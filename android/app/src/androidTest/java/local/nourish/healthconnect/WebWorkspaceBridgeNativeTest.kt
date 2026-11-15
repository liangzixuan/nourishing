package local.nourish.healthconnect

import android.app.Activity
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.*
import org.junit.Test

class WebWorkspaceBridgeNativeTest {
    private val instrumentation=InstrumentationRegistry.getInstrumentation()
    private val origin=WorkspaceOrigin.parse("https://fixture.test.ts.net:8443")
    private fun evaluate(web:WebView,script:String):String {
        val done=CountDownLatch(1);val result=AtomicReference<String>()
        instrumentation.runOnMainSync{web.evaluateJavascript(script){result.set(it);done.countDown()}}
        assertTrue("JavaScript callback timed out",done.await(5,TimeUnit.SECONDS));return result.get()
    }
    @Test fun detachedBlobDownloadsCrossTheNativePortWithoutLosingBytes() {
        val context=instrumentation.targetContext
        val delivered=CountDownLatch(1);val received=AtomicReference<ByteArray>();val filename=AtomicReference<String>()
        lateinit var web:WebView;lateinit var bridge:WebWorkspaceBridge
        ActivityScenario.launch<Activity>(context.packageManager.getLaunchIntentForPackage(context.packageName)!!).use{scenario ->
            scenario.onActivity { activity ->
                activity.window.decorView.findViewWithTag<WebView>("nourishing-webview").stopLoading()
                web=WebView(activity);web.settings.javaScriptEnabled=true
                web.webChromeClient=object:android.webkit.WebChromeClient(){override fun onConsoleMessage(message:android.webkit.ConsoleMessage):Boolean{android.util.Log.i("NourishingFixture",message.message());return true}}
                bridge=WebWorkspaceBridge(web,WebWorkspacePolicy(origin),{name,mime,bytes->assertEquals("text/csv",mime);filename.set(name);received.set(bytes);delivered.countDown()},{fail("Unexpected print")},{fail("Unexpected Health Connect")},{_,_,_->fail("Unexpected share")},speech={_,reply->reply(Result.failure(IllegalStateException("Unexpected speech")))},cancelSpeech={},reminders={_,_,_,reply->reply(Result.failure(IllegalStateException("Unexpected reminder request")))},cancelReminders={})
                web.webViewClient=object:WebViewClient(){override fun onPageFinished(view:WebView,url:String){android.util.Log.i("NourishingFixture","Page finished: "+url+" current="+view.url);bridge.connect()}}
                activity.setContentView(web)
                web.loadDataWithBaseURL(origin.value+"/fixture","<html><body>Download fixture</body></html>","text/html","UTF-8",origin.value+"/fixture")
            }
            val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(10)
            while(evaluate(web,"window.__nourishingReady===true")!="true"&&System.nanoTime()<deadline)Thread.sleep(100)
            assertEquals(evaluate(web,"JSON.stringify({ready:window.__nourishingReady,installed:window.__nourishingInstalled,url:location.href,origin:location.origin})"),"true",evaluate(web,"window.__nourishingReady===true"))
            evaluate(web,"(()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['row,é\\n'.repeat(100000)],{type:'text/csv'}));a.download='report.csv';a.click();return true})()")
            assertTrue("Chunked export did not finish",delivered.await(20,TimeUnit.SECONDS))
            assertEquals("report.csv",filename.get());assertArrayEquals("row,é\n".repeat(100000).toByteArray(),received.get())
            instrumentation.runOnMainSync{bridge.close();web.destroy()}
        }
    }
    @Test fun capturedReportPrintsTheFrameAndNotTheDiary() {
        val context=instrumentation.targetContext
        val delivered=CountDownLatch(1);val html=AtomicReference<String>()
        lateinit var web:WebView;lateinit var bridge:WebWorkspaceBridge
        ActivityScenario.launch<Activity>(context.packageManager.getLaunchIntentForPackage(context.packageName)!!).use{scenario ->
            scenario.onActivity { activity ->
                activity.window.decorView.findViewWithTag<WebView>("nourishing-webview").stopLoading()
                web=WebView(activity);web.settings.javaScriptEnabled=true
                web.webChromeClient=object:android.webkit.WebChromeClient(){override fun onConsoleMessage(message:android.webkit.ConsoleMessage):Boolean{android.util.Log.i("NourishingFixture",message.message());return true}}
                bridge=WebWorkspaceBridge(web,WebWorkspacePolicy(origin),{_,_,_->fail("Unexpected download")},{html.set(it);delivered.countDown()},{fail("Unexpected Health Connect")},{_,_,_->fail("Unexpected share")},speech={_,reply->reply(Result.failure(IllegalStateException("Unexpected speech")))},cancelSpeech={},reminders={_,_,_,reply->reply(Result.failure(IllegalStateException("Unexpected reminder request")))},cancelReminders={})
                web.webViewClient=object:WebViewClient(){override fun onPageFinished(view:WebView,url:String){android.util.Log.i("NourishingFixture","Page finished: "+url+" current="+view.url);bridge.connect()}}
                activity.setContentView(web)
                web.loadDataWithBaseURL(origin.value+"/fixture","<html><body>DIARY_CONTROLS</body></html>","text/html","UTF-8",origin.value+"/fixture")
            }
            val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(10)
            while(evaluate(web,"window.__nourishingReady===true")!="true"&&System.nanoTime()<deadline)Thread.sleep(100)
            evaluate(web,"(()=>{const f=document.createElement('iframe');f.setAttribute('sandbox','allow-same-origin allow-modals');f.srcdoc='<html><body>REPORT_CONTENT é</body></html>';document.body.append(f);return true})()")
            var ready=false
            repeat(50){if(!ready){ready=evaluate(web,"!!document.querySelector('iframe')?.contentDocument?.body?.textContent.includes('REPORT_CONTENT')")=="true";if(!ready)Thread.sleep(100)}}
            assertTrue(ready)
            evaluate(web,"document.querySelector('iframe').contentWindow.print()")
            assertTrue("Report frame did not reach Android",delivered.await(10,TimeUnit.SECONDS))
            assertTrue(html.get().contains("REPORT_CONTENT é"));assertFalse(html.get().contains("DIARY_CONTROLS"))
            instrumentation.runOnMainSync{bridge.close();web.destroy()}
        }
    }
}
