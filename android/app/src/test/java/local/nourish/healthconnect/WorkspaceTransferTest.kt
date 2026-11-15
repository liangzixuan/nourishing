package local.nourish.healthconnect

import java.io.File
import java.io.IOException
import java.net.InetAddress
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.OkHttpClient
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class WorkspaceTransferTest {
    private class Fixture : AutoCloseable {
        val certificate = HeldCertificate.Builder().addSubjectAlternativeName("fixture.test.ts.net").build()
        val server = MockWebServer()
        val http: OkHttpClient
        val client: WorkspaceClient
        val origin: WorkspaceOrigin
        val file = File.createTempFile("nourish-transfer-", ".json").apply { writeText("{\"format\":\"fixture\",\"records\":[]}") }
        init {
            val serverTls = HandshakeCertificates.Builder().heldCertificate(certificate).build()
            server.useHttps(serverTls.sslSocketFactory());server.start()
            val trust = HandshakeCertificates.Builder().addTrustedCertificate(certificate.certificate).build()
            http = WorkspaceClient.defaultClient().newBuilder().sslSocketFactory(trust.sslSocketFactory(), trust.trustManager)
                .dns { listOf(InetAddress.getByName("127.0.0.1")) }.build()
            client = WorkspaceClient(http);origin = WorkspaceOrigin.parse("https://fixture.test.ts.net:${server.port}")
        }
        fun identity(login: String = "owner@example.test") = MockResponse(body = """{"mode":"private","phone":{"configured":true,"origin":"${origin.value}","login":"$login"}}""")
        fun preview() = MockResponse(body = """{"reviewToken":"${"a".repeat(64)}","counts":{"added":1,"updated":0,"unchanged":0},"range":{"from":"2026-10-28","to":"2026-10-29","zone":"America/Chicago"},"warnings":["Fixture warning"]}""")
        override fun close() { http.connectionPool.evictAll();http.dispatcher.executorService.shutdownNow();server.close();file.delete() }
    }

    @Test fun privateOriginsAcceptOnlyExplicitHttpsTailnetOrigins() {
        assertEquals("https://pc.tail.ts.net:8443", WorkspaceOrigin.parse(" https://PC.tail.ts.net:8443/ ").value)
        assertEquals("https://pc.tail.ts.net", WorkspaceOrigin.parse("https://pc.tail.ts.net:443").value)
        for (value in listOf("http://pc.tail.ts.net", "https://127.0.0.1", "https://pc.tail.ts.net.evil.test", "https://user@pc.tail.ts.net", "https://pc.tail.ts.net/path", "https://pc.tail.ts.net/?token=x", "https://pc.tail.ts.net/#x", "https://pc..tail.ts.net", "https://pc.tail.ts.net:0", "https://pc.tail.ts.net:65536")) {
            assertThrows(value, IllegalArgumentException::class.java) { WorkspaceOrigin.parse(value) }
        }
    }

    @Test fun summaryCountsRejectCoercionFractionsNegativesAndOversizedTotals() {
        assertEquals(ImportCounts(1, 2, 3), importCounts(JSONObject("""{"added":1,"updated":2,"unchanged":3}""")))
        for (value in listOf("-1", "0.5", "\"1\"", "null", "100001")) assertThrows(Exception::class.java) {
            importCounts(JSONObject("""{"added":$value,"updated":0,"unchanged":0}"""))
        }
        assertThrows(IllegalArgumentException::class.java) { ImportCounts(100000, 1, 0) }
    }

    @Test fun realTlsPreviewAndReviewedImportSendTheSameStagedBytesOnce() = runBlocking {
        Fixture().use { f ->
            f.server.enqueue(f.identity());f.server.enqueue(f.preview());f.server.enqueue(f.identity())
            f.server.enqueue(MockResponse(body = """{"counts":{"added":1,"updated":0,"unchanged":0}}"""))
            val review = f.client.preview(f.origin, f.file, WorkspaceIdentity("owner@example.test"))
            assertEquals("America/Chicago", review.zone);assertEquals(1, review.counts.added)
            assertEquals(ImportCounts(1, 0, 0), f.client.import(review))
            val access = f.server.takeRequest();val preview = f.server.takeRequest();val check = f.server.takeRequest();val imported = f.server.takeRequest()
            assertNotNull(access.handshake);assertEquals("/api/access", access.target)
            assertEquals("/api/health-connect/preview?summary=1", preview.target);assertEquals("POST", preview.method)
            assertEquals("/api/access", check.target);assertEquals("/api/health-connect/import?summary=1", imported.target)
            assertEquals("a".repeat(64), imported.headers["X-Nourish-Review-Token"]);assertNull(preview.headers["X-Nourish-Review-Token"])
            assertEquals(f.file.readText(), preview.body!!.utf8());assertEquals(preview.body, imported.body)
            assertNull(imported.headers["Authorization"]);assertNull(imported.headers["Tailscale-User-Login"])
            assertEquals(4, f.server.requestCount)
        }
    }

    @Test fun changedBytesRejectBeforeImportAndChangedAccountRejectsBeforePreviewUpload() = runBlocking {
        Fixture().use { f ->
            f.server.enqueue(f.identity());f.server.enqueue(f.preview());val review = f.client.preview(f.origin, f.file)
            f.file.appendText(" ")
            try { f.client.import(review);fail("Changed staged bytes were imported") } catch (_: IllegalArgumentException) {}
            assertEquals(2, f.server.requestCount)
            f.server.enqueue(f.identity("other@example.test"))
            try { f.client.preview(f.origin, f.file, WorkspaceIdentity("owner@example.test"));fail("Changed account accepted") } catch (_: IllegalArgumentException) {}
            assertEquals(3, f.server.requestCount)
        }
    }

    @Test fun redirectsAreNotFollowedAndAnImportServerFailureIsNotReplayed() = runBlocking {
        Fixture().use { f ->
            f.server.enqueue(MockResponse.Builder().code(307).addHeader("Location", "https://other.ts.net").body("{}").build())
            try { f.client.identity(f.origin);fail("Redirect followed") } catch (error: WorkspaceTransferFailure) { assertEquals(307, error.httpStatus) }
            assertEquals(1, f.server.requestCount)
            f.server.enqueue(f.identity());f.server.enqueue(f.preview());val review = f.client.preview(f.origin, f.file)
            f.server.enqueue(f.identity());f.server.enqueue(MockResponse(code = 500, body = """{"error":"Synthetic server failure"}"""))
            try { f.client.import(review);fail("Failure was accepted") } catch (error: WorkspaceTransferFailure) { assertTrue(error.outcomeUnknown);assertTrue(error.message!!.contains("outcome is unknown")) }
            assertEquals(5, f.server.requestCount)
        }
    }

    @Test fun responseBoundAndCertificateHostnameRemainEnforced() = runBlocking {
        Fixture().use { f ->
            f.server.enqueue(MockResponse(body = "x".repeat(MAX_TRANSFER_RESPONSE_BYTES + 1)))
            try { f.client.identity(f.origin);fail("Oversized response accepted") } catch (error: WorkspaceTransferFailure) { assertTrue(error.message!!.contains("too large")) }
            val wrong = WorkspaceOrigin.parse("https://wrong.test.ts.net:${f.server.port}")
            try { f.client.identity(wrong);fail("Certificate hostname mismatch accepted") } catch (_: WorkspaceTransferFailure) {}
            assertEquals(1, f.server.requestCount)
        }
    }

    @Test fun missingOrInvalidCommittedImportCountsLeaveTheOutcomeUnknownWithoutReplay() = runBlocking {
        for (body in listOf("{}", """{"counts":{"added":-1,"updated":0,"unchanged":0}}""")) {
            Fixture().use { f ->
                f.server.enqueue(f.identity());f.server.enqueue(f.preview())
                val review = f.client.preview(f.origin, f.file)
                f.server.enqueue(f.identity());f.server.enqueue(MockResponse(body = body))
                try { f.client.import(review);fail("Invalid summary was accepted") }
                catch (error: WorkspaceTransferFailure) {
                    assertTrue(error.outcomeUnknown)
                    assertTrue(error.message!!.contains("outcome is unknown"))
                }
                assertEquals(4, f.server.requestCount)
            }
        }
    }

    @Test fun retryAfterZeroDoesNotReplayTheImportBody() = runBlocking {
        Fixture().use { f ->
            f.server.enqueue(f.identity());f.server.enqueue(f.preview())
            val review = f.client.preview(f.origin, f.file)
            f.server.enqueue(f.identity())
            f.server.enqueue(MockResponse.Builder().code(503).addHeader("Retry-After", "0").body("""{"error":"Temporary fixture failure"}""").build())
            f.server.enqueue(MockResponse(body = """{"counts":{"added":0,"updated":0,"unchanged":1}}"""))
            try { f.client.import(review);fail("Import body was replayed") }
            catch (error: WorkspaceTransferFailure) { assertEquals(503, error.httpStatus);assertTrue(error.outcomeUnknown) }
            assertEquals(4, f.server.requestCount)
            repeat(3) { f.server.takeRequest() }
            val imported = f.server.takeRequest()
            assertEquals("POST", imported.method)
            assertEquals("/api/health-connect/import?summary=1", imported.target)
            assertNull(f.server.takeRequest(100, TimeUnit.MILLISECONDS))
        }
    }

    @Test fun uploadGuardRunsAfterIdentityAndStopsEachUnsentHealthPost() = runBlocking {
        Fixture().use { f ->
            var allowed = false
            var guards = 0
            val client = WorkspaceClient(f.http) { guards++;check(allowed) { "Fixture permission or configuration revoked" } }
            f.server.enqueue(f.identity())
            try { client.preview(f.origin, f.file);fail("Blocked preview uploaded") } catch (_: IllegalStateException) {}
            assertEquals(1, f.server.requestCount)
            allowed = true
            f.server.enqueue(f.identity());f.server.enqueue(f.preview())
            val review = client.preview(f.origin, f.file)
            allowed = false
            f.server.enqueue(f.identity())
            try { client.import(review);fail("Blocked import uploaded") } catch (_: IllegalStateException) {}
            assertEquals(3, guards)
            assertEquals(4, f.server.requestCount)
            assertEquals("GET", f.server.takeRequest().method)
            assertEquals("GET", f.server.takeRequest().method)
            assertEquals("/api/health-connect/preview?summary=1", f.server.takeRequest().target)
            assertEquals("GET", f.server.takeRequest().method)
            assertNull(f.server.takeRequest(100, TimeUnit.MILLISECONDS))
        }
    }

    @Test fun cancellationCancelsTheOwnedHttpCall() = runBlocking {
        val started = CompletableDeferred<Unit>();val ended = CompletableDeferred<Unit>()
        val http = WorkspaceClient.defaultClient().newBuilder().addInterceptor { chain ->
            started.complete(Unit)
            while (!chain.call().isCanceled()) Thread.sleep(5)
            ended.complete(Unit);throw IOException("Canceled fixture")
        }.build()
        try {
            val request = launch { WorkspaceClient(http).identity(WorkspaceOrigin.parse("https://fixture.test.ts.net")) }
            withTimeout(3000) { started.await();request.cancelAndJoin();ended.await() }
        } finally { http.dispatcher.executorService.shutdownNow();http.connectionPool.evictAll() }
    }

    private fun reconciliationPending(f:Fixture):ReconciliationPending {
        val batch=JSONObject().put("streamId","11111111-1111-4111-8111-111111111111").put("batchId","22222222-2222-4222-8222-222222222222").put("sequence",1)
            .put("snapshot",JSONObject().put("range",JSONObject().put("from","2026-10-29").put("to","2026-10-30").put("zone","America/Chicago")))
        f.file.writeText(batch.toString());return ReconciliationPending(batch,mapOf(ExportType.WEIGHT to "candidate"),setOf(ExportType.WEIGHT),"a".repeat(64))
    }
    private fun reconciliationReceipt(p:ReconciliationPending)=JSONObject().put("streamId",p.batch.getString("streamId")).put("batchId",p.batch.getString("batchId")).put("sequence",1).put("batchDigest",p.digest).put("receiptId","b".repeat(64)).put("counts",JSONObject("""{"added":0,"updated":0,"unchanged":0,"deleted":1,"replaced":0,"invalidated":0}""")).put("recoverySnapshotId",1)

    @Test fun reconciliationApplySendsReviewedJsonAsOneShotRequest()=runBlocking {
        Fixture().use { f ->
            val pending=reconciliationPending(f)
            val review=ReconciliationReview("c".repeat(64),pending.digest!!,ReconciliationCounts(0,0,0,1,0,0),emptyList(),false,null)
            val receipt=reconciliationReceipt(pending)
            val client=WorkspaceClient(f.http.newBuilder().addInterceptor { chain ->
                if(chain.request().url.encodedPath=="/api/health-connect/reconcile/apply")assertTrue(chain.request().body!!.isOneShot())
                chain.proceed(chain.request())
            }.build())
            f.server.enqueue(f.identity());f.server.enqueue(MockResponse(body=JSONObject().put("receipt",receipt).put("replayed",false).toString()))
            val result=ReconciliationTransfer(client).apply(f.origin,WorkspaceIdentity("owner@example.test"),pending,review,true)
            assertEquals(receipt.toString(),result.toString())
            assertEquals("GET",f.server.takeRequest().method)
            val upload=f.server.takeRequest();assertNotNull(upload.handshake);assertEquals("POST",upload.method)
            assertEquals("/api/health-connect/reconcile/apply",upload.target)
            val expected=JSONObject().put("batch",pending.batch).put("reviewToken",review.token).put("confirmed",true).put("allowRemovals",true)
            assertEquals(expected.toString(),JSONObject(upload.body!!.utf8()).toString())
            assertNull(f.server.takeRequest(100,TimeUnit.MILLISECONDS))
        }
    }

    @Test fun jsonUploadByteLimitIsOwnedAndCheckedBeforeUploadGuard()=runBlocking {
        Fixture().use { f ->
            var guards=0
            val client=WorkspaceClient(f.http,beforeHealthUpload={guards++})
            val payload=JSONObject().put("fixture","é".repeat((MAX_EXPORT_BYTES/2).toInt()))
            for(serialized in listOf(false,true)) {
                try {
                    if(serialized)client.exchange(f.origin,"/api/health-connect/reconcile/apply",importing=true,jsonText=payload.toString())
                    else client.exchange(f.origin,"/api/health-connect/reconcile/apply",importing=true,json=payload)
                    fail("Oversized UTF-8 JSON uploaded")
                } catch(error:WorkspaceValidationFailure){assertEquals("The request exceeds the transfer limit.",error.code.diagnostic)}
            }
            assertEquals(0,guards);assertNull(f.server.takeRequest(100,TimeUnit.MILLISECONDS))
        }
    }

    @Test fun reconciliation503AndMalformedCommittedReplyRemainUnknownWithoutReplay()=runBlocking {
        for(response in listOf(MockResponse(code=503,body="""{"error":"unknown"}""").newBuilder().addHeader("Retry-After","0").build(),MockResponse(body="""{"receipt":{},"replayed":false}"""))){
            Fixture().use { f -> val p=reconciliationPending(f);val review=ReconciliationReview("c".repeat(64),p.digest!!,ReconciliationCounts(0,0,0,1,0,0),emptyList(),false,null)
                f.server.enqueue(f.identity());f.server.enqueue(response);f.server.enqueue(MockResponse(body=JSONObject().put("receipt",reconciliationReceipt(p)).put("replayed",false).toString()))
                try{ReconciliationTransfer(f.client).apply(f.origin,WorkspaceIdentity("owner@example.test"),p,review,true);fail("Unknown result accepted")}catch(error:WorkspaceTransferFailure){assertTrue(error.outcomeUnknown)}
                assertEquals("/api/access",f.server.takeRequest().target);assertEquals("/api/health-connect/reconcile/apply",f.server.takeRequest().target);assertNull(f.server.takeRequest(100,TimeUnit.MILLISECONDS))
            }
        }
    }
    @Test fun reconciliationReceiptChecksExactBatchAndStagedBytesBeforeAnyApply()=runBlocking {
        Fixture().use{f->val p=reconciliationPending(f);val api=ReconciliationTransfer(f.client);val bad=reconciliationReceipt(p).put("batchId","33333333-3333-4333-8333-333333333333")
            f.server.enqueue(f.identity());f.server.enqueue(MockResponse(body=JSONObject().put("receipt",bad).toString()))
            try{api.receipt(f.origin,WorkspaceIdentity("owner@example.test"),p);fail("Wrong receipt accepted")}catch(_:IllegalArgumentException){}
            f.server.takeRequest();assertTrue(f.server.takeRequest().target!!.startsWith("/api/health-connect/reconcile/receipt?"))
            f.file.writeText("tampered");f.server.enqueue(f.identity());try{api.preview(f.origin,WorkspaceIdentity("owner@example.test"),p,f.file);fail("Changed file accepted")}catch(_:IllegalArgumentException){}
            f.server.takeRequest();assertNull(f.server.takeRequest(100,TimeUnit.MILLISECONDS))
        }
    }
    @Test fun reconciliationApplyRequiresExplicitRemovalConsentAndUploadGuard()=runBlocking {
        Fixture().use{f->val p=reconciliationPending(f);val review=ReconciliationReview("c".repeat(64),p.digest!!,ReconciliationCounts(0,0,0,1,0,0),emptyList(),false,null)
            try{ReconciliationTransfer(f.client).apply(f.origin,WorkspaceIdentity("owner@example.test"),p,review,false);fail("Unconfirmed removal accepted")}catch(_:IllegalArgumentException){}
            assertNull(f.server.takeRequest(100,TimeUnit.MILLISECONDS));f.server.enqueue(f.identity())
            val guarded=WorkspaceClient(f.http,beforeHealthUpload={throw SecurityException("permission revoked")})
            try{ReconciliationTransfer(guarded).apply(f.origin,WorkspaceIdentity("owner@example.test"),p,review,true);fail("Revoked upload accepted")}catch(_:SecurityException){}
            assertEquals("/api/access",f.server.takeRequest().target);assertNull(f.server.takeRequest(100,TimeUnit.MILLISECONDS))
        }
    }
    @Test fun reconciliationReceiptReadReturnsExactAcknowledgementWithoutPost()=runBlocking {
        Fixture().use{f->val p=reconciliationPending(f);val receipt=reconciliationReceipt(p);f.server.enqueue(f.identity());f.server.enqueue(MockResponse(body=JSONObject().put("receipt",receipt).toString()))
            val result=ReconciliationTransfer(f.client).receipt(f.origin,WorkspaceIdentity("owner@example.test"),p)!!;assertEquals(receipt.toString(),result.toString());assertEquals("GET",f.server.takeRequest().method);assertEquals("GET",f.server.takeRequest().method);assertNull(f.server.takeRequest(100,TimeUnit.MILLISECONDS))
        }
    }
    @Test fun backgroundConfigurationKeepsExplicitTypesAndBoundedRollingSpan() {
        val origin = WorkspaceOrigin.parse("https://pc.tail.ts.net")
        val config = BackgroundSyncConfig(origin, "owner@example.test", setOf(ExportType.WEIGHT), 7, "revision")
        assertEquals(setOf(ExportType.WEIGHT), config.types)
        assertThrows(IllegalArgumentException::class.java) { BackgroundSyncConfig(origin, "owner", emptySet(), 7, "revision") }
        assertThrows(IllegalArgumentException::class.java) { config.copy(days = 31) }
        assertThrows(IllegalArgumentException::class.java) { config.copy(login = "") }
    }

    @Test fun hourlyExportUsesRealTlsAccountChecksAndJsonReviewWithoutTemporaryFiles()=runBlocking {
        Fixture().use { f ->
            val selection=JSONObject().put("kind","weight").put("from","2026-10-31").put("to","2026-10-31").put("timeZone","America/Chicago").put("metric",JSONObject().put("type","Weight").put("unit","kg"))
            val config=HourlyExportConfig(f.origin,"owner@example.test",selection.toString(),1,"revision")
            val token="a".repeat(64)
            f.server.enqueue(f.identity());f.server.enqueue(MockResponse(body=JSONObject().put("version",1).put("selection",selection).put("reviewToken",token).put("records",org.json.JSONArray()).put("skipped",org.json.JSONArray()).toString()))
            f.server.enqueue(f.identity());f.server.enqueue(MockResponse(body=JSONObject().put("valid",true).put("reviewToken",token).toString()))
            val transport=HealthExportWorkspace(f.client);val plan=transport.preview(config,selection);transport.verify(config,plan)
            assertEquals("/api/access",f.server.takeRequest().target)
            val preview=f.server.takeRequest();assertNotNull(preview.handshake);assertEquals("POST",preview.method);assertEquals("/api/health-connect/export/biometric/preview",preview.target)
            assertTrue(sameHealthExportSelection(selection,JSONObject(preview.body!!.utf8())))
            assertEquals("/api/access",f.server.takeRequest().target)
            val verify=f.server.takeRequest();assertEquals("/api/health-connect/export/biometric/verify",verify.target);assertEquals(token,JSONObject(verify.body!!.utf8()).getString("reviewToken"))
            f.server.enqueue(f.identity("different@example.test"))
            try{transport.preview(config,selection);fail("Changed account accepted")}catch(_:IllegalArgumentException){}
            assertEquals("/api/access",f.server.takeRequest().target);assertEquals(5,f.server.requestCount)
            f.server.enqueue(f.identity());f.server.enqueue(MockResponse(code=409,body="{\"error\":\"Stale review\"}"))
            try{transport.verify(config,plan);fail("Stale review accepted")}catch(error:WorkspaceTransferFailure){assertEquals(409,error.httpStatus)}
            assertEquals(7,f.server.requestCount)
        }
    }

    @Test fun validationErrorsCarryProducerIdentityWithoutChangingGuards() {
        val syntax=assertThrows(WorkspaceValidationFailure::class.java){WorkspaceOrigin.parse("https://bad host")}
        assertEquals(WorkspaceError.ADDRESS_SYNTAX,syntax.code)
        val privateAddress=assertThrows(WorkspaceValidationFailure::class.java){WorkspaceOrigin.parse("http://fixture.test.ts.net")}
        assertEquals(WorkspaceError.PRIVATE_ADDRESS,privateAddress.code)
        val counts=assertThrows(WorkspaceValidationFailure::class.java){importCounts(JSONObject("""{"added":0.5,"updated":0,"unchanged":0}"""))}
        assertEquals(WorkspaceError.INVALID_COUNT,counts.code)
        assertEquals("Invalid workspace count.",counts.message)
    }
    @Test fun transportSeparatesOwnedFailuresFromLiteralServerDiagnostics()=runBlocking {
        val cases=listOf(
            Triple(MockResponse(code=403,body="{}"),WorkspaceError.ACCESS_DENIED,false),
            Triple(MockResponse(code=503,body="{}"),WorkspaceError.REJECTED,true),
            Triple(MockResponse(code=503,body=JSONObject().put("error",WorkspaceError.ACCESS_DENIED.diagnostic).toString()),null,true),
            Triple(MockResponse(code=302,body="{}").newBuilder().addHeader("Location","https://external.example/").build(),WorkspaceError.REDIRECT,true),
            Triple(MockResponse(body="invalid JSON"),WorkspaceError.INVALID_SUMMARY,true)
        )
        for((response,code,unknown) in cases)Fixture().use { f ->
            f.server.enqueue(response)
            try { f.client.exchange(f.origin,"/api/health-connect/import?summary=1",f.file,importing=true);fail("Failure accepted") }
            catch(error:WorkspaceTransferFailure){
                assertEquals(code,error.code);assertEquals(unknown,error.outcomeUnknown)
                if(code==null)assertEquals(WorkspaceError.ACCESS_DENIED.diagnostic,error.detail)
                if(unknown)assertTrue(error.message!!.contains("The import outcome is unknown."))
            }
            assertEquals(1,f.server.requestCount);assertEquals("POST",f.server.takeRequest().method)
            assertNull(f.server.takeRequest(100,TimeUnit.MILLISECONDS))
        }
    }
}
