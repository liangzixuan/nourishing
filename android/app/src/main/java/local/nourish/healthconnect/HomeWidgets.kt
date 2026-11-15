package local.nourish.healthconnect

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import androidx.core.widget.RemoteViewsCompat
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.CancellationException

private const val REFRESH_WIDGET = "local.nourish.healthconnect.REFRESH_WIDGET"
private fun workName(id: Int) = "home-widget-$id"
fun widgetKind(context: Context, id: Int): WidgetKind? = when (AppWidgetManager.getInstance(context).getAppWidgetInfo(id)?.provider?.className) {
    ConsumedWidget::class.java.name -> WidgetKind.CONSUMED
    RemainingWidget::class.java.name -> WidgetKind.REMAINING
    FastingWidget::class.java.name -> WidgetKind.FASTING
    else -> null
}
fun refreshWidget(context: Context, id: Int) {
    if(NourishingWorkspace.cloudOrigin!=null){
        if(widgetKind(context,id)==null||CloudWidgetStore(context).config(id)==null)return
        WorkManager.getInstance(context).enqueueUniqueWork(workName(id),ExistingWorkPolicy.REPLACE,
            OneTimeWorkRequestBuilder<CloudHomeWidgetWorker>().setInputData(workDataOf("widgetId" to id)).build())
        return
    }
    if (widgetKind(context,id) == null || HomeWidgetStore(context).config(id) == null) return
    WorkManager.getInstance(context).enqueueUniqueWork(workName(id),ExistingWorkPolicy.REPLACE,
        OneTimeWorkRequestBuilder<HomeWidgetWorker>().setInputData(workDataOf("widgetId" to id)).build())
}
fun renderHomeWidget(context: Context, id: Int) = synchronized(HomeWidgetStore.lock) {
    val manager = AppWidgetManager.getInstance(context)
    val info = manager.getAppWidgetInfo(id) ?: return@synchronized
    val store = HomeWidgetStore(context);val config = store.config(id)
    val cloudStore=CloudWidgetStore(context)
    val cloud=if(NourishingWorkspace.cloudOrigin!=null)cloudStore.config(id)?.takeIf{it.binding.origin==NourishingWorkspace.cloudOrigin&&CloudWebSessions.get(it.binding.origin).matchesCookie(it.binding)}else null
    val snapshot = cloud?.let{cloudStore.snapshot(id,it)}?:config?.let { store.snapshot(id,it) }
    val configured=cloud!=null||config!=null
    val selectedKind=cloud?.kind?:config?.kind
    val selectedOrigin=cloud?.let{WorkspaceOrigin.parse(it.binding.origin.value)}?:config?.origin
    val height = manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,180) / context.resources.configuration.fontScale
    // Below the declared 180dp minimum in scaled text space, reserve the value and date.
    val compact = height < 180
    val views = RemoteViews(context.packageName,if(compact) R.layout.home_widget_compact else R.layout.home_widget)
    val summary = RemoteViews(context.packageName,if(compact) R.layout.home_widget_summary_compact else R.layout.home_widget_summary)
    summary.setTextViewText(R.id.widget_title,snapshot?.card?.title ?: context.getString(R.string.app_name))
    summary.setTextViewText(R.id.widget_value,snapshot?.card?.value ?: context.getString(if(!configured) R.string.widget_unconfigured else R.string.widget_refresh_needed))
    val stamp = snapshot?.let { context.getString(R.string.widget_snapshot,it.date.toString(),DateTimeFormatter.ofPattern("HH:mm").format(it.asOf.atZone(it.zone)),it.zone.id) }
        ?: if(NourishingWorkspace.cloudOrigin!=null){if(!configured)"Connect the account signed into Nourishing" else "Open Nourishing and sign in, then Refresh"}
        else context.getString(if(!configured) R.string.widget_choose_workspace else R.string.widget_connection_hint)
    views.setTextViewText(R.id.widget_stamp,if(compact) snapshot?.let{context.getString(R.string.widget_as_of,it.date.toString())} ?: context.getString(R.string.widget_not_updated) else stamp)
    views.setContentDescription(R.id.widget_stamp,stamp)
    summary.setTextViewText(R.id.widget_detail,snapshot?.card?.detail.orEmpty())
    summary.setTextViewText(R.id.widget_expanded,snapshot?.card?.expanded.orEmpty())
    summary.setViewVisibility(R.id.widget_detail,if(height>=250 && snapshot!=null) View.VISIBLE else View.GONE)
    summary.setViewVisibility(R.id.widget_expanded,if(height>=440 && snapshot!=null) View.VISIBLE else View.GONE)
    summary.setViewVisibility(R.id.widget_progress,if(!compact&&snapshot?.card?.progress!=null) View.VISIBLE else View.GONE)
    summary.setProgressBar(R.id.widget_progress,100,snapshot?.card?.progress ?: 0,false)
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    val configure = Intent(context,HomeWidgetConfiguration::class.java).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id)
        .setData(Uri.parse("nourish-widget://configure/$id"))
    views.setOnClickPendingIntent(R.id.widget_configure,PendingIntent.getActivity(context,id,configure,flags))
    val open = if(selectedOrigin==null) configure else NourishingWorkspace.widgetIntent(context,selectedOrigin,if(selectedKind==WidgetKind.FASTING) WidgetDestination.FASTING else WidgetDestination.DIARY)
    val openPending = PendingIntent.getActivity(context,id,open,flags)
    views.setOnClickPendingIntent(R.id.widget_open,openPending)
    views.setPendingIntentTemplate(R.id.widget_list,openPending)
    summary.setOnClickFillInIntent(R.id.widget_content,Intent())
    val items=RemoteViewsCompat.RemoteCollectionItems.Builder().setViewTypeCount(3).setHasStableIds(true).addItem(0,summary)
    val credits=snapshot?.card?.attributions.orEmpty()
    if(credits.isNotEmpty()){
        val sources=RemoteViews(context.packageName,R.layout.home_widget_sources)
        sources.setTextViewText(R.id.widget_sources,context.getString(R.string.widget_sources)+"\n"+credits.joinToString("\n\n"))
        sources.setOnClickFillInIntent(R.id.widget_sources,Intent())
        items.addItem(1,sources)
    }
    RemoteViewsCompat.setRemoteAdapter(context,views,id,R.id.widget_list,items.build())
    views.setViewVisibility(R.id.widget_food,if(selectedKind==WidgetKind.REMAINING && height>=250) View.VISIBLE else View.GONE)
    if(selectedOrigin!=null) views.setOnClickPendingIntent(R.id.widget_food,PendingIntent.getActivity(context,id,NourishingWorkspace.widgetIntent(context,selectedOrigin,WidgetDestination.FOOD),flags))
    val refresh = Intent(context,Class.forName(info.provider.className)).setAction(REFRESH_WIDGET)
        .setData(Uri.parse("nourish-widget://refresh/$id")).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id)
    views.setOnClickPendingIntent(R.id.widget_refresh,PendingIntent.getBroadcast(context,id,refresh,flags))
    manager.updateAppWidget(id,views)
}
open class HomeWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { renderHomeWidget(context,it);refreshWidget(context,it) }
    }
    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) { renderHomeWidget(context,id) }
    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context,intent)
        if(intent.action==REFRESH_WIDGET) refreshWidget(context,intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,AppWidgetManager.INVALID_APPWIDGET_ID))
    }
    override fun onDeleted(context: Context, ids: IntArray) {
        ids.forEach { HomeWidgetStore(context).delete(it);CloudWidgetStore(context).delete(it);WorkManager.getInstance(context).cancelUniqueWork(workName(it)) }
    }
    override fun onRestored(context: Context, oldWidgetIds: IntArray, newWidgetIds: IntArray) {
        onDeleted(context,oldWidgetIds);newWidgetIds.forEach { HomeWidgetStore(context).delete(it);CloudWidgetStore(context).delete(it);renderHomeWidget(context,it) }
    }
}
class ConsumedWidget : HomeWidgetProvider()
class RemainingWidget : HomeWidgetProvider()
class FastingWidget : HomeWidgetProvider()

class HomeWidgetWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context,parameters) {
    override suspend fun doWork(): Result {
        val id=inputData.getInt("widgetId",AppWidgetManager.INVALID_APPWIDGET_ID)
        val store=HomeWidgetStore(applicationContext);val config=store.config(id) ?: return Result.success()
        if(widgetKind(applicationContext,id)!=config.kind)return Result.success()
        try {
            val json=WorkspaceClient().widgetSnapshot(config)
            if(store.publish(id,config,json))renderHomeWidget(applicationContext,id)
        } catch(error: CancellationException) { throw error }
        catch(_: Exception) { if(store.publish(id,config,null))renderHomeWidget(applicationContext,id) }
        return Result.success()
    }
}
