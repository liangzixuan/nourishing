package local.nourish.healthconnect

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Settings
import androidx.activity.result.contract.ActivityResultContracts
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.core.widget.addTextChangedListener
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.lifecycleScope
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import local.nourish.wearcontract.WATCH_CLEAR_PATH

class WearSettingsActivity:ComponentActivity() {
    private var job:Job?=null
    private var pendingRelay:WearConfig?=null
    private lateinit var relayStatus:TextView
    private val handler=Handler(Looper.getMainLooper())
    private val relayTick=object:Runnable{override fun run(){relayStatus.text=wearRelayStatusText(WearRelayControl.status);handler.postDelayed(this,1000)}}
    private val relayPermissions=registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()){
        val config=pendingRelay;pendingRelay=null
        if(config!=null&&WearSettings(this).config()==config)startRelay(config)
    }
    private fun relayMessage(message:WearRelayStatus){WearRelayControl.notice(message);relayStatus.text=wearRelayStatusText(message)}
    private fun startRelay(config:WearConfig){try{WearRelayService.start(this,config);relayStatus.text=wearRelayStatusText(WearRelayControl.status)}catch(error:Exception){relayMessage(wearRelayError(error))}}
    override fun onCreate(savedInstanceState:Bundle?) {
        super.onCreate(savedInstanceState)
        val settings=WearSettings(this);val layout=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(24,40,24,32)}
        fun text(value:String)=TextView(this).apply{text=value;textSize=17f;setPadding(0,12,0,12);layout.addView(this)}
        fun help(title:Int,body:Int){val details=NativeDetails(this,getString(title));details.body.addView(TextView(this).apply{text=getString(body);textSize=16f});layout.addView(details)}
        text(getString(R.string.watch_title))
        help(R.string.watch_help_title,R.string.watch_help)
        val address=EditText(this).apply{hint=getString(R.string.watch_address);setSingleLine();setText(settings.config()?.origin?.value?:SyncSettings(this@WearSettingsActivity).origin);layout.addView(this)}
        val status=text(settings.config()?.let{getString(R.string.watch_enabled,it.login,it.origin.value)}?:getString(R.string.watch_off))
        var checked:Pair<WorkspaceOrigin,WorkspaceIdentity>?=null
        val enable=Button(this).apply{textSize=16f;isAllCaps=false;text=getString(R.string.watch_enable);isEnabled=false}
        val check=Button(this).apply{textSize=16f;isAllCaps=false;text=getString(R.string.watch_check)}
        address.addTextChangedListener{checked=null;enable.isEnabled=false;job?.cancel()}
        check.setOnClickListener{
            job?.cancel();checked=null;enable.isEnabled=false
            val input=address.text.toString()
            val origin=runCatching{WorkspaceOrigin.parse(input)}.getOrElse{status.text=workspaceErrorText(it);return@setOnClickListener}
            status.text=getString(R.string.watch_checking)
            job=lifecycleScope.launch{
                try{val identity=WorkspaceClient().identity(origin);if(address.text.toString()!=input)return@launch;checked=origin to identity;status.text=getString(R.string.watch_account,identity.login,origin.value);enable.isEnabled=true}
                catch(error:Exception){if(error is kotlinx.coroutines.CancellationException)throw error;status.text=workspaceErrorText(error)}
            }
        }
        enable.setOnClickListener{checked?.let{(origin,identity)->pendingRelay=null;WearRelayService.stop(this);settings.enable(origin,identity);status.text=getString(R.string.watch_connected,identity.login);enable.isEnabled=false}}
        layout.addView(check);layout.addView(enable)
        text(getString(R.string.watch_reminders))
        help(R.string.watch_reminder_help_title,R.string.watch_reminder_help)
        relayStatus=text(wearRelayStatusText(WearRelayControl.status))
        layout.addView(Button(this).apply{textSize=16f;isAllCaps=false;text=getString(R.string.watch_start);setOnClickListener{
            val config=settings.config();if(config==null){relayMessage(WearRelayStatus.Notice(WearRelayNotice.ENABLE_FIRST));return@setOnClickListener}
            val missing=WearRelayService.permissions().filter{checkSelfPermission(it)!=PackageManager.PERMISSION_GRANTED}
            if(missing.isNotEmpty()){pendingRelay=config;relayPermissions.launch(missing.toTypedArray())} else startRelay(config)
        }})
        layout.addView(Button(this).apply{textSize=16f;isAllCaps=false;text=getString(R.string.watch_stop);setOnClickListener{pendingRelay=null;WearRelayService.stop(this@WearSettingsActivity);relayStatus.text=wearRelayStatusText(WearRelayControl.status)}})
        layout.addView(Button(this).apply{textSize=16f;isAllCaps=false;text=getString(R.string.watch_notifications);setOnClickListener{startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,packageName))}})
        layout.addView(Button(this).apply{textSize=16f;isAllCaps=false;text=getString(R.string.watch_reconnect);setOnClickListener{
            pendingRelay=null;WearRelayService.stop(this@WearSettingsActivity);WearRelayStore(this@WearSettingsActivity).reconnect();relayMessage(WearRelayStatus.Notice(WearRelayNotice.RECONNECTED))
        }})
        layout.addView(Button(this).apply{textSize=16f;isAllCaps=false;text=getString(R.string.watch_disable);setOnClickListener{
            job?.cancel();checked=null;enable.isEnabled=false;pendingRelay=null;WearRelayService.stop(this@WearSettingsActivity);settings.clear();status.text=getString(R.string.watch_disabled)
            Wearable.getNodeClient(this@WearSettingsActivity).connectedNodes.addOnSuccessListener{nodes->nodes.forEach{Wearable.getMessageClient(this@WearSettingsActivity).sendMessage(it.id,WATCH_CLEAR_PATH,byteArrayOf())}}
        }})
        val scroll=ScrollView(this).apply{addView(layout)}
        ViewCompat.setOnApplyWindowInsetsListener(scroll){view,insets->
            val edges=insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            view.setPadding(edges.left,edges.top,edges.right,edges.bottom);insets
        }
        setContentView(scroll)
        WindowCompat.getInsetsController(window,window.decorView).isAppearanceLightStatusBars=true
        ViewCompat.requestApplyInsets(scroll)
    }
    override fun onResume(){super.onResume();handler.post(relayTick)}
    override fun onPause(){handler.removeCallbacks(relayTick);super.onPause()}
    override fun onStop(){job?.cancel();super.onStop()}
}
