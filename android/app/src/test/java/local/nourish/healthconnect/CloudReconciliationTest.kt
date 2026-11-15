package local.nourish.healthconnect

import java.io.IOException
import java.time.Instant
import java.time.ZoneId
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class CloudReconciliationTest {
    private val now=Instant.parse("2026-11-03T12:00:00Z")
    private val origin=CloudOrigin.parse("https://nourishing.app")
    private val namespace="11111111-1111-4111-8111-111111111111"
    private val digest="a".repeat(64)
    private val counts=JSONObject("""{"added":1,"updated":0,"unchanged":0,"deleted":1,"replaced":0,"invalidated":0}""")
    private class Memory:ReconciliationDocument {var raw:String?=null;override fun read()=raw;override fun write(value:String){raw=value}}
    private inner class Server {
        var account="owner";var cookie="__Host-nourishing_session=first";var lineage=namespace;var lost=false;var logout=false;var conflict=false
        var applied=0;var previews=0;var options=0;var onOptions:()->Unit={};var receiptReads=0;var saved:JSONObject?=null;lateinit var batch:JSONObject
        val session=CloudAccountSession(origin,{cookie},CloudHttpTransport{request->
            val path=request.url.encodedPath
            val body=when {
                path=="/api/account"->JSONObject().put("id",account)
                path.endsWith("/options")->{options++;onOptions();JSONObject().put("version",1).put("metrics",JSONArray()).put("timeZone","UTC").put("namespace",lineage).put("accountId",account)}
                path.endsWith("/receipt")->{receiptReads++;if(conflict)return@CloudHttpTransport CloudHttpReply(409,"{}");assertEquals(batch.getString("streamId"),request.url.queryParameter("streamId"));assertEquals(digest,request.url.queryParameter("batchDigest"));JSONObject().put("receipt",saved?:JSONObject.NULL)}
                path.endsWith("/preview")->{previews++;JSONObject().put("batchId",batch.getString("batchId")).put("batchDigest",digest).put("reviewToken","c".repeat(64)).put("counts",counts).put("range",batch.getJSONObject("snapshot").getJSONObject("range")).put("warnings",JSONArray()).put("replayed",false).put("receipt",JSONObject.NULL)}
                else->{assertEquals("/api/health-connect/reconcile/apply",path);applied++;saved=receipt();if(logout){cookie="";sessionChanged()};if(lost)throw IOException("lost apply response");JSONObject().put("receipt",saved).put("replayed",false)}
            }
            CloudHttpReply(200,body.toString())
        })
        private fun sessionChanged(){session.refresh()}
        val transfer=CloudReconciliationTransfer(session)
        fun receipt()=JSONObject().put("streamId",batch.getString("streamId")).put("sequence",batch.getLong("sequence")).put("batchId",batch.getString("batchId")).put("batchDigest",digest).put("receiptId","b".repeat(64)).put("counts",counts).put("recoverySnapshotId",1)
        fun stage(store:ReconciliationStore){val captured=store.captureState();val range=ExportRange.create("2026-11-02","2026-11-03",ZoneId.of("UTC"),now);batch=reconciliationBatch(captured,HealthSnapshot(range,emptyList(),setOf(ExportType.WEIGHT),emptySet()),emptyList(),listOf(ExportType.WEIGHT to "initial-baseline"),now);store.stage(captured,batch,mapOf(ExportType.WEIGHT to "device-private-token"),setOf(ExportType.WEIGHT))}
    }
    @Test fun durableOwnerEnvelopeRejectsOtherAccountOriginAndLineage() {
        val owner=CloudExportOwner(origin,"owner",namespace);val memory=Memory();val store=ReconciliationStore(CloudReconciliationDocument(memory,owner));Server().stage(store)
        assertNotNull(ReconciliationStore(CloudReconciliationDocument(memory,owner)).pending())
        for(other in listOf(owner.copy(accountId="other"),owner.copy(origin=CloudOrigin.parse("https://nourishing-cloud.appwrite.network")),owner.copy(namespace="22222222-2222-4222-8222-222222222222")))
            assertThrows(IllegalArgumentException::class.java){ReconciliationStore(CloudReconciliationDocument(memory,other)).pending()}
    }
    @Test fun removalConsentAndLostResponseRecoverExactReceiptWithoutSecondApply()=runBlocking {
        val server=Server();val connection=server.transfer.connect();val memory=Memory();val store=ReconciliationStore(CloudReconciliationDocument(memory,connection.owner));server.stage(store)
        val coordinator=CloudReconciliationCoordinator(server.transfer,connection,store){}
        val review=requireNotNull(coordinator.preview().review)
        try{coordinator.apply(review,false);fail()}catch(_:IllegalArgumentException){}
        assertEquals(0,server.applied);assertNotNull(store.pending())
        server.lost=true;coordinator.apply(review,true)
        assertEquals(1,server.applied);assertTrue(server.receiptReads>=2);assertNull(store.pending());assertEquals("device-private-token",store.cursors(store.captureState())[ExportType.WEIGHT])
    }
    @Test fun logoutDuringApplyKeepsPendingAndNewSessionChecksReceiptFirst()=runBlocking {
        val server=Server();val connection=server.transfer.connect();val memory=Memory();val store=ReconciliationStore(CloudReconciliationDocument(memory,connection.owner));server.stage(store)
        val coordinator=CloudReconciliationCoordinator(server.transfer,connection,store){};val review=requireNotNull(coordinator.preview().review)
        server.logout=true
        try{coordinator.apply(review,true);fail()}catch(_:CloudReconciliationUncertain){}
        assertNotNull(store.pending());assertTrue(store.cursors(JSONObject(CloudReconciliationDocument(memory,connection.owner).read()!!)).isEmpty())
        server.cookie="__Host-nourishing_session=second";server.logout=false
        val reopened=ReconciliationStore(CloudReconciliationDocument(memory,connection.owner));val next=CloudReconciliationCoordinator(server.transfer,server.transfer.connect(),reopened){}
        assertNotNull(next.preview().receipt);assertNull(reopened.pending());assertEquals(1,server.applied)
    }
    @Test fun accountChangeAndRevokedReadAccessCannotUploadPendingBatch()=runBlocking {
        for(mode in listOf("account","lineage","permission")){
            val server=Server();val connection=server.transfer.connect();val store=ReconciliationStore(Memory());server.stage(store)
            if(mode=="account")server.account="other" else if(mode=="lineage")server.lineage="22222222-2222-4222-8222-222222222222"
            val coordinator=CloudReconciliationCoordinator(server.transfer,connection,store){if(mode=="permission")throw SecurityException("revoked")}
            try{coordinator.preview();fail()}catch(_:Exception){}
            assertEquals(0,server.applied);assertNotNull(store.pending())
        }
    }
    @Test fun permissionRevokedDuringAccountCheckStopsUploadAndKeepsCandidateCursors()=runBlocking {
        val server=Server();val connection=server.transfer.connect();val store=ReconciliationStore(Memory());server.stage(store)
        var allowed=true;server.onOptions={if(server.options>=3)allowed=false}
        val coordinator=CloudReconciliationCoordinator(server.transfer,connection,store){check(allowed){"Read permission revoked"}}
        try{coordinator.preview();fail()}catch(_:IllegalStateException){}
        assertEquals(0,server.previews);assertNotNull(store.pending());assertNull(store.pending()!!.digest)
        assertEquals("device-private-token",store.pending()!!.candidates[ExportType.WEIGHT])
    }
    @Test fun mismatchedReceiptCannotCommitCursorsAndKnownConflictKeepsPending()=runBlocking {
        val server=Server();val connection=server.transfer.connect();val store=ReconciliationStore(Memory());server.stage(store)
        val coordinator=CloudReconciliationCoordinator(server.transfer,connection,store){};coordinator.preview()
        server.saved=server.receipt().put("batchDigest","d".repeat(64))
        try{coordinator.preview();fail()}catch(_:IllegalArgumentException){}
        assertNotNull(store.pending());assertEquals(0,server.applied)
        server.saved=null;server.conflict=true
        try{coordinator.preview();fail()}catch(_:CloudReconciliationConflict){}
        assertNotNull(store.pending());assertEquals(0,server.applied)
    }
}
