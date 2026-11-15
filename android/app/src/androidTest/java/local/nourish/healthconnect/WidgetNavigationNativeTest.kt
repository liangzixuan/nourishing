package local.nourish.healthconnect

import android.content.Intent
import android.net.Uri
import android.view.View
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test

class WidgetNavigationNativeTest {
    private val instrument=InstrumentationRegistry.getInstrumentation()
    private val context get()=instrument.targetContext
    private val policy=NourishingWorkspace.policy
    private fun entry(destination:WidgetDestination)=NourishingWorkspace.widgetIntent(context,policy.origin,destination)
    private fun web(activity:NourishingActivity)=activity.findViewById<View>(android.R.id.content).findViewWithTag<WebView>("nourishing-webview")
    private fun until(message:String,condition:()->Boolean) {
        val deadline=System.nanoTime()+8_000_000_000
        while(!condition()&&System.nanoTime()<deadline)Thread.sleep(25)
        assertTrue(message,condition())
    }
    private fun awaitUrl(scenario:ActivityScenario<NourishingActivity>,url:String) {
        until("WebView did not select $url") { var actual:String?=null;scenario.onActivity { actual=web(it).url };actual==url }
    }
    @Test fun warmWidgetEntryReusesActivityAndRecreationPreservesCurrentPage() {
        // ActivityScenario matches lifecycle events against the initial Intent's data.
        // A real onNewIntent replaces that data, so use the platform activity monitor here.
        val original=instrument.startActivitySync(entry(WidgetDestination.DIARY).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as NourishingActivity
        var recreated:NourishingActivity?=null
        var monitor:android.app.Instrumentation.ActivityMonitor?=null
        fun selected(activity:NourishingActivity,url:String,finished:Boolean=false):Boolean {
            var ready=false;instrument.runOnMainSync { ready=web(activity).url==url&&(!finished||web(activity).progress==100) };return ready
        }
        try {
            until("Cold widget entry missing") { selected(original,policy.widgetUrl(WidgetDestination.DIARY)) }
            instrument.runOnMainSync {
                web(original).webViewClient=object:WebViewClient() {
                    override fun shouldInterceptRequest(view:WebView,request:WebResourceRequest)=WebResourceResponse("text/html","UTF-8","<html><title>Widget fixture</title><body>Review only</body></html>".byteInputStream())
                }
                original.startActivity(entry(WidgetDestination.FOOD))
            }
            until("Warm widget entry missing") { selected(original,policy.widgetUrl(WidgetDestination.FOOD)) }
            instrument.runOnMainSync { assertEquals("food",Uri.parse(original.intent.dataString).getQueryParameter("widget"));assertFalse(original.isDestroyed) }
            val selectedPage=policy.origin.value+"/?date=2026-11-11#diary"
            instrument.runOnMainSync { web(original).loadUrl(selectedPage) }
            until("Synthetic selected page did not finish") { selected(original,selectedPage,true) }
            monitor=instrument.addMonitor(NourishingActivity::class.java.name,null,false)
            instrument.runOnMainSync { original.recreate() }
            recreated=instrument.waitForMonitorWithTimeout(monitor,8000) as? NourishingActivity
            assertNotNull("Recreated activity missing",recreated)
            assertNotSame(original,recreated)
            until("Recreation replaced the selected page with the widget's original destination") { selected(recreated!!,selectedPage) }
        } finally {
            instrument.runOnMainSync { recreated?.finish();if(!original.isDestroyed)original.finish() }
            monitor?.let { instrument.removeMonitor(it) }
        }
    }
    @Test fun unownedOrUnsupportedLaunchDataCannotReplaceTheWorkspace() {
        for(url in listOf("https://other.test.ts.net/?widget=food",policy.origin.value+"/?widget=unknown",policy.origin.value+"/api/action?widget=food")) {
            ActivityScenario.launch<NourishingActivity>(Intent(context,NourishingActivity::class.java).setAction(Intent.ACTION_VIEW).setData(Uri.parse(url))).use { scenario ->
                awaitUrl(scenario,policy.origin.value+"/")
            }
        }
    }
    @Test fun anotherConfiguredWorkspaceKeepsItsOwnExternalDestination() {
        val other=WorkspaceOrigin.parse("https://other.test.ts.net:8443")
        for(destination in WidgetDestination.entries) {
            val intent=NourishingWorkspace.widgetIntent(context,other,destination)
            assertEquals(Intent.ACTION_VIEW,intent.action)
            assertNull(intent.component)
            assertEquals(other.value+"/?widget="+destination.key,intent.dataString)
        }
    }
}
