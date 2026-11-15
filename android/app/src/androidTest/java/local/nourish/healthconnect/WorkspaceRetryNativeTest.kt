package local.nourish.healthconnect

import android.app.Activity
import android.graphics.Bitmap
import android.view.View
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/** Supplies an HTTP error to the installed APK's handler, then uses its real Retry and WebView. */
class WorkspaceRetryNativeTest {
    private val trace=CopyOnWriteArrayList<String>()
    private val instrument=InstrumentationRegistry.getInstrumentation()
    private val context get()=instrument.targetContext
    private val origin="https://fixture.example.ts.net:8443"
    private fun descendants(view:View):Sequence<View> = sequence {
        yield(view)
        if(view is ViewGroup)for(i in 0 until view.childCount)yieldAll(descendants(view.getChildAt(i)))
    }
    private fun until(message:String,check:()->Boolean){repeat(100){if(check())return;Thread.sleep(50)};assertTrue("$message: $trace",check())}
    private fun retryRoute(route:String) {
        ActivityScenario.launch<Activity>(context.packageManager.getLaunchIntentForPackage(context.packageName)!!).use { scenario ->
            val failed=AtomicBoolean(false);val seen=CopyOnWriteArrayList<String>();var retry:Button?=null
            val firstFinished=AtomicBoolean(false);val retryRequested=AtomicBoolean(false);val retryFinished=AtomicBoolean(false)
            val pendingFailure=AtomicReference<Pair<WebResourceRequest,WebResourceResponse>?>()
            lateinit var web:WebView
            lateinit var production:WebViewClient
            val blank=CountDownLatch(1)
            scenario.onActivity { activity ->
                web=activity.window.decorView.findViewWithTag("nourishing-webview");web.stopLoading()
                production=web.webViewClient
                web.webViewClient=object:WebViewClient(){override fun onPageFinished(view:WebView,url:String){if(url=="about:blank")blank.countDown()}}
                web.loadUrl("about:blank")
            }
            assertTrue("Startup page did not settle",blank.await(5,TimeUnit.SECONDS))
            scenario.onActivity { activity ->
                retry=descendants(activity.window.decorView).filterIsInstance<Button>().first{it.text.toString()==context.getString(R.string.web_retry)}
                web.webViewClient=object:WebViewClient(){
                    override fun shouldInterceptRequest(view:WebView,request:WebResourceRequest):WebResourceResponse {
                        trace.add("request ${request.url} main=${request.isForMainFrame}")
                        if(request.isForMainFrame)seen.add(request.url.toString())
                        val fail=request.isForMainFrame&&!failed.get()
                        val response=WebResourceResponse("text/html","UTF-8",if(fail)503 else 200,if(fail)"Unavailable" else "OK",mapOf("Cache-Control" to "no-store"),"<html><title>Retry fixture</title><body>Recovered page</body></html>".byteInputStream())
                        if(fail)pendingFailure.set(request to response)
                        return response
                    }
                    override fun onPageStarted(view:WebView,url:String,icon:Bitmap?){trace.add("start $url");production.onPageStarted(view,url,icon)}
                    override fun onPageFinished(view:WebView,url:String){
                        trace.add("finish $url pending=${pendingFailure.get()!=null}")
                        production.onPageFinished(view,url)
                        // A late completion from the startup page must not consume this request's failure.
                        val completed=android.net.Uri.parse(url).buildUpon().fragment(null).build()
                        pendingFailure.get()?.takeIf{it.first.url.buildUpon().fragment(null).build()==completed}?.let{pending->
                            if(pendingFailure.compareAndSet(pending,null)){
                                val(request,response)=pending;production.onReceivedHttpError(view,request,response);failed.set(true)
                            }
                        }
                        if(retryRequested.get())retryFinished.set(true)
                        else if(completed==android.net.Uri.parse(route).buildUpon().fragment(null).build())firstFinished.set(true)
                    }
                    override fun onReceivedHttpError(view:WebView,request:WebResourceRequest,response:WebResourceResponse){trace.add("error ${request.url} ${response.statusCode}");production.onReceivedHttpError(view,request,response);if(request.isForMainFrame)failed.set(true)}
                }
                web.loadUrl(route)
            }
            until("Native Retry did not appear") { var visible=false;scenario.onActivity{visible=firstFinished.get()&&failed.get()&&retry!!.isShown};visible }
            scenario.onActivity{assertEquals(route,web.url);retryRequested.set(true);retry!!.performClick()}
            until("Retried request did not complete") { var ready=false;scenario.onActivity{ready=retryFinished.get()&&seen.size>=2&&web.progress==100&&!retry!!.isShown};ready }
            assertEquals("Retry discarded the selected workspace destination",android.net.Uri.parse(route).buildUpon().fragment(null).build().toString(),android.net.Uri.parse(seen.last()).buildUpon().fragment(null).build().toString())
            scenario.onActivity{assertEquals(route,web.url)}
        }
    }
    @Test fun httpFailureKeepsDiaryWidgetDestination(){retryRoute("$origin/?widget=diary")}
    @Test fun httpFailureKeepsFoodWidgetDestination(){retryRoute("$origin/?widget=food")}
    @Test fun httpFailureKeepsFastingWidgetDestination(){retryRoute("$origin/?widget=fasting")}
    @Test fun httpFailureKeepsSelectedQueryAndFragment(){retryRoute("$origin/?mobile=1&date=2026-11-11#diary")}
}
