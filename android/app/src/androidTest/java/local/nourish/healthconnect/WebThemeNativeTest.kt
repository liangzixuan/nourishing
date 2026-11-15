package local.nourish.healthconnect

import android.app.Activity
import android.content.ComponentName
import android.content.res.Configuration
import android.view.ContextThemeWrapper
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.*
import org.junit.Test

class WebThemeNativeTest {
    private val instrumentation=InstrumentationRegistry.getInstrumentation()
    private fun evaluate(web:WebView,script:String):String {
        val done=CountDownLatch(1);val result=AtomicReference<String>()
        instrumentation.runOnMainSync{web.evaluateJavascript(script){result.set(it);done.countDown()}}
        assertTrue(done.await(5,TimeUnit.SECONDS));return result.get()
    }
    @Test fun manifestThemeMakesWebViewFollowBothDeviceModes(){
        val context=instrumentation.targetContext
        val activityInfo=context.packageManager.getActivityInfo(ComponentName(context,NourishingActivity::class.java),0)
        for(dark in listOf(false,true)){
            lateinit var web:WebView
            val loaded=CountDownLatch(1)
            ActivityScenario.launch<Activity>(context.packageManager.getLaunchIntentForPackage(context.packageName)!!).use{scenario->
                scenario.onActivity{activity->
                    activity.window.decorView.findViewWithTag<WebView>("nourishing-webview").stopLoading()
                    val config=Configuration(activity.resources.configuration).apply{uiMode=(uiMode and Configuration.UI_MODE_NIGHT_MASK.inv()) or if(dark)Configuration.UI_MODE_NIGHT_YES else Configuration.UI_MODE_NIGHT_NO}
                    val themed=ContextThemeWrapper(activity.createConfigurationContext(config),activityInfo.themeResource)
                    web=WebView(themed).apply{settings.javaScriptEnabled=true}
                    web.webViewClient=object:WebViewClient(){override fun onPageFinished(view:WebView,url:String){loaded.countDown()}}
                    activity.setContentView(web)
                    web.loadDataWithBaseURL("https://fixture.test.ts.net/", "<html><head><meta name='color-scheme' content='dark light'></head><body><textarea>Retained draft</textarea></body></html>","text/html","UTF-8",null)
                }
                assertTrue(loaded.await(10,TimeUnit.SECONDS))
                assertEquals("WebView must report device dark="+dark,dark.toString(),evaluate(web,"matchMedia('(prefers-color-scheme: dark)').matches"))
                assertEquals("\"Retained draft\"",evaluate(web,"document.querySelector('textarea').value"))
                instrumentation.runOnMainSync{web.destroy()}
            }
        }
    }
}
