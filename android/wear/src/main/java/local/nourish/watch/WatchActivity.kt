package local.nourish.watch

import android.app.Activity
import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import local.nourish.wearcontract.*

class WatchActivity:Activity(),MessageClient.OnMessageReceivedListener {
    private val gate=WatchRequestGate()
    private val handler=Handler(Looper.getMainLooper())
    private lateinit var column:LinearLayout
    private lateinit var body:LinearLayout
    private lateinit var status:TextView
    private val settings by lazy{WatchSettings(this)}
    private val notifications by lazy{WatchNotifications(this)}
    private val alertButtons=mutableMapOf<String,Button>()
    private var permissionChoice:Pair<WatchAlertPolicy,String>?=null
    private var renderedPhone:String?=null
    private var active=false
    private var pending=false
    private var discovering=false
    private val tick=object:Runnable{override fun run(){if(active){if(settings.read().enabled&&!pending&&!discovering)refresh();handler.postDelayed(this,60000)}}}
    private fun dp(value:Int)=(value*resources.displayMetrics.density).toInt()
    private fun label(parent:LinearLayout,value:String,size:Float=16f)=TextView(this).apply{text=value;textSize=size;setTextColor(Color.WHITE);setPadding(0,dp(5),0,dp(5));parent.addView(this)}
    private fun button(value:String,action:()->Unit)=Button(this).apply{text=value;textSize=16f;isAllCaps=false;minHeight=dp(48);column.addView(this,LinearLayout.LayoutParams(-1,-2));setOnClickListener{action()}}
    override fun onCreate(state:Bundle?){
        super.onCreate(state)
        column=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER_HORIZONTAL;setPadding(dp(28),dp(32),dp(28),dp(32));setBackgroundColor(Color.BLACK)}
        label(column,getString(R.string.app_name),22f);status=label(column,getString(R.string.watch_connect_hint),14f)
        body=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;column.addView(this,LinearLayout.LayoutParams(-1,-2))}
        button(getString(R.string.watch_connect)){discover()};button(getString(R.string.watch_refresh)){discovering=false;if(settings.read().phone==null)discover() else refresh()}
        button(getString(R.string.watch_unit_switch)){val choice=settings.read();val unit=if(choice.unit=="kcal")"kJ" else "kcal";settings.setUnit(unit);gate.clear();clearDisplay();if(choice.enabled&&!discovering)refresh() else status.text=getString(R.string.watch_unit,unit)}
        for(kind in listOf("food","fasting"))alertButtons[kind]=button(""){toggleAlert(kind)}
        button(getString(R.string.watch_notification_settings)){startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,packageName))}
        button(getString(R.string.watch_disconnect)){disconnect(getString(R.string.watch_disconnected))}
        val help=TextView(this).apply{text=getString(R.string.watch_help);textSize=14f;setTextColor(Color.WHITE);visibility=View.GONE;setPadding(0,dp(5),0,dp(5))}
        val details=button(getString(R.string.watch_details)){}
        details.setOnClickListener{val expanded=help.visibility!=View.VISIBLE;help.visibility=if(expanded)View.VISIBLE else View.GONE;details.text=getString(if(expanded)R.string.watch_hide_details else R.string.watch_details)}
        column.addView(help)
        setContentView(ScrollView(this).apply{isFillViewport=true;addView(column)})
        updateAlertControls()
    }
    private fun updateAlertControls(){
        val choice=settings.read()
        alertButtons.forEach{(kind,button)->val resource=if(kind=="food"){
            if(kind !in choice.kinds)R.string.watch_food_off else if(notifications.permitted(kind))R.string.watch_food_on else R.string.watch_food_blocked
        }else{
            if(kind !in choice.kinds)R.string.watch_fasting_off else if(notifications.permitted(kind))R.string.watch_fasting_on else R.string.watch_fasting_blocked
        };button.text=getString(resource);button.isEnabled=choice.policy()!=null}
    }
    private fun toggleAlert(kind:String){
        val policy=settings.read().policy()?:return
        if(kind in policy.kinds){notifications.changeKinds(policy,policy.kinds-kind);updateAlertControls();return}
        if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){permissionChoice=policy to kind;requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS),101);return}
        if(!notifications.permitted(kind)){status.text=getString(R.string.watch_blocked);return}
        notifications.changeKinds(policy,policy.kinds+kind);updateAlertControls()
    }
    override fun onRequestPermissionsResult(requestCode:Int,permissions:Array<out String>,grantResults:IntArray){
        super.onRequestPermissionsResult(requestCode,permissions,grantResults)
        if(requestCode!=101)return
        val choice=permissionChoice;permissionChoice=null
        if(choice!=null&&grantResults.firstOrNull()==PackageManager.PERMISSION_GRANTED&&notifications.permitted(choice.second))notifications.changeKinds(choice.first,choice.first.kinds+choice.second)
        updateAlertControls()
    }
    private fun clearDisplay(){body.removeAllViews();renderedPhone=null}
    override fun onResume(){super.onResume();active=true;updateAlertControls();Wearable.getMessageClient(this).addListener(this).addOnFailureListener{if(active)status.text=getString(R.string.watch_connection_unavailable)};if(settings.read().enabled&&!discovering)refresh();handler.postDelayed(tick,60000)}
    override fun onPause(){active=false;gate.clear();pending=false;handler.removeCallbacks(tick);Wearable.getMessageClient(this).removeListener(this);clearDisplay();super.onPause()}
    private fun disconnect(message:String){gate.clear();pending=false;discovering=false;permissionChoice=null;notifications.disconnect();clearDisplay();updateAlertControls();status.text=message}
    override fun onMessageReceived(event:MessageEvent){if(active&&event.path==WATCH_CLEAR_PATH&&(event.sourceNodeId==settings.read().phone||event.sourceNodeId==renderedPhone))disconnect(getString(R.string.watch_access_revoked))}
    private fun discover(){
        val request=gate.begin();pending=false;discovering=true;clearDisplay();status.text=getString(R.string.watch_looking)
        val client=Wearable.getCapabilityClient(this)
        GoogleApiAvailability.getInstance().checkApiAvailability(client).addOnSuccessListener(this){
            client.getCapability(PHONE_CAPABILITY,CapabilityClient.FILTER_REACHABLE).addOnSuccessListener(this){info->
                if(!active||!gate.owns(request))return@addOnSuccessListener
                if(info.nodes.isEmpty()){status.text=getString(R.string.watch_enable_on_phone);return@addOnSuccessListener}
                status.text=getString(R.string.watch_choose_phone)
                info.nodes.sortedBy{it.displayName}.forEach{node->body.addView(Button(this).apply{text=node.displayName;isAllCaps=false;setOnClickListener{notifications.selectPhone(node.id);discovering=false;permissionChoice=null;updateAlertControls();refresh()}})}
            }.addOnFailureListener(this){if(active&&gate.owns(request))status.text=getString(R.string.watch_phone_not_found)}
        }.addOnFailureListener(this){if(active&&gate.owns(request))status.text=getString(R.string.watch_play_unavailable)}
    }
    private fun refresh(){
        val choice=settings.read();if(!choice.enabled)return;val target=choice.phone?:return;val requestedUnit=choice.unit;val request=gate.begin();pending=true;status.text=getString(R.string.watch_refreshing)
        Wearable.getMessageClient(this).sendRequest(target,WATCH_SUMMARY_PATH,watchRequest(requestedUnit)).addOnSuccessListener(this){bytes->
            if(!active||!gate.owns(request))return@addOnSuccessListener
            pending=false
            try{val reply=WatchReply.parse(bytes);clearDisplay();if(reply.status!="connected"){status.text=reply.message;return@addOnSuccessListener};val summary=requireNotNull(reply.summary);require(summary.unit==requestedUnit);if(!notifications.confirmRevision(target,requireNotNull(reply.revision)))return@addOnSuccessListener;updateAlertControls();render(summary)}
            catch(_:Exception){clearDisplay();status.text=getString(R.string.watch_bad_update)}
        }.addOnFailureListener(this){if(active&&gate.owns(request)){pending=false;clearDisplay();status.text=getString(R.string.watch_workspace_unavailable)}}
    }
    private fun render(summary:WatchSummary){
        renderedPhone=settings.read().phone
        status.text="${summary.date}\n"+getString(R.string.watch_updated,summary.asOf.atZone(summary.zone).toLocalTime().withNano(0).toString())+"\n${summary.zone.id}"
        fun section(title:String,section:WatchSection){if(!section.visible)return;label(body,title,18f);section.rows.forEach{row->
            val card=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(10),dp(8),dp(10),dp(8));background=GradientDrawable().apply{setColor(Color.rgb(30,37,40));cornerRadius=dp(14).toFloat()}}
            body.addView(card,LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=dp(8)})
            label(card,row.title,14f);label(card,row.value,21f);if(row.status!="complete")label(card,if(row.status=="partial")getString(R.string.watch_partial) else getString(R.string.watch_unmeasured),12f);label(card,row.detail,11f)
        }}
        section(getString(if(summary.unit=="kcal")R.string.watch_calories else R.string.watch_energy),summary.energy);section(getString(R.string.watch_scores),summary.scores);section(getString(R.string.watch_targets),summary.targets)
        if(summary.attributions.isNotEmpty()){label(body,getString(R.string.watch_sources),14f);summary.attributions.forEach{label(body,it,12f)}}
    }
}
