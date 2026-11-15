package local.nourish.healthconnect

import android.app.Activity
import android.webkit.WebView
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test

class NourishingAppNativeTest {
    private fun evaluate(web:WebView,script:String):String {
        val done=java.util.concurrent.CountDownLatch(1);val result=java.util.concurrent.atomic.AtomicReference<String>()
        InstrumentationRegistry.getInstrumentation().runOnMainSync{web.evaluateJavascript(script){result.set(it);done.countDown()}}
        assertTrue(done.await(5,java.util.concurrent.TimeUnit.SECONDS));return result.get()
    }
    @Test fun healthConnectIsAvailableInsideTheApp() {
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val context=instrumentation.targetContext
        val monitor=instrumentation.addMonitor(MainActivity::class.java.name,null,false)
        try {
            ActivityScenario.launch<Activity>(context.packageManager.getLaunchIntentForPackage(context.packageName)!!).use { scenario ->
                lateinit var web:WebView
                scenario.onActivity { activity ->
                    web=activity.window.decorView.findViewWithTag<WebView>("nourishing-webview")
                    web.loadDataWithBaseURL("https://fixture.example.ts.net:8443/fixture","<html><body><button data-nourishing-health-connect>Health Connect</button></body></html>","text/html","UTF-8","https://fixture.example.ts.net:8443/fixture")
                }
                var ready=false
                repeat(50){if(!ready){ready=evaluate(web,"window.__nourishingReady===true")=="true";if(!ready)Thread.sleep(100)}}
                assertTrue("Native navigation: "+evaluate(web,"JSON.stringify({ready:window.__nourishingReady,installed:window.__nourishingInstalled,url:location.href})"),ready)
                evaluate(web,"document.querySelector('button').click()")
                val health=instrumentation.waitForMonitorWithTimeout(monitor,5000)
                assertNotNull("Health Connect did not open",health)
                instrumentation.runOnMainSync { health.finish() }
                scenario.onActivity { activity -> assertNotNull(activity.window.decorView.findViewWithTag<WebView>("nourishing-webview")) }
                scenario.recreate()
                scenario.onActivity { activity -> assertNotNull(activity.window.decorView.findViewWithTag<WebView>("nourishing-webview")) }
            }
        } finally { instrumentation.removeMonitor(monitor) }
    }
    @Test fun foreignCameraRequestsAreDeniedWithoutAnAndroidPrompt() {
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        ActivityScenario.launch<Activity>(context.packageManager.getLaunchIntentForPackage(context.packageName)!!).use { scenario ->
            scenario.onActivity { activity ->
                val web=activity.window.decorView.findViewWithTag<WebView>("nourishing-webview")
                var denied=false
                val foreign=object:android.webkit.PermissionRequest(){
                    override fun getOrigin()=android.net.Uri.parse("https://example.org")
                    override fun getResources()=arrayOf(RESOURCE_VIDEO_CAPTURE)
                    override fun grant(resources:Array<String>){fail("A foreign origin received camera access")}
                    override fun deny(){denied=true}
                }
                web.webChromeClient!!.onPermissionRequest(foreign)
                assertTrue(denied)
            }
        }
    }
    @Test fun cancelledAndroidFilePickerResolvesTheWebUpload() {
        val instrumentation=InstrumentationRegistry.getInstrumentation();val context=instrumentation.targetContext
        val cancelled=java.util.concurrent.CountDownLatch(1)
        ActivityScenario.launch<Activity>(context.packageManager.getLaunchIntentForPackage(context.packageName)!!).use { scenario ->
            scenario.onActivity { activity ->
                val web=activity.window.decorView.findViewWithTag<WebView>("nourishing-webview")
                val params=object:android.webkit.WebChromeClient.FileChooserParams(){
                    override fun getMode()=MODE_OPEN
                    override fun getAcceptTypes()=arrayOf("image/*")
                    override fun isCaptureEnabled()=false
                    override fun getTitle():CharSequence?=null
                    override fun getFilenameHint():String?=null
                    override fun createIntent()=android.content.Intent(android.content.Intent.ACTION_GET_CONTENT).setType("image/*")
                }
                assertTrue(web.webChromeClient!!.onShowFileChooser(web,{uris->assertNull(uris);cancelled.countDown()},params))
            }
            var pickerVisible=false
            repeat(50){if(!pickerVisible){pickerVisible=instrumentation.uiAutomation.rootInActiveWindow?.packageName?.toString()?.let{it!=context.packageName}==true;if(!pickerVisible)Thread.sleep(100)}}
            assertTrue("Android did not open its file picker",pickerVisible)
            assertTrue(instrumentation.uiAutomation.performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK))
            assertTrue("Cancelled picker left the upload pending",cancelled.await(5,java.util.concurrent.TimeUnit.SECONDS))
        }
    }
    @Test fun launcherIsTheFullNourishingApp() {
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        assertEquals("Nourishing",context.applicationInfo.loadLabel(context.packageManager).toString())
        val launch=requireNotNull(context.packageManager.getLaunchIntentForPackage(context.packageName))
        assertEquals("local.nourish.healthconnect.NourishingActivity",launch.component?.className)
        ActivityScenario.launch<Activity>(launch).use { scenario ->
            scenario.onActivity { activity ->
                val web=activity.window.decorView.findViewWithTag<WebView>("nourishing-webview")
                assertNotNull("The launcher must contain the diary, not only Health Connect controls",web)
                assertEquals("https://fixture.example.ts.net:8443/",web.originalUrl)
                assertNull("The duplicate native toolbar must be removed",activity.window.decorView.findViewWithTag<android.view.View>("nourishing-health-connect"))
            }
        }
    }
}
