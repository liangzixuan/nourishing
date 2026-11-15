package local.nourish.healthconnect

import java.io.File
import org.json.JSONObject
import kotlinx.coroutines.CancellationException

private val hashPattern=Regex("[a-f0-9]{64}")
private val uuidPattern=Regex("[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")
internal fun validReceiptPath(path:String):Boolean {
    if(!path.startsWith("/api/health-connect/reconcile/receipt?"))return false
    val query=path.substringAfter('?').split('&');if(query.size!=4)return false
    val fields=query.map{it.split('=',limit=2)};if(fields.any{it.size!=2})return false
    val values=fields.associate{it[0] to it[1]};return values.size==4&&values.keys==setOf("streamId","sequence","batchId","batchDigest")&&uuidPattern.matches(values.getValue("streamId"))&&uuidPattern.matches(values.getValue("batchId"))&&hashPattern.matches(values.getValue("batchDigest"))&&values.getValue("sequence").toLongOrNull()?.let{it in 1..9007199254740991L}==true
}
private fun safeInteger(value:Any,minimum:Long=0):Long {requireWorkspace(value is Number&&value.toDouble().isFinite()&&value.toDouble()%1.0==0.0&&value.toDouble() in minimum.toDouble()..9007199254740991.0, WorkspaceError.RECON_NUMBER);return (value as Number).toLong()}
data class ReconciliationCounts(val added:Int,val updated:Int,val unchanged:Int,val deleted:Int,val replaced:Int,val invalidated:Int) {
    init {requireWorkspace(listOf(added,updated,unchanged,deleted,replaced,invalidated).all{it in 0..MAX_EXPORT_RECORDS}, WorkspaceError.RECON_COUNT)}
    val removals:Boolean get()=deleted>0||replaced>0||invalidated>0
}
fun reconciliationCounts(value:JSONObject):ReconciliationCounts {
    val keys=listOf("added","updated","unchanged","deleted","replaced","invalidated");strictKeys(value,keys.toSet());val counts=keys.map{safeInteger(value.get(it)).also{n->requireWorkspace(n<=MAX_EXPORT_RECORDS,WorkspaceError.RECON_COUNT)}.toInt()};return ReconciliationCounts(counts[0],counts[1],counts[2],counts[3],counts[4],counts[5])
}
fun validateReconciliationReceipt(receipt:JSONObject,batch:JSONObject,digest:String){
    strictKeys(receipt,setOf("streamId","sequence","batchId","batchDigest","receiptId","counts","recoverySnapshotId"))
    requireWorkspace(receipt.getString("streamId")==batch.getString("streamId")&&receipt.getString("batchId")==batch.getString("batchId")&&safeInteger(receipt.get("sequence"),1)==batch.getLong("sequence")&&receipt.getString("batchDigest")==digest&&hashPattern.matches(receipt.getString("receiptId")), WorkspaceError.RECON_RECEIPT)
    reconciliationCounts(receipt.getJSONObject("counts"));if(!receipt.isNull("recoverySnapshotId"))safeInteger(receipt.get("recoverySnapshotId"),1)
}
data class ReconciliationReview(val token:String,val digest:String,val counts:ReconciliationCounts,val warnings:List<String>,val replayed:Boolean,val receipt:JSONObject?)
interface ReconciliationTransport {
    suspend fun receipt(origin:WorkspaceOrigin,identity:WorkspaceIdentity,pending:ReconciliationPending):JSONObject?
    suspend fun preview(origin:WorkspaceOrigin,identity:WorkspaceIdentity,pending:ReconciliationPending,file:File):ReconciliationReview
    suspend fun apply(origin:WorkspaceOrigin,identity:WorkspaceIdentity,pending:ReconciliationPending,review:ReconciliationReview,allowRemovals:Boolean):JSONObject
}
class ReconciliationTransfer(private val client:WorkspaceClient):ReconciliationTransport {
    override suspend fun receipt(origin:WorkspaceOrigin,identity:WorkspaceIdentity,pending:ReconciliationPending):JSONObject? {
        requireWorkspace(client.identity(origin)==identity, WorkspaceError.RECON_ACCOUNT_UNSENT);val digest=(pending.digest ?: throw WorkspaceValidationFailure(WorkspaceError.RECON_PREVIEW_REQUIRED))
        val batch=pending.batch;val path="/api/health-connect/reconcile/receipt?streamId=${batch.getString("streamId")}&sequence=${batch.getLong("sequence")}&batchId=${batch.getString("batchId")}&batchDigest=$digest"
        val result=client.exchange(origin,path);strictKeys(result,setOf("receipt"));if(result.isNull("receipt"))return null
        return result.getJSONObject("receipt").also{validateReconciliationReceipt(it,batch,digest)}
    }
    override suspend fun preview(origin:WorkspaceOrigin,identity:WorkspaceIdentity,pending:ReconciliationPending,file:File):ReconciliationReview {
        requireWorkspace(client.identity(origin)==identity, WorkspaceError.RECON_ACCOUNT_CHANGED)
        requireWorkspace(file.readText(Charsets.UTF_8)==pending.batch.toString(), WorkspaceError.RECON_STAGED_CHANGED)
        val json=client.exchange(origin,"/api/health-connect/reconcile/preview?summary=1",file)
        strictKeys(json,setOf("batchId","batchDigest","reviewToken","counts","range","warnings","replayed","receipt"))
        val digest=json.getString("batchDigest");requireWorkspace(json.getString("batchId")==pending.batch.getString("batchId")&&hashPattern.matches(digest)&&(pending.digest==null||pending.digest==digest),WorkspaceError.RECON_BATCH_MISMATCH)
        val token=json.getString("reviewToken");requireWorkspace(hashPattern.matches(token), WorkspaceError.RECON_REVIEW_TOKEN)
        val expected=pending.batch.getJSONObject("snapshot").getJSONObject("range");val actual=json.getJSONObject("range");strictKeys(actual,setOf("from","to","zone"));requireWorkspace(listOf("from","to","zone").all{actual.getString(it)==expected.getString(it)}, WorkspaceError.RECON_RANGE_CHANGED)
        val warnings=json.getJSONArray("warnings");requireWorkspace(warnings.length()<=MAX_EXPORT_RECORDS,WorkspaceError.RECON_WARNINGS);val replayed=json.get("replayed");requireWorkspace(replayed is Boolean,WorkspaceError.RECON_REPLAY_SUMMARY)
        val receipt=if(json.isNull("receipt"))null else json.getJSONObject("receipt").also{validateReconciliationReceipt(it,pending.batch,digest)}
        requireWorkspace(replayed==(receipt!=null), WorkspaceError.RECON_REPLAY_SUMMARY)
        return ReconciliationReview(token,digest,reconciliationCounts(json.getJSONObject("counts")),(0 until warnings.length()).map{warnings.getString(it).also{s->requireWorkspace(s.length<=2000,WorkspaceError.RECON_WARNINGS)}},replayed as Boolean,receipt)
    }
    override suspend fun apply(origin:WorkspaceOrigin,identity:WorkspaceIdentity,pending:ReconciliationPending,review:ReconciliationReview,allowRemovals:Boolean):JSONObject {
        requireWorkspace(review.digest==pending.digest&&(!review.counts.removals||allowRemovals), WorkspaceError.RECON_REMOVAL_APPROVAL)
        requireWorkspace(client.identity(origin)==identity, WorkspaceError.RECON_ACCOUNT_CHANGED)
        val payload=JSONObject().put("batch",pending.batch).put("reviewToken",review.token)
            .put("confirmed",true).put("allowRemovals",allowRemovals)
        val result=client.exchange(origin,"/api/health-connect/reconcile/apply",importing=true,json=payload)
        try {
            strictKeys(result,setOf("receipt","replayed"))
            requireWorkspace(result.get("replayed") is Boolean,WorkspaceError.RECON_REPLAY_SUMMARY)
            return result.getJSONObject("receipt").also{validateReconciliationReceipt(it,pending.batch,review.digest)}
        } catch(error:CancellationException){throw error}
          catch(_:Exception){throw WorkspaceTransferFailure(WorkspaceError.RECON_INVALID_RESULT,outcomeUnknown=true)}
    }
}
