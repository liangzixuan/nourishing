package local.nourish.healthconnect

import java.io.File
import java.io.IOException
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.Rule
import org.junit.rules.TemporaryFolder

class CloudNativeBackgroundTest{
    @get:Rule val temp=TemporaryFolder()
    private inline fun <reified T:Throwable> rejects(block:()->Unit){try{block();fail("Expected ${T::class.simpleName}")}catch(error:Throwable){if(error !is T)throw error}}
    private class Fixture{
        var cookie:String?="__Host-nourishing_session=fixture-A"
        var account="account-A"
        var changed:((String)->Unit)?=null
        var failure=false
        var invalidations=0
        val requests=mutableListOf<String>()
        val counts="{\"added\":1,\"updated\":0,\"unchanged\":0}"
        val session=CloudAccountSession(CloudOrigin.parse("https://nourishing.app"),{cookie},CloudHttpTransport{request->
            val path=request.url.encodedPath;requests.add(path);changed?.invoke(path)
            when(path){
                "/api/account"->CloudHttpReply(200,"{\"id\":\"$account\"}")
                "/api/health-connect/preview"->CloudHttpReply(200,"{\"reviewToken\":\"${"a".repeat(64)}\",\"counts\":$counts,\"range\":{\"from\":\"2026-11-14\",\"to\":\"2026-11-14\",\"zone\":\"UTC\"},\"warnings\":[]}")
                else->{if(failure)throw IOException("Fixture timeout");CloudHttpReply(200,"{\"counts\":$counts}")}
            }
        },{invalidations++})
        val lease=session.acquire()
        val config=CloudBackgroundConfig(CloudNativeBinding.from(lease),setOf(ExportType.WEIGHT),7,"fixture-revision")
        var active=config
        val transfer=CloudBackgroundTransfer(session,{it==active})
    }
    private fun file():File=temp.newFile().apply{writeText("{\"format\":\"nourish-health-connect\",\"records\":[]}")}
    @Test fun leaseReuseDoesNotRevokeExplicitConsent(){
        val f=Fixture();assertSame(f.lease,f.session.acquire());assertEquals(1,f.requests.size);assertEquals(0,f.invalidations)
        val next=f.session.connect();assertEquals(0,f.invalidations);assertTrue(f.config.binding.owns(next));assertFalse(f.session.isCurrent(f.lease))
    }
    @Test fun accountAndCookieBindPersistedConfigurationAcrossRestart(){
        val f=Fixture();val saved=CloudBackgroundConfig.parse(JSONObject(f.config.json().toString()))
        assertEquals(f.config,saved);assertFalse(saved.json().toString().contains("fixture-A"));assertTrue(f.session.matchesCookie(saved.binding))
        f.cookie="__Host-nourishing_session=fixture-B";f.account="account-B"
        assertFalse(f.session.matchesCookie(saved.binding));val next=f.session.acquire();assertFalse(saved.binding.owns(next));assertEquals(1,f.invalidations)
        rejects<CloudSessionChanged>{f.transfer.check(saved,next)}
    }
    @Test fun syncChecksConsentAndAccessBeforeEachUpload(){
        val f=Fixture();var access=0;assertEquals(1,f.transfer.transfer(f.config,f.lease,file()){access++}.added);assertEquals(2,access)
        assertEquals(listOf("/api/account","/api/health-connect/preview","/api/health-connect/import"),f.requests)
    }
    @Test fun changedSelectionAfterPreviewCannotImport(){
        val f=Fixture();f.changed={path->if(path.endsWith("preview"))f.active=f.config.copy(revision="new-selection")}
        rejects<CloudSessionChanged>{f.transfer.transfer(f.config,f.lease,file())};assertFalse(f.requests.any{it.endsWith("import")})
    }
    @Test fun changedAccountAfterPreviewCannotImportOrPublish(){
        val f=Fixture();f.changed={path->if(path.endsWith("preview"))f.cookie=null}
        rejects<CloudSessionChanged>{f.transfer.transfer(f.config,f.lease,file())};var published=false
        assertFalse(f.session.publish(f.lease){published=true});assertFalse(published);assertFalse(f.requests.any{it.endsWith("import")})
    }
    @Test fun lostCommitResponseIsNotAutomaticallyReplayed(){
        val f=Fixture();f.failure=true;rejects<CloudHealthImportUncertain>{f.transfer.transfer(f.config,f.lease,file())}
        assertEquals(1,f.requests.count{it.endsWith("import")});assertTrue(f.session.isCurrent(f.lease))
    }
    @Test fun logoutDuringAccountCheckInvalidatesNativeState(){
        val f=Fixture();f.changed={path->if(path=="/api/account"){f.cookie=null;f.session.refresh()}}
        rejects<CloudSessionChanged>{f.session.connect()};assertEquals(1,f.invalidations)
        assertFalse(f.session.matchesCookie(f.config.binding))
    }
    @Test fun boundsAndAccountIsolation(){
        val f=Fixture();rejects<IllegalArgumentException>{f.config.copy(days=31)};rejects<IllegalArgumentException>{f.config.copy(types=emptySet())}
        rejects<CloudSessionChanged>{f.transfer.check(f.config.copy(binding=f.config.binding.copy(accountId="account-B")),f.lease)}
    }
}
