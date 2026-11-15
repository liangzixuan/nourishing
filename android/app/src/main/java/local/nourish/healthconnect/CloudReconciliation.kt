package local.nourish.healthconnect

import java.io.File
import java.io.IOException
import java.security.MessageDigest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/** The original cursor/outbox document is retained inside an explicit cloud owner envelope. */
class CloudReconciliationDocument(private val delegate:ReconciliationDocument,private val owner:CloudExportOwner):ReconciliationDocument {
    private fun ownerJson()=JSONObject().put("origin",owner.origin.value).put("accountId",owner.accountId).put("namespace",owner.namespace)
    override fun read():String?=delegate.read()?.let {
        val json=JSONObject(it);strictKeys(json,setOf("format","version","owner","state"))
        require(json.getString("format")=="nourishing-cloud-reconciliation"&&json.get("version")==1)
        val saved=json.getJSONObject("owner");strictKeys(saved,setOf("origin","accountId","namespace"))
        require(CloudExportOwner(CloudOrigin.parse(saved.getString("origin")),saved.getString("accountId"),saved.getString("namespace"))==owner){"This reconciliation belongs to another account or workspace."}
        json.getJSONObject("state").toString()
    }
    override fun write(value:String){read();delegate.write(JSONObject().put("format","nourishing-cloud-reconciliation").put("version",1).put("owner",ownerJson()).put("state",JSONObject(value)).toString())}
}
fun cloudReconciliationDirectory(directory:File,owner:CloudExportOwner):File {
    val key=MessageDigest.getInstance("SHA-256").digest("${owner.origin.value}\n${owner.accountId}\n${owner.namespace}".toByteArray()).joinToString(""){"%02x".format(it)}
    val scoped=File(directory,key);check(scoped.isDirectory||scoped.mkdirs()){"Could not open reconciliation storage."}
    return scoped
}
fun openCloudReconciliation(directory:File,owner:CloudExportOwner):ReconciliationStore {
    val scoped=cloudReconciliationDirectory(directory,owner)
    return ReconciliationStore(CloudReconciliationDocument(AtomicReconciliationDocument(File(scoped,"outbox.json")),owner),scoped)
}
data class CloudReconciliationAccount(val lease:CloudAccountLease,val owner:CloudExportOwner)
data class CloudReconciliationResult(val review:ReconciliationReview?=null,val receipt:JSONObject?=null)
class CloudReconciliationUncertain:IOException("The result is not confirmed. Preview the pending batch to check its receipt.")
class CloudReconciliationConflict:IllegalStateException("The receiver no longer accepts this stream. Review a new baseline before continuing.")

class CloudReconciliationTransfer(private val session:CloudAccountSession) {
    fun connect():CloudReconciliationAccount {
        val lease=session.acquire();return CloudReconciliationAccount(lease,CloudHealthExport(session).options(lease).first)
    }
    fun guard(connection:CloudReconciliationAccount){
        require(connection.owner.origin==session.origin&&connection.lease.account.id==connection.owner.accountId)
        require(CloudHealthExport(session).options(connection.lease).first==connection.owner){"The account or workspace changed."}
    }
    fun publish(connection:CloudReconciliationAccount,work:()->Unit){if(!session.publish(connection.lease,work))throw CloudSessionChanged()}
    fun receipt(connection:CloudReconciliationAccount,pending:ReconciliationPending):JSONObject? {
        guard(connection);val digest=requireNotNull(pending.digest){"Preview the batch first."};val batch=pending.batch
        val path="/api/health-connect/reconcile/receipt?streamId=${batch.getString("streamId")}&sequence=${batch.getLong("sequence")}&batchId=${batch.getString("batchId")}&batchDigest=$digest"
        require(validReceiptPath(path));val reply=try{session.request(connection.lease,path)}catch(error:CloudApiFailure){if(error.status==409)throw CloudReconciliationConflict();throw error}
        val json=JSONObject(reply.body);strictKeys(json,setOf("receipt"))
        return if(json.isNull("receipt"))null else json.getJSONObject("receipt").also{validateReconciliationReceipt(it,batch,digest)}
    }
    suspend fun preview(connection:CloudReconciliationAccount,pending:ReconciliationPending,beforeUpload:suspend()->Unit={}):ReconciliationReview {
        guard(connection)
        beforeUpload()
        return parseReconciliationReview(JSONObject(session.request(connection.lease,"/api/health-connect/reconcile/preview?summary=1",pending.batch.toString()).body),pending)
    }
    suspend fun apply(connection:CloudReconciliationAccount,pending:ReconciliationPending,review:ReconciliationReview,allowRemovals:Boolean,beforeUpload:suspend()->Unit={}):JSONObject {
        require(review.digest==pending.digest&&(!review.counts.removals||allowRemovals)){"Approve the listed removals first."}
        guard(connection)
        beforeUpload()
        val payload=JSONObject().put("batch",pending.batch).put("reviewToken",review.token).put("confirmed",true).put("allowRemovals",allowRemovals)
        try {
            val json=JSONObject(session.request(connection.lease,"/api/health-connect/reconcile/apply",payload.toString()).body)
            strictKeys(json,setOf("receipt","replayed"));require(json.get("replayed") is Boolean)
            return json.getJSONObject("receipt").also{validateReconciliationReceipt(it,pending.batch,review.digest)}
        }catch(error:CloudApiFailure){if(error.status<500)throw error;throw CloudReconciliationUncertain()}
        catch(error:CancellationException){throw error}
        catch(_:Exception){throw CloudReconciliationUncertain()}
    }
}

/** Only a validated receiver receipt commits source cursors. No snapshot absence implies deletion. */
class CloudReconciliationCoordinator(private val transfer:CloudReconciliationTransfer,private val connection:CloudReconciliationAccount,
    private val store:ReconciliationStore,private val permission:suspend(Set<ExportType>)->Unit) {
    private suspend fun guard(pending:ReconciliationPending){require(pending.authority==PendingAuthority.Foreground){"This batch was not captured for foreground reconciliation."};permission(pending.types);transfer.guard(connection)}
    private fun acknowledge(receipt:JSONObject){transfer.publish(connection){store.acknowledge(receipt)}}
    suspend fun preview():CloudReconciliationResult=withContext(Dispatchers.IO){ReconciliationGate.shared.withCloud(connection.owner){
        val pending=requireNotNull(store.pending()){"Read changes first."};guard(pending)
        if(pending.digest!=null)transfer.receipt(connection,pending)?.let{acknowledge(it);return@withCloud CloudReconciliationResult(receipt=it)}
        val review=transfer.preview(connection,pending){permission(pending.types)}
        transfer.publish(connection){store.bindDigest(review.digest)}
        if(review.receipt!=null){acknowledge(review.receipt);CloudReconciliationResult(receipt=review.receipt)}else CloudReconciliationResult(review=review)
    }}
    suspend fun apply(review:ReconciliationReview,allowRemovals:Boolean):JSONObject=withContext(Dispatchers.IO){ReconciliationGate.shared.withCloud(connection.owner){
        val pending=requireNotNull(store.pending()){"Preview the pending batch again."};guard(pending)
        require(review.digest==pending.digest&&(!review.counts.removals||allowRemovals)){"Approve the listed removals first."}
        val receipt=transfer.receipt(connection,pending)?:try{transfer.apply(connection,pending,review,allowRemovals){permission(pending.types)}}catch(error:CloudReconciliationUncertain){
            val recovered=try{transfer.receipt(connection,pending)}catch(_:Exception){null}
            recovered?:throw error
        }
        acknowledge(receipt);receipt
    }}
}
