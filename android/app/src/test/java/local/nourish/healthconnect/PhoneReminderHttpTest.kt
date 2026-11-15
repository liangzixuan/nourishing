package local.nourish.healthconnect

import java.io.File
import java.net.InetAddress
import java.nio.file.Files
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

/** Actual candidate server, production HTTPS reminder client/coordinator, controlled SDK identity. */
class PhoneReminderHttpTest {
    private class Server:AutoCloseable {
        val directory=Files.createTempDirectory("nourish-reminder-http-").toFile().canonicalFile
        private val certificate=HeldCertificate.Builder().addSubjectAlternativeName("fixture.test.ts.net").build()
        private val trust=HandshakeCertificates.Builder().addTrustedCertificate(certificate.certificate).build()
        val http=WorkspaceClient.defaultClient().newBuilder().sslSocketFactory(trust.sslSocketFactory(),trust.trustManager).dns { listOf(InetAddress.getByName("127.0.0.1")) }.build()
        val client=WorkspaceClient(http);val process:Process;val ready:JSONObject
        init {
            File(directory,"key.pem").writeText(certificate.privateKeyPkcs8Pem());File(directory,"cert.pem").writeText(certificate.certificatePem())
            process=ProcessBuilder("node",requireNotNull(System.getProperty("nourish.reminderServerFixture")),directory.path).redirectErrorStream(true).redirectOutput(File(directory,"server.log")).start()
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
            val root=File(requireNotNull(System.getProperty("java.io.tmpdir"))).canonicalFile;check(directory.parentFile==root&&directory.name.startsWith("nourish-reminder-http-"));check(directory.deleteRecursively())
        }
    }
    @Test fun lostHttpsReplyRotationRemovalAndExplicitReconnectPreserveRecords()=runBlocking {
        Server().use { server ->
            val origin=WorkspaceOrigin.parse(server.ready.getString("origin"));val backend=PrivatePhoneReminderBackend(server.client)
            val disk=object:PhoneReminderStateStore {
                var value=PhoneReminderState("a".repeat(64))
                override fun read()=value
                override fun update(change:(PhoneReminderState)->PhoneReminderState)=change(value).also{value=it}
            }
            var installation="first-id"
            val sdk=object:PhoneReminderFirebase {
                override val projectId="nourish-test"
                override fun autoInitialize(enabled:Boolean){}
                override suspend fun register()=installation
                override suspend fun unregister(){}
            }
            fun owner()=PhoneReminderCoordinator(origin,disk,backend,sdk,{true},{})
            assertEquals(PhoneReminderSync.RETRY,owner().connect("My Android"));assertNotNull(disk.read().pending)
            val first=backend.inspect(disk.read().clientId,disk.read().desired!!).binding!!
            disk.value=PhoneReminderState.parse(disk.read().json())
            assertEquals(PhoneReminderSync.COMPLETE,owner().sync());assertEquals(first,disk.read().deliveryBinding())
            installation="second-id";disk.update{it.copy(pendingInstallationId=installation)}
            assertEquals(PhoneReminderSync.COMPLETE,owner().sync());val rotated=disk.read().binding!!
            assertNotEquals(first.revision,rotated.revision);assertEquals(first.deviceId,rotated.deviceId)
            try{backend.disconnect(first);fail("Stale revision deleted the registration")}catch(error:PhoneReminderFailure){assertEquals(PhoneReminderIssue.CHANGED,error.issue)}
            backend.disconnect(rotated);disk.update{it.copy(pendingInstallationId="third-id")}
            assertEquals(PhoneReminderSync.ATTENTION,owner().sync());assertNull(backend.inspect(disk.read().clientId,disk.read().desired!!).binding)
            assertEquals(PhoneReminderSync.COMPLETE,owner().connect("My Android"));assertNotNull(disk.read().deliveryBinding())
            assertEquals(PhoneReminderSync.COMPLETE,owner().disconnect());assertNull(disk.read().binding)
            val result=server.finish();assertTrue(result.getBoolean("diaryUnchanged"));assertTrue(result.getBoolean("paused"));assertEquals(0,result.getInt("devices"));assertTrue(result.getBoolean("droppedReply"))
            val requests=result.getJSONArray("registerRequests");assertEquals(5,requests.length());assertEquals(requests.getString(0),requests.getString(1))
        }
    }
}
