package local.nourish.healthconnect

import android.content.Context
import android.view.View
import android.widget.*
import androidx.core.widget.addTextChangedListener
import androidx.health.connect.client.HealthConnectClient
import java.time.ZoneId
import kotlinx.coroutines.*
import org.json.JSONObject

/** Foreground export uses the account already signed into the app's WebView. */
class CloudHealthExportPanel(context:Context,private val scope:CoroutineScope,private val dates:()->Pair<String,String>,
    private val health:()->HealthConnectClient?,private val grant:(Set<String>)->Unit,private val onBusy:(Boolean)->Unit):LinearLayout(context) {
    private val session=CloudWebSessions.get(requireNotNull(NourishingWorkspace.cloudOrigin))
    private val transfer=CloudHealthExport(session)
    private val journal=AndroidCloudExportJournal(context)
    private val controls=mutableListOf<View>()
    private val metrics=mutableListOf<Pair<String,String>>()
    private val kind=Spinner(context)
    private val metric=Spinner(context)
    private val secondary=Spinner(context)
    private val water=Spinner(context)
    private val zone=EditText(context).apply{setSingleLine();setText(ZoneId.systemDefault().id)}
    private val output=TextView(context).apply{textSize=16f;setTextIsSelectable(true);setPadding(0,12,0,12)}
    private var lease:CloudAccountLease?=null
    private var review:CloudExportReview?=null
    private var resumed=false
    private var pending=false
    private var external=false
    private var disposed=false
    private var job:Job?=null
    private lateinit var confirm:Button
    private lateinit var permission:Button
    private lateinit var metricLabel:TextView
    private lateinit var secondaryLabel:TextView
    private lateinit var waterLabel:TextView
    init {
        orientation=VERTICAL
        label("Export to Health Connect").textSize=22f
        button("Load exports") { runRequest {
            val connected=withContext(Dispatchers.IO){session.acquire()}
            val (owner,options)=withContext(Dispatchers.IO){transfer.options(connected)}
            metrics.clear();val list=options.getJSONArray("metrics")
            for(index in 0 until list.length()){val item=list.getJSONObject(index);metrics.add(item.getString("type") to item.getString("unit"))}
            lease=connected;zone.setText(options.getString("timeZone"));refreshMetrics()
            val saved=withContext(Dispatchers.IO){journal.load(owner)}
            resumed=saved!=null;review=saved?.review
            output.text=review?.let{previewText(it,"Pending export")}?:"Choose a type, then preview."
        }}
        label("Type");kind.adapter=adapter(HealthWriteType.entries.map{context.getString(it.displayLabelResource)});addControl(kind)
        metricLabel=label("Metric");addControl(metric)
        secondaryLabel=label("Diastolic metric");addControl(secondary)
        waterLabel=label("Water source");water.adapter=adapter(HealthWaterChoice.entries.map{context.getString(it.labelResource)});addControl(water)
        label("Time zone");addControl(zone)
        permission=button("Grant selected write permissions"){val permissions=review?.plan?.type?.permissions?:selectedType().permissions;review=null;grant(permissions);updateControls()}
        button("Preview export"){runRequest {
            require(!resumed){"Resume the pending export first."}
            val connected=lease?:error("Load exports first.");val selection=selection()
            val prepared=withContext(Dispatchers.IO){transfer.preview(connected,selection)}
            require(sameHealthExportSelection(selection,selection())){"Selection changed. Preview again."}
            review=prepared;output.text=previewText(prepared,"Preview")
        }}
        addView(output)
        confirm=button("Write to Health Connect"){runRequest {
            val prepared=review?:error("Preview the export first.")
            if(!resumed)require(sameHealthExportSelection(JSONObject(prepared.plan.selection),selection())){"Selection changed. Preview again."}
            val connected=lease?:error("Load exports first.")
            val native=health()?:error("Health Connect is unavailable.")
            val progress=HealthWriteProgress()
            try {
                val count=transfer.write(connected,prepared,journal,AndroidHealthWriteSink(native),NativeHealthWrites.sequence(context),progress)
                review=null;resumed=false;output.text="$count records verified in Health Connect."
            }catch(error:Exception){
                review=null
                if(error is CancellationException)throw error
                error("${error.message ?: "Export failed."} ${context.healthExportProgressText(progress)} Load exports to review any pending write.")
            }
        }}
        kind.onItemSelectedListener=object:AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent:AdapterView<*>?,view:View?,position:Int,id:Long){if(!resumed)refreshMetrics()}
            override fun onNothingSelected(parent:AdapterView<*>?){}
        }
        zone.addTextChangedListener{if(!resumed)review=null;updateControls()}
        refreshMetrics()
    }
    private fun label(text:String)=TextView(context).apply{this.text=text;textSize=16f;setPadding(0,10,0,4);addView(this)}
    private fun adapter(values:List<String>)=ArrayAdapter(context,android.R.layout.simple_spinner_dropdown_item,values)
    private fun addControl(view:View){controls.add(view);addView(view)}
    private fun button(text:String,action:()->Unit)=Button(context).apply{this.text=text;textSize=16f;isAllCaps=false;setOnClickListener{action()};addControl(this)}
    private fun selectedType()=HealthWriteType.entries[kind.selectedItemPosition.coerceAtLeast(0)]
    private fun allowedMetrics()=metrics.filter{it.second in selectedType().units}
    private fun refreshMetrics(){
        review=null
        val type=selectedType();val labels=allowedMetrics().map{"${it.first} (${it.second})"};metric.adapter=adapter(labels);secondary.adapter=adapter(labels)
        metric.visibility=if(type.isIntake)GONE else VISIBLE;metricLabel.visibility=metric.visibility
        secondary.visibility=if(type==HealthWriteType.PRESSURE)VISIBLE else GONE;secondaryLabel.visibility=secondary.visibility
        water.visibility=if(type==HealthWriteType.HYDRATION)VISIBLE else GONE;waterLabel.visibility=water.visibility
        updateControls()
    }
    private fun selection():JSONObject {
        val type=selectedType();val range=dates()
        fun chosen(spinner:Spinner):JSONObject{val item=allowedMetrics().getOrNull(spinner.selectedItemPosition)?:error("Select a metric.");return JSONObject().put("type",item.first).put("unit",item.second)}
        return JSONObject().put("kind",type.wire).put("from",range.first).put("to",range.second).put("timeZone",zone.text.toString()).apply{
            if(type.isIntake)put("interval","recorded-minute")else put("metric",chosen(metric))
            if(type==HealthWriteType.PRESSURE)put("secondaryMetric",chosen(secondary))
            if(type==HealthWriteType.HYDRATION)put("waterSource",HealthWaterChoice.entries[water.selectedItemPosition.coerceAtLeast(0)].wire)
        }
    }
    private fun previewText(value:CloudExportReview,title:String)=listOf(
        "$title · ${context.getString(value.plan.type.displayLabelResource)}",
        "${value.owner.origin.value}\nAccount: ${lease?.account?.email?:value.owner.accountId}\n${value.plan.timeZone}",
        "${value.plan.rows.size} records · ${value.plan.skipped.size} skipped",
        value.plan.rows.joinToString("\n"){it.description},value.plan.skipped.joinToString("\n")
    ).filter{it.isNotEmpty()}.joinToString("\n\n")
    private fun runRequest(work:suspend()->Unit){
        if(pending||external||disposed)return
        pending=true;onBusy(true);updateControls()
        job=scope.launch {
            try{work()}catch(_:CancellationException){review=null;output.text="Export stopped. Load exports to review any pending write."}
            catch(error:Exception){review=null;output.text=when(error){is CloudSessionChanged->"Sign in to Nourishing, then load exports again.";is CloudApiFailure->"Export request failed (${error.status}). Load exports and try again.";else->error.message?:"Export failed."}}
            finally{pending=false;onBusy(false);updateControls()}
        }
    }
    private fun updateControls(){
        val enabled=!pending&&!external&&!disposed
        controls.forEach{it.isEnabled=enabled}
        if(resumed)listOf(kind,metric,secondary,water,zone).forEach{it.isEnabled=false}
        if(::permission.isInitialized)permission.isEnabled=enabled&&health()!=null
        if(::confirm.isInitialized){confirm.text=if(resumed)"Resume export" else "Write to Health Connect";confirm.isEnabled=enabled&&health()!=null&&review?.plan?.rows?.isNotEmpty()==true}
    }
    fun setExternalBusy(value:Boolean){external=value;updateControls()}
    fun stopRequests(){job?.cancel();review=null;lease=null;resumed=false;output.text="";metrics.clear();updateControls()}
    fun dispose(){disposed=true;stopRequests()}
}
