package local.nourish.healthconnect

import kotlinx.coroutines.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class PhoneReminderUiSessionTest {
    private class Fixture(scope:CoroutineScope){
        var configured=true;var allowed=true;var requested=false;var connected=false;var disconnected=false;var settings=0
        var permission:suspend()->Boolean={true};var onConnect:suspend()->Unit={};var cleanup:suspend()->Unit={}
        val session=PhoneReminderUiSession(scope,{JSONObject().put("configured",configured).put("allowed",allowed).put("connected",connected)},
            {requested=true;permission()},{onConnect();connected=true},{disconnected=true;connected=false},{cleanup()},{settings++})
    }
    @Test fun unconfiguredAndDeniedConnectionsNeverRegister()=runBlocking {
        val f=Fixture(this);f.configured=false;var reply:Result<JSONObject>?=null
        f.session.request("1","connect","Phone"){reply=it};assertEquals(PhoneReminderIssue.NOT_CONFIGURED,(reply!!.exceptionOrNull() as PhoneReminderFailure).issue);assertFalse(f.requested)
        f.configured=true;f.allowed=false;f.permission={false};f.session.request("2","connect","Phone"){reply=it}
        assertEquals(PhoneReminderIssue.PERMISSION,(reply!!.exceptionOrNull() as PhoneReminderFailure).issue);assertFalse(f.connected)
    }
    @Test fun cancellingPermissionWaitCannotConnectFromALateApproval()=runBlocking {
        val f=Fixture(this);f.allowed=false;val permission=CompletableDeferred<Boolean>();f.permission={permission.await()};var replies=0
        f.session.request("1","connect","Phone"){replies++};assertTrue(f.requested);f.session.cancel("1");permission.complete(true);yield()
        assertFalse(f.connected);assertEquals(0,replies)
    }
    @Test fun cancellationOnlyAffectsItsOwnRequestAndBusyMutationsAreRejected()=runBlocking {
        val f=Fixture(this);val pending=CompletableDeferred<Unit>();f.onConnect={pending.await()};var first=0;var error:Throwable?=null
        f.session.request("1","connect","Phone"){first++};f.session.cancel("old")
        f.session.request("2","connect","Phone"){error=it.exceptionOrNull()};assertEquals("busy",(error as PhoneReminderUiFailure).code)
        pending.complete(Unit);yield();assertEquals(1,first);assertTrue(f.connected)
    }
    @Test fun disconnectDisablesLocallyBeforeCleanupAndPageCloseDropsTheReply()=runBlocking {
        val f=Fixture(this);f.connected=true;val started=CompletableDeferred<Unit>();f.cleanup={started.complete(Unit);awaitCancellation()};var replies=0
        f.session.request("1","disconnect",null){replies++};started.await();assertTrue(f.disconnected);assertFalse(f.connected)
        f.session.cancel(null);yield();assertEquals(0,replies)
    }
    @Test fun statusAndSettingsDoNotConnectOrRequestPermission()=runBlocking {
        val f=Fixture(this);var reply:JSONObject?=null
        f.session.request("1","status",null){reply=it.getOrThrow()};assertFalse(reply!!.getBoolean("connected"))
        f.session.request("2","settings",null){};assertEquals(1,f.settings);assertFalse(f.requested);assertFalse(f.connected)
    }
}
