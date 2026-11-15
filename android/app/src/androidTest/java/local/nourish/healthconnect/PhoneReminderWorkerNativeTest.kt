package local.nourish.healthconnect

import android.Manifest
import android.content.Context
import androidx.test.platform.app.InstrumentationRegistry
import androidx.work.ListenableWorker
import androidx.work.WorkerFactory
import androidx.work.WorkerParameters
import androidx.work.WorkManager
import androidx.work.WorkInfo
import androidx.work.await
import androidx.work.testing.TestListenableWorkerBuilder
import com.google.firebase.FirebaseApp
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.flow.first
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.Assert.*

class PhoneReminderWorkerNativeTest {
    private val instrument=InstrumentationRegistry.getInstrumentation()
    private val context get()=instrument.targetContext
    @Before fun prepare(){instrument.uiAutomation.grantRuntimePermission(context.packageName,Manifest.permission.POST_NOTIFICATIONS);clean()}
    @After fun clean(){context.getSharedPreferences("phone-reminders",0).edit().clear().commit()}
    private inner class Fixture {
        var remote:PhoneReminderBinding?=null;var offline=false;var lost=false;var auto=false;var queued=0;var registrations=0
        val backend=object:PhoneReminderBackend {
            override suspend fun identity(origin:WorkspaceOrigin):String{if(offline)throw IOException("offline");return "owner@example.test"}
            override suspend fun inspect(clientId:String,authority:PhoneReminderAuthority)=PhoneReminderInspection("nourish-test",remote)
            override suspend fun register(clientId:String,change:PhoneReminderChange.Register):PhoneReminderBinding {
                registrations++
                val binding=remote?:PhoneReminderBinding(change.authority.origin,change.authority.login,change.authority.projectId,"a".repeat(64),UUID.randomUUID().toString(),change.installationId,change.authority.label).also{remote=it}
                if(lost){lost=false;throw IOException("lost reply")};return binding
            }
            override suspend fun disconnect(binding:PhoneReminderBinding){remote=null}
        }
        val sdk=object:PhoneReminderFirebase {
            override val projectId="nourish-test"
            override fun autoInitialize(enabled:Boolean){auto=enabled}
            override suspend fun register()="synthetic-id"
            override suspend fun unregister(){}
        }
        val runtime=PhoneReminderRuntime(context,sdk,backend){queued++}
        fun worker():PhoneReminderWorker=TestListenableWorkerBuilder<PhoneReminderWorker>(context).setWorkerFactory(object:WorkerFactory(){
            override fun createWorker(appContext:Context,workerClassName:String,workerParameters:WorkerParameters):ListenableWorker=PhoneReminderWorker(appContext,workerParameters,runtime)
        }).build()
    }
    @Test fun unconfiguredFirebaseDoesNotInitializeOrRegister()=runBlocking {
        val apps=FirebaseApp.getApps(context).map{it.name};val sdk=AndroidPhoneReminderFirebase(context)
        assertNull(sdk.projectId);sdk.autoInitialize(false);sdk.unregister()
        try{sdk.register();fail("Unconfigured Firebase registered")}catch(error:PhoneReminderFailure){assertEquals(PhoneReminderIssue.NOT_CONFIGURED,error.issue)}
        assertEquals(apps,FirebaseApp.getApps(context).map{it.name})
        assertSame(PhoneReminderRuntime.get(context),PhoneReminderRuntime.get(context.applicationContext))
    }
    @Test fun workerFinishesALostReplyFromThePersistedRequest()=runBlocking {
        val f=Fixture();f.lost=true
        assertEquals(PhoneReminderSync.RETRY,f.runtime.connect("Phone"));val revision=f.remote!!.revision
        assertNotNull(PhoneReminderStore(context).read().pending)
        assertEquals(ListenableWorker.Result.success(),f.worker().doWork())
        assertEquals(revision,PhoneReminderStore(context).read().deliveryBinding()!!.revision);assertEquals(2,f.registrations)
    }
    @Test fun workerRetriesOfflineDisconnectAndNeverReenablesDelivery()=runBlocking {
        val f=Fixture();f.runtime.connect("Phone");f.offline=true
        assertEquals(PhoneReminderSync.RETRY,f.runtime.disconnect());assertNull(PhoneReminderStore(context).read().deliveryBinding());assertFalse(f.auto)
        assertEquals(ListenableWorker.Result.retry(),f.worker().doWork());assertNotNull(f.remote);assertTrue(f.runtime.status().getBoolean("canDisconnect"))
        f.offline=false;assertEquals(ListenableWorker.Result.success(),f.worker().doWork());assertNull(f.remote)
        assertNull(PhoneReminderStore(context).read().binding);assertFalse(PhoneReminderStore(context).read().enabled);assertFalse(f.runtime.status().getBoolean("canDisconnect"))
    }
    @Test fun registrationCallbackQueuesSavedWorkOnlyForAnEnabledConnection()=runBlocking {
        val f=Fixture();f.runtime.registered("unrequested");assertEquals(0,f.queued)
        f.runtime.connect("Phone");val before=f.queued;f.runtime.registered("new-id")
        assertEquals("new-id",PhoneReminderStore(context).read().pendingInstallationId);assertEquals(before+1,f.queued)
        f.runtime.disconnect();val disconnected=f.queued;f.runtime.registered("late-id")
        assertNull(PhoneReminderStore(context).read().pendingInstallationId);assertEquals(disconnected,f.queued)
    }
    @Test fun malformedSavedStateFailsTheWorkerWithoutOverwritingEvidence()=runBlocking {
        val f=Fixture();val raw="{invalid";val prefs=context.getSharedPreferences("phone-reminders",0);prefs.edit().putString("state",raw).commit()
        val result=f.worker().doWork();assertTrue(result is ListenableWorker.Result.Failure);assertEquals(raw,prefs.getString("state",null))
    }
    @Test fun workManagerExecutesSavedWorkAndStopsForMissingConfiguration()=runBlocking {
        val manager=WorkManager.getInstance(context)
        withTimeout(5000){manager.cancelUniqueWork(PHONE_REMINDER_WORK).await()}
        val previous=withTimeout(5000){manager.getWorkInfosForUniqueWorkFlow(PHONE_REMINDER_WORK).first()}.map{it.id}.toSet()
        try{
            PhoneReminderStore(context).update{it.copy(enabled=true,desired=PhoneReminderAuthority(NourishingWorkspace.policy.origin,"owner@example.test","nourish-test","Phone"))}
            PhoneReminderRuntime.get(context).enqueuePending()
            withTimeout(15000){manager.getWorkInfosForUniqueWorkFlow(PHONE_REMINDER_WORK).first{rows->PhoneReminderStore(context).read().issue==PhoneReminderIssue.PROJECT&&rows.any{it.id !in previous&&it.state==WorkInfo.State.SUCCEEDED}}}
            assertFalse(PhoneReminderStore(context).read().enabled);assertNull(PhoneReminderStore(context).read().deliveryBinding())
        }finally{withTimeout(5000){manager.cancelUniqueWork(PHONE_REMINDER_WORK).await()}}
    }
}
