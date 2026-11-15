package local.nourish.healthconnect

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.view.View
import android.webkit.PermissionRequest
import android.accessibilityservice.AccessibilityService
import android.os.SystemClock
import android.view.MotionEvent
import android.webkit.WebView
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

class UserManualEntryNativeTest {
    private val instrument=InstrumentationRegistry.getInstrumentation()
    private val context get()=instrument.targetContext
    private val guide="https://support.cronometer.com/hc/en-us/articles/360036016612-Mobile-Fasting"
    private fun evaluate(web:WebView,script:String):String {
        val done=CountDownLatch(1);val result=AtomicReference<String>()
        instrument.runOnMainSync{web.evaluateJavascript(script){result.set(it);done.countDown()}}
        assertTrue(done.await(5,TimeUnit.SECONDS));return result.get()
    }
    private fun until(message:String,check:()->Boolean) {
        repeat(80){if(check())return;Thread.sleep(100)};assertTrue(message,check())
    }
    @Test fun helpOpensInsideAppAndBackPreservesWorkspace() {
        ActivityScenario.launch<Activity>(context.packageManager.getLaunchIntentForPackage(context.packageName)!!).use { scenario ->
            lateinit var web:WebView
            scenario.onActivity { activity ->
                web=activity.window.decorView.findViewWithTag("nourishing-webview")
                web.stopLoading()
                web.loadDataWithBaseURL("https://fixture.example.ts.net:8443/manual-fixture","<html><head><meta name='viewport' content='width=device-width, initial-scale=1'></head><body style='margin:0'><a href='$guide' target='_blank' rel='noopener noreferrer' style='display:block;height:80px'>User Manual</a><input id='draft' value='unsaved diary draft'><script>window.fixtureReady=true</script></body></html>","text/html","UTF-8","https://fixture.example.ts.net:8443/manual-fixture")
            }
            until("Workspace fixture did not load"){evaluate(web,"window.fixtureReady===true")=="true"}
            scenario.onActivity{assertEquals("https://fixture.example.ts.net:8443/manual-fixture",web.url)}
            val monitor=instrument.addMonitor("local.nourish.healthconnect.UserManualActivity",null,false)
            var manual:Activity?=null
            try {
                val point=IntArray(2);var scale=1f
                instrument.runOnMainSync { web.getLocationOnScreen(point);scale=web.resources.displayMetrics.density }
                val now=SystemClock.uptimeMillis()
                for(action in listOf(MotionEvent.ACTION_DOWN,MotionEvent.ACTION_UP)) {
                    val event=MotionEvent.obtain(now,SystemClock.uptimeMillis(),action,point[0]+40*scale,point[1]+35*scale,0)
                    instrument.sendPointerSync(event);event.recycle()
                }
                manual=instrument.waitForMonitorWithTimeout(monitor,5000)
                assertNotNull("Help opened outside Nourishing instead of the User Manual screen",manual)
                instrument.runOnMainSync {
                    assertNotNull(manual!!.window.decorView.findViewWithTag<WebView>("nourishing-manual-webview"))
                    manual!!.window.decorView.findViewWithTag<android.view.View>("manual-back").performClick()
                }
                until("Manual did not close"){manual!!.isFinishing||manual!!.isDestroyed}
                assertEquals("\"unsaved diary draft\"",evaluate(web,"document.querySelector('#draft').value"))
                assertFalse(web.isDestroyedForTest())
            } finally { instrument.runOnMainSync{manual?.finish()};instrument.removeMonitor(monitor) }
        }
    }
    private fun WebView.isDestroyedForTest()=parent==null
}
