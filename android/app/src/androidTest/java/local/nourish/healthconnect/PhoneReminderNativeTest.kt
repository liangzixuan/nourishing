package local.nourish.healthconnect

import android.Manifest
import android.app.Notification
import android.app.NotificationManager
import android.content.pm.PackageManager
import com.google.firebase.FirebaseOptions
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.Assert.*

class PhoneReminderNativeTest {
    private val instrument=InstrumentationRegistry.getInstrumentation()
    private val context get()=instrument.targetContext
    private val manager get()=context.getSystemService(NotificationManager::class.java)
    private val revision="dfc09d2a-2e23-4d05-94ee-2f2bf0799edf"
    private val binding=PhoneReminderBinding(NourishingWorkspace.policy.origin,"owner@example.test","nourish-test","a".repeat(64),revision,"synthetic:token","My Android")
    private fun data(language:String="en",suffix:Char='a')=mapOf("version" to "1","language" to language,"tag" to "nourish-"+suffix.toString().repeat(64),"registration" to revision)
    private fun store()=PhoneReminderStore(context)
    private fun until(message:String,condition:()->Boolean){val deadline=System.nanoTime()+5_000_000_000;while(!condition()&&System.nanoTime()<deadline)Thread.sleep(25);assertTrue(message,condition())}
    private fun notifications()=manager.activeNotifications.filter{it.notification.channelId==PhoneReminderNotifications.CHANNEL}
    private fun notification(tag:String):Notification {until("Notification was not posted"){notifications().any{it.tag==tag}};return notifications().single{it.tag==tag}.notification}
    private fun receive(value:Map<String,String> =data()):Boolean {val now=System.currentTimeMillis();return PhoneReminderNotifications(context).receive(value,now-1000,300,now)}
    @Before fun prepare(){
        instrument.uiAutomation.grantRuntimePermission(context.packageName,Manifest.permission.POST_NOTIFICATIONS)
        clean();store().update{it.copy(binding=binding,desired=binding.authority,enabled=true)}
    }
    @After fun clean(){
        PhoneReminderNotifications(context).clearDisplayed()
        until("Test notifications were not cleared"){notifications().isEmpty()}
        context.getSharedPreferences("phone-reminders",0).edit().clear().commit()
        context.deleteDatabase("phone-reminder-receipts.sqlite")
    }
    @Test fun supportedLanguagesDisplayOnlyBundledGenericText(){
        val expected=mapOf("en" to "Your reminder is ready. Open Nourishing when convenient.","fr" to "Votre rappel est prêt. Ouvrez Nourishing quand cela vous convient.","de" to "Ihre Erinnerung ist bereit. Öffnen Sie Nourishing, wenn es Ihnen passt.","pt-BR" to "Seu lembrete está pronto. Abra o Nourishing quando for conveniente.")
        expected.entries.forEachIndexed { index,(language,text) ->
            val value=data(language,('a'.code+index).toChar());assertTrue(receive(value))
            val notification=notification(value.getValue("tag"))
            assertEquals(text,notification.extras.getCharSequence(Notification.EXTRA_TEXT).toString())
            assertEquals("Nourishing",notification.extras.getCharSequence(Notification.EXTRA_TITLE).toString())
            assertEquals(PhoneReminderNotifications.CHANNEL,notification.channelId)
            assertEquals(Notification.VISIBILITY_PRIVATE,notification.visibility)
        }
    }
    @Test fun duplicateAfterDismissalIsNotRedisplayedByANewReceiverInstance(){
        assertTrue(receive());notification(data().getValue("tag"));manager.cancel(data()["tag"],0)
        until("Notification dismissal was not applied"){notifications().isEmpty()}
        assertFalse(receive());assertEquals(0,notifications().size)
    }
    @Test fun disabledExpiredForeignAndOldRegistrationMessagesAreIgnored(){
        store().update{it.copy(enabled=false)};assertFalse(receive());store().update{it.copy(enabled=true)}
        assertFalse(receive(data()+("registration" to "00000000-0000-4000-8000-000000000001")))
        assertFalse(receive(data()+("body" to "private meal")))
        val now=System.currentTimeMillis();assertFalse(PhoneReminderNotifications(context).receive(data(),now-300001,300,now))
        store().update{val other=binding.copy(origin=WorkspaceOrigin.parse("https://foreign.test.ts.net"));it.copy(binding=other,desired=other.authority)};assertFalse(receive())
        assertEquals(0,manager.activeNotifications.count{it.notification.channelId==PhoneReminderNotifications.CHANNEL})
    }
    @Test fun anUncertainDisplayClaimCannotBeReplayed(){
        val now=System.currentTimeMillis();val message=PhoneReminderMessage.parse(data(),now-1,300,now,revision)!!
        assertThrows(IllegalStateException::class.java){store().receive(message,now){error("Synthetic platform failure")}}
        assertFalse(store().receive(message,now){fail("Must not display twice")})
    }
    @Test fun notificationTapOpensThePackagedDiary(){
        assertTrue(receive());val monitor=instrument.addMonitor(NourishingActivity::class.java.name,null,false)
        try{
            notification(data().getValue("tag")).contentIntent.send()
            val activity=instrument.waitForMonitorWithTimeout(monitor,10000);assertNotNull("Notification did not open Nourishing",activity)
            assertEquals(NourishingWorkspace.policy.widgetUrl(WidgetDestination.DIARY),activity.intent.dataString)
            instrument.runOnMainSync{activity.finish()}
        }finally{instrument.removeMonitor(monitor)}
    }
    @Test fun pendingDisconnectSurvivesNewStoreAndCallbackCannotReenableIt(){
        val owner=store();val initial=owner.read()
        owner.update{it.copy(enabled=false,pending=PhoneReminderChange.Disconnect(binding),unregisterPending=true)}
        val restored=store();assertEquals(initial.clientId,restored.read().clientId)
        assertEquals(PhoneReminderChange.Disconnect(binding),restored.read().pending)
        restored.savePendingInstallationId("late-sdk-id",binding.projectId)
        assertFalse(restored.read().enabled);assertNull(restored.read().pendingInstallationId);assertFalse(receive())
    }
    @Test fun registrationCallbackOnlyUpdatesTheSelectedProjectAndPendingWorkBlocksDelivery(){
        store().savePendingInstallationId("new-id","other-project");assertNull(store().read().pendingInstallationId)
        store().savePendingInstallationId("new-id",binding.projectId);assertEquals("new-id",store().read().pendingInstallationId)
        assertFalse(receive());assertEquals(binding,store().read().binding)
    }
    @Test fun malformedSavedStateIsPreservedAndCannotBecomeANewRegistration(){
        val prefs=context.getSharedPreferences("phone-reminders",0);val raw=store().read().json().put("pendingInstallationId",123).toString()
        assertTrue(prefs.edit().putString("state",raw).commit())
        assertThrows(IllegalArgumentException::class.java){store().read()}
        assertEquals(raw,prefs.getString("state",null))
    }
    @Test fun unconfiguredFirebaseCannotAutoRegisterAndTheServiceIsPrivate(){
        assertNull(FirebaseOptions.fromResource(context))
        val info=context.packageManager.getApplicationInfo(context.packageName,PackageManager.GET_META_DATA)
        assertFalse(info.metaData.getBoolean("firebase_messaging_auto_init_enabled",true))
        assertTrue(info.metaData.getBoolean("firebase_messaging_installation_id_enabled",false))
        assertFalse(info.metaData.getBoolean("firebase_analytics_collection_enabled",true))
        assertFalse(info.metaData.getBoolean("firebase_messaging_notification_delegation_enabled",true))
        val service=context.packageManager.getServiceInfo(android.content.ComponentName(context,PhoneReminderMessagingService::class.java),0)
        assertFalse(service.exported)
    }
}
