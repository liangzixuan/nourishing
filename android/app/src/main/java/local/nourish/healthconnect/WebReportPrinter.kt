package local.nourish.healthconnect

import android.content.Context
import android.os.CancellationSignal
import android.os.Bundle
import android.os.ParcelFileDescriptor
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintManager
import android.print.PrintJob
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebResourceError
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import java.io.ByteArrayInputStream
import kotlinx.coroutines.*

/** Prints one captured, offline report under the account that supplied it. */
class WebReportPrinter(private val activity:ComponentActivity,private val policy:WebWorkspacePolicy,
    private val currentPage:()->String,private val notice:(String)->Unit) {
    private val gate=CloudReportPrintGate(CloudWebSessions.get(CloudOrigin.parse(policy.origin.value)))
    private var active:WebView?=null
    private var printJob:PrintJob?=null
    private var work:Job?=null
    private var deadline:Job?=null
    private var epoch=0L
    private var busy=false
    fun print(html:String,accountId:String){
        if(busy){notice("Finish the current print job first.");return}
        require(policy.isWorkspace(currentPage())){"Open the report in Nourishing."}
        busy=true;val token=++epoch;val sourcePage=currentPage()
        work=activity.lifecycleScope.launch {
            try {
                val capture=withContext(Dispatchers.IO){gate.capture(accountId,sourcePage)}
                if(token!=epoch||!gate.isCurrent(capture,currentPage()))throw CloudSessionChanged()
                val view=WebView(activity);active=view
                view.settings.javaScriptEnabled=false
                view.settings.allowFileAccess=false;view.settings.allowContentAccess=false
                view.settings.blockNetworkLoads=true;view.settings.domStorageEnabled=false
                view.webViewClient=object:WebViewClient(){
                    private var submitted=false
                    override fun shouldOverrideUrlLoading(web:WebView,request:WebResourceRequest)=true
                    override fun shouldInterceptRequest(web:WebView,request:WebResourceRequest):WebResourceResponse?=if(request.url.scheme=="data")null else WebResourceResponse("text/plain","UTF-8",ByteArrayInputStream(byteArrayOf()))
                    override fun onReceivedError(web:WebView,request:WebResourceRequest,error:WebResourceError){if(request.isForMainFrame&&token==epoch){notice("The report could not be rendered.");dispose()}}
                    override fun onPageFinished(web:WebView,url:String){
                        if(submitted||token!=epoch||activity.isFinishing||activity.isDestroyed)return
                        submitted=true
                        work=activity.lifecycleScope.launch {
                            try {
                                withContext(Dispatchers.IO){gate.verify(capture,sourcePage)}
                                if(token!=epoch||!gate.isCurrent(capture,currentPage()))throw CloudSessionChanged()
                                deadline?.cancel();deadline=null
                                val delegate=web.createPrintDocumentAdapter("Nourishing report")
                                val adapter=object:PrintDocumentAdapter(){
                                    private fun valid()=token==epoch&&!activity.isFinishing&&gate.isCurrent(capture,currentPage())
                                    override fun onStart(){delegate.onStart()}
                                    override fun onLayout(old:PrintAttributes?,new:PrintAttributes?,signal:CancellationSignal?,callback:LayoutResultCallback?,extras:Bundle?){
                                        if(!valid()){callback?.onLayoutCancelled();dispose();return}
                                        delegate.onLayout(old,new,signal,callback,extras)
                                    }
                                    override fun onWrite(pages:Array<android.print.PageRange>?,destination:ParcelFileDescriptor?,signal:CancellationSignal?,callback:WriteResultCallback?){
                                        if(!valid()){callback?.onWriteCancelled();dispose();return}
                                        delegate.onWrite(pages,destination,signal,callback)
                                    }
                                    override fun onFinish(){try{delegate.onFinish()}finally{if(token==epoch)release(cancelPrint=false)}}
                                }
                                val job=(activity.getSystemService(Context.PRINT_SERVICE) as PrintManager).print("Nourishing report",adapter,null)
                                if(token==epoch)printJob=job else job.cancel()
                            }catch(_:CancellationException){if(token==epoch)release()}
                            catch(_:Exception){if(token==epoch){notice("Sign in and preview the report again before printing.");release()}}
                        }
                    }
                }
                deadline=activity.lifecycleScope.launch {delay(30_000);if(token==epoch){notice("The report took too long to render. Please retry.");dispose()}}
                view.loadDataWithBaseURL(null,html,"text/html","UTF-8",null)
            }catch(_:CancellationException){if(token==epoch)release()}
            catch(_:Exception){if(token==epoch){notice("Sign in and preview the report again before printing.");release()}}
        }
    }
    private fun release(cancelPrint:Boolean=true){
        epoch++;deadline?.cancel();deadline=null
        val job=printJob;printJob=null;if(cancelPrint)job?.cancel()
        val view=active;active=null;view?.stopLoading();view?.destroy();busy=false
    }
    fun dispose(){work?.cancel();work=null;release()}
}
