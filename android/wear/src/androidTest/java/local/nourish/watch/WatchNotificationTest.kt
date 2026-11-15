package local.nourish.watch

import android.Manifest
import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import local.nourish.wearcontract.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class WatchNotificationTest {
    private val instrument get()=InstrumentationRegistry.getInstrumentation()
    private val context get()=instrument.targetContext
    private val manager get()=context.getSystemService(NotificationManager::class.java)
    private val phoneRevision="00000000-0000-4000-8000-000000000001"
    private fun batch()=WatchReminderBatch.parse(JSONObject(instrument.context.assets.open("wear-reminder-claim.json").bufferedReader().use{it.readText()}))
    @Before fun reset(){
        if(Build.VERSION.SDK_INT>=33)instrument.uiAutomation.grantRuntimePermission(context.packageName,Manifest.permission.POST_NOTIFICATIONS)
        context.getSharedPreferences("watch-connection",Context.MODE_PRIVATE).edit().clear().commit()
        context.getSharedPreferences("watch-deliveries",Context.MODE_PRIVATE).edit().clear().commit()
        manager.cancelAll()
    }
    private fun configured():Pair<WatchNotifications,WatchAlertDelivery>{
        val batch=batch();val settings=WatchSettings(context);settings.selectPhone("phone",batch.asOf.minusSeconds(60));assertTrue(settings.confirmRevision("phone",phoneRevision,batch.asOf.minusSeconds(60)))
        val receiver=WatchNotifications(context){batch.asOf};receiver.setKinds(setOf("food"),batch.asOf.minusSeconds(60))
        val state=receiver.state("phone",phoneRevision);return receiver to WatchAlertDelivery(phoneRevision,requireNotNull(state.preferenceRevision),batch.asOf,batch.events.single())
    }
    @Test fun genericNotificationIsPostedOnceAndReceiptSurvivesNewReceiver(){
        val (receiver,packet)=configured();val result=receiver.receive("phone",packet.bytes());assertEquals("accepted",result.outcome)
        val notification=manager.activeNotifications.single();assertEquals("Nourishing",notification.notification.extras.getString(Notification.EXTRA_TITLE));assertEquals("Your reminder is ready. Open Nourishing when convenient.",notification.notification.extras.getString(Notification.EXTRA_TEXT))
        val second=WatchNotifications(context){packet.asOf}.receive("phone",packet.bytes());assertEquals("accepted",second.outcome);assertEquals("duplicate",second.reason);assertEquals(notification.postTime,manager.activeNotifications.single().postTime)
        receiver.disconnect();assertTrue(manager.activeNotifications.isEmpty());assertEquals("rejected",receiver.receive("phone",packet.bytes()).outcome)
    }
    @Test fun disabledChangedAndExpiredDeliveriesNeverPost(){
        val (receiver,packet)=configured();assertEquals("wrong-phone",receiver.receive("other",packet.bytes()).reason)
        receiver.setKinds(emptySet(),packet.asOf);assertEquals("changed",receiver.receive("phone",packet.bytes()).reason);assertTrue(manager.activeNotifications.isEmpty())
        receiver.setKinds(setOf("food"),packet.asOf);val state=receiver.state("phone",phoneRevision);val newer=packet.copy(preferenceRevision=requireNotNull(state.preferenceRevision));assertEquals("before-opt-in",receiver.receive("phone",newer.bytes()).reason)
        val fresh=newer.copy(event=newer.event.copy(dueAt=packet.asOf,expiresAt=packet.asOf.plusSeconds(900)))
        assertEquals("expired",WatchNotifications(context){fresh.event.expiresAt}.receive("phone",fresh.bytes()).reason);assertTrue(manager.activeNotifications.isEmpty())
    }
    @Test fun anInterruptedPostRemainsUnknownAndDoesNotRetry(){
        val (receiver,packet)=configured();assertNull(WatchDeliveryLedger(context).claim(packet.event,packet.asOf))
        val receipt=receiver.receive("phone",packet.bytes());assertEquals("unknown",receipt.outcome);assertEquals("duplicate",receipt.reason);assertTrue(manager.activeNotifications.isEmpty())
    }
    @Test fun changingPhoneRevisionRevokesConsentAndClearsPostedAlerts(){
        val (receiver,packet)=configured();assertEquals("accepted",receiver.receive("phone",packet.bytes()).outcome)
        assertTrue(receiver.confirmRevision("phone","00000000-0000-4000-8000-000000000002"))
        assertTrue(WatchSettings(context).read().kinds.isEmpty());assertTrue(manager.activeNotifications.isEmpty())
        assertEquals("changed",receiver.receive("phone",packet.bytes()).reason)
        assertFalse(receiver.confirmRevision("another-phone",phoneRevision))
    }
    @Test fun permissionResultCannotApplyToAChangedConnectionOrChangedChoices(){
        val (receiver,_)=configured();val settings=WatchSettings(context);val old=requireNotNull(settings.read().policy())
        assertTrue(receiver.changeKinds(old,setOf("fasting")))
        assertFalse(receiver.changeKinds(old,setOf("food","fasting")))
        val beforeDisconnect=requireNotNull(settings.read().policy());receiver.disconnect()
        assertFalse(receiver.changeKinds(beforeDisconnect,setOf("food")))
        receiver.selectPhone("other");assertTrue(receiver.confirmRevision("other",phoneRevision))
        assertFalse(receiver.changeKinds(beforeDisconnect,setOf("food")));assertTrue(settings.read().kinds.isEmpty())
    }
}
