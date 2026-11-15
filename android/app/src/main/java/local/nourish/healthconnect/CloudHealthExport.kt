package local.nourish.healthconnect

import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/** Durable ownership excludes replaceable WebView sessions and display email addresses. */
data class CloudExportOwner(val origin:CloudOrigin,val accountId:String,val namespace:String) {
    init {CloudAccount(accountId);require(UUID.fromString(namespace).toString()==namespace){"Invalid workspace export identity."}}
}
data class CloudExportReview(val owner:CloudExportOwner,val plan:HealthWritePlan,val response:String,val capturedAt:Instant)
data class CloudExportPending(val review:CloudExportReview,val version:Long,val attempted:Boolean=false,val receipts:Map<String,HealthWriteReceipt> = emptyMap())
interface CloudExportJournal {
    fun load(owner:CloudExportOwner):CloudExportPending?
    fun save(value:CloudExportPending)
    fun finish(owner:CloudExportOwner)
}

class CloudHealthExport(private val session:CloudAccountSession) {
    private fun identity(lease:CloudAccountLease,json:JSONObject):CloudExportOwner {
        require(lease.origin==session.origin&&json.getString("accountId")==lease.account.id){"Export account changed. Check the account again."}
        return CloudExportOwner(lease.origin,lease.account.id,json.getString("namespace"))
    }
    fun options(lease:CloudAccountLease):Pair<CloudExportOwner,JSONObject> {
        val json=JSONObject(session.request(lease,"/api/health-connect/export/biometric/options").body)
        require(json.get("version")==1);json.getJSONArray("metrics");java.time.ZoneId.of(json.getString("timeZone"))
        return identity(lease,json) to json
    }
    fun preview(lease:CloudAccountLease,selection:JSONObject,now:Instant=Instant.now()):CloudExportReview {
        val type=HealthWriteType.fromWire(selection.getString("kind"))
        val reply=session.request(lease,healthExportEndpoint(type,"preview"),selection.toString())
        val json=JSONObject(reply.body);val owner=identity(lease,json);val plan=parseHealthWritePlan(json,now)
        require(sameHealthExportSelection(selection,JSONObject(plan.selection))){"Export selection changed. Preview again."}
        return CloudExportReview(owner,plan,reply.body,now)
    }
    private fun current(lease:CloudAccountLease,owner:CloudExportOwner) {
        require(lease.origin==owner.origin&&lease.account.id==owner.accountId){"Sign in to the account that started this export."}
        if(!session.isCurrent(lease))throw CloudSessionChanged()
    }
    private fun verify(lease:CloudAccountLease,review:CloudExportReview) {
        current(lease,review.owner)
        val reply=session.request(lease,healthExportEndpoint(review.plan.type,"verify"),JSONObject()
            .put("selection",JSONObject(review.plan.selection)).put("reviewToken",review.plan.reviewToken).toString())
        val json=JSONObject(reply.body)
        require(json.get("valid")==true&&json.getString("reviewToken")==review.plan.reviewToken){"Export changed. Preview again."}
    }
    /** Called only by foreground confirmation. Persist intent before insert and receipts after readback. */
    suspend fun write(lease:CloudAccountLease,review:CloudExportReview,journal:CloudExportJournal,sink:HealthWriteSink,
        sequence:HealthWriteSequence,progress:HealthWriteProgress=HealthWriteProgress()):Int = withContext(Dispatchers.IO) {
        current(lease,review.owner)
        sequence.write { allocatedVersion->
            require(options(lease).first==review.owner){"Workspace export identity changed. The earlier export remains on this phone."}
            verify(lease,review)
            var pending=journal.load(review.owner)?.also{require(it.review==review){"Resume the pending export before starting another."}}
                ?:CloudExportPending(review,allocatedVersion)
            journal.save(pending)
            val count=writeReviewedHealthRecords(review.plan,sink,pending.version,progress,
                onVerified={receipt->pending=pending.copy(receipts=pending.receipts+(receipt.row.clientId to receipt));journal.save(pending)},
                beforeBatch={verify(lease,review);pending=pending.copy(attempted=true);journal.save(pending)},
                beforeWrite={verify(lease,review)})
            current(lease,review.owner)
            journal.finish(review.owner)
            count
        }
    }
}

fun cloudExportPendingJson(value:CloudExportPending):JSONObject=JSONObject()
    .put("format","nourishing-cloud-export").put("version",1)
    .put("origin",value.review.owner.origin.value).put("accountId",value.review.owner.accountId).put("namespace",value.review.owner.namespace)
    .put("response",value.review.response).put("capturedAt",value.review.capturedAt.toString())
    .put("writeVersion",value.version).put("attempted",value.attempted)
    .put("receipts",healthReceiptJson(value.review.plan.type,value.receipts))

fun parseCloudExportPending(json:JSONObject):CloudExportPending {
    require(json.getString("format")=="nourishing-cloud-export"&&json.get("version")==1)
    val owner=CloudExportOwner(CloudOrigin.parse(json.getString("origin")),json.getString("accountId"),json.getString("namespace"))
    val response=json.getString("response");val source=JSONObject(response);val at=Instant.parse(json.getString("capturedAt"))
    require(source.getString("accountId")==owner.accountId&&source.getString("namespace")==owner.namespace)
    val plan=parseHealthWritePlan(source,at);val version=json.get("writeVersion")
    require(version is Number&&version.toLong()>0&&version.toString()==version.toLong().toString())
    val receipts=parseHealthReceipts(plan.type,json.getJSONObject("receipts"));val rows=plan.rows.associateBy{it.clientId}
    for((id,receipt) in receipts){require(receipt.version==version.toLong()&&rows[id]?.let{healthPayloadDigest(plan.type,it)==healthPayloadDigest(plan.type,receipt.row)}==true)}
    val restored=receipts.mapValues{(_,receipt)->receipt.copy(row=rows.getValue(receipt.row.clientId))}
    val attempted=json.get("attempted");require(attempted is Boolean&& (attempted||receipts.isEmpty()))
    return CloudExportPending(CloudExportReview(owner,plan,response,at),version.toLong(),attempted,restored)
}
