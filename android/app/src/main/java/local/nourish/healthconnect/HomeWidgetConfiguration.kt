package local.nourish.healthconnect

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.WindowInsets
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.core.widget.addTextChangedListener
import androidx.lifecycle.lifecycleScope
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import org.json.JSONObject

class HomeWidgetConfiguration : ComponentActivity() {
    private var request: Job? = null
    private var cloudPanel:CloudWidgetConfigurationPanel?=null
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setResult(Activity.RESULT_CANCELED)
        val id=intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,AppWidgetManager.INVALID_APPWIDGET_ID)
        val kind=widgetKind(this,id) ?: run { finish();return }
        if(NourishingWorkspace.cloudOrigin!=null){cloudPanel=CloudWidgetConfigurationPanel(this,id,kind);setContentView(cloudPanel!!.view);return}
        val store=HomeWidgetStore(this);val previous=store.config(id)
        val column=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL;setPadding(24,28,24,28) }
        fun label(value: String) = TextView(this).apply { text=value;textSize=16f;setPadding(0,12,0,12);column.addView(this) }
        label(getString(R.string.widget_config_title)).textSize=24f
        label(getString(R.string.widget_workspace))
        val address=EditText(this).apply { setSingleLine();hint="https://your-pc.your-tailnet.ts.net:8443";setText(previous?.origin?.value ?: SyncSettings(this@HomeWidgetConfiguration).origin);column.addView(this) }
        label(getString(R.string.widget_unit))
        val unit=Spinner(this).apply { adapter=ArrayAdapter(this@HomeWidgetConfiguration,android.R.layout.simple_spinner_dropdown_item,listOf("kcal","kJ"));setSelection(if(previous?.unit=="kJ")1 else 0);column.addView(this) }
        val check=Button(this).apply { text=getString(R.string.widget_preview);textSize=16f;isAllCaps=false;column.addView(this) }
        val output=label("")
        val save=Button(this).apply { text=getString(R.string.widget_save);textSize=16f;isAllCaps=false;isEnabled=false;column.addView(this) }
        column.addView(NativeDetails(this,getString(R.string.widget_help)).apply {
            body.addView(TextView(this@HomeWidgetConfiguration).apply { text=getString(R.string.widget_help_text);textSize=16f;setPadding(0,12,0,12) })
        })
        var prepared: Pair<HomeWidgetConfig,JSONObject>?=null
        address.addTextChangedListener { prepared=null;save.isEnabled=false }
        unit.onItemSelectedListener=object:android.widget.AdapterView.OnItemSelectedListener {
            override fun onNothingSelected(parent:android.widget.AdapterView<*>?) { prepared=null;save.isEnabled=false }
            override fun onItemSelected(parent:android.widget.AdapterView<*>?,view:android.view.View?,position:Int,itemId:Long) { prepared=null;save.isEnabled=false }
        }
        check.setOnClickListener {
            request?.cancel();prepared=null;save.isEnabled=false
            address.isEnabled=false;unit.isEnabled=false;check.isEnabled=false
            request=lifecycleScope.launch {
                try {
                    val origin=WorkspaceOrigin.parse(address.text.toString());val client=WorkspaceClient();val identity=client.identity(origin)
                    val config=HomeWidgetConfig(origin,identity.login,unit.selectedItem.toString(),kind,UUID.randomUUID().toString())
                    val json=client.widgetSnapshot(config);val snapshot=HomeWidgetSnapshot.parse(json,config)
                    require(widgetKind(this@HomeWidgetConfiguration,id)==kind) { getString(R.string.widget_removed) }
                    prepared=config to json;save.isEnabled=true
                    output.text=listOf(getString(R.string.widget_account,config.login),origin.value,"", "${snapshot.date} (${snapshot.zone})", "${snapshot.card.title}: ${snapshot.card.value}",snapshot.card.detail,snapshot.card.expanded,"",getString(R.string.widget_updated,snapshot.asOf.toString())).joinToString("\n")
                } catch(error:CancellationException) { output.text=getString(R.string.widget_preview_stopped);throw error }
                catch(error:Exception) { output.text=syncDiagnosticText(captureSyncDiagnostic(error)) }
                finally { address.isEnabled=true;unit.isEnabled=true;check.isEnabled=true }
            }
        }
        save.setOnClickListener {
            try {
                val (config,json)=prepared ?: error(getString(R.string.widget_preview_first))
                require(widgetKind(this,id)==config.kind) { getString(R.string.widget_removed) }
                store.save(id,config,json);renderHomeWidget(this,id)
                setResult(Activity.RESULT_OK,Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id));finish()
            } catch(error:Exception) { output.text=syncDiagnosticText(captureSyncDiagnostic(error)) }
        }
        setContentView(ScrollView(this).apply { addView(column);setOnApplyWindowInsetsListener { _,insets ->
            if(Build.VERSION.SDK_INT>=30){val edges=insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime());column.setPadding(24+edges.left,28+edges.top,24+edges.right,28+edges.bottom)}
            else { @Suppress("DEPRECATION") column.setPadding(24+insets.systemWindowInsetLeft,28+insets.systemWindowInsetTop,24+insets.systemWindowInsetRight,28+insets.systemWindowInsetBottom) };insets
        } })
    }
    override fun onStop() { request?.cancel();cloudPanel?.stop();super.onStop() }
}
