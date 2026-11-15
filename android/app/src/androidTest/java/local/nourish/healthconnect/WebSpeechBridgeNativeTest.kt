package local.nourish.healthconnect

import android.app.Activity
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.*
import org.junit.Test

class WebSpeechBridgeNativeTest {
    private val instrumentation=InstrumentationRegistry.getInstrumentation()
    private fun evaluate(web:WebView,script:String):String {
        val done=CountDownLatch(1);val value=AtomicReference<String>()
        instrumentation.runOnMainSync{web.evaluateJavascript(script){value.set(it);done.countDown()}}
        assertTrue(done.await(5,TimeUnit.SECONDS));return value.get()
    }
    private fun until(web:WebView,script:String){
        val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(10)
        while(evaluate(web,script)!="true"&&System.nanoTime()<deadline)Thread.sleep(50)
        assertEquals(script,"true",evaluate(web,script))
    }
    @Test fun realWebViewPortReturnsSpeechAndDiscardsCancelledResults(){
        val context=instrumentation.targetContext;val origin=WorkspaceOrigin.parse("https://fixture.test.ts.net:8443")
        val language=AtomicReference<String>();val receiver=AtomicReference<(Result<String?>)->Unit>();val cancelled=AtomicInteger()
        lateinit var web:WebView;lateinit var bridge:WebWorkspaceBridge
        ActivityScenario.launch<Activity>(context.packageManager.getLaunchIntentForPackage(context.packageName)!!).use{scenario->
            scenario.onActivity{activity->
                activity.window.decorView.findViewWithTag<WebView>("nourishing-webview").stopLoading()
                web=WebView(activity);web.settings.javaScriptEnabled=true
                bridge=WebWorkspaceBridge(web,WebWorkspacePolicy(origin),{_,_,_->fail("Unexpected download")},{fail("Unexpected print")},{fail("Unexpected Health Connect")},{_,_,_->fail("Unexpected share")},speech={lang,reply->language.set(lang);receiver.set(reply)},cancelSpeech={cancelled.incrementAndGet()},reminders={_,_,_,reply->reply(Result.failure(IllegalStateException("Unexpected reminder request")))},cancelReminders={})
                web.webViewClient=object:WebViewClient(){override fun onPageFinished(view:WebView,url:String){bridge.connect()}}
                activity.setContentView(web);web.loadDataWithBaseURL(origin.value+"/fixture","<html><body>Speech fixture</body></html>","text/html","UTF-8",origin.value+"/fixture")
            }
            until(web,"window.__nourishingReady===true")
            evaluate(web,"window.voiceSignal=new AbortController();window.voiceResult='waiting';window.NourishingNative.dictate({language:'fr',signal:voiceSignal.signal}).then(v=>window.voiceResult=v,e=>window.voiceResult=e.name)")
            until(web,"window.voiceResult==='waiting'")
            val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5)
            while(receiver.get()==null&&System.nanoTime()<deadline)Thread.sleep(50)
            assertEquals("fr",language.get());assertNotNull(receiver.get())
            instrumentation.runOnMainSync{receiver.get().invoke(Result.success("Literal <riz> & poulet"))}
            until(web,"window.voiceResult==='Literal <riz> & poulet'")
            receiver.set(null);val before=cancelled.get()
            evaluate(web,"window.voiceSignal=new AbortController();window.voiceResult='waiting';window.NourishingNative.dictate({language:'de',signal:voiceSignal.signal}).then(v=>window.voiceResult=v,e=>window.voiceResult=e.name)")
            val nextDeadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5)
            while(receiver.get()==null&&System.nanoTime()<nextDeadline)Thread.sleep(50)
            assertNotNull(receiver.get());evaluate(web,"voiceSignal.abort()")
            until(web,"window.voiceResult==='AbortError'")
            instrumentation.runOnMainSync{receiver.get().invoke(Result.success("Late result"))}
            assertEquals("true",evaluate(web,"window.voiceResult==='AbortError'"));assertTrue(cancelled.get()>before)
            instrumentation.runOnMainSync{bridge.close();web.destroy()}
        }
    }
}
