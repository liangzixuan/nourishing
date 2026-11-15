package local.nourish.watch

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import java.time.Instant
import local.nourish.wearcontract.*

class WatchNotifications(private val context:Context,private val now:()->Instant={Instant.now()}){
    private val settings=WatchSettings(context)
    private val ledger=WatchDeliveryLedger(context)
    private val manager=context.getSystemService(NotificationManager::class.java)
    init{
        manager.createNotificationChannel(NotificationChannel("nourish-food",context.getString(R.string.watch_food_channel),NotificationManager.IMPORTANCE_DEFAULT))
        manager.createNotificationChannel(NotificationChannel("nourish-fasting",context.getString(R.string.watch_fasting_channel),NotificationManager.IMPORTANCE_DEFAULT))
    }
    fun permitted(kind:String):Boolean=(Build.VERSION.SDK_INT<33||context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED)&&manager.areNotificationsEnabled()&&manager.getNotificationChannel("nourish-$kind")?.importance!=NotificationManager.IMPORTANCE_NONE
    fun state(sender:String,phoneRevision:String):WatchAlertState=synchronized(WatchSettings.lock){
        val policy=settings.read().policy()?:return@synchronized WatchAlertState.unavailable()
        if(policy.phone!=sender||policy.phoneRevision!=phoneRevision)return@synchronized WatchAlertState.unavailable()
        WatchAlertState(policy.phoneRevision,policy.preferenceRevision,policy.kinds.filter{permitted(it)}.toSet())
    }
    fun setKinds(kinds:Set<String>,at:Instant=now())=synchronized(WatchSettings.lock){settings.setKinds(kinds,at);manager.cancelAll()}
    /** A permission result or button action belongs to the connection shown when it began. */
    fun changeKinds(expected:WatchAlertPolicy,kinds:Set<String>,at:Instant=now()):Boolean=synchronized(WatchSettings.lock){
        if(settings.read().policy()!=expected)return@synchronized false
        setKinds(kinds,at);true
    }
    fun selectPhone(phone:String)=synchronized(WatchSettings.lock){settings.selectPhone(phone,now());manager.cancelAll()}
    fun confirmRevision(phone:String,revision:String):Boolean=synchronized(WatchSettings.lock){
        val previous=settings.read().revision
        val confirmed=settings.confirmRevision(phone,revision,now())
        if(confirmed&&previous!=revision)manager.cancelAll()
        confirmed
    }
    fun disconnect()=synchronized(WatchSettings.lock){settings.disconnect();manager.cancelAll()}
    fun receive(sender:String,bytes:ByteArray):WatchAlertReceipt=synchronized(WatchSettings.lock){
        val packet=WatchAlertDelivery.parse(bytes);val event=packet.event;val policy=settings.read().policy()?:return@synchronized WatchAlertReceipt(event.id,"rejected","disabled")
        val rejected=policy.rejection(sender,packet,now(),permitted(event.kind));if(rejected!=null)return@synchronized WatchAlertReceipt(event.id,"rejected",rejected)
        try{
            val previous=ledger.claim(event,now());if(previous!=null)return@synchronized WatchAlertReceipt(event.id,previous,"duplicate")
            val open=PendingIntent.getActivity(context,0,Intent(context,WatchActivity::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val notification=Notification.Builder(context,"nourish-${event.kind}").setSmallIcon(R.drawable.watch_icon).setContentTitle(context.getString(R.string.app_name)).setContentText(context.getString(R.string.watch_reminder)).setContentIntent(open).setAutoCancel(true).setOnlyAlertOnce(true).setCategory(Notification.CATEGORY_REMINDER).setVisibility(Notification.VISIBILITY_PRIVATE).build()
            manager.notify("nourish-alert-${event.id}",1,notification);ledger.accepted(event.id);WatchAlertReceipt(event.id,"accepted","posted")
        }catch(_:Exception){WatchAlertReceipt(event.id,"unknown","post-unconfirmed")}
    }
}
