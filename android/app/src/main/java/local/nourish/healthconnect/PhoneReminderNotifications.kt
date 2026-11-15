package local.nourish.healthconnect

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Build
import java.util.Locale

class PhoneReminderNotifications(private val context:Context) {
    private val manager=context.getSystemService(NotificationManager::class.java)
    fun allowed():Boolean=(Build.VERSION.SDK_INT<33||context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED)&&manager.areNotificationsEnabled()&&manager.getNotificationChannel(CHANNEL)?.importance!=NotificationManager.IMPORTANCE_NONE
    fun receive(data:Map<String,String>,sentAt:Long,ttlSeconds:Int,now:Long=System.currentTimeMillis()):Boolean {
        val store=PhoneReminderStore(context)
        if(!allowed())return false
        val binding=store.read().deliveryBinding()?:return false
        if(binding.origin!=NourishingWorkspace.policy.origin)return false
        val message=PhoneReminderMessage.parse(data,sentAt,ttlSeconds,now,binding.revision)?:return false
        val localized=context.createConfigurationContext(Configuration(context.resources.configuration).apply{setLocale(Locale.forLanguageTag(message.language))})
        return store.receive(message,now){
            manager.createNotificationChannel(NotificationChannel(CHANNEL,context.getString(R.string.phone_reminder_channel),NotificationManager.IMPORTANCE_DEFAULT))
            val open=PendingIntent.getActivity(context,0,NourishingWorkspace.widgetIntent(context,binding.origin,WidgetDestination.DIARY),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val notification=Notification.Builder(context,CHANNEL).setSmallIcon(R.drawable.ic_launcher_foreground).setContentTitle(context.getString(R.string.app_name)).setContentText(localized.getString(R.string.phone_reminder_body)).setContentIntent(open).setAutoCancel(true).setOnlyAlertOnce(true).setVisibility(Notification.VISIBILITY_PRIVATE).setLocalOnly(true).build()
            manager.notify(message.tag,0,notification)
        }
    }
    fun clearDisplayed(){manager.activeNotifications.filter{it.notification.channelId==CHANNEL}.forEach{manager.cancel(it.tag,it.id)}}
    companion object {const val CHANNEL="nourishing-phone-reminders"}
}
