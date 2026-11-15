package local.nourish.healthconnect

import android.app.Activity
import android.webkit.WebView
import android.accessibilityservice.AccessibilityService
import androidx.lifecycle.Lifecycle
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.*
import org.junit.Test

class WebBackNativeTest {
    private val instrumentation=InstrumentationRegistry.getInstrumentation()
    private val context=instrumentation.targetContext
    private val origin="https://fixture.example.ts.net:8443"
    private fun evaluate(web:WebView,script:String):String {
        val done=CountDownLatch(1);val result=AtomicReference<String>()
        instrumentation.runOnMainSync{web.evaluateJavascript(script){result.set(it);done.countDown()}}
        assertTrue(done.await(5,TimeUnit.SECONDS));return result.get()
    }
    private fun until(check:()->Boolean):Boolean {repeat(50){if(check())return true;Thread.sleep(100)};return false}
    private fun load(scenario:ActivityScenario<Activity>,url:String):WebView {
        lateinit var web:WebView
        scenario.onActivity{activity->web=activity.window.decorView.findViewWithTag("nourishing-webview");web.stopLoading();web.loadDataWithBaseURL(url,"<html><body><dialog id='popup'>Popup</dialog><script>window.backCount=0;window.addEventListener('nourishing-back',e=>{window.backCount++;if(document.querySelector('dialog').open){e.preventDefault();document.querySelector('dialog').close();}});window.fixtureReady=true;</script></body></html>","text/html","UTF-8",url)}
        assertTrue(until{evaluate(web,"window.fixtureReady===true && location.href === "+org.json.JSONObject.quote(url))=="true"})
        return web
    }
    private fun pressBack(){assertTrue(instrumentation.uiAutomation.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK))}
    @Test fun systemBackDismissesTrustedPopupBeforeLeavingTheApp(){
        ActivityScenario.launch<Activity>(context.packageManager.getLaunchIntentForPackage(context.packageName)!!).use{scenario->
            val web=load(scenario,"$origin/back-popup")
            instrumentation.runOnMainSync{web.clearHistory()}
            evaluate(web,"document.querySelector('dialog').showModal()")
            pressBack()
            assertTrue("Back did not reach the workspace popup",until{scenario.state==Lifecycle.State.RESUMED&&evaluate(web,"window.backCount===1 && !document.querySelector('dialog').open")=="true"})
            assertEquals(Lifecycle.State.RESUMED,scenario.state)
            pressBack()
            assertTrue("Unhandled root Back did not leave the app",until{scenario.state!=Lifecycle.State.RESUMED})
        }
    }
    @Test fun foreignPageCannotConsumeNativeBack(){
        ActivityScenario.launch<Activity>(context.packageManager.getLaunchIntentForPackage(context.packageName)!!).use{scenario->
            val web=load(scenario,"https://example.org/back-fixture")
            instrumentation.runOnMainSync{web.clearHistory()}
            evaluate(web,"document.querySelector('dialog').showModal()")
            pressBack()
            assertTrue("Foreign page trapped Back",until{scenario.state!=Lifecycle.State.RESUMED})
        }
    }
    @Test fun unhandledBackUsesWebHistory(){
        ActivityScenario.launch<Activity>(context.packageManager.getLaunchIntentForPackage(context.packageName)!!).use{scenario->
            val web=load(scenario,"$origin/back-first")
            instrumentation.runOnMainSync{web.clearHistory()}
            load(scenario,"$origin/back-second")
            var hasHistory=false;instrumentation.runOnMainSync{hasHistory=web.canGoBack()};assertTrue(hasHistory)
            pressBack()
            assertTrue("Back did not use page history",until{scenario.state==Lifecycle.State.RESUMED&&evaluate(web,"location.href==='$origin/back-first'")=="true"})
        }
    }
}
