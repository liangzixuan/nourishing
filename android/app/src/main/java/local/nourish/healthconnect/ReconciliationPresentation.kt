package local.nourish.healthconnect
import android.content.Context
fun Context.reconciliationReviewText(origin: WorkspaceOrigin, identity: WorkspaceIdentity, pending: ReconciliationPending, review: ReconciliationReview): String {
    val range=pending.batch.getJSONObject("snapshot").getJSONObject("range")
    return getString(R.string.recon_review,origin.value,identity.login,range.getString("from"),range.getString("to"),range.getString("zone"),reconciliationCountsText(review.counts),review.warnings.joinToString("\n"))
}
