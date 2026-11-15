package local.nourish.healthconnect

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.net.http.SslError
import android.os.Bundle
import android.view.View
import android.webkit.*
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

class NourishingActivity:ComponentActivity() {
    private val policy=NourishingWorkspace.policy
    private lateinit var web:WebView
    private lateinit var bridge:WebWorkspaceBridge
    private lateinit var files:WebFileController
    private lateinit var printer:WebReportPrinter
    private lateinit var speech:WebSpeechInput
    private lateinit var reminders:WebPhoneReminders
    private lateinit var errorPanel:LinearLayout
    private var upload:ValueCallback<Array<Uri>>?=null
    private var cameraRequest:PermissionRequest?=null
    private var pageFailed=false
    private val chooseFile=registerForActivityResult(ActivityResultContracts.StartActivityForResult()){result ->
        val callback=upload;upload=null
        val uris=WebChromeClient.FileChooserParams.parseResult(result.resultCode,result.data)?.filter{it.scheme=="content"}?.toTypedArray()
        callback?.onReceiveValue(uris?.takeIf{it.isNotEmpty()})
    }
    private val cameraPermission=registerForActivityResult(ActivityResultContracts.RequestPermission()){granted ->
        val request=cameraRequest;cameraRequest=null
        if(request!=null){if(granted&&policy.isWorkspace(request.origin.toString())&&policy.isWorkspace(web.url.orEmpty()))request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))else request.deny()}
    }
    override fun onCreate(savedInstanceState:Bundle?){
        super.onCreate(savedInstanceState)
        pauseUnmigratedNativeFeatures(this)
        speech=WebSpeechInput(this)
        reminders=WebPhoneReminders(this)
        files=WebFileController(this,policy,::notice)
        printer=WebReportPrinter(this,policy,{if(::web.isInitialized)web.url.orEmpty() else ""},::notice)
        val column=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setBackgroundColor(Color.rgb(16,18,34))}
        val body=FrameLayout(this)
        web=WebView(this).apply{tag="nourishing-webview"}
        body.addView(web,FrameLayout.LayoutParams(-1,-1))
        errorPanel=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=android.view.Gravity.CENTER;setPadding(32,32,32,32);setBackgroundColor(Color.WHITE);visibility=View.GONE}
        errorPanel.addView(TextView(this).apply{text=if(NourishingWorkspace.cloudOrigin!=null)"Could not connect to Nourishing. Check your connection and try again." else getString(R.string.web_unavailable);textSize=18f})
        errorPanel.addView(Button(this).apply{text=getString(R.string.web_retry);setOnClickListener{web.reload()}})
        body.addView(errorPanel,FrameLayout.LayoutParams(-1,-1))
        column.addView(body,LinearLayout.LayoutParams(-1,0,1f));setContentView(column)
        ViewCompat.setOnApplyWindowInsetsListener(column){view,insets->val safe=insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime());view.setPadding(safe.left,safe.top,safe.right,safe.bottom);insets}
        WindowCompat.getInsetsController(window,column).apply{isAppearanceLightStatusBars=false;isAppearanceLightNavigationBars=false}
        bridge=WebWorkspaceBridge(web,policy,download=files::bytes,print=printer::print,healthConnect={startActivity(Intent(this,MainActivity::class.java))},shareImage=WebImageShare(this)::share,speech=speech::start,cancelSpeech=speech::cancel,reminders=reminders::request,cancelReminders=reminders::cancel)
        configureWebView()
        files.restore(savedInstanceState)
        onBackPressedDispatcher.addCallback(this,object:OnBackPressedCallback(true){
            private var pending=false
            private fun fallback(){
                if(web.canGoBack())web.goBack()
                else{isEnabled=false;try{onBackPressedDispatcher.onBackPressed()}finally{isEnabled=true}}
            }
            override fun handleOnBackPressed(){
                if(pending)return
                val page=web.url.orEmpty()
                if(!policy.isWorkspace(page)){fallback();return}
                pending=true
                web.evaluateJavascript("!window.dispatchEvent(new Event('nourishing-back',{cancelable:true}))"){consumed->
                    pending=false
                    if(isDestroyed||isFinishing||web.url!=page)return@evaluateJavascript
                    if(consumed!="true")fallback()
                }
            }
        })
        if(savedInstanceState?.getBundle("diary-web-state")?.let{web.restoreState(it)}==null)web.loadUrl(widgetEntry(intent)?:policy.origin.value+"/")
    }
    private fun widgetEntry(entry:Intent)=if(entry.action==Intent.ACTION_VIEW)policy.widgetEntry(entry.dataString.orEmpty())else null
    override fun onNewIntent(intent:Intent) {
        super.onNewIntent(intent)
        val destination=widgetEntry(intent)?:return
        setIntent(intent)
        web.loadUrl(destination)
    }
    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView(){
        web.settings.apply{javaScriptEnabled=true;domStorageEnabled=true;textZoom=100;allowFileAccess=false;allowContentAccess=false;mixedContentMode=WebSettings.MIXED_CONTENT_NEVER_ALLOW;javaScriptCanOpenWindowsAutomatically=false;setSupportMultipleWindows(false);mediaPlaybackRequiresUserGesture=true}
        CookieManager.getInstance().setAcceptThirdPartyCookies(web,false)
        web.webViewClient=object:WebViewClient(){
            override fun shouldOverrideUrlLoading(view:WebView,request:WebResourceRequest):Boolean {
                if(policy.isWorkspace(request.url.toString()))return false
                if(request.isForMainFrame&&request.hasGesture()&&policy.isExternalLink(request.url.toString()))runCatching{
                    val destination=Intent(Intent.ACTION_VIEW,request.url)
                    if(policy.isWorkspace(view.url.orEmpty())&&UserManualPolicy.owns(request.url.toString()))destination.setClass(this@NourishingActivity,UserManualActivity::class.java)
                    startActivity(destination)
                }.onFailure{notice(getString(R.string.web_no_handler))}
                return true
            }
            override fun onPageStarted(view:WebView,url:String,icon:android.graphics.Bitmap?){CloudWebSessions.refresh();bridge.close();printer.dispose();cameraRequest?.deny();cameraRequest=null;pageFailed=false;errorPanel.visibility=View.GONE}
            override fun onPageFinished(view:WebView,url:String){if(!pageFailed&&policy.isWorkspace(url))bridge.connect()}
            override fun onReceivedError(view:WebView,request:WebResourceRequest,error:WebResourceError){if(request.isForMainFrame){pageFailed=true;errorPanel.visibility=View.VISIBLE}}
            override fun onReceivedHttpError(view:WebView,request:WebResourceRequest,response:WebResourceResponse){if(request.isForMainFrame&&response.statusCode>=400){pageFailed=true;errorPanel.visibility=View.VISIBLE}}
            override fun onReceivedSslError(view:WebView,handler:SslErrorHandler,error:SslError){handler.cancel();pageFailed=true;errorPanel.visibility=View.VISIBLE}
        }
        web.webChromeClient=object:WebChromeClient(){
            override fun onShowFileChooser(view:WebView,callback:ValueCallback<Array<Uri>>,params:FileChooserParams):Boolean {
                if(!policy.isWorkspace(view.url.orEmpty())){callback.onReceiveValue(null);return true}
                upload?.onReceiveValue(null);upload=callback
                try{chooseFile.launch(params.createIntent())}catch(_:Exception){upload=null;callback.onReceiveValue(null);notice(getString(R.string.web_no_handler))}
                return true
            }
            override fun onPermissionRequest(request:PermissionRequest){
                if(!policy.isWorkspace(request.origin.toString())||!policy.isWorkspace(web.url.orEmpty())||PermissionRequest.RESOURCE_VIDEO_CAPTURE !in request.resources){request.deny();return}
                cameraRequest?.deny();cameraRequest=request
                if(ContextCompat.checkSelfPermission(this@NourishingActivity,Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED){cameraRequest=null;request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))}
                else cameraPermission.launch(Manifest.permission.CAMERA)
            }
            override fun onPermissionRequestCanceled(request:PermissionRequest){if(cameraRequest===request)cameraRequest=null}
        }
        web.setDownloadListener{url,agent,disposition,mime,_->
            if(policy.isWorkspace(url))runCatching{files.url(url,agent,disposition,mime)}.onFailure{notice(it.message?:getString(R.string.web_download_failed))}
            else notice(getString(R.string.web_download_failed))
        }
    }
    private fun notice(value:String){Toast.makeText(this,value,Toast.LENGTH_LONG).show()}
    override fun onSaveInstanceState(out:Bundle){super.onSaveInstanceState(out);val state=Bundle();web.saveState(state);out.putBundle("diary-web-state",state);files.saveState(out)}
    override fun onPause(){web.onPause();super.onPause()}
    override fun onResume(){super.onResume();CloudWebSessions.refresh();if(::web.isInitialized)web.onResume();if(::bridge.isInitialized)bridge.refreshFontScale();if(NourishingWorkspace.cloudOrigin==null)runCatching{PhoneReminderRuntime.get(this).enqueuePending()}}
    override fun onDestroy(){upload?.onReceiveValue(null);upload=null;cameraRequest?.deny();cameraRequest=null;if(::bridge.isInitialized)bridge.close();if(::printer.isInitialized)printer.dispose();if(::web.isInitialized){(web.parent as? android.view.ViewGroup)?.removeView(web);web.destroy()};super.onDestroy()}
}
