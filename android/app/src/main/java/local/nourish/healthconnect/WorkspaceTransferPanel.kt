package local.nourish.healthconnect

import android.content.Context
import android.text.InputType
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.CheckBox
import androidx.core.widget.addTextChangedListener
import androidx.health.connect.client.HealthConnectClient
import java.io.File
import java.time.temporal.ChronoUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Owns foreground request cancellation, reviewed bytes and destination consent. */
class WorkspaceTransferPanel(
    context: Context,
    private val scope: CoroutineScope,
    private val stagedFile: () -> File?,
    private val selection: () -> Pair<Set<ExportType>, ExportRange>,
    private val healthClient: () -> HealthConnectClient?,
    private val requestBackgroundPermission: () -> Unit,
    private val onBusy: (Boolean) -> Unit
) : LinearLayout(context) {
    private val settings = SyncSettings(context)
    private val cloudSettings=CloudBackgroundSettings(context)
    private val client = WorkspaceClient()
    private val cloudOrigin=NourishingWorkspace.cloudOrigin
    private val cloudSession=cloudOrigin?.let{CloudWebSessions.get(it)}
    private val cloudTransfer=cloudSession?.let{CloudHealthTransfer(it)}
    private var cloudLease:CloudAccountLease?=null
    private var cloudReview:CloudHealthReview?=null
    private val address: EditText
    private val output: TextView
    private val backgroundStatus: TextView
    private val checkConnection: Button
    private val preview: Button
    private val importButton: Button
    private val grantBackground: Button
    private val enableBackground: Button
    private val stopBackground: Button
    private val reconciliationMode:CheckBox
    private val automaticRemovals:CheckBox
    private var connection: Pair<WorkspaceOrigin, WorkspaceIdentity>? = null
    private var review: TransferReview? = null
    private var request: Job? = null
    private var pending = false
    private var externalBusy = false
    private var disposed = false

    init {
        orientation = VERTICAL
        fun text(value: String, size: Float = 16f): TextView = TextView(context).apply {
            text = value; textSize = size; setPadding(0, 12, 0, 12); addView(this)
        }
        fun button(value: String, action: () -> Unit): Button = Button(context).apply {
            text = value; setOnClickListener { action() }; addView(this)
        }
        text(if(cloudOrigin!=null)"Import to Nourishing" else context.getString(R.string.transfer_title), 22f)
        if(cloudOrigin==null)text(context.getString(R.string.transfer_intro))
        address = EditText(context).apply {
            hint = "https://your-pc.your-tailnet.ts.net:8443"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            setSingleLine(); setText(cloudOrigin?.value?:settings.origin);visibility=if(cloudOrigin==null)View.VISIBLE else View.GONE;addView(this)
        }
        output = text(if(cloudOrigin!=null)"Not connected" else context.getString(R.string.transfer_initial))
        checkConnection = button(if(cloudOrigin!=null)"Check account" else context.getString(R.string.transfer_check)) { runRequest {
            if(cloudSession!=null){
                val lease=withContext(Dispatchers.IO){cloudSession.connect()};cloudLease=lease;cloudReview=null
                connection=WorkspaceOrigin.parse(lease.origin.value) to WorkspaceIdentity(lease.account.id)
                output.text=lease.account.email?:lease.account.id
                return@runRequest
            }
            val origin = WorkspaceOrigin.parse(address.text.toString())
            val identity = client.identity(origin)
            settings.saveOrigin(origin);connection = origin to identity;review = null
            output.text = context.getString(R.string.transfer_checked, origin.value, identity.login)
        } }
        preview = button(context.getString(R.string.transfer_preview)) { runRequest {
            if(cloudTransfer!=null){
                val lease=cloudLease?:throw CloudSessionChanged();val file=stagedFile()?:error(context.getString(R.string.transfer_read_first))
                val prepared=withContext(Dispatchers.IO){cloudTransfer.preview(lease,file)};cloudReview=prepared
                output.text=context.getString(R.string.transfer_review,lease.origin.value,lease.account.email?:lease.account.id,prepared.from,prepared.to,prepared.zone,context.importCountsText(prepared.counts),prepared.warnings.joinToString("\n"))
                return@runRequest
            }
            val destination = connection ?: error(context.getString(R.string.transfer_check_first))
            val file = stagedFile() ?: error(context.getString(R.string.transfer_read_first))
            review = withContext(Dispatchers.IO) { client.preview(destination.first, file, destination.second) }
            val prepared = review!!
            output.text = context.getString(R.string.transfer_review, prepared.origin.value, prepared.identity.login, prepared.from, prepared.to, prepared.zone, context.importCountsText(prepared.counts), prepared.warnings.joinToString("\n"))
        } }
        importButton = button(context.getString(R.string.transfer_confirm)) { runRequest(importing = true) {
            if(cloudTransfer!=null){
                val prepared=cloudReview?:error(context.getString(R.string.transfer_preview_again))
                val counts=withContext(Dispatchers.IO){cloudTransfer.import(prepared)};cloudReview=null
                output.text=context.getString(R.string.transfer_completed,context.importCountsText(counts));return@runRequest
            }
            val prepared = review ?: error(context.getString(R.string.transfer_preview_again))
            require(WorkspaceOrigin.parse(address.text.toString()) == prepared.origin) { context.getString(R.string.transfer_address_changed) }
            val counts = withContext(Dispatchers.IO) { client.import(prepared) }
            settings.confirm(prepared.origin, prepared.identity);review = null
            output.text = context.getString(R.string.transfer_completed, context.importCountsText(counts))
        } }
        val backgroundStart=childCount
        text(context.getString(R.string.sync_title), 22f)
        text(context.getString(R.string.sync_intro))
        reconciliationMode=CheckBox(context).apply{text=context.getString(R.string.sync_reconciliation);isChecked=false;addView(this)}
        automaticRemovals=CheckBox(context).apply{text=context.getString(R.string.sync_removals);isChecked=false;isEnabled=false;addView(this)}
        reconciliationMode.setOnCheckedChangeListener{_,checked->if(!checked)automaticRemovals.isChecked=false;selectionChanged();updateEnabled()}
        automaticRemovals.setOnCheckedChangeListener{_,_->selectionChanged()}
        backgroundStatus = text(backgroundText())
        grantBackground = button(context.getString(R.string.sync_grant)) {
            val health = healthClient()
            if (health == null || !backgroundReadAvailable(health)) output.text = context.getString(R.string.sync_foreground_available)
            else requestBackgroundPermission()
        }
        enableBackground = button(context.getString(R.string.sync_enable)) { runRequest {
            val health = healthClient() ?: error(context.getString(R.string.unavailable))
            require(backgroundReadAvailable(health)) { context.getString(R.string.sync_background_version) }
            require(BACKGROUND_READ_PERMISSION in health.permissionController.getGrantedPermissions()) { context.getString(R.string.sync_grant_first) }
            val selected = selection()
            require(selected.first.isNotEmpty()) { context.getString(R.string.select_type) }
            val days = (ChronoUnit.DAYS.between(selected.second.from, selected.second.to) + 1).toInt()
            if(cloudSession!=null){
                val lease=cloudLease?:throw CloudSessionChanged()
                require(readPermissions(selected.first).all(health.permissionController.getGrantedPermissions()::contains)){"Grant the selected Health Connect permissions first."}
                if(!cloudSession.publish(lease){cloudSettings.enable(lease,selected.first,days)})throw CloudSessionChanged()
                scheduleCloudHealthSync(context);backgroundStatus.text=backgroundText();return@runRequest
            }
            val destination = connection ?: error(context.getString(R.string.transfer_check_first))
            checkSync(settings.isConfirmed(destination.first, destination.second),SyncError.CONFIRM_FIRST)
            val currentIdentity = client.identity(destination.first)
            require(currentIdentity == destination.second) { context.getString(WorkspaceError.ACCOUNT_PREVIEW.displayResource) }
            settings.enable(destination.first,destination.second,selected.first,days,
                if(reconciliationMode.isChecked)BackgroundSyncMode.RECONCILIATION else BackgroundSyncMode.SNAPSHOT,automaticRemovals.isChecked)
            scheduleHealthSync(context)
            backgroundStatus.text = backgroundText()
        } }
        stopBackground = button(context.getString(R.string.sync_stop)) {
            if(cloudOrigin!=null){cloudSettings.disable();stopCloudHealthSync(context)}else{settings.disable();stopHealthSync(context)};backgroundStatus.text = backgroundText();updateEnabled()
        }
        if(cloudOrigin!=null){
            (getChildAt(backgroundStart) as TextView).text="Hourly import"
            (getChildAt(backgroundStart+1) as TextView).text="Import selected data to this signed-in account each hour."
            reconciliationMode.visibility=View.GONE;automaticRemovals.visibility=View.GONE
            enableBackground.text="Enable hourly import";stopBackground.text="Stop hourly import"
        }
        address.addTextChangedListener {
            if (!disposed && !pending) {
                connection = null;review = null
                if (settings.background() != null) { settings.disable(SyncNotice.DESTINATION_EDITED);stopHealthSync(context) }
                backgroundStatus.text = backgroundText();output.text = context.getString(R.string.transfer_address_edited);updateEnabled()
            }
        }
        updateEnabled()
    }
    private fun runRequest(importing: Boolean = false, work: suspend () -> Unit) {
        if (pending || externalBusy || disposed) return
        pending = true;onBusy(true);updateEnabled()
        request = scope.launch {
            try { work() }
            catch (_: CancellationException) {
                review = null
                output.text = if (importing) context.getString(R.string.transfer_cancel_import) else context.getString(R.string.transfer_cancel_request)
            }
            catch (error: Exception) {
                if (importing || error is WorkspaceTransferFailure) review = null
                output.text = if(cloudOrigin!=null)when(error){
                    is CloudSessionChanged->"Sign in to Nourishing, then check the connection."
                    is CloudApiFailure->if(error.status==409)"The diary changed. Preview again." else "Could not import (${error.status})."
                    else->error.message?:"Could not connect."
                }else context.workspaceErrorText(error)
            }
            finally { pending = false;onBusy(false);if (!disposed) updateEnabled() }
        }
    }
    fun checkedConnection():Pair<WorkspaceOrigin,WorkspaceIdentity>? = if(cloudOrigin==null)connection else null
    fun stagedChanged() { review = null;cloudReview=null;updateEnabled() }
    fun selectionChanged(){if(cloudOrigin!=null&&cloudSettings.config()!=null){cloudSettings.disable("Selection changed; enable hourly import again");stopCloudHealthSync(context);backgroundStatus.text=backgroundText()}else if(settings.background()!=null){settings.disable(SyncNotice.SELECTION_EDITED);stopHealthSync(context);backgroundStatus.text=backgroundText()}}
    fun setExternalBusy(value: Boolean) { externalBusy = value;updateEnabled() }
    private fun backgroundText(): String = if(cloudOrigin!=null)cloudSettings.status else context.syncConfigurationText(settings.status,settings.background())
    fun refresh() { if (!disposed) { if(cloudLease?.let{cloudSession?.isCurrent(it)}==false){cloudLease=null;cloudReview=null;connection=null};backgroundStatus.text = backgroundText();updateEnabled() } }
    fun stopRequests() { request?.cancel() }
    fun dispose() { disposed = true;request?.cancel();updateEnabled() }
    private fun updateEnabled() {
        val available = !pending && !externalBusy && !disposed
        address.isEnabled = available;checkConnection.isEnabled = available
        reconciliationMode.isEnabled=available;automaticRemovals.isEnabled=available&&reconciliationMode.isChecked
        preview.isEnabled = available && connection != null && stagedFile()?.isFile == true
        importButton.isEnabled = available && (review != null||cloudReview!=null)
        grantBackground.isEnabled = available && healthClient() != null
        enableBackground.isEnabled = available && (if(cloudSession!=null)cloudLease?.let(cloudSession::isCurrent)==true else connection?.let { settings.isConfirmed(it.first, it.second) } == true) && healthClient() != null
        stopBackground.isEnabled = (if(cloudOrigin!=null)cloudSettings.config()!=null else settings.background() != null) && !disposed
    }
}
