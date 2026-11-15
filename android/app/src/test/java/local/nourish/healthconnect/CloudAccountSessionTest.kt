package local.nourish.healthconnect

import org.junit.Assert.*
import org.junit.Test
import okhttp3.Request

class CloudAccountSessionTest {
    private val origin=CloudOrigin.parse("https://nourishing.app")
    private class Fixture {
        var cookie:String?="other=ignored; __Host-nourishing_session=first%3Dsecret"
        var response=CloudHttpReply(200,"{\"id\":\"account-A\",\"email\":\"same@example.test\"}")
        var during:(()->Unit)?=null
        val requests=mutableListOf<Request>()
        var invalidations=0
        val session=CloudAccountSession(CloudOrigin.parse("https://nourishing.app"),{cookie},CloudHttpTransport{request->
            requests.add(request);during?.invoke();response
        },{invalidations++})
    }
    private inline fun <reified T:Throwable> rejects(block:()->Unit){try{block();fail("Expected ${T::class.simpleName}")}catch(error:Throwable){if(error !is T)throw error}}
    @Test fun exactCloudOriginsAndApiPaths(){
        assertEquals(origin,CloudOrigin.parse("https://NOURISHING.APP:443/"))
        assertEquals("https://nourishing-cloud.appwrite.network",CloudOrigin.parse("https://nourishing-cloud.appwrite.network").value)
        for(address in listOf("http://nourishing.app","https://nourishing.app.evil.test","https://evil.nourishing.app","https://nourishing.app:8443","https://user@nourishing.app","https://nourishing.app?x=1","https://nourishing.app/#x","https://nourishing.app/login","https://nourishing.app.","https://%6eourishing.app","https://fixture.example.ts.net:8443"))rejects<IllegalArgumentException>{CloudOrigin.parse(address)}
        for(path in listOf("https://evil.test/api/account","//evil.test/api/account","/api/../auth","/api/%2e%2e/auth","/api/a#fragment","/login","/api/a\\b"))rejects<IllegalArgumentException>{origin.endpoint(path)}
        assertEquals("https://nourishing.app/api/records?date=2026-11-14",origin.endpoint("/api/records?date=2026-11-14"))
    }
    @Test fun usesOnlyHostCookieAndServerId(){
        val f=Fixture();val lease=f.session.connect()
        assertEquals("account-A",lease.account.id)
        assertFalse(lease.toString().contains("secret"))
        assertEquals("__Host-nourishing_session=first%3Dsecret",f.requests.single().header("Cookie"))
        f.response=CloudHttpReply(200,"{\"ok\":true}")
        f.session.request(lease,"/api/health-connect/import?summary=1","{\"records\":[]}")
        val request=f.requests.last()
        assertEquals("https://nourishing.app",request.header("Origin"))
        assertEquals("POST",request.method);assertTrue(request.body!!.isOneShot())
        assertNull(request.header("Authorization"));assertTrue(f.session.isCurrent(lease))
    }
    @Test fun missingDuplicateAndMalformedCookiesNeverReachNetwork(){
        for(cookie in listOf(null,"","other=a","__Host-nourishing_session=","__Host-nourishing_session=a; __Host-nourishing_session=b","__Host-nourishing_session=a\nb","__Host-nourishing_session=\"a\"")){
            val f=Fixture();f.cookie=cookie;rejects<CloudSessionChanged>{f.session.connect()};assertTrue(f.requests.isEmpty())
        }
    }
    @Test fun accountSwitchNeverReusesOldLeaseEvenWithSameEmail(){
        val f=Fixture();val old=f.session.connect();f.cookie="__Host-nourishing_session=second"
        assertFalse(f.session.isCurrent(old));val before=f.requests.size
        rejects<CloudSessionChanged>{f.session.request(old,"/api/account")};assertEquals(before,f.requests.size)
        f.response=CloudHttpReply(200,"{\"id\":\"account-B\",\"email\":\"same@example.test\"}")
        val next=f.session.connect();assertEquals("account-B",next.account.id)
        assertFalse(f.session.isCurrent(old));assertTrue(f.session.isCurrent(next))
    }
    @Test fun logoutAndLateIdentityOrDataRepliesAreRejected(){
        val f=Fixture();f.during={f.session.invalidate()}
        rejects<CloudSessionChanged>{f.session.connect()}
        f.during=null;val lease=f.session.connect();f.during={f.cookie=null}
        rejects<CloudSessionChanged>{f.session.request(lease,"/api/workspace")};assertFalse(f.session.isCurrent(lease))
        f.cookie="__Host-nourishing_session=third";f.during=null;val current=f.session.connect()
        f.during={f.session.invalidate()};rejects<CloudSessionChanged>{f.session.request(current,"/api/workspace")}
    }
    @Test fun authenticationFailureInvalidatesButOtherErrorsDoNotRebind(){
        for(code in listOf(401,403)){
            val f=Fixture();val lease=f.session.connect();f.response=CloudHttpReply(code,"{}")
            rejects<CloudApiFailure>{f.session.request(lease,"/api/workspace")};assertFalse(f.session.isCurrent(lease))
        }
        val f=Fixture();val lease=f.session.connect()
        for(code in listOf(302,409,429,500)){
            f.response=CloudHttpReply(code,"{}")
            rejects<CloudApiFailure>{f.session.request(lease,"/api/workspace")};assertTrue(f.session.isCurrent(lease))
        }
    }
    @Test fun identityMustBeServerStringAndAValidId(){
        for(body in listOf("{}","{\"id\":1}","{\"id\":\"\"}","{\"id\":\"account with spaces\"}","not JSON")){
            val f=Fixture();f.response=CloudHttpReply(200,body);rejects<CloudProtocolFailure>{f.session.connect()}
        }
    }
    @Test fun leaseCannotBeUsedByAnotherSessionOwner(){
        val first=Fixture();val lease=first.session.connect();val second=Fixture();second.session.connect()
        rejects<CloudSessionChanged>{second.session.request(lease,"/api/workspace")}
        assertEquals(1,second.requests.size)
    }
}
