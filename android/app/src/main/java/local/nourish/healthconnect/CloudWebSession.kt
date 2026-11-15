package local.nourish.healthconnect

import android.webkit.CookieManager
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.appwidget.AppWidgetManager
import android.content.ComponentName

/** The web shell and foreground Health Connect share the same first-party session. */
fun cloudWebSession(origin:CloudOrigin,onInvalidated:()->Unit):CloudAccountSession =
    CloudAccountSession(origin,{address->CookieManager.getInstance().getCookie(address)},onInvalidated=onInvalidated)

object CloudWebSessions {
    private var current:CloudAccountSession?=null
    private var application:Context?=null
    fun initialize(context:Context){
        synchronized(this){application=context.applicationContext}
        val origin=NourishingWorkspace.cloudOrigin?:return
        val session=get(origin);val settings=CloudBackgroundSettings(context);val config=settings.config()
        if(config!=null&&!session.matchesCookie(config.binding)){settings.disable("Sign in and enable hourly import again");stopCloudHealthSync(context)}
    }
    private fun invalidated(){
        val context=application?:return
        CloudBackgroundSettings(context).disable("Sign in and enable hourly import again")
        stopCloudHealthSync(context);CloudWidgetStore(context).clearSnapshots()
        Handler(Looper.getMainLooper()).post{
            val manager=AppWidgetManager.getInstance(context)
            for(provider in listOf(ConsumedWidget::class.java,RemainingWidget::class.java,FastingWidget::class.java))
                manager.getAppWidgetIds(ComponentName(context,provider)).forEach{renderHomeWidget(context,it)}
        }
    }
    @Synchronized fun get(origin:CloudOrigin):CloudAccountSession {
        if(current?.origin!=origin){current?.invalidate();current=cloudWebSession(origin,::invalidated)}
        return current!!
    }
    fun refresh(){synchronized(this){current}?.refresh()}
}
