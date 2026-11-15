package local.nourish.healthconnect

import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.webkit.WebView
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.*
import org.junit.Test

/** Network smoke check, separate from deterministic activity tests. Uses only the public guide. */
class UserManualLiveTest {
    @Test fun publicGuideLoadsWithNormalTls() {
        val instrument=InstrumentationRegistry.getInstrumentation();val context=instrument.targetContext
        val url="https://support.cronometer.com/hc/en-us/articles/360036016612-Mobile-Fasting"
        ActivityScenario.launch<UserManualActivity>(Intent(context,UserManualActivity::class.java).setData(Uri.parse(url))).use { scenario ->
            lateinit var web:WebView;scenario.onActivity{web=it.window.decorView.findViewWithTag("nourishing-manual-webview")}
            var ready=false;val deadline=System.nanoTime()+30_000_000_000
            while(!ready&&System.nanoTime()<deadline) {
                val done=CountDownLatch(1);val result=AtomicReference<String>()
                instrument.runOnMainSync{web.evaluateJavascript("document.readyState==='complete' && !!document.querySelector('h1') && document.querySelector('h1').textContent.trim()==='Mobile - Fasting'"){result.set(it);done.countDown()}}
                assertTrue(done.await(3,TimeUnit.SECONDS));ready=result.get()=="true";if(!ready)Thread.sleep(250)
            }
            instrument.waitForIdleSync()
            val screenshot=instrument.uiAutomation.takeScreenshot()
            File(context.getExternalFilesDir(null),"manual-live.png").outputStream().use{screenshot.compress(Bitmap.CompressFormat.PNG,100,it)}
            screenshot.recycle()
            assertTrue("Real public fasting guide did not render within 30 seconds",ready)
            scenario.onActivity{assertEquals(url,web.url);assertEquals(android.view.View.GONE,it.window.decorView.findViewWithTag<android.view.View>("manual-error").visibility)}
        }
    }
}
