package local.nourish.healthconnect

import android.content.Context
import android.widget.*
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.*
import org.json.JSONObject

/** Manual review and separately enabled hourly exports share the same native write owner. */
class HealthExportPanel(context:Context,private val scope:CoroutineScope,private val destination:()->Pair<WorkspaceOrigin,WorkspaceIdentity>?,private val dates:()->Pair<String,String>,private val health:()->androidx.health.connect.client.HealthConnectClient?,private val grant:(Set<String>)->Unit,private val onBusy:(Boolean)->Unit):LinearLayout(context){
    private val client=WorkspaceClient()
    private val hourly=HourlyExportSettings(context)
    private val hourlyStatus=TextView(context)
    private lateinit var enableHourly:Button
    private lateinit var stopHourly:Button
    private val metrics=mutableListOf<Pair<String,String>>()
    private val metricLabel=TextView(context)
    private val waterLabel=TextView(context)
    private val metric=Spinner(context)
    private val kind=Spinner(context)
    private val waterSource=Spinner(context)
    private val secondary=Spinner(context)
    private val secondaryLabel=TextView(context)
    private val available=mutableListOf<Pair<String,String>>()
    private val zone=EditText(context)
    private val output=TextView(context).apply { textSize=16f;setTextIsSelectable(true);setPadding(0,12,0,12) }
    private val buttons=mutableListOf<Button>()
    private var plan:HealthWritePlan?=null
    private var reviewedDestination:Pair<WorkspaceOrigin,WorkspaceIdentity>?=null
    private var job:Job?=null
    private var pending=false
    private var external=false
    private var disposed=false
    private var progress=HealthWriteProgress()
    private lateinit var confirm:Button
    private lateinit var grantButton:Button
    private lateinit var corrections:IntakeCorrectionPanel
    init {
        orientation=VERTICAL
        var section:LinearLayout=this
        fun text(value:String)=section.addView(TextView(context).apply{text=value;textSize=16f;setPadding(0,12,0,12)})
        fun button(label:String,action:()->Unit)=Button(context).apply{text=label;setOnClickListener{action()};textSize=16f;isAllCaps=false;buttons.add(this);section.addView(this)}
        text(context.getString(R.string.export_ui_title))
        val details=NativeDetails(context,context.getString(R.string.export_ui_details));addView(details);section=details.body
        text(context.getString(R.string.export_help_records))
        text(context.getString(R.string.export_help_intake))
        section=this
        text(context.getString(R.string.export_ui_type))
        waterSource.adapter=ArrayAdapter(context,android.R.layout.simple_spinner_dropdown_item,HealthWaterChoice.entries.map { context.getString(it.labelResource) })
        kind.adapter=ArrayAdapter(context,android.R.layout.simple_spinner_dropdown_item,HealthWriteType.entries.map { context.getString(it.displayLabelResource) });addView(kind)
        waterLabel.text=context.getString(R.string.export_ui_source);waterLabel.textSize=16f;addView(waterLabel);addView(waterSource)
        kind.onItemSelectedListener=object:AdapterView.OnItemSelectedListener{
            override fun onItemSelected(parent:AdapterView<*>?,view:android.view.View?,position:Int,id:Long){refreshMetrics()}
            override fun onNothingSelected(parent:AdapterView<*>?){}
        }
        button(context.getString(R.string.export_ui_load)){runRequest{val target=checked();val json=client.exchange(target.first,"/api/health-connect/export/biometric/options");val list=json.getJSONArray("metrics");available.clear();for(i in 0 until list.length()){val item=list.getJSONObject(i);available.add(item.getString("type") to item.getString("unit"))};refreshMetrics();zone.setText(json.getString("timeZone"));output.text=if(selectedType().isIntake)context.getString(R.string.health_export_ready_intake) else if(metrics.isEmpty())context.getString(R.string.health_export_no_metrics) else context.getString(R.string.health_export_ready_metric)}}
        metricLabel.text=context.getString(R.string.export_ui_metric);metricLabel.textSize=16f;addView(metricLabel);addView(metric)
        text(context.getString(R.string.export_ui_zone));zone.hint="America/Chicago";zone.setSingleLine();zone.textSize=16f;addView(zone)
        secondaryLabel.text=context.getString(R.string.export_ui_secondary);secondaryLabel.textSize=16f;addView(secondaryLabel);addView(secondary)
        grantButton=button(context.getString(R.string.export_ui_permissions)){plan=null;controls();grant(selectedType().permissions)}
        button(context.getString(R.string.export_ui_preview)){runRequest{
            val target=checked();val selection=currentSelection()
            val json=post(target.first,endpoint(selectedType(),"preview"),selection);val prepared=parseHealthWritePlan(json,Instant.now());plan=prepared;reviewedDestination=target
            output.text=context.healthExportPreviewText(target,prepared)
        }}
        addView(output)
        confirm=button(context.getString(R.string.export_ui_confirm)){runRequest(writing=true){
            val prepared=plan?:error(context.getString(R.string.health_export_preview_first));val target=checked();require(target==reviewedDestination){context.getString(R.string.health_export_destination_changed)};require(selectionStillMatches(prepared)){context.getString(R.string.health_export_selection_changed)}
            val sink=AndroidHealthWriteSink(health()?:error(context.getString(R.string.health_export_unavailable)))
            val count=NativeHealthWrites.sequence(context).write { version->
                hourly.invalidate(prepared.type)
                writeReviewedHealthRecords(prepared,sink,version,progress){
                    require(checked()==target){context.getString(R.string.health_export_selection_changed)}
                    HealthExportWorkspace(client).verify(HourlyExportConfig(target.first,target.second.login,prepared.selection,1,"manual"),prepared)
                }
            }
            plan=null;output.text=context.getString(R.string.health_export_written,context.getString(prepared.type.displayLabelResource),count)
        }}
        corrections=IntakeCorrectionPanel(context,scope,destination,selection={currentSelection()},health,onBusy)
        addView(corrections)
        val hourlyDetails=NativeDetails(context,context.getString(R.string.export_ui_hourly));addView(hourlyDetails);section=hourlyDetails.body
        text(context.getString(R.string.export_help_hourly))
        button(context.getString(R.string.export_ui_background)){
            val native=health()
            if(native==null||!backgroundReadAvailable(native))output.text=context.getString(R.string.health_export_background_unavailable)
            else {plan=null;controls();grant(setOf(BACKGROUND_READ_PERMISSION))}
        }
        enableHourly=button(context.getString(R.string.export_ui_enable)){runRequest{
            val prepared=plan?:error(context.getString(R.string.health_export_preview_first));val target=checked()
            require(target==reviewedDestination&&selectionStillMatches(prepared)){context.getString(R.string.health_export_selection_changed)}
            val native=health()?:error(context.getString(R.string.health_export_unavailable))
            require(backgroundReadAvailable(native)){context.getString(R.string.health_export_background_unavailable)}
            val granted=native.permissionController.getGrantedPermissions()
            require(BACKGROUND_READ_PERMISSION in granted&&granted.containsAll(prepared.type.permissions)){context.getString(R.string.health_export_permissions_first)}
            val config=reviewedHourlyExport(target.first,target.second,prepared,Instant.now(),UUID.randomUUID().toString())
            HealthExportWorkspace(client).verify(config,prepared)
            hourly.enable(config);scheduleHealthExport(context);plan=null;refreshHourly()
            output.text=context.getString(R.string.health_export_hourly_enabled,context.getString(prepared.type.displayLabelResource))
        }}
        stopHourly=Button(context).apply{text=context.getString(R.string.export_ui_stop);textSize=16f;isAllCaps=false;setOnClickListener{
            try{hourly.stopAll();stopHealthExport(context);refreshHourly();output.text=context.getString(R.string.health_export_hourly_stopped)}
            catch(error:Exception){output.text=context.workspaceErrorText(error)}
        };addView(this)}
        button(context.getString(R.string.export_ui_refresh)){refreshHourly()}
        hourlyStatus.textSize=16f;addView(hourlyStatus);refreshMetrics()
    }
    private fun selectionStillMatches(value:HealthWritePlan):Boolean {
        return sameHealthExportSelection(JSONObject(value.selection),currentSelection())
    }
    private fun selectedType()=HealthWriteType.entries[kind.selectedItemPosition.coerceAtLeast(0)]
    private fun refreshMetrics(){
        plan=null;val type=selectedType();metrics.clear();metrics.addAll(available.filter{it.second in type.units})
        val labels=metrics.map{"${it.first} (${it.second})"};metric.adapter=ArrayAdapter(context,android.R.layout.simple_spinner_dropdown_item,labels);secondary.adapter=ArrayAdapter(context,android.R.layout.simple_spinner_dropdown_item,labels)
        secondary.visibility=if(type==HealthWriteType.PRESSURE)VISIBLE else GONE;secondaryLabel.visibility=secondary.visibility;metric.visibility=if(type.isIntake)GONE else VISIBLE;metricLabel.visibility=metric.visibility;waterSource.visibility=if(type==HealthWriteType.HYDRATION)VISIBLE else GONE;waterLabel.visibility=waterSource.visibility;controls()
    }
    private fun currentSelection():JSONObject {
        fun chosen(spinner:Spinner):JSONObject{val pair=metrics.getOrNull(spinner.selectedItemPosition)?:error(context.getString(R.string.health_export_metric_first));return JSONObject().put("type",pair.first).put("unit",pair.second)}
        val range=dates();val selection=JSONObject().put("kind",selectedType().wire).put("from",range.first).put("to",range.second).put("timeZone",zone.text.toString())
        if(selectedType().isIntake)selection.put("interval","recorded-minute") else selection.put("metric",chosen(metric))
        if(selectedType()==HealthWriteType.HYDRATION)selection.put("waterSource",HealthWaterChoice.entries[waterSource.selectedItemPosition.coerceAtLeast(0)].wire)
        if(selectedType()==HealthWriteType.PRESSURE)selection.put("secondaryMetric",chosen(secondary))
        return selection
    }
    private fun endpoint(type:HealthWriteType,action:String)=healthExportEndpoint(type,action)
    private suspend fun checked():Pair<WorkspaceOrigin,WorkspaceIdentity>{val target=destination()?:error(context.getString(R.string.health_export_connection_first));require(client.identity(target.first)==target.second){context.getString(R.string.health_export_account_changed)};return target}
    private suspend fun post(origin:WorkspaceOrigin,path:String,payload:JSONObject)=client.exchange(origin,path,json=payload)
    private fun refreshHourly(){val snapshots=hourly.snapshots();val active=snapshots.isNotEmpty();hourlyStatus.text=context.hourlyExportText(snapshots);hourlyStatus.visibility=if(active)VISIBLE else GONE;if(::stopHourly.isInitialized){stopHourly.isEnabled=!disposed&&active;stopHourly.visibility=if(active)VISIBLE else GONE}}
    private fun runRequest(writing:Boolean=false,work:suspend()->Unit){
        if(pending||external||disposed)return
        pending=true;progress=HealthWriteProgress();onBusy(true);controls()
        job=scope.launch{
            try{work()}catch(_:CancellationException){plan=null;output.text=context.getString(if(progress.attempted>progress.confirmed)R.string.health_export_interrupted else R.string.health_export_stopped)+" "+context.healthExportProgressText(progress)}
            catch(error:Exception){plan=null;output.text=context.workspaceErrorText(error)+if(writing||progress.attempted>progress.confirmed)" "+context.healthExportProgressText(progress) else ""}
            finally{pending=false;onBusy(false);if(!disposed)controls()}
        }
    }
    private fun controls(){val enabled=!pending&&!external&&!disposed;buttons.forEach{it.isEnabled=enabled};metric.isEnabled=enabled;kind.isEnabled=enabled;secondary.isEnabled=enabled;waterSource.isEnabled=enabled;zone.isEnabled=enabled;if(::grantButton.isInitialized)grantButton.isEnabled=enabled&&health()!=null;if(::confirm.isInitialized)confirm.isEnabled=enabled&&health()!=null&&plan?.rows?.isNotEmpty()==true;if(::enableHourly.isInitialized)enableHourly.isEnabled=enabled&&health()!=null&&plan!=null;refreshHourly()}
    fun setExternalBusy(value:Boolean){external=value;controls();if(::corrections.isInitialized)corrections.setExternalBusy(value)}
    fun stopRequests(){job?.cancel();plan=null;controls();if(::corrections.isInitialized)corrections.stopRequests()}
    fun dispose(){disposed=true;job?.cancel();plan=null;if(::corrections.isInitialized)corrections.dispose()}
}
