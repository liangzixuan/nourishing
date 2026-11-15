package local.nourish.healthconnect

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.http.SslError
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.webkit.*
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.net.toUri

/** A separate activity preserves the diary, its scroll position and unsaved inputs. */
class UserManualActivity:ComponentActivity() {
    private lateinit var web:WebView
    private lateinit var failure:LinearLayout
    private lateinit var loading:ProgressBar
    private var requestedUrl=""
    private var pageFailed=false
    private fun dp(value:Int)=(value*resources.displayMetrics.density).toInt()
    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState:Bundle?) {
        super.onCreate(savedInstanceState)
        requestedUrl=savedInstanceState?.getString("manual-url")?:intent.dataString.orEmpty()
        if(!UserManualPolicy.owns(requestedUrl)){finish();return}
        val ink=Color.rgb(37,40,57)
        val column=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL;setBackgroundColor(Color.WHITE) }
        val header=FrameLayout(this).apply {
            background=GradientDrawable().apply { setColor(ink);cornerRadii=floatArrayOf(0f,0f,0f,0f,dp(16).toFloat(),dp(16).toFloat(),dp(16).toFloat(),dp(16).toFloat()) }
        }
        fun button(icon:Int,label:Int,position:Int,viewTag:String,action:()->Unit) {
            header.addView(ImageButton(this).apply {
                tag=viewTag;contentDescription=getString(label);setImageResource(icon);setBackgroundColor(Color.TRANSPARENT)
                setPadding(dp(14),dp(14),dp(14),dp(14));setOnClickListener{action()}
            },FrameLayout.LayoutParams(dp(52),dp(52),position or Gravity.CENTER_VERTICAL))
        }
        header.addView(TextView(this).apply {
            text=getString(R.string.manual_title);textSize=20f;setTypeface(typeface,Typeface.BOLD);setTextColor(Color.rgb(244,243,255));gravity=Gravity.CENTER
        },FrameLayout.LayoutParams(-1,-1).apply{leftMargin=dp(52);rightMargin=dp(52)})
        button(R.drawable.manual_back,R.string.manual_back,Gravity.START,"manual-back",::back)
        button(R.drawable.manual_external,R.string.manual_external,Gravity.END,"manual-external"){openBrowser(selectedUrl())}
        column.addView(FrameLayout(this).apply{setBackgroundColor(Color.WHITE);addView(header,FrameLayout.LayoutParams(-1,-1))},LinearLayout.LayoutParams(-1,dp(64)))
        val body=FrameLayout(this).apply{setBackgroundColor(Color.WHITE)}
        web=WebView(this).apply{tag="nourishing-manual-webview";setBackgroundColor(Color.WHITE)}
        web.settings.apply {
            javaScriptEnabled=true;domStorageEnabled=true;allowFileAccess=false;allowContentAccess=false
            mixedContentMode=WebSettings.MIXED_CONTENT_NEVER_ALLOW;javaScriptCanOpenWindowsAutomatically=false
            setSupportMultipleWindows(false);mediaPlaybackRequiresUserGesture=true
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(web,false)
        body.addView(web,FrameLayout.LayoutParams(-1,-1))
        loading=ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal).apply{tag="manual-loading"}
        body.addView(loading,FrameLayout.LayoutParams(-1,dp(3),Gravity.TOP))
        failure=LinearLayout(this).apply {
            tag="manual-error";orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER;setBackgroundColor(Color.WHITE);visibility=View.GONE;setPadding(dp(24),dp(24),dp(24),dp(24))
            addView(TextView(this@UserManualActivity).apply{text=getString(R.string.manual_unavailable);textSize=18f;gravity=Gravity.CENTER;setTextColor(ink)})
            addView(Button(this@UserManualActivity).apply{tag="manual-retry";text=getString(R.string.manual_retry);setOnClickListener{web.loadUrl(requestedUrl)}})
        }
        body.addView(failure,FrameLayout.LayoutParams(-1,-1));column.addView(body,LinearLayout.LayoutParams(-1,0,1f))
        setContentView(column)
        ViewCompat.setOnApplyWindowInsetsListener(column){view,insets->val safe=insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime());view.setPadding(safe.left,safe.top,safe.right,0);body.setPadding(0,0,0,safe.bottom);insets}
        // Keep the status-bar inset the same dark color as the reference header.
        column.setBackgroundColor(ink)
        WindowCompat.getInsetsController(window,column).apply{isAppearanceLightStatusBars=false;isAppearanceLightNavigationBars=true}
        web.webViewClient=object:WebViewClient() {
            override fun shouldOverrideUrlLoading(view:WebView,request:WebResourceRequest):Boolean {
                val url=request.url.toString()
                if(UserManualPolicy.owns(url))return false
                if(request.isForMainFrame&&request.hasGesture()&&UserManualPolicy.isBrowserLink(url))openBrowser(url)
                return true
            }
            override fun onPageStarted(view:WebView,url:String,icon:android.graphics.Bitmap?) {
                if(!UserManualPolicy.owns(url)){view.stopLoading();showError();return}
                requestedUrl=url;pageFailed=false;failure.visibility=View.GONE;loading.visibility=View.VISIBLE
            }
            override fun onPageFinished(view:WebView,url:String){loading.visibility=View.GONE}
            override fun onReceivedError(view:WebView,request:WebResourceRequest,error:WebResourceError){if(request.isForMainFrame)showError()}
            override fun onReceivedHttpError(view:WebView,request:WebResourceRequest,response:WebResourceResponse){if(request.isForMainFrame&&response.statusCode>=400)showError()}
            override fun onReceivedSslError(view:WebView,handler:SslErrorHandler,error:SslError){handler.cancel();if(error.url==view.url||error.url==requestedUrl)showError()}
        }
        web.webChromeClient=object:WebChromeClient() {
            override fun onProgressChanged(view:WebView,progress:Int){loading.progress=progress;loading.visibility=if(progress<100&&!pageFailed)View.VISIBLE else View.GONE}
            override fun onPermissionRequest(request:PermissionRequest){request.deny()}
        }
        web.setDownloadListener{url,_,_,_,_->if(UserManualPolicy.isBrowserLink(url))openBrowser(url)}
        onBackPressedDispatcher.addCallback(this,object:OnBackPressedCallback(true){override fun handleOnBackPressed()=back()})
        if(savedInstanceState?.getBundle("manual-web-state")?.let{web.restoreState(it)}==null)web.loadUrl(requestedUrl)
    }
    private fun selectedUrl()=web.url?.takeIf(UserManualPolicy::owns)?:requestedUrl
    private fun showError(){pageFailed=true;failure.visibility=View.VISIBLE;loading.visibility=View.GONE}
    private fun back(){if(web.canGoBack())web.goBack()else finish()}
    private fun openBrowser(url:String) {
        if(!UserManualPolicy.isBrowserLink(url))return
        runCatching{startActivity(Intent(Intent.ACTION_VIEW,url.toUri()))}.onFailure{Toast.makeText(this,getString(R.string.web_no_handler),Toast.LENGTH_SHORT).show()}
    }
    override fun onSaveInstanceState(outState:Bundle) {
        super.onSaveInstanceState(outState)
        if(::web.isInitialized){outState.putString("manual-url",selectedUrl());val state=Bundle();web.saveState(state);outState.putBundle("manual-web-state",state)}
    }
    override fun onPause(){if(::web.isInitialized)web.onPause();super.onPause()}
    override fun onResume(){super.onResume();if(::web.isInitialized)web.onResume()}
    override fun onDestroy(){if(::web.isInitialized){web.stopLoading();(web.parent as? android.view.ViewGroup)?.removeView(web);web.destroy()};super.onDestroy()}
}
