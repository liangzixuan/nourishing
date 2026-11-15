package local.nourish.healthconnect

import android.content.Context

/** Translate UI labels while retaining source descriptions, identities and observations. */
fun Context.intakeCorrectionPreviewText(preview: CorrectedIntakePreview, origin: WorkspaceOrigin, identity: WorkspaceIdentity, before: Map<String,String>): String = buildString {
    append(getString(R.string.correction_header,origin.value,identity.login,getString(preview.selection.type.displayLabelResource),preview.selection.from.toString(),preview.selection.to.toString(),preview.selection.timeZone,preview.selection.correctionDates.joinToString(", ")))
    for(group in preview.groups)append("\n\n${group.description}")
    for(row in preview.rows)append("\n\n"+getString(R.string.correction_update,row.description,before[row.clientId]?:getString(R.string.correction_absent)))
    for(row in preview.retire)append("\n\n"+getString(R.string.correction_remove,row.id,row.reason,before[row.clientId]?:getString(R.string.correction_already_absent)))
    if(preview.related.isNotEmpty())append("\n\n"+getString(R.string.correction_related,preview.related.joinToString("\n")))
    if(preview.skipped.isNotEmpty())append("\n\n"+getString(R.string.correction_skipped,preview.skipped.joinToString("\n")))
}

fun Context.intakeCorrectionRecoveryText(session: IntakeCorrectionSession, current: Map<String,String>): String = buildString {
    append(getString(R.string.correction_recovery_header,session.origin.value,session.identity.login,getString(session.operation.review.plan.type.displayLabelResource),session.operation.id,session.operation.attemptedUpserts.size,session.operation.attemptedRetirements.size))
    val preview=session.preview()
    for(row in preview.rows)append("\n\n"+getString(R.string.correction_original_update,row.description,current[row.clientId]?:getString(R.string.correction_absent)))
    for(row in preview.retire)append("\n\n"+getString(R.string.correction_original_remove,row.id,row.reason,current[row.clientId]?:getString(R.string.correction_absent)))
}
