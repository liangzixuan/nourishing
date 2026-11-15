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

class UserManualNativeTest {
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
    private fun manualIntent()=Intent(context,UserManualActivity::class.java).setData(Uri.parse(guide))
    private fun fixture(scenario:ActivityScenario<UserManualActivity>,url:String):WebView {
        lateinit var web:WebView
        scenario.onActivity{activity->
            web=activity.window.decorView.findViewWithTag("nourishing-manual-webview");web.stopLoading()
            web.loadDataWithBaseURL(url,"<html><body><h1>Manual fixture</h1><script>window.fixtureReady=true</script></body></html>","text/html","UTF-8",url)
        }
        until("Manual fixture not loaded"){evaluate(web,"window.fixtureReady===true && location.href === "+org.json.JSONObject.quote(url))=="true"}
        return web
    }
    private fun navigatedFixture(scenario:ActivityScenario<UserManualActivity>,url:String):WebView {
        lateinit var web:WebView
        scenario.onActivity{activity->
            web=activity.window.decorView.findViewWithTag("nourishing-manual-webview");web.stopLoading()
            val production=web.webViewClient
            web.webViewClient=object:android.webkit.WebViewClient(){
                override fun shouldInterceptRequest(view:WebView,request:android.webkit.WebResourceRequest):android.webkit.WebResourceResponse? =
                    if(request.isForMainFrame&&request.url.toString().substringBefore('#')==url)
                        android.webkit.WebResourceResponse("text/html","UTF-8","<html><body>Manual fixture<script>window.fixtureReady=true</script></body></html>".byteInputStream())
                    else production.shouldInterceptRequest(view,request)
                override fun shouldOverrideUrlLoading(view:WebView,request:android.webkit.WebResourceRequest)=production.shouldOverrideUrlLoading(view,request)
                override fun onPageStarted(view:WebView,url:String,icon:android.graphics.Bitmap?)=production.onPageStarted(view,url,icon)
                override fun onPageFinished(view:WebView,url:String)=production.onPageFinished(view,url)
            }
            web.loadUrl(url)
        }
        until("Navigated fixture did not load"){evaluate(web,"window.fixtureReady===true")=="true"}
        return web
    }
    @Test fun manualKeepsArticleHistoryAndRecreatesSelectedPage() {
        ActivityScenario.launch<UserManualActivity>(manualIntent()).use { scenario ->
            val web=fixture(scenario,guide)
            instrument.runOnMainSync{web.clearHistory()}
            val second="https://support.cronometer.com/hc/en-us/articles/360036016612-Mobile-Fasting#history"
            fixture(scenario,second)
            assertEquals("false",evaluate(web,"Boolean(window.__nourishingInstalled)"))
            scenario.recreate()
            lateinit var restored:WebView
            scenario.onActivity { restored=it.window.decorView.findViewWithTag("nourishing-manual-webview");assertEquals(second,restored.url) }
            assertNotSame(web,restored)
            assertTrue(instrument.uiAutomation.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK))
            until("System Back did not return to the preceding manual page") { var url:String?=null;scenario.onActivity{url=restored.url};url==guide }
        }
    }
    @Test fun externalButtonOpensSelectedArticleWithoutWorkspaceExtras() {
        ActivityScenario.launch<UserManualActivity>(manualIntent()).use { scenario ->
            val second="https://support.cronometer.com/hc/en-us/search?query=fasting"
            // loadDataWithBaseURL pins WebView.url to its history URL, even after replaceState.
            // Use a normal navigation with intercepted synthetic bytes for this URL-boundary check.
            val page=navigatedFixture(scenario,second)
            evaluate(page,"history.replaceState(null,'','#history')")
            assertEquals(second+"#history",org.json.JSONTokener(evaluate(page,"location.href")).nextValue())
            until("Native URL did not follow the selected section") {var url:String?=null;scenario.onActivity{url=page.url};url==second+"#history"}
            var captured:Intent?=null
            val monitor=object:android.app.Instrumentation.ActivityMonitor() {
                override fun onStartActivity(intent:Intent):android.app.Instrumentation.ActivityResult? {
                    if(intent.action==Intent.ACTION_VIEW){captured=Intent(intent);return android.app.Instrumentation.ActivityResult(Activity.RESULT_CANCELED,null)}
                    return null
                }
            }
            instrument.addMonitor(monitor)
            try {
                scenario.onActivity{it.window.decorView.findViewWithTag<View>("manual-external").performClick()}
                assertEquals(second+"#history",captured?.dataString);assertNull(captured?.extras);assertNull(captured?.component)
            } finally {instrument.removeMonitor(monitor)}
        }
    }
    @Test fun publicPageCannotUseNativePermissionsOrWorkspaceBridge() {
        ActivityScenario.launch<UserManualActivity>(manualIntent()).use { scenario ->
            val web=fixture(scenario,guide)
            var denied=false;var granted=false
            instrument.runOnMainSync {
                assertFalse(web.settings.allowFileAccess);assertFalse(web.settings.allowContentAccess)
                web.webChromeClient!!.onPermissionRequest(object:PermissionRequest(){
                    override fun getOrigin()=Uri.parse(guide)
                    override fun getResources()=arrayOf(RESOURCE_VIDEO_CAPTURE,RESOURCE_AUDIO_CAPTURE)
                    override fun grant(resources:Array<String>){granted=true}
                    override fun deny(){denied=true}
                })
            }
            assertTrue(denied);assertFalse(granted)
            assertEquals("false",evaluate(web,"Boolean(window.__nourishingInstalled)"))
            assertFalse(context.packageManager.getActivityInfo(manualIntent().component!!,0).exported)
        }
    }
    @Test fun failedPageShowsConciseRetryAndSuccessfulRetryClearsIt() {
        ActivityScenario.launch<UserManualActivity>(manualIntent()).use { scenario ->
            val web=fixture(scenario,guide)
            instrument.runOnMainSync {web.settings.blockNetworkLoads=true;web.loadUrl(guide+"?nourishing-offline-test=1")}
            until("Offline manual did not show Retry") {var visible=false;scenario.onActivity{visible=it.window.decorView.findViewWithTag<View>("manual-error").visibility==View.VISIBLE};visible}
            scenario.onActivity{it.window.decorView.findViewWithTag<View>("manual-retry").performClick()}
            fixture(scenario,guide)
            scenario.onActivity{assertEquals(View.GONE,it.window.decorView.findViewWithTag<View>("manual-error").visibility)}
        }
    }
}
