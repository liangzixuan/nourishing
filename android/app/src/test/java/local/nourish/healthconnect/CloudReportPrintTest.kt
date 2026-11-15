package local.nourish.healthconnect

import org.junit.Assert.*
import org.junit.Test

class CloudReportPrintTest {
    private class Fixture {
        var cookie="__Host-nourishing_session=first";var account="owner";var status=200;var calls=0
        val session=CloudAccountSession(CloudOrigin.parse("https://nourishing.app"),{cookie},CloudHttpTransport{calls++;CloudHttpReply(status,"{\"id\":\"$account\"}")})
        val gate=CloudReportPrintGate(session)
    }
    @Test fun capturesOnlyFreshVerifiedAccountAtTrustedPage(){
        val f=Fixture();val capture=f.gate.capture("owner","https://nourishing.app/diary")
        assertEquals("owner",capture.lease.account.id);assertTrue(f.calls>=2);assertTrue(f.gate.isCurrent(capture,"https://nourishing.app/diary"))
        assertThrows(IllegalArgumentException::class.java){f.gate.capture("other","https://nourishing.app/diary")}
    }
    @Test fun foreignOriginAndMissingAccountAreRejectedBeforeNetwork(){
        for(page in listOf("https://other.example/diary","http://nourishing.app/diary","https://nourishing.app.evil.test/diary")){
            val f=Fixture();assertThrows(IllegalArgumentException::class.java){f.gate.capture("owner",page)};assertEquals(0,f.calls)
        }
        val f=Fixture();assertThrows(IllegalArgumentException::class.java){f.gate.capture("","https://nourishing.app/diary")};assertEquals(0,f.calls)
    }
    @Test fun logoutOrNavigationBeforeDialogInvalidatesCapture(){
        val f=Fixture();val capture=f.gate.capture("owner","https://nourishing.app/diary")
        assertFalse(f.gate.isCurrent(capture,"https://nourishing.app/login"))
        f.cookie="";f.session.refresh();assertFalse(f.gate.isCurrent(capture,"https://nourishing.app/diary"))
        assertThrows(CloudSessionChanged::class.java){f.gate.verify(capture,"https://nourishing.app/diary")}
    }
    @Test fun serverRevocationIsCheckedAgainBeforeDialog(){
        val f=Fixture();val capture=f.gate.capture("owner","https://nourishing.app/diary");f.status=401
        assertThrows(CloudApiFailure::class.java){f.gate.verify(capture,"https://nourishing.app/diary")}
        assertFalse(f.gate.isCurrent(capture,"https://nourishing.app/diary"))
    }
}
