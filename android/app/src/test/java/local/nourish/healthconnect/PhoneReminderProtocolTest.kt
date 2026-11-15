package local.nourish.healthconnect

import java.net.InetAddress
import kotlinx.coroutines.runBlocking
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class PhoneReminderProtocolTest {
    private class Fixture:AutoCloseable {
        private val certificate=HeldCertificate.Builder().addSubjectAlternativeName("fixture.test.ts.net").build()
        val server=MockWebServer().apply{useHttps(HandshakeCertificates.Builder().heldCertificate(certificate).build().sslSocketFactory());start()}
        private val trust=HandshakeCertificates.Builder().addTrustedCertificate(certificate.certificate).build()
        private val http=WorkspaceClient.defaultClient().newBuilder().sslSocketFactory(trust.sslSocketFactory(),trust.trustManager).dns{listOf(InetAddress.getByName("127.0.0.1"))}.build()
        val backend=PrivatePhoneReminderBackend(WorkspaceClient(http))
        val authority=PhoneReminderAuthority(WorkspaceOrigin.parse("https://fixture.test.ts.net:${server.port}"),"owner@example.test","nourish-test","Phone")
        fun reply()=JSONObject().put("version",1).put("projectId","nourish-test").put("registration",JSONObject.NULL).put("access",JSONObject().put("mode","private").put("origin",authority.origin.value).put("login",authority.login))
        override fun close(){http.connectionPool.evictAll();http.dispatcher.executorService.shutdownNow();server.close()}
    }
    @Test fun foreignAccountsOriginsAndMalformedRepliesNeverProduceABinding()=runBlocking {
        Fixture().use{f->
            val cases=listOf(
                f.reply().apply{getJSONObject("access").put("login","other@example.test")} to PhoneReminderIssue.ACCOUNT,
                f.reply().apply{getJSONObject("access").put("origin","https://other.test.ts.net")} to PhoneReminderIssue.ACCOUNT,
                f.reply().put("version","1") to PhoneReminderIssue.PROTOCOL,
                f.reply().put("projectId",123) to PhoneReminderIssue.PROTOCOL,
                f.reply().put("registration",JSONObject().put("deviceId","b".repeat(64)).put("revision","00000000-0000-4000-8000-000000000001").put("projectId","nourish-test").put("installationId","synthetic").put("label","Phone")) to PhoneReminderIssue.PROTOCOL
            )
            for((reply,issue)in cases){
                f.server.enqueue(MockResponse(body=reply.toString()))
                try{f.backend.inspect("a".repeat(64),f.authority);fail("Invalid reply accepted")}catch(error:PhoneReminderFailure){assertEquals(issue,error.issue)}
            }
            assertEquals(cases.size,f.server.requestCount)
        }
    }
    @Test fun rejectionsStopForAttentionWhileTransientServerErrorsRemainRetryable()=runBlocking {
        Fixture().use{f->
            for((status,issue)in listOf(401 to PhoneReminderIssue.ACCOUNT,403 to PhoneReminderIssue.ACCOUNT,409 to PhoneReminderIssue.CHANGED,400 to PhoneReminderIssue.PROTOCOL)){
                f.server.enqueue(MockResponse(code=status,body="{}"))
                try{f.backend.inspect("a".repeat(64),f.authority);fail("Rejected response accepted")}catch(error:PhoneReminderFailure){assertEquals(issue,error.issue)}
            }
            f.server.enqueue(MockResponse(code=503,body="{}"))
            try{f.backend.inspect("a".repeat(64),f.authority);fail("Unavailable response accepted")}catch(error:WorkspaceTransferFailure){assertEquals(503,error.httpStatus)}
            assertEquals(5,f.server.requestCount)
        }
    }
}
