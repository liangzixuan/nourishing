package local.nourish.healthconnect

import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.records.metadata.Metadata
import java.io.File
import java.net.InetAddress
import java.nio.file.Files
import java.time.Instant
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

/** Actual candidate server, production HTTPS client/coordinator, controlled SDK storage. */
class IntakeSessionHttpTest {
    private class Server:AutoCloseable {
        val directory=Files.createTempDirectory("nourish-intake-http-").toFile().canonicalFile
        private val certificate=HeldCertificate.Builder().addSubjectAlternativeName("fixture.test.ts.net").build()
        private val trust=HandshakeCertificates.Builder().addTrustedCertificate(certificate.certificate).build()
        val http=WorkspaceClient.defaultClient().newBuilder().sslSocketFactory(trust.sslSocketFactory(),trust.trustManager).dns { listOf(InetAddress.getByName("127.0.0.1")) }.build()
        val client=WorkspaceClient(http);val process:Process;val ready:JSONObject
        init {
            File(directory,"key.pem").writeText(certificate.privateKeyPkcs8Pem());File(directory,"cert.pem").writeText(certificate.certificatePem())
            process=ProcessBuilder("node",requireNotNull(System.getProperty("nourish.intakeServerFixture")),directory.path).redirectErrorStream(true).redirectOutput(File(directory,"server.log")).start()
            try {
                val path=File(directory,"ready.json");val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(15)
                while(!path.isFile&&process.isAlive&&System.nanoTime()<deadline)Thread.sleep(25)
                check(path.isFile){"Synthetic server did not start: "+File(directory,"server.log").readText()};ready=JSONObject(path.readText())
            }catch(error:Throwable){process.destroyForcibly();process.waitFor(5,TimeUnit.SECONDS);throw error}
        }
        fun finish():JSONObject {
            http.connectionPool.evictAll();process.outputStream.write("stop\n".toByteArray());process.outputStream.flush()
            check(process.waitFor(10,TimeUnit.SECONDS)){"Synthetic server did not stop."};check(process.exitValue()==0){File(directory,"server.log").readText()}
            return JSONObject(File(directory,"result.json").readText())
        }
        override fun close(){
            http.connectionPool.evictAll();http.dispatcher.executorService.shutdownNow()
            if(process.isAlive){process.destroy();if(!process.waitFor(5,TimeUnit.SECONDS)){process.destroyForcibly();check(process.waitFor(5,TimeUnit.SECONDS))}}
            val evidence=File(requireNotNull(System.getProperty("nourish.testFixtureDirectory")),directory.name);check(evidence.mkdirs()||evidence.isDirectory)
            for(name in listOf("server.log","ready.json","result.json")){val source=File(directory,name);if(source.isFile)source.copyTo(File(evidence,name))}
            val root=File(System.getProperty("java.io.tmpdir")).canonicalFile;check(directory.parentFile==root&&directory.name.startsWith("nourish-intake-http-"));check(directory.deleteRecursively())
        }
    }
    @Test fun actualHttpsActivationReplyLossReplaysOnceAndGuardsNativeWrites()=runBlocking {
        Server().use { server->
            val origin=WorkspaceOrigin.parse(server.ready.getString("origin"));val identity=WorkspaceIdentity(server.ready.getString("login"));val selection=parseCorrectedIntakeSelection(server.ready.getJSONObject("selection"));val now=Instant.parse("2026-11-06T12:00:00Z")
            val disk=MemoryIntakeSessions()
            fun store()=PersistedIntakeSessionStore(disk)
            val records=linkedMapOf<String,Record>();var insertCalls=0
            val sink=object:IntakeReconciliationSink {
                override suspend fun permissions()=HealthWriteType.NUTRITION.permissions
                override suspend fun snapshot(type:HealthWriteType,clientIds:Set<String>)=records.filterKeys { it in clientIds }
                override suspend fun read(type:HealthWriteType,id:String)=records.values.single { it.metadata.id==id }
                override suspend fun insert(values:List<Record>):List<String>{
                    insertCalls++;val pending=store().load()!!;assertTrue(pending.activated)
                    return values.map { value->val id=value.metadata.clientRecordId!!;assertTrue(id in pending.operation.attemptedUpserts)
                        val metadata=Metadata::class.java.constructors.first { it.parameterCount==7 }.newInstance(Metadata.RECORDING_METHOD_MANUAL_ENTRY,"native:$id",DataOrigin("local.nourish.healthconnect"),now,id,value.metadata.clientRecordVersion,null) as Metadata
                        records[id]=HealthWriteType.NUTRITION.native(pending.operation.review.plan.rows.single { it.clientId==id },metadata);"native:$id"
                    }
                }
                override suspend fun deleteNative(type:HealthWriteType,nativeIds:List<String>){fail("No prior native record existed in this HTTP fixture")}
            }
            var version=0L;val sequence=HealthWriteSequence({version},{version=it},{100L},{check(store().load()==null)})
            fun coordinator()=IntakeCorrectionCoordinator(WorkspaceIntakeCorrections(server.client),sink,store(),sequence,access={o,i->check(o==origin&&i==identity)},now={now})
            val review=coordinator().review(origin,identity,selection)
            try{coordinator().confirm(review);fail("The fixture deliberately drops the activation reply")}catch(_:WorkspaceTransferFailure){}
            assertNotNull(store().load());assertFalse(store().load()!!.activated);assertEquals(0,insertCalls)
            assertEquals(2,coordinator().resume());assertEquals(1,insertCalls);assertNull(store().load());assertEquals(2,records.size)
            val source=review.preview();val anchor=records.getValue(source.rows.single { it.id=="anchor" }.clientId) as NutritionRecord
            assertEquals(150.0,anchor.energy!!.inKilocalories,0.0);assertTrue(anchor.name!!.endsWith("Exact HTTPS source credit"))
            val result=server.finish();assertTrue(result.getBoolean("diaryUnchanged"));assertTrue(result.getBoolean("droppedReply"));assertEquals(1,result.getInt("receipts"));assertEquals(1,result.getJSONArray("policies").getJSONObject(0).getInt("revision"))
            val requests=result.getJSONArray("activationRequests");assertEquals(2,requests.length());assertEquals(requests.getString(0),requests.getString(1))
        }
    }
}
