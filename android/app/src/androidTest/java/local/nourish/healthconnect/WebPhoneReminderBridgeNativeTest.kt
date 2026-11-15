package local.nourish.healthconnect

import android.app.Activity
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class WebPhoneReminderBridgeNativeTest {
    private val instrument=InstrumentationRegistry.getInstrumentation()
    private fun evaluate(web:WebView,script:String):String {
        val done=CountDownLatch(1);val value=AtomicReference<String>();instrument.runOnMainSync{web.evaluateJavascript(script){value.set(it);done.countDown()}}
        assertTrue(done.await(5,TimeUnit.SECONDS));return value.get()
    }
    private fun until(web:WebView,script:String){val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(10);while(evaluate(web,script)!="true"&&System.nanoTime()<deadline)Thread.sleep(25);assertEquals(script,"true",evaluate(web,script))}
    private class Request(val id:String,val action:String,val label:String?,val reply:(Result<JSONObject>)->Unit)
    private fun fixture(block:(WebView,WebWorkspaceBridge,AtomicReference<Request>,AtomicReference<String?>)->Unit){
        val context=instrument.targetContext;val origin=WorkspaceOrigin.parse("https://fixture.test.ts.net:8443");val request=AtomicReference<Request>();val cancelled=AtomicReference<String?>()
        lateinit var web:WebView;lateinit var bridge:WebWorkspaceBridge
        ActivityScenario.launch<Activity>(context.packageManager.getLaunchIntentForPackage(context.packageName)!!).use{scenario->
            scenario.onActivity{activity->
                activity.window.decorView.findViewWithTag<WebView>("nourishing-webview").stopLoading();web=WebView(activity);web.settings.javaScriptEnabled=true
                bridge=WebWorkspaceBridge(web,WebWorkspacePolicy(origin),{_,_,_->fail("download")},{_,_->fail("print")},{fail("health")},{_,_,_->fail("share")},speech={_,_->fail("speech")},cancelSpeech={},reminders={id,action,label,reply->request.set(Request(id,action,label,reply))},cancelReminders={cancelled.set(it)})
                web.webViewClient=object:WebViewClient(){override fun onPageStarted(view:WebView,url:String,icon:android.graphics.Bitmap?){bridge.close()};override fun onPageFinished(view:WebView,url:String){bridge.connect()}}
                activity.setContentView(web);web.loadDataWithBaseURL(origin.value+"/fixture","<html><body>Reminder fixture</body></html>","text/html","UTF-8",origin.value+"/fixture")
            }
            until(web,"window.__nourishingReady===true")
            try{block(web,bridge,request,cancelled)}finally{instrument.runOnMainSync{bridge.close();web.destroy()}}
        }
    }
    private fun request(reference:AtomicReference<Request>):Request {val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);while(reference.get()==null&&System.nanoTime()<deadline)Thread.sleep(25);return requireNotNull(reference.get())}
    @Test fun realPortReturnsStructuredStatusAndNativeErrorCodes(){fixture{web,_,reference,_->
        evaluate(web,"window.result=null;NourishingNative.reminders.status().then(v=>window.result=v)");val first=request(reference);assertEquals("status",first.action)
        instrument.runOnMainSync{first.reply(Result.success(JSONObject().put("connected",false).put("pending",true)))};until(web,"window.result?.pending===true")
        reference.set(null);evaluate(web,"NourishingNative.reminders.connect({label:'Pixel'}).catch(e=>window.failure=e.code)");val connect=request(reference);assertEquals("Pixel",connect.label)
        instrument.runOnMainSync{connect.reply(Result.failure(PhoneReminderFailure(PhoneReminderIssue.PERMISSION)))};until(web,"window.failure==='permission'")
    }}
    @Test fun cancelTargetsItsRequestAndNavigationDiscardsAnOldReply(){fixture{web,_,reference,cancelled->
        evaluate(web,"window.signal=new AbortController();NourishingNative.reminders.connect({label:'Phone',signal:signal.signal}).catch(e=>window.failure=e.name)");val old=request(reference)
        evaluate(web,"signal.abort()");until(web,"window.failure==='AbortError'")
        val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);while(cancelled.get()!=old.id&&System.nanoTime()<deadline)Thread.sleep(25);assertEquals(old.id,cancelled.get())
        instrument.runOnMainSync{web.loadDataWithBaseURL("https://fixture.test.ts.net:8443/next","<html><body>New page</body></html>","text/html","UTF-8","https://fixture.test.ts.net:8443/next")}
        until(web,"window.__nourishingReady===true&&document.body.innerText==='New page'")
        reference.set(null);evaluate(web,"window.result='waiting';NourishingNative.reminders.status().then(v=>window.result=v)");val next=request(reference)
        instrument.runOnMainSync{old.reply(Result.success(JSONObject().put("connected",true)))};assertEquals("true",evaluate(web,"window.result==='waiting'"))
        instrument.runOnMainSync{next.reply(Result.success(JSONObject().put("connected",false)))};until(web,"window.result?.connected===false")
    }}
}
