package local.nourish.healthconnect

import java.io.File
import java.net.InetAddress
import kotlinx.coroutines.runBlocking
import local.nourish.wearcontract.*
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class WearRelayHttpTest {
    private class Fixture:AutoCloseable{
        val certificate=HeldCertificate.Builder().addSubjectAlternativeName("fixture.test.ts.net").build()
        val server=MockWebServer().apply{useHttps(HandshakeCertificates.Builder().heldCertificate(certificate).build().sslSocketFactory());start()}
        val trust=HandshakeCertificates.Builder().addTrustedCertificate(certificate.certificate).build()
        val http=WorkspaceClient.defaultClient().newBuilder().sslSocketFactory(trust.sslSocketFactory(),trust.trustManager).dns{listOf(InetAddress.getByName("127.0.0.1"))}.build()
        val config=WearConfig(WorkspaceOrigin.parse("https://fixture.test.ts.net:${server.port}"),"owner@example.test","00000000-0000-4000-8000-000000000001")
        val run=WearRelayRun(config,"test")
        val revision="00000000-0000-4000-8000-000000000002"
        val batch=JSONObject(File(requireNotNull(System.getProperty("nourish.wearReminderFixture"))).readText())
        var saved:WearRegistration?=null
        var deliveries=0
        val records=object:WearRelayRegistrations{
            override fun clientId(config:WearConfig,node:String)="a".repeat(64)
            override fun load(config:WearConfig,node:String)=saved
            override fun save(config:WearConfig,node:String,value:WearRegistration){saved=value}
        }
        val cycle=WearRelayCycle({run},PrivateWearRelayWorkspace(WorkspaceClient(http)),records){_,path,bytes->
            if(path==WATCH_ALERT_STATE_PATH)WatchAlertState(config.revision,revision,setOf("food")).bytes()
            else{deliveries++;val packet=WatchAlertDelivery.parse(bytes);assertFalse(bytes.toString(Charsets.UTF_8).contains(config.login));WatchAlertReceipt(packet.event.id,"accepted","posted").bytes()}
        }
        fun identity(login:String=config.login)=MockResponse(body=JSONObject().put("mode","private").put("phone",JSONObject().put("configured",true).put("origin",config.origin.value).put("login",login)).toString())
        fun reply(value:JSONObject)=MockResponse(body=value.put("version",1).put("access",JSONObject().put("mode","private").put("origin",config.origin.value).put("login",config.login)).toString())
        override fun close(){http.connectionPool.evictAll();http.dispatcher.executorService.shutdownNow();server.close()}
    }
    @Test fun productionTlsClientUsesExactPrivateRoutesAndBoundAcknowledgement()=runBlocking{
        Fixture().use{f->
            val id=f.batch.getJSONArray("events").getJSONObject(0).getString("id")
            f.server.enqueue(f.identity());f.server.enqueue(f.reply(JSONObject().put("deviceId","b".repeat(64)).put("revision",f.revision)))
            f.server.enqueue(f.reply(f.batch));f.server.enqueue(f.reply(JSONObject().put("id",id).put("outcome","accepted")))
            assertEquals(1,f.cycle.deliver(f.run,"watch").accepted);assertEquals(1,f.deliveries);assertEquals(4,f.server.requestCount)
            val requests=(1..4).map{f.server.takeRequest()}
            assertEquals(listOf("/api/access","/api/wear-reminders/register","/api/wear-reminders/claim","/api/wear-reminders/ack"),requests.map{it.target})
            assertEquals(listOf("GET","POST","POST","POST"),requests.map{it.method})
            requests.forEach{assertNotNull(it.handshake);assertNull(it.headers["Authorization"]);assertNull(it.headers["Tailscale-User-Login"])}
            val ack=JSONObject(requests.last().body!!.utf8());assertEquals(id,ack.getString("id"));assertEquals(f.revision,ack.getString("revision"))
        }
    }
    @Test fun accountMismatchStopsBeforeAnyRegistration()=runBlocking{
        Fixture().use{f->f.server.enqueue(f.identity("other@example.test"));try{f.cycle.deliver(f.run,"watch");fail()}catch(_:IllegalArgumentException){};assertEquals(1,f.server.requestCount);assertEquals(0,f.deliveries)}
    }
    @Test fun serverRemovalDoesNotDropPreviousRevisionOrRetry()=runBlocking{
        Fixture().use{f->
            f.saved=WearRegistration("b".repeat(64),f.revision,setOf("food"))
            f.server.enqueue(f.identity());f.server.enqueue(MockResponse(code=409,body="""{"error":"Watch registration was removed. Enable it again explicitly."}"""))
            try{f.cycle.deliver(f.run,"watch");fail()}catch(error:WorkspaceTransferFailure){assertEquals(409,error.httpStatus)}
            assertEquals(2,f.server.requestCount);assertEquals(0,f.deliveries);f.server.takeRequest()
            assertEquals(f.revision,JSONObject(f.server.takeRequest().body!!.utf8()).getString("previousRevision"))
        }
    }
}
