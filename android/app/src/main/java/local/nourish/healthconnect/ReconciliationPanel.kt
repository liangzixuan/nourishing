package local.nourish.healthconnect

import android.content.Context
import android.text.InputType
import android.text.Editable
import android.text.TextWatcher
import android.widget.*
import androidx.health.connect.client.HealthConnectClient
import kotlinx.coroutines.*
import java.io.File
import org.json.JSONObject

/** Foreground-only destructive reconciliation. Its durable outbox is separate
 * from disposable snapshots and from the existing hourly snapshot worker. */
class ReconciliationPanel(context:Context,private val scope:CoroutineScope,
    private val selection:()->Pair<Set<ExportType>,ExportRange>,private val healthClient:()->HealthConnectClient?,
    private val saveFile:suspend(File)->Unit,private val onBusy:(Boolean)->Unit):LinearLayout(context) {
    private val directory=File(context.filesDir,"health-reconciliation")
    private val address:EditText
    private val output:TextView
    private val consent:CheckBox
    private val baselineConsent:CheckBox
    private val buttons=mutableListOf<Button>()
    private var connection:Pair<WorkspaceOrigin,WorkspaceIdentity>?=null
    private var store:ReconciliationStore?=null
    private var review:ReconciliationReview?=null
    private var request:Job?=null
    private var pending=false;private var externalBusy=false;private var disposed=false
    private var conflicted=false
    private val client=WorkspaceClient(beforeHealthUpload={guard()})
    private val transfer=ReconciliationTransfer(client)
    init {
        orientation=VERTICAL
        fun text(value:String)=TextView(context).apply{text=value;setPadding(0,12,0,8);addView(this)}
        fun button(label:String,owned:Boolean=true,work:suspend()->Unit)=Button(context).apply{text=label;setOnClickListener{run(owned,work)};buttons.add(this);addView(this)}
        text(context.getString(R.string.recon_title))
        text(context.getString(R.string.recon_intro))
        address=EditText(context).apply{hint="https://your-pc.your-tailnet.ts.net:8443";setSingleLine();inputType=InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI;setText(SyncSettings(context).origin);addView(this)}
        output=text(context.getString(R.string.recon_initial))
        consent=CheckBox(context).apply{text=context.getString(R.string.recon_consent);isChecked=false;addView(this)}
        baselineConsent=CheckBox(context).apply{text=context.getString(R.string.recon_baseline_consent);isChecked=false;addView(this)}
        button(context.getString(R.string.recon_check),owned=false) {
            val origin=WorkspaceOrigin.parse(address.text.toString());val identity=client.identity(origin)
            connection=origin to identity;store=ReconciliationStore.open(directory,origin,identity);review=null;consent.isChecked=false;baselineConsent.isChecked=false;conflicted=false
            val hasPending=ReconciliationGate.shared.withWorkspace(origin,identity){store!!.pending()!=null}
            output.text=context.getString(R.string.recon_destination,origin.value,identity.login,context.getString(if(hasPending)R.string.recon_has_pending else R.string.recon_no_pending))
        }
        button(context.getString(R.string.recon_read)) {
            destination();val selected=selection();val health=healthClient()?:error(context.getString(R.string.unavailable));val outbox=requireNotNull(store)
            withContext(Dispatchers.IO){captureReconciliation(health,selected.second,selected.first,outbox)}
            review=null;consent.isChecked=false;output.text=context.getString(R.string.recon_staged)
        }
        button(context.getString(R.string.recon_preview)) { previewPending() }
        button(context.getString(R.string.recon_confirm)) {
            val (origin,identity)=destination();guard();val outbox=requireNotNull(store);val batch=requireNotNull(outbox.pending()){ context.getString(WorkspaceError.RECON_PENDING_REQUIRED.displayResource) };val viewed=requireNotNull(review){context.getString(R.string.recon_preview_again)}
            require(!viewed.counts.removals||consent.isChecked){context.getString(WorkspaceError.RECON_REMOVAL_APPROVAL.displayResource)}
            val receipt=checkReceipt(origin,identity,batch)?:transfer.apply(origin,identity,batch,viewed,consent.isChecked)
            outbox.acknowledge(receipt);review=null;consent.isChecked=false;output.text=context.getString(R.string.recon_acknowledged,context.reconciliationCountsText(reconciliationCounts(receipt.getJSONObject("counts"))))
        }
        button(context.getString(R.string.recon_save)) {
            destination();val file=withContext(Dispatchers.IO){requireNotNull(store).file(directory)};saveFile(file)
            output.text=context.getString(R.string.recon_save_help)
        }
        button(context.getString(R.string.recon_reset)) {
            destination();require(conflicted&&baselineConsent.isChecked){context.getString(R.string.recon_conflict_required)}
            requireNotNull(store).resetAfterConfirmedConflict();review=null;consent.isChecked=false;baselineConsent.isChecked=false;conflicted=false
            output.text=context.getString(R.string.recon_reset_ready)
        }
        address.addTextChangedListener(object:TextWatcher{override fun beforeTextChanged(s:CharSequence?,start:Int,count:Int,after:Int){};override fun onTextChanged(s:CharSequence?,start:Int,before:Int,count:Int){connection=null;store=null;review=null;consent.isChecked=false;baselineConsent.isChecked=false;conflicted=false};override fun afterTextChanged(s:Editable?){} })
    }
    private fun destination():Pair<WorkspaceOrigin,WorkspaceIdentity>{val current=requireNotNull(connection){context.getString(R.string.recon_check_first)};require(WorkspaceOrigin.parse(address.text.toString())==current.first){context.getString(R.string.recon_changed)};return current}
    private suspend fun guard(){destination();val types=requireNotNull(store).pending()?.types?:error(context.getString(WorkspaceError.RECON_PENDING_REQUIRED.displayResource));val health=healthClient()?:error(context.getString(R.string.unavailable));require(readPermissions(types).all(health.permissionController.getGrantedPermissions()::contains)){context.getString(R.string.recon_permission_revoked)};destination()}
    private suspend fun previewPending(){
        val (origin,identity)=destination();guard();val outbox=requireNotNull(store);val batch=requireNotNull(outbox.pending());review=null;consent.isChecked=false
        if(batch.digest!=null){val receipt=checkReceipt(origin,identity,batch);if(receipt!=null){outbox.acknowledge(receipt);output.text=context.getString(R.string.recon_already_applied);return}}
        val viewed=transfer.preview(origin,identity,batch,withContext(Dispatchers.IO){outbox.file(directory)})
        outbox.bindDigest(viewed.digest)
        if(viewed.receipt!=null){outbox.acknowledge(viewed.receipt);output.text=context.getString(R.string.recon_replay_receipt);return}
        review=viewed;conflicted=false;baselineConsent.isChecked=false;output.text=context.reconciliationReviewText(origin,identity,batch,viewed)
    }
    private suspend fun checkReceipt(origin:WorkspaceOrigin,identity:WorkspaceIdentity,batch:ReconciliationPending):JSONObject?=try{transfer.receipt(origin,identity,batch)}catch(error:WorkspaceTransferFailure){if(error.httpStatus==409)conflicted=true;throw error}
    private fun run(owned:Boolean,work:suspend()->Unit){if(pending||externalBusy||disposed)return;pending=true;onBusy(true);update()
        request=scope.launch{try{if(owned){val target=destination();ReconciliationGate.shared.withWorkspace(target.first,target.second){work()}}else work()}catch(_:CancellationException){review=null;consent.isChecked=false;output.text=context.getString(R.string.recon_cancelled)}catch(error:Exception){review=null;consent.isChecked=false;output.text=context.getString(R.string.recon_failure,context.workspaceErrorText(error))}finally{pending=false;onBusy(false);update()}}
    }
    private fun update(){val enabled=!pending&&!externalBusy&&!disposed;address.isEnabled=enabled;consent.isEnabled=enabled;baselineConsent.isEnabled=enabled;buttons.forEach{it.isEnabled=enabled}}
    fun setExternalBusy(value:Boolean){externalBusy=value;update()}
    fun stopRequests(){request?.cancel()}
    fun dispose(){disposed=true;request?.cancel();update()}
}
