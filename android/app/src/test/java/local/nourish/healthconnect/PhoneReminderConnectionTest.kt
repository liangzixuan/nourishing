package local.nourish.healthconnect

import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test

class PhoneReminderConnectionTest {
    private val origin=WorkspaceOrigin.parse("https://fixture.test.ts.net")
    private class Memory:PhoneReminderStateStore {
        var state=PhoneReminderState("a".repeat(64))
        override fun read()=state
        override fun update(change:(PhoneReminderState)->PhoneReminderState):PhoneReminderState=change(state).also{state=it}
    }
    private inner class Fixture {
        val disk=Memory();var remote:PhoneReminderBinding?=null;var login="owner@example.test";var serverProject:String?="nourish-test";var permitted=true
        var sdkProject:String?="nourish-test";var installation="first-id";var sdkCalls=0;var unregisterCalls=0;var auto=false;var inspections=0;var registerCalls=0;var loseReply=false;var offline=false
        var afterRegister:suspend()->Unit={}
        var beforeInspect:suspend()->Unit={}
        val backend=object:PhoneReminderBackend {
            override suspend fun identity(origin:WorkspaceOrigin):String {if(offline)throw IOException("offline");return login}
            override suspend fun inspect(clientId:String,authority:PhoneReminderAuthority):PhoneReminderInspection {inspections++;beforeInspect();return PhoneReminderInspection(serverProject,remote)}
            override suspend fun register(clientId:String,change:PhoneReminderChange.Register):PhoneReminderBinding {
                registerCalls++
                val old=remote
                if(old?.installationId==change.installationId&&old.authority==change.authority){afterRegister();return old}
                if(old?.revision!=change.previousRevision)throw PhoneReminderFailure(PhoneReminderIssue.CHANGED)
                val next=PhoneReminderBinding(change.authority.origin,change.authority.login,change.authority.projectId,"b".repeat(64),UUID.randomUUID().toString(),change.installationId,change.authority.label)
                remote=next;afterRegister();if(loseReply){loseReply=false;throw IOException("reply lost")};return next
            }
            override suspend fun disconnect(binding:PhoneReminderBinding){
                if(remote!=null&&remote!!.revision!=binding.revision)throw PhoneReminderFailure(PhoneReminderIssue.CHANGED)
                remote=null
            }
        }
        val firebase=object:PhoneReminderFirebase {
            override val projectId get()=sdkProject
            override fun autoInitialize(enabled:Boolean){auto=enabled}
            override suspend fun register():String {sdkCalls++;return installation}
            override suspend fun unregister(){unregisterCalls++}
        }
        fun owner()=PhoneReminderCoordinator(origin,disk,backend,firebase,{permitted},{})
    }
    @Test fun explicitConnectionPersistsAndBackgroundSyncDoesNotInspectOrResend()=runBlocking {
        val f=Fixture();assertNull(f.disk.read().deliveryBinding());f.owner().connect("My phone")
        assertNotNull(f.disk.read().deliveryBinding());assertEquals(f.remote,f.disk.read().binding);assertEquals(1,f.sdkCalls);assertTrue(f.auto)
        assertEquals(PhoneReminderSync.COMPLETE,f.owner().sync());assertEquals(1,f.registerCalls);assertEquals(1,f.inspections)
        assertEquals(f.disk.read(),PhoneReminderState.parse(f.disk.read().json()))
    }
    @Test fun deniedPermissionOrMissingOrMismatchedConfigurationDoesNotEnableSdk()=runBlocking {
        for(kind in listOf("permission","missing","server")){
            val f=Fixture();when(kind){"permission"->f.permitted=false;"missing"->f.sdkProject=null;else->f.serverProject="other-project"}
            try{f.owner().connect("My phone");fail("Must reject $kind")}catch(_:PhoneReminderFailure){}
            assertFalse(f.disk.read().enabled);assertEquals(0,f.sdkCalls);assertFalse(f.auto)
        }
    }
    @Test fun lostRegistrationReplyReplaysTheExactSavedRequestAfterRestart()=runBlocking {
        val f=Fixture();f.loseReply=true
        assertEquals(PhoneReminderSync.RETRY,f.owner().connect("My phone"));assertNotNull(f.disk.read().pending);assertNull(f.disk.read().deliveryBinding());val revision=f.remote!!.revision
        f.disk.state=PhoneReminderState.parse(f.disk.read().json())
        assertEquals(PhoneReminderSync.COMPLETE,f.owner().sync());assertEquals(revision,f.remote!!.revision);assertEquals(2,f.registerCalls);assertNotNull(f.disk.read().deliveryBinding())
    }
    @Test fun disconnectDuringRegistrationDisablesDisplayAndCleansUpAfterReply()=runBlocking {
        val f=Fixture();val started=CompletableDeferred<Unit>();val release=CompletableDeferred<Unit>();f.afterRegister={started.complete(Unit);release.await()}
        val owner=f.owner();val work=async{owner.connect("My phone")};started.await();owner.requestDisconnect();assertFalse(f.disk.read().enabled);assertNull(f.disk.read().deliveryBinding());release.complete(Unit)
        work.await();assertNull(f.remote);assertNull(f.disk.read().binding);assertFalse(f.auto);assertEquals(1,f.unregisterCalls)
    }
    @Test fun offlineDisconnectStaysDisabledAndRetainsCleanupAcrossRestart()=runBlocking {
        val f=Fixture();val owner=f.owner();owner.connect("My phone");f.offline=true;owner.requestDisconnect()
        assertEquals(PhoneReminderSync.RETRY,owner.sync());assertFalse(f.disk.read().enabled);assertNotNull(f.disk.read().binding);assertNull(f.disk.read().deliveryBinding())
        f.disk.state=PhoneReminderState.parse(f.disk.read().json());f.offline=false;assertEquals(PhoneReminderSync.COMPLETE,f.owner().sync());assertNull(f.remote);assertNull(f.disk.read().binding);assertFalse(f.disk.read().unregisterPending)
    }
    @Test fun newerInstallationArrivingDuringUpdateIsNotLost()=runBlocking {
        val f=Fixture();f.owner().connect("My phone");f.disk.update{it.copy(pendingInstallationId="second-id")}
        var changed=false;f.afterRegister={if(!changed){changed=true;f.disk.update{it.copy(pendingInstallationId="third-id")}}}
        val first=f.owner().sync();assertTrue(first in setOf(PhoneReminderSync.COMPLETE,PhoneReminderSync.RETRY));f.owner().sync()
        assertEquals("third-id",f.remote!!.installationId);assertEquals("third-id",f.disk.read().binding!!.installationId);assertNull(f.disk.read().pendingInstallationId)
    }
    @Test fun removedServerRegistrationRequiresExplicitReconnect()=runBlocking {
        val f=Fixture();f.owner().connect("My phone");f.remote=null;f.disk.update{it.copy(pendingInstallationId="new-id")}
        assertEquals(PhoneReminderSync.ATTENTION,f.owner().sync());assertNull(f.remote);assertNull(f.disk.read().deliveryBinding());val before=f.inspections
        assertEquals(PhoneReminderSync.ATTENTION,f.owner().sync());assertEquals(before,f.inspections)
        f.installation="new-id";assertEquals(PhoneReminderSync.COMPLETE,f.owner().connect("My phone"));assertNotNull(f.remote);assertNull(f.disk.read().issue)
    }
    @Test fun accountChangeCannotMoveAConnectionToAnotherOwner()=runBlocking {
        val f=Fixture();f.owner().connect("My phone");f.login="other@example.test";f.disk.update{it.copy(pendingInstallationId="new-id")}
        assertEquals(PhoneReminderSync.ATTENTION,f.owner().sync());assertEquals("first-id",f.remote!!.installationId);assertNull(f.disk.read().deliveryBinding())
        try{f.owner().connect("My phone");fail("Must reject changed owner")}catch(_:PhoneReminderFailure){}
    }
    @Test fun cancelledConnectionRetainsTheExactPendingMutation()=runBlocking {
        val f=Fixture();val started=CompletableDeferred<Unit>();f.afterRegister={started.complete(Unit);awaitCancellation()}
        val job=launch{f.owner().connect("My phone")};started.await();job.cancelAndJoin();assertNotNull(f.disk.read().pending);assertNull(f.disk.read().deliveryBinding())
        f.afterRegister={};assertEquals(PhoneReminderSync.COMPLETE,f.owner().sync());assertEquals(f.remote,f.disk.read().binding)
    }
    @Test fun explicitDisconnectReconcilesAChangedRevisionWithoutBackgroundGuessing()=runBlocking {
        val f=Fixture();f.owner().connect("My phone");f.remote=f.remote!!.copy(revision=UUID.randomUUID().toString())
        val owner=f.owner();owner.requestDisconnect();assertEquals(PhoneReminderSync.ATTENTION,owner.sync());assertNotNull(f.remote)
        assertEquals(PhoneReminderSync.COMPLETE,owner.disconnect());assertNull(f.remote);assertNull(f.disk.read().binding)
    }
    @Test fun disconnectDuringConnectionLookupCannotBeOverwritten()=runBlocking {
        val f=Fixture();val started=CompletableDeferred<Unit>();val release=CompletableDeferred<Unit>()
        f.beforeInspect={started.complete(Unit);release.await()}
        val owner=f.owner();val work=async{owner.connect("My phone")};started.await();owner.requestDisconnect();release.complete(Unit)
        work.await();assertFalse(f.disk.read().enabled);assertNull(f.remote);assertEquals(0,f.sdkCalls)
    }
    @Test fun persistedIdentityFieldsMustNotCoerceNumbersToStrings(){
        val authority=PhoneReminderAuthority(origin,"owner@example.test","nourish-test","Phone")
        for(key in listOf("login","label"))assertThrows(IllegalArgumentException::class.java){PhoneReminderAuthority.parse(authority.json().put(key,123))}
        val binding=PhoneReminderBinding(origin,authority.login,authority.projectId,"b".repeat(64),UUID.randomUUID().toString(),"123",authority.label)
        assertThrows(IllegalArgumentException::class.java){PhoneReminderBinding.parse(binding.json().put("installationId",123))}
        assertThrows(IllegalArgumentException::class.java){PhoneReminderState.parse(PhoneReminderState("a".repeat(64)).json().put("pendingInstallationId",123))}
    }
    @Test fun backgroundReplayStopsWhenPermissionOrProjectIsNoLongerAvailable()=runBlocking {
        for(permission in listOf(false,true)){
            val f=Fixture();f.loseReply=true;f.owner().connect("My phone");val requests=f.registerCalls
            if(permission)f.permitted=false else f.sdkProject=null
            f.offline=true
            assertEquals(PhoneReminderSync.ATTENTION,f.owner().sync())
            assertEquals(if(permission)PhoneReminderIssue.PERMISSION else PhoneReminderIssue.PROJECT,f.disk.read().issue)
            assertEquals(requests,f.registerCalls);assertNull(f.disk.read().deliveryBinding());assertFalse(f.auto)
        }
    }
    @Test fun newerConnectionSupersedesUnfinishedExplicitDisconnectCleanup()=runBlocking {
        val f=Fixture();val owner=f.owner();owner.connect("Phone");owner.requestDisconnect()
        owner.connect("Phone again");val current=f.remote
        assertEquals(PhoneReminderSync.COMPLETE,owner.finishDisconnect());assertEquals(current,f.remote);assertNotNull(f.disk.read().deliveryBinding())
    }
    @Test fun explicitDisconnectResolvesTheSavedRequestBeforeInspectingAgain()=runBlocking {
        val f=Fixture();f.loseReply=true;val owner=f.owner();owner.connect("Phone")
        assertNotNull(f.disk.read().pending);val inspections=f.inspections
        assertEquals(PhoneReminderSync.COMPLETE,owner.disconnect());assertEquals(2,f.registerCalls);assertEquals(inspections,f.inspections)
        assertNull(f.remote);assertNull(f.disk.read().pending)
    }
}
