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

class WebDownloadLimitsNativeTest {
    private val instrumentation=InstrumentationRegistry.getInstrumentation()
    private fun evaluate(web:WebView,script:String):String {
        val done=CountDownLatch(1);val result=AtomicReference<String>()
        instrumentation.runOnMainSync{web.evaluateJavascript(script){result.set(it);done.countDown()}}
        assertTrue(done.await(5,TimeUnit.SECONDS));return result.get()
    }
    @Test fun androidFileStorageStagesBackupAboveTheMemoryLimit() {
        val dir=java.io.File(instrumentation.targetContext.cacheDir,"native-large-download-fixture");assertTrue(dir.mkdirs()||dir.isDirectory)
        val store=WebDownloadStore(dir);val length=40L*1024*1024
        val input=object:java.io.InputStream(){var left=length;override fun read():Int=if(left-- > 0)90 else -1
            override fun read(bytes:ByteArray,offset:Int,count:Int):Int{if(left==0L)return -1;val n=minOf(count.toLong(),left).toInt();java.util.Arrays.fill(bytes,offset,offset+n,90.toByte());left-=n;return n}}
        try {
            val file=store.stage(input);assertEquals(length,file.length());assertNotNull(store.restore(file.name))
            java.io.RandomAccessFile(file,"r").use{it.seek(length-1);assertEquals(90,it.read())}
            assertTrue(store.release(file));assertTrue(dir.listFiles()!!.isEmpty())
        }finally{store.cleanup(null);dir.delete()}
    }
    @Test fun oversizedBrowserBlobRetainsTheMemoryLimit() {
        val context=instrumentation.targetContext;val rejected=CountDownLatch(1);val error=AtomicReference<String>()
        val origin=WorkspaceOrigin.parse("https://fixture.test.ts.net:8443")
        lateinit var web:WebView;lateinit var bridge:WebWorkspaceBridge
        ActivityScenario.launch<Activity>(context.packageManager.getLaunchIntentForPackage(context.packageName)!!).use{scenario ->
            scenario.onActivity{activity ->
                activity.window.decorView.findViewWithTag<WebView>("nourishing-webview").stopLoading()
                web=WebView(activity);web.settings.javaScriptEnabled=true
                web.webChromeClient=object:android.webkit.WebChromeClient(){override fun onJsAlert(view:WebView,url:String,message:String,result:android.webkit.JsResult):Boolean{error.set(message);result.confirm();rejected.countDown();return true}}
                bridge=WebWorkspaceBridge(web,WebWorkspacePolicy(origin),{_,_,_->fail("Oversized memory export delivered")},{_,_->fail("Unexpected print")},{fail("Unexpected navigation")},{_,_,_->fail("Unexpected share")},speech={_,reply->reply(Result.failure(IllegalStateException("Unexpected speech")))},cancelSpeech={},reminders={_,_,_,reply->reply(Result.failure(IllegalStateException("Unexpected reminder request")))},cancelReminders={})
                web.webViewClient=object:WebViewClient(){override fun onPageFinished(view:WebView,url:String){bridge.connect()}}
                activity.setContentView(web);web.loadDataWithBaseURL(origin.value+"/fixture","<html><body>Limit fixture</body></html>","text/html","UTF-8",origin.value+"/fixture")
            }
            try {
                val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(10)
                while(evaluate(web,"window.__nourishingReady===true")!="true"&&System.nanoTime()<deadline)Thread.sleep(100)
                assertEquals("true",evaluate(web,"window.__nourishingReady===true"))
                evaluate(web,"(()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([new Uint8Array(33*1024*1024)]));a.download='large.bin';a.click();return true})()")
                assertTrue(rejected.await(10,TimeUnit.SECONDS));assertTrue(error.get().contains("32 MiB"))
            }finally{instrumentation.runOnMainSync{bridge.close();web.destroy()}}
        }
    }
}
