package local.nourish.healthconnect

import android.content.Context
import java.security.MessageDigest
import org.json.JSONObject

/** Private, account/lineage-scoped write intent. Logout never clears this store. */
class AndroidCloudExportJournal(context:Context):CloudExportJournal {
    private val prefs=context.applicationContext.getSharedPreferences("cloud-health-export-journal",Context.MODE_PRIVATE)
    companion object {private val lock=Any()}
    private fun key(owner:CloudExportOwner):String=MessageDigest.getInstance("SHA-256")
        .digest("${owner.origin.value}\n${owner.accountId}\n${owner.namespace}".toByteArray()).joinToString(""){"%02x".format(it)}
    override fun load(owner:CloudExportOwner):CloudExportPending?=synchronized(lock) {
        prefs.getString("pending:"+key(owner),null)?.let{parseCloudExportPending(JSONObject(it)).also{value->require(value.review.owner==owner)}}
    }
    override fun save(value:CloudExportPending)=synchronized(lock) {
        val previous=load(value.review.owner)
        require(previous==null||previous.review==value.review&&previous.version==value.version&&(!previous.attempted||value.attempted)&&value.receipts.entries.containsAll(previous.receipts.entries)){"A different export is pending."}
        val json=cloudExportPendingJson(value);require(parseCloudExportPending(json)==value)
        check(prefs.edit().putString("pending:"+key(value.review.owner),json.toString()).commit()){"Could not retain the export. No further native write was requested."}
    }
    override fun finish(owner:CloudExportOwner)=synchronized(lock) {
        val pending=requireNotNull(load(owner));require(pending.receipts.size==pending.review.plan.rows.size)
        // Keep verified receipts for later ownership checks. Only the pending flag is cleared.
        check(prefs.edit().putString("completed:${key(owner)}:${pending.review.plan.type.wire}",cloudExportPendingJson(pending).toString())
            .remove("pending:"+key(owner)).commit()){"Export was verified, but its local acknowledgement could not be saved."}
    }
}
