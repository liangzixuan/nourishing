package local.nourish.healthconnect

import android.app.Activity
import android.content.res.Configuration
import android.util.TypedValue
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.*
import org.junit.Test

class WebFontScaleNativeTest {
    private val instrumentation=InstrumentationRegistry.getInstrumentation()
    private fun evaluate(web:WebView,script:String):String {
        val done=CountDownLatch(1);val result=AtomicReference<String>()
        instrumentation.runOnMainSync{web.evaluateJavascript(script){result.set(it);done.countDown()}}
        assertTrue(done.await(5,TimeUnit.SECONDS));return result.get()
    }
    @Test fun deviceBaseSizeCrossesTheBoundPortAndRefreshesWithoutNavigation(){
        val context=instrumentation.targetContext
        val origin=WorkspaceOrigin.parse("https://fixture.test.ts.net:8443")
        lateinit var web:WebView;lateinit var bridge:WebWorkspaceBridge;var expected=0.0
        ActivityScenario.launch<Activity>(context.packageManager.getLaunchIntentForPackage(context.packageName)!!).use{scenario->
            scenario.onActivity{activity->
                activity.window.decorView.findViewWithTag<WebView>("nourishing-webview").stopLoading()
                val config=Configuration(activity.resources.configuration).apply{fontScale=2f}
                val scaledContext=activity.createConfigurationContext(config)
                val metrics=scaledContext.resources.displayMetrics
                expected=(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP,18f,metrics)/TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP,18f,metrics)).toDouble()
                assertTrue(expected>1.0)
                web=WebView(scaledContext).apply{settings.javaScriptEnabled=true;settings.textZoom=100}
                bridge=WebWorkspaceBridge(web,WebWorkspacePolicy(origin),{_,_,_->fail("Unexpected download")},{_,_->fail("Unexpected print")},{fail("Unexpected Health Connect")},{_,_,_->fail("Unexpected share")},speech={_,reply->reply(Result.failure(IllegalStateException("Unexpected speech")))},cancelSpeech={},reminders={_,_,_,reply->reply(Result.failure(IllegalStateException("Unexpected reminder request")))},cancelReminders={})
                web.webViewClient=object:WebViewClient(){override fun onPageFinished(view:WebView,url:String){bridge.connect()}}
                activity.setContentView(web)
                web.loadDataWithBaseURL(origin.value+"/fixture","<html><body><textarea>Retained draft</textarea></body></html>","text/html","UTF-8",origin.value+"/fixture")
            }
            val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(10)
            while(evaluate(web,"typeof window.NourishingNative?.deviceFontScale==='number'")!="true"&&System.nanoTime()<deadline)Thread.sleep(100)
            assertEquals(expected,evaluate(web,"window.NourishingNative.deviceFontScale").toDouble(),0.0001)
            evaluate(web,"window.fontEvents=0;window.addEventListener('nourishing:devicefontchange',()=>window.fontEvents++)")
            instrumentation.runOnMainSync{bridge.refreshFontScale()}
            val refreshDeadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5)
            while(evaluate(web,"window.fontEvents>0")!="true"&&System.nanoTime()<refreshDeadline)Thread.sleep(50)
            assertEquals("true",evaluate(web,"window.fontEvents>0"))
            assertEquals("\"Retained draft\"",evaluate(web,"document.querySelector('textarea').value"))
            instrumentation.runOnMainSync{bridge.close();web.destroy()}
        }
    }
}
