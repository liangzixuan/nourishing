package local.nourish.healthconnect

import android.app.Activity
import android.content.Context
import android.os.CancellationSignal
import android.os.Bundle
import android.os.ParcelFileDescriptor
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintManager
import android.webkit.WebView
import android.webkit.WebViewClient

/** Print the captured report document, not the surrounding diary controls. */
class WebReportPrinter(private val activity:Activity,private val policy:WebWorkspacePolicy) {
    private val active=mutableSetOf<WebView>()
    fun print(html:String){
        val view=WebView(activity);active.add(view)
        view.settings.javaScriptEnabled=false
        view.settings.allowFileAccess=false;view.settings.allowContentAccess=false
        view.webViewClient=object:WebViewClient(){
            private var submitted=false
            override fun onPageFinished(web:WebView,url:String){
                if(submitted||activity.isFinishing)return;submitted=true
                val delegate=web.createPrintDocumentAdapter("Nourishing report")
                val adapter=object:PrintDocumentAdapter(){
                    override fun onStart(){delegate.onStart()}
                    override fun onLayout(old:PrintAttributes?,new:PrintAttributes?,signal:CancellationSignal?,callback:LayoutResultCallback?,extras:Bundle?){delegate.onLayout(old,new,signal,callback,extras)}
                    override fun onWrite(pages:Array<android.print.PageRange>?,destination:ParcelFileDescriptor?,signal:CancellationSignal?,callback:WriteResultCallback?){delegate.onWrite(pages,destination,signal,callback)}
                    override fun onFinish(){delegate.onFinish();active.remove(web);web.destroy()}
                }
                (activity.getSystemService(Context.PRINT_SERVICE) as PrintManager).print("Nourishing report",adapter,null)
            }
        }
        view.loadDataWithBaseURL(policy.origin.value+"/",html,"text/html","UTF-8",null)
    }
    fun dispose(){active.toList().forEach{it.destroy()};active.clear()}
}
