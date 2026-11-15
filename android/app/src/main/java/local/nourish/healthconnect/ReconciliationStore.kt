package local.nourish.healthconnect

import android.util.AtomicFile
import java.io.File
import java.security.MessageDigest
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject

interface ReconciliationDocument { fun read():String?; fun write(value:String) }
class AtomicReconciliationDocument(file:File):ReconciliationDocument {
    private val atomic=AtomicFile(file)
    override fun read():String?=try{atomic.openRead().bufferedReader(Charsets.UTF_8).use{it.readText()}}catch(_:java.io.FileNotFoundException){null}
    override fun write(value:String){val stream=atomic.startWrite();try{stream.write(value.toByteArray(Charsets.UTF_8));atomic.finishWrite(stream)}catch(error:Throwable){atomic.failWrite(stream);throw error}}
}
sealed class PendingAuthority {
    data object Foreground:PendingAuthority()
    data class Background(val revision:String):PendingAuthority(){init{require(revision.isNotBlank())}}
}
private fun authorityJson(authority:PendingAuthority)=when(authority){PendingAuthority.Foreground->JSONObject().put("kind","foreground");is PendingAuthority.Background->JSONObject().put("kind","background").put("revision",authority.revision)}
private fun parseAuthority(value:JSONObject?):PendingAuthority? {
    if(value==null)return null // no inferred background authority for older pending data.
    return when(value.getString("kind")){"foreground"->{strictKeys(value,setOf("kind"));PendingAuthority.Foreground};"background"->{strictKeys(value,setOf("kind","revision"));PendingAuthority.Background(value.getString("revision"))};else->throw WorkspaceValidationFailure(WorkspaceError.RECON_AUTHORITY)}
}
data class ReconciliationPending(val batch:JSONObject,val candidates:Map<ExportType,String>,val types:Set<ExportType>,val digest:String?,val authority:PendingAuthority?=null)

/** A single AtomicFile owns stream progress and pending payload together. An ack
 * cannot commit cursors while leaving an old pending payload eligible to replay. */
class ReconciliationStore(private val document:ReconciliationDocument,private val uploadDirectory:File?=null) {
    private fun state()=document.read()?.let(::JSONObject)?:JSONObject().put("streamId",UUID.randomUUID().toString()).put("sequence",1).put("previousReceipt",JSONObject.NULL).put("cursors",JSONObject())
    fun pending():ReconciliationPending?{val p=state().optJSONObject("pending")?:return null
        val candidates=p.getJSONObject("candidates");return ReconciliationPending(p.getJSONObject("batch"),candidates.keys().asSequence().associate{ExportType.valueOf(it) to candidates.getString(it)},p.getJSONArray("types").let{a->(0 until a.length()).map{ExportType.valueOf(a.getString(it))}.toSet()},p.optString("digest").takeIf{it.isNotBlank()},parseAuthority(p.optJSONObject("authority")))
    }
    fun captureState():JSONObject{retryCleanup();return state().also{requireWorkspace(!it.has("pending"), WorkspaceError.RECON_UNRESOLVED)}}
    fun cursors(state:JSONObject):Map<ExportType,String> = state.getJSONObject("cursors").let { values->values.keys().asSequence().associate{ExportType.valueOf(it) to values.getString(it)} }
    fun stage(captured:JSONObject,batch:JSONObject,candidates:Map<ExportType,String>,types:Set<ExportType>,authority:PendingAuthority=PendingAuthority.Foreground){
        requireWorkspace(!state().has("pending"), WorkspaceError.RECON_ALREADY_PENDING)
        requireWorkspace(batch.getString("streamId")==captured.getString("streamId")&&batch.getLong("sequence")==captured.getLong("sequence"),WorkspaceError.RECON_BATCH_MISMATCH)
        requireWorkspace(batch.toString().toByteArray(Charsets.UTF_8).size<=MAX_EXPORT_BYTES, WorkspaceError.RECON_BATCH_LIMIT)
        captured.put("pending",JSONObject().put("batch",batch).put("candidates",JSONObject(candidates.mapKeys{it.key.name})).put("types",JSONArray(types.map{it.name})).put("authority",authorityJson(authority)))
        document.write(captured.toString())
    }
    fun bindDigest(digest:String){requireWorkspace(Regex("[a-f0-9]{64}").matches(digest), WorkspaceError.RECON_DIGEST);val s=state();val p=s.getJSONObject("pending");requireWorkspace(!p.has("digest")||p.getString("digest")==digest, WorkspaceError.RECON_IDENTITY_CHANGED);p.put("digest",digest);document.write(s.toString())}
    /** Only the foreground owner exposes this after a known receiver conflict
     * and an explicit new-baseline acknowledgement. Never call for lost replies. */
    fun resetAfterConfirmedConflict(){val previous=state();val next=JSONObject().put("streamId",UUID.randomUUID().toString()).put("sequence",1).put("previousReceipt",JSONObject.NULL).put("cursors",JSONObject())
        previous.optJSONObject("pending")?.getJSONObject("batch")?.getString("batchId")?.let{next.put("cleanupBatchId",it)}
        document.write(next.toString());retryCleanup()
    }
    fun acknowledge(receipt:JSONObject){
        val s=state();val p=(pending() ?: throw WorkspaceValidationFailure(WorkspaceError.RECON_PENDING_REQUIRED));validateReconciliationReceipt(receipt,p.batch,(p.digest ?: throw WorkspaceValidationFailure(WorkspaceError.RECON_PREVIEW_REQUIRED)))
        val cursors=s.getJSONObject("cursors");for((type,token)in p.candidates)cursors.put(type.name,token)
        s.put("sequence",receipt.getLong("sequence")+1).put("previousReceipt",receipt.getString("receiptId")).put("cleanupBatchId",p.batch.getString("batchId")).remove("pending")
        document.write(s.toString())
        retryCleanup()
    }
    private fun retryCleanup(){val s=state();if(!s.has("cleanupBatchId"))return
        val id=s.getString("cleanupBatchId");require(Regex("[0-9a-f-]{36}").matches(id))
        uploadDirectory?.let{directory->val file=File(directory,"reconciliation-$id.json");if(file.exists()&&!file.delete())throw WorkspaceTransferFailure(WorkspaceError.RECON_CLEANUP)}
        s.remove("cleanupBatchId");document.write(s.toString())
    }
    fun file(directory:File):File{val p=(pending() ?: throw WorkspaceValidationFailure(WorkspaceError.RECON_PENDING_REQUIRED));if(!directory.isDirectory&&!directory.mkdirs())throw WorkspaceTransferFailure(WorkspaceError.RECON_DIRECTORY);val file=File(directory,"reconciliation-${p.batch.getString("batchId")}.json");val bytes=p.batch.toString().toByteArray(Charsets.UTF_8);requireWorkspace(bytes.size<=MAX_EXPORT_BYTES,WorkspaceError.RECON_BATCH_LIMIT)
        if(!file.isFile||!file.readBytes().contentEquals(bytes))file.outputStream().use{it.write(bytes);it.fd.sync()};return file
    }
    companion object {
        fun open(directory:File,origin:WorkspaceOrigin,identity:WorkspaceIdentity):ReconciliationStore{
            if(!directory.isDirectory&&!directory.mkdirs())throw WorkspaceTransferFailure(WorkspaceError.RECON_DIRECTORY);val key=MessageDigest.getInstance("SHA-256").digest((origin.value+"\n"+identity.login).toByteArray(Charsets.UTF_8)).joinToString(""){"%02x".format(it)}
            return ReconciliationStore(AtomicReconciliationDocument(File(directory,"$key.json")),directory)
        }
    }
}
