package local.nourish.healthconnect

import android.app.AlertDialog
import android.content.Context
import android.os.Build
import android.widget.*
import androidx.health.connect.client.HealthConnectClient
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject

/** Explicit review uses the same checked destination and native writer as ordinary exports. */
class IntakeCorrectionPanel(context:Context,private val scope:CoroutineScope,
    private val destination:()->Pair<WorkspaceOrigin,WorkspaceIdentity>?,private val selection:()->JSONObject,
    private val health:()->HealthConnectClient?,private val onBusy:(Boolean)->Unit,
    private val client:WorkspaceClient=WorkspaceClient()):LinearLayout(context) {
    private val details=NativeDetails(context,context.getString(R.string.export_ui_corrections))
    private val sessions=androidIntakeSessions(context);private val choices=LinearLayout(context).apply { orientation=VERTICAL }
    private val dates=linkedMapOf<String,CheckBox>();private var loadedKind:String?=null
    private val applyDrafts=CheckBox(context).apply { text=context.getString(R.string.correction_apply) }
    private val output=TextView(context).apply { setTextIsSelectable(true) };private val buttons=mutableListOf<Button>()
    private var reviewed:ReviewedIntakeCorrection?=null;private var job:Job?=null;private var busy=false;private var external=false;private var disposed=false
    private lateinit var confirm:Button;private lateinit var resume:Button;private lateinit var discard:Button
    private var recovery:ReviewedIntakeRecovery?=null;private var historyBefore:Long?=null
    private lateinit var keepCurrent:Button;private lateinit var olderHistory:Button
    private lateinit var inspect:Button;private lateinit var reviewCurrent:Button
    init {
        orientation=VERTICAL
        addView(details)
        val help=NativeDetails(context,context.getString(R.string.correction_help_title))
        help.body.addView(TextView(context).apply { textSize=16f;text=context.getString(R.string.correction_help) })
        details.body.addView(help)
        button(context.getString(R.string.correction_load)){request {
            val base=selection();require(HealthWriteType.fromWire(base.intakeText("kind")).isIntake){context.getString(R.string.correction_choose_type)}
            val target=destination()?:error(context.getString(R.string.health_export_connection_first));require(client.identity(target.first)==target.second){context.getString(R.string.health_export_account_changed)}
            val result=client.exchange(target.first,"/api/health-connect/export/intake/corrected/options");require(result.get("version")==3&&result.get("nativeReviewRequired")==true)
            val labels=linkedMapOf<String,MutableSet<String>>();val kind=base.intakeText("kind")
            for((key,label) in listOf("policies" to context.getString(R.string.correction_history_active),"drafts" to context.getString(R.string.correction_draft))){
                val array=result.getJSONArray(key);require(array.length()<=MAX_EXPORT_RECORDS)
                for(index in 0 until array.length()){val row=array.getJSONObject(index);if(row.intakeText("kind")==kind){val day=row.intakeText("date");java.time.LocalDate.parse(day);labels.getOrPut(day){linkedSetOf()}.add(if(key=="drafts"&&row.isNull("selection"))context.getString(R.string.correction_draft_discarded) else label)}}
            }
            dates.clear();choices.removeAllViews();loadedKind=kind;reviewed=null;recovery=null
            for((day,label) in labels.toSortedMap()){val check=CheckBox(context).apply { text="$day: ${label.joinToString(", ")}" };dates[day]=check;choices.addView(check)}
            output.text=if(labels.isEmpty())context.getString(R.string.correction_no_dates) else context.getString(R.string.correction_select_dates)
        }}
        details.body.addView(choices);details.body.addView(applyDrafts)
        button(context.getString(R.string.correction_review)){request {
            val target=destination()?:error(context.getString(R.string.health_export_connection_first));val selected=currentSelection()
            val result=coordinator().review(target.first,target.second,selected);reviewed=result;recovery=null
            output.text=context.intakeCorrectionPreviewText(result.preview(),result.origin,result.identity,result.inspection.beforeDescriptions)+"\n\n"+context.getString(R.string.correction_preview_footer)
        }}
        output.textSize=16f;details.body.addView(output)
        confirm=button(context.getString(R.string.correction_confirm)){request {
            val captured=reviewed?:error(context.getString(R.string.correction_review_first));require(currentSelection()==captured.preview().selection){context.getString(R.string.correction_selection_changed)}
            val retirements=captured.preview().retire.size;val count=coordinator().confirm(captured);reviewed=null
            output.text=context.getString(R.string.correction_completed,count,retirements)
        }}
        inspect=button(context.getString(R.string.correction_inspect)){request { showPending() }}
        resume=button(context.getString(R.string.correction_resume)){request {
            val pending=sessions.load()?:error(context.getString(R.string.correction_none));val retirements=pending.preview().retire.size
            val count=coordinator().resume();reviewed=null;recovery=null;output.text=context.getString(R.string.correction_recovered,count,retirements)
        }}
        discard=button(context.getString(R.string.correction_forget)){
            AlertDialog.Builder(context).setTitle(context.getString(R.string.correction_forget_title))
                .setMessage(context.getString(R.string.correction_forget_help))
                .setNegativeButton(context.getString(R.string.correction_keep),null).setPositiveButton(context.getString(R.string.correction_forget_action)){_,_->request { coordinator().discardUnwritten();reviewed=null;recovery=null;output.text=context.getString(R.string.correction_forgotten) }}.show()
        }
        reviewCurrent=button(context.getString(R.string.correction_review_current)){request {
            val result=coordinator().reviewCurrentPhoneState();reviewed=null;recovery=result
            output.text=context.intakeCorrectionRecoveryText(result.session,result.inspection.beforeDescriptions)+"\n\n"+context.getString(R.string.correction_current_footer)
        }}
        keepCurrent=button(context.getString(R.string.correction_keep_current)){
            val captured=recovery?:return@button
            AlertDialog.Builder(context).setTitle(context.getString(R.string.correction_keep_title))
                .setMessage(context.getString(R.string.correction_keep_help))
                .setNegativeButton(context.getString(R.string.correction_cancel),null).setPositiveButton(context.getString(R.string.correction_keep_action)){_,_->request {
                    coordinator().keepCurrentPhoneState(captured);reviewed=null;recovery=null
                    output.text=context.getString(R.string.correction_kept)
                }}.show()
        }
        button(context.getString(R.string.correction_history)){request { showHistory(null) }}
        olderHistory=button(context.getString(R.string.correction_older)){request { showHistory(historyBefore) }}
        runCatching { if(sessions.load()!=null)showPending() }.onFailure { output.text=context.getString(R.string.correction_read_failed,context.workspaceErrorText(it)) };controls()
    }
    private fun button(label:String,action:()->Unit)=Button(context).apply { text=label;setOnClickListener { action() };textSize=16f;isAllCaps=false;buttons.add(this);details.body.addView(this) }
    private fun currentSelection():CorrectedIntakeSelection {
        val base=selection();require(HealthWriteType.fromWire(base.intakeText("kind")).isIntake){context.getString(R.string.correction_choose_type)}
        require(loadedKind==base.intakeText("kind")){context.getString(R.string.correction_load_first)}
        base.put("correctionDates",JSONArray(dates.filterValues { it.isChecked }.keys.sorted())).put("useDrafts",applyDrafts.isChecked)
        return parseCorrectedIntakeSelection(base)
    }
    private fun coordinator():IntakeCorrectionCoordinator {
        if(Build.VERSION.SDK_INT<34)error(context.getString(R.string.correction_android))
        val native=health()?:error(context.getString(R.string.health_export_unavailable))
        return IntakeCorrectionCoordinator(WorkspaceIntakeCorrections(client),AndroidIntakeReconciliationSink(context,native),sessions,NativeHealthWrites.sequence(context),
            access={origin,identity->require(destination()==(origin to identity)){context.getString(R.string.correction_destination)}},
            invalidateHourly={HourlyExportSettings(context).invalidate(it)})
    }
    private fun showPending(){
        val pending=sessions.load();reviewed=null;recovery=null
        output.text=if(pending==null)context.getString(R.string.correction_none) else context.getString(R.string.correction_pending,context.getString(if(pending.activated)R.string.correction_activated else R.string.correction_activation_pending),pending.operation.attemptedUpserts.size,pending.operation.attemptedRetirements.size)+"\n\n"+context.intakeCorrectionPreviewText(pending.preview(),pending.origin,pending.identity,pending.beforeDescriptions)+"\n"+context.getString(R.string.correction_resume_help)
    }
    private fun showHistory(before:Long?){
        reviewed=null;recovery=null
        val entries=sessions.history(before,11);val page=entries.take(10);historyBefore=if(entries.size>10)page.last().sequence else null
        if(page.isEmpty()){output.text=context.getString(R.string.correction_no_history);return}
        AlertDialog.Builder(context).setTitle(context.getString(R.string.correction_history_title))
            .setItems(page.map { "${it.resolvedAt}: ${context.getString(it.type.displayLabelResource)}" }.toTypedArray()){_,index->request {
                val archived=sessions.resolution(page[index].operationId)?:error(context.getString(R.string.correction_history_unavailable))
                output.text=context.getString(R.string.correction_history_header,archived.resolvedAt.toString())+"\n\n"+context.intakeCorrectionRecoveryText(archived.session,archived.descriptions)
            }}.setNegativeButton(context.getString(R.string.correction_close),null).show()
    }
    private fun request(work:suspend()->Unit){
        if(busy||external||disposed)return;busy=true;onBusy(true);controls()
        job=scope.launch {
            try { work() }catch(_:CancellationException){reviewed=null;recovery=null;if(!disposed)output.text=context.getString(R.string.correction_stopped)}
            catch(error:Exception){
                reviewed=null;recovery=null
                if(!disposed){
                    val saved=runCatching { sessions.load() }
                    output.text=context.workspaceErrorText(error)+if(saved.isFailure||saved.getOrNull()!=null)"\n"+context.getString(R.string.correction_retry) else ""
                }
            }
            finally { busy=false;onBusy(false);if(!disposed)controls() }
        }
    }
    private fun controls(){
        val enabled=!busy&&!external&&!disposed;buttons.forEach { it.isEnabled=enabled };dates.values.forEach { it.isEnabled=enabled };applyDrafts.isEnabled=enabled
        val result=runCatching { sessions.load() };val pending=result.getOrNull()
        if(result.isFailure||pending!=null)details.setExpanded(true)
        if(::confirm.isInitialized)confirm.isEnabled=enabled&&result.isSuccess&&pending==null&&reviewed!=null
        if(::resume.isInitialized)resume.isEnabled=enabled&&pending!=null
        if(::discard.isInitialized)discard.isEnabled=enabled&&pending!=null&&pending.operation.attemptedUpserts.isEmpty()&&pending.operation.attemptedRetirements.isEmpty()
        if(::keepCurrent.isInitialized)keepCurrent.isEnabled=enabled&&pending!=null&&pending==recovery?.session
        if(::olderHistory.isInitialized)olderHistory.isEnabled=enabled&&historyBefore!=null
        if(::confirm.isInitialized)confirm.visibility=if(reviewed!=null)VISIBLE else GONE
        if(::inspect.isInitialized)inspect.visibility=if(result.isFailure||pending!=null)VISIBLE else GONE
        if(::resume.isInitialized)resume.visibility=if(pending!=null)VISIBLE else GONE
        if(::discard.isInitialized)discard.visibility=if(pending!=null)VISIBLE else GONE
        if(::reviewCurrent.isInitialized)reviewCurrent.visibility=if(pending!=null)VISIBLE else GONE
        if(::keepCurrent.isInitialized)keepCurrent.visibility=if(recovery!=null)VISIBLE else GONE
        if(::olderHistory.isInitialized)olderHistory.visibility=if(historyBefore!=null)VISIBLE else GONE
    }
    fun setExternalBusy(value:Boolean){external=value;controls()}
    fun stopRequests(){job?.cancel();reviewed=null;recovery=null;controls()}
    fun dispose(){disposed=true;job?.cancel();reviewed=null;recovery=null}
}
