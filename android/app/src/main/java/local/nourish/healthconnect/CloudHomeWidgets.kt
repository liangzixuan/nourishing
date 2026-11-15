package local.nourish.healthconnect

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.view.WindowInsets
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.*
import java.util.UUID
import org.json.JSONObject

class CloudHomeWidgetWorker(context:Context,parameters:WorkerParameters):CoroutineWorker(context,parameters){
    override suspend fun doWork():Result=withContext(Dispatchers.IO){
        CloudWebSessions.initialize(applicationContext)
        val id=inputData.getInt("widgetId",AppWidgetManager.INVALID_APPWIDGET_ID)
        val store=CloudWidgetStore(applicationContext);val config=store.config(id)?:return@withContext Result.success()
        if(config.binding.origin!=NourishingWorkspace.cloudOrigin||widgetKind(applicationContext,id)!=config.kind)return@withContext Result.success()
        val session=CloudWebSessions.get(config.binding.origin)
        try{
            val lease=session.acquire()
            if(!config.binding.owns(lease))throw CloudSessionChanged()
            val json=cloudWidgetSnapshot(session,lease,config)
            if(!isStopped)session.publish(lease){store.publish(id,config,json)}
        }catch(error:CancellationException){throw error}
        catch(_:Exception){store.publish(id,config,null)}
        renderHomeWidget(applicationContext,id);Result.success()
    }
}

class CloudWidgetConfigurationPanel(private val activity:ComponentActivity,private val id:Int,private val kind:WidgetKind){
    private var request:Job?=null
    private val context:Context=activity
    private val origin=NourishingWorkspace.cloudOrigin!!
    private val session=CloudWebSessions.get(origin)
    private val store=CloudWidgetStore(context)
    val view:ScrollView
    init{
        CloudWebSessions.initialize(context)
        val column=LinearLayout(context).apply{orientation=LinearLayout.VERTICAL;setPadding(24,28,24,28)}
        fun label(value:String)=TextView(context).apply{text=value;textSize=18f;setPadding(0,12,0,12);column.addView(this)}
        label("Nourishing widget").textSize=24f
        label("Energy unit")
        val unit=Spinner(context).apply{adapter=ArrayAdapter(context,android.R.layout.simple_spinner_dropdown_item,listOf("kcal","kJ"));setSelection(if(store.config(id)?.unit=="kJ")1 else 0);column.addView(this)}
        val preview=Button(context).apply{text="Preview";isAllCaps=false;column.addView(this)}
        val output=label("Uses the account signed into Nourishing.")
        val save=Button(context).apply{text="Save widget";isAllCaps=false;isEnabled=false;column.addView(this)}
        var prepared:Triple<CloudAccountLease,CloudWidgetConfig,JSONObject>?=null
        unit.onItemSelectedListener=object:android.widget.AdapterView.OnItemSelectedListener{
            override fun onNothingSelected(parent:android.widget.AdapterView<*>?){prepared=null;save.isEnabled=false}
            override fun onItemSelected(parent:android.widget.AdapterView<*>?,view:android.view.View?,position:Int,itemId:Long){prepared=null;save.isEnabled=false}
        }
        preview.setOnClickListener{
            request?.cancel();prepared=null;save.isEnabled=false;preview.isEnabled=false;unit.isEnabled=false
            val selected=unit.selectedItem.toString()
            request=activity.lifecycleScope.launch{
                try{
                    val result=withContext(Dispatchers.IO){val lease=session.acquire();val config=CloudWidgetConfig(CloudNativeBinding.from(lease),selected,kind,UUID.randomUUID().toString());Triple(lease,config,cloudWidgetSnapshot(session,lease,config))}
                    if(!session.isCurrent(result.first))throw CloudSessionChanged()
                    require(widgetKind(context,id)==kind){"Widget removed"}
                    prepared=result;save.isEnabled=true
                    val snapshot=HomeWidgetSnapshot.parseCloud(result.third,result.second)
                    output.text="${result.first.account.email?:result.first.account.id}\n${snapshot.card.title}: ${snapshot.card.value}\n${snapshot.date}"
                }catch(error:CancellationException){throw error}
                catch(_:Exception){output.text="Open Nourishing and sign in, then try Preview again."}
                finally{preview.isEnabled=true;unit.isEnabled=true}
            }
        }
        save.setOnClickListener{
            try{
                val result=prepared?:throw CloudSessionChanged()
                require(widgetKind(context,id)==kind){"Widget removed"}
                if(!session.publish(result.first){store.save(id,result.second,result.third)})throw CloudSessionChanged()
                renderHomeWidget(context,id)
                activity.setResult(Activity.RESULT_OK,Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id));activity.finish()
            }catch(_:Exception){prepared=null;save.isEnabled=false;output.text="Preview the signed-in account again."}
        }
        view=ScrollView(context).apply{addView(column);setOnApplyWindowInsetsListener{_,insets->
            if(Build.VERSION.SDK_INT>=30){val edges=insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime());column.setPadding(24+edges.left,28+edges.top,24+edges.right,28+edges.bottom)};insets
        }}
    }
    fun stop(){request?.cancel()}
}
