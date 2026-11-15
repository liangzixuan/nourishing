package local.nourish.healthconnect

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import androidx.work.WorkManager

/** Legacy jobs stay inactive in cloud builds. Their receipts and pending writes remain on disk. */
fun pauseUnmigratedNativeFeatures(context:Context) {
    if(NourishingWorkspace.cloudOrigin==null)return
    CloudWebSessions.initialize(context)
    stopHealthSync(context);stopHealthExport(context)
    WorkManager.getInstance(context).cancelUniqueWork(PHONE_REMINDER_WORK)
    WearRelayService.stop(context)
    PhoneReminderNotifications(context).clearDisplayed()
    if(CloudBackgroundSettings(context).config()!=null)scheduleCloudHealthSync(context)
    val manager=AppWidgetManager.getInstance(context)
    for(provider in listOf(ConsumedWidget::class.java,RemainingWidget::class.java,FastingWidget::class.java)){
        manager.getAppWidgetIds(ComponentName(context,provider)).forEach{id->
            WorkManager.getInstance(context).cancelUniqueWork("home-widget-$id")
            renderHomeWidget(context,id)
        }
    }
}
