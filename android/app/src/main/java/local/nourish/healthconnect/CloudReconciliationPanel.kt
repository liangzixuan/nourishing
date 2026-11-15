package local.nourish.healthconnect

import android.content.Context
import android.widget.*
import androidx.health.connect.client.HealthConnectClient
import java.io.File
import kotlinx.coroutines.*

/** Foreground review only. Native records and background consent are never changed here. */
class CloudReconciliationPanel(context:Context,private val scope:CoroutineScope,
    private val selection:()->Pair<Set<ExportType>,ExportRange>,private val healthClient:()->HealthConnectClient?,
    private val saveFile:suspend(File)->Unit,private val onBusy:(Boolean)->Unit):LinearLayout(context) {
    private val directory=File(context.filesDir,"cloud-health-reconciliation")
    private val transfer=CloudReconciliationTransfer(CloudWebSessions.get(requireNotNull(NourishingWorkspace.cloudOrigin)))
    private val controls=mutableListOf<Button>()
    private val output=TextView(context).apply{textSize=16f;setTextIsSelectable(true);setPadding(0,12,0,8)}
    private val consent=CheckBox(context).apply{text="Apply the listed removals to Nourishing";visibility=GONE}
    private val baselineConsent=CheckBox(context).apply{text="Start a new baseline; keep existing cloud data";visibility=GONE}
    private lateinit var confirm:Button
    private lateinit var reset:Button
    private var connection:CloudReconciliationAccount?=null
    private var store:ReconciliationStore?=null
    private var review:ReconciliationReview?=null
    private var request:Job?=null
    private var pending=false;private var external=false;private var disposed=false;private var conflicted=false
    init {
        orientation=VERTICAL
        addView(TextView(context).apply{text="Sync changes and deletions";textSize=22f;setPadding(0,16,0,8)})
        button("Check account"){
            val checked=withContext(Dispatchers.IO){transfer.connect()}
            val outbox=withContext(Dispatchers.IO){ReconciliationGate.shared.withCloud(checked.owner){openCloudReconciliation(directory,checked.owner)}}
            connection=checked;store=outbox;clearReview();conflicted=false
            val staged=withContext(Dispatchers.IO){ReconciliationGate.shared.withCloud(checked.owner){outbox.pending()!=null}}
            output.text="${checked.lease.account.email?:checked.owner.accountId}\n"+if(staged)"Pending batch. Preview to check its receipt." else "Ready to read changes."
        }
        button("Read changes"){
            val target=target();val outbox=requireNotNull(store);val selected=selection();val native=healthClient()?:error("Health Connect is unavailable.")
            clearReview()
            withContext(Dispatchers.IO){ReconciliationGate.shared.withCloud(target.owner){
                transfer.guard(target)
                captureReconciliation(native,selected.second,selected.first,outbox,beforeStage={transfer.guard(target)})
            }}
            output.text="Changes saved on this phone. Preview to continue."
        }
        button("Preview changes"){
            val target=target();clearReview();val result=coordinator(target).preview()
            if(result.receipt!=null){output.text="Already applied. Receipt verified."}
            else {
                val viewed=requireNotNull(result.review);review=viewed;consent.visibility=if(viewed.counts.removals)VISIBLE else GONE
                conflicted=false;baselineConsent.isChecked=false
                output.text=listOf(context.reconciliationCountsText(viewed.counts),viewed.warnings.joinToString("\n")).filter{it.isNotEmpty()}.joinToString("\n\n")
            }
        }
        addView(output);addView(consent)
        confirm=button("Apply changes"){
            val target=target();val viewed=requireNotNull(review){"Preview the changes first."}
            val receipt=coordinator(target).apply(viewed,consent.isChecked)
            clearReview();output.text="Applied and verified.\n"+context.reconciliationCountsText(reconciliationCounts(receipt.getJSONObject("counts")))
        }
        button("Save pending batch"){
            val target=target();val outbox=requireNotNull(store)
            val file=withContext(Dispatchers.IO){ReconciliationGate.shared.withCloud(target.owner){transfer.guard(target);outbox.file(cloudReconciliationDirectory(directory,target.owner))}}
            saveFile(file)
        }
        addView(baselineConsent)
        reset=button("Start new baseline"){
            val target=target();require(conflicted&&baselineConsent.isChecked){"Confirm the new baseline first."}
            withContext(Dispatchers.IO){ReconciliationGate.shared.withCloud(target.owner){
                transfer.guard(target);val outbox=requireNotNull(store);val staged=requireNotNull(outbox.pending())
                var stillConflicted=false
                try{transfer.receipt(target,staged)}catch(_:CloudReconciliationConflict){stillConflicted=true}
                require(stillConflicted){"The receipt is available or the conflict changed. Preview again."}
                outbox.resetAfterConfirmedConflict()
            }}
            clearReview();conflicted=false;baselineConsent.isChecked=false;output.text="Ready to read a new baseline."
        }
        consent.setOnCheckedChangeListener{_,_->update()};baselineConsent.setOnCheckedChangeListener{_,_->update()};update()
    }
    private fun target()=requireNotNull(connection){"Check your account first."}
    private fun coordinator(target:CloudReconciliationAccount)=CloudReconciliationCoordinator(transfer,target,requireNotNull(store)){types->
        val native=healthClient()?:error("Health Connect is unavailable.")
        require(readPermissions(types).all(native.permissionController.getGrantedPermissions()::contains)){"Grant the selected read permissions first."}
    }
    private fun clearReview(){review=null;consent.isChecked=false;consent.visibility=GONE}
    private fun button(label:String,work:suspend()->Unit)=Button(context).apply{text=label;textSize=16f;isAllCaps=false;controls.add(this);addView(this);setOnClickListener{run(work)}}
    private fun run(work:suspend()->Unit){
        if(pending||external||disposed)return
        pending=true;onBusy(true);update()
        request=scope.launch {
            try{work()}catch(_:CancellationException){clearReview();output.text="Stopped. The pending batch stays on this phone."}
            catch(error:Exception){clearReview();if(error is CloudReconciliationConflict)conflicted=true
                output.text=when(error){is CloudSessionChanged->"Sign in again, then check the account. The pending batch stays on this phone.";is CloudApiFailure->"Cloud request failed (${error.status}). Preview again to check the receipt.";else->error.message?:"Could not sync changes."}}
            finally{pending=false;onBusy(false);update()}
        }
    }
    private fun update(){
        val enabled=!pending&&!external&&!disposed;controls.forEach{it.isEnabled=enabled};consent.isEnabled=enabled;baselineConsent.isEnabled=enabled
        baselineConsent.visibility=if(conflicted)VISIBLE else GONE
        if(::confirm.isInitialized)confirm.isEnabled=enabled&&review!=null&&(review?.counts?.removals!=true||consent.isChecked)
        if(::reset.isInitialized){reset.visibility=if(conflicted)VISIBLE else GONE;reset.isEnabled=enabled&&conflicted&&baselineConsent.isChecked}
    }
    fun setExternalBusy(value:Boolean){external=value;update()}
    fun stopRequests(){request?.cancel();connection=null;store=null;clearReview();output.text="";conflicted=false;baselineConsent.isChecked=false;update()}
    fun dispose(){disposed=true;stopRequests()}
}
