package local.nourish.healthconnect

import android.content.Context
val SyncNotice.displayResource: Int get() = when(this) {
    SyncNotice.OFF -> R.string.sync_notice_off
    SyncNotice.STOPPED -> R.string.sync_notice_stopped
    SyncNotice.ENABLED -> R.string.sync_notice_enabled
    SyncNotice.DESTINATION_EDITED -> R.string.sync_notice_destination_edited
    SyncNotice.SELECTION_EDITED -> R.string.sync_notice_selection_edited
    SyncNotice.HEALTH_UNAVAILABLE -> R.string.sync_notice_health_unavailable
    SyncNotice.PERMISSION_UNAVAILABLE -> R.string.sync_notice_permission_unavailable
    SyncNotice.RECONCILIATION_INACTIVE -> R.string.sync_notice_reconciliation_inactive
    SyncNotice.PENDING_FOREGROUND -> R.string.sync_notice_pending_foreground
    SyncNotice.CACHE_CLEANUP -> R.string.sync_notice_cache_cleanup
}
val SyncError.displayResource: Int get() = when(this) {
    SyncError.EXPORT_UNAVAILABLE -> R.string.health_export_unavailable
    SyncError.EXPORT_PERMISSION -> R.string.hourly_export_permission
    SyncError.RECONCILIATION_STOPPED -> R.string.sync_error_reconciliation_stopped
    SyncError.BACKGROUND_UNAVAILABLE -> R.string.sync_error_background_unavailable
    SyncError.RECONCILIATION_PERMISSION -> R.string.sync_error_reconciliation_permission
    SyncError.RECONCILIATION_CHANGED -> R.string.sync_error_reconciliation_changed
    SyncError.NO_PENDING -> R.string.sync_error_no_pending
    SyncError.PENDING_AUTHORITY -> R.string.sync_error_pending_authority
    SyncError.CACHE_UNAVAILABLE -> R.string.sync_error_cache_unavailable
    SyncError.CACHE_OLD -> R.string.sync_error_cache_old
    SyncError.CONFIG_CHANGED -> R.string.sync_error_config_changed
    SyncError.ACCESS_CHANGED -> R.string.sync_error_access_changed
    SyncError.ACCESS_REVOKED -> R.string.sync_error_access_revoked
    SyncError.GUARD_STOPPED -> R.string.sync_error_guard_stopped
    SyncError.GUARD_CHANGED -> R.string.sync_error_guard_changed
    SyncError.CAPTURE_INCOMPLETE -> R.string.sync_error_capture_incomplete
    SyncError.CAPTURE_AUTHORITY -> R.string.sync_error_capture_authority
    SyncError.PENDING_TYPES -> R.string.sync_error_pending_types
    SyncError.SAVE_ADDRESS -> R.string.sync_error_save_address
    SyncError.SAVE_CONFIRMATION -> R.string.sync_error_save_confirmation
    SyncError.CONFIRM_FIRST -> R.string.sync_error_confirm_first
    SyncError.SAVE_CONFIGURATION -> R.string.sync_error_save_configuration
    SyncError.STOP_FAILED -> R.string.sync_error_stop_failed
}

fun Context.syncDiagnosticText(problem: SyncDiagnostic): String = when(problem) {
    is SyncDiagnostic.Export -> exportProblemText(problem.code)
    is SyncDiagnostic.Owned -> getString(problem.code.displayResource)
    is SyncDiagnostic.Workspace -> workspaceErrorText(if(problem.code==null)WorkspaceTransferFailure(problem.detail,problem.outcomeUnknown,problem.httpStatus) else WorkspaceTransferFailure(problem.code,problem.outcomeUnknown,problem.httpStatus))
    is SyncDiagnostic.Literal -> problem.text
    SyncDiagnostic.Unspecified -> getString(R.string.sync_unspecified)
}
fun Context.reconciliationCountsText(counts: ReconciliationCounts): String = getString(R.string.sync_reconciliation_counts,counts.added,counts.updated,counts.unchanged,counts.deleted,counts.replaced,counts.invalidated)
fun Context.syncStatusText(status: SyncStatus): String = when(status) {
    is SyncStatus.Notice -> getString(status.notice.displayResource)
    is SyncStatus.Snapshot -> getString(R.string.sync_snapshot_result,status.at.toString(),importCountsText(status.counts),if(status.denied.isEmpty())"" else " "+getString(R.string.sync_denied,status.denied.joinToString { getString(it.displayLabelResource) }))
    is SyncStatus.Reconciled -> getString(R.string.sync_receipt,reconciliationCountsText(status.counts))
    is SyncStatus.HeldRemovals -> getString(R.string.sync_held_removals,reconciliationCountsText(status.counts))
    is SyncStatus.Failed -> getString(R.string.sync_failure,status.at.toString(),syncDiagnosticText(status.problem))
    is SyncStatus.Literal -> status.text
}
fun Context.syncConfigurationText(status: SyncStatus, config: BackgroundSyncConfig?): String {
    val text=syncStatusText(status)
    if(config==null)return text
    return getString(R.string.sync_configuration,text,config.origin.value,config.login,
        getString(when(config.mode){BackgroundSyncMode.SNAPSHOT->R.string.sync_snapshot_mode;BackgroundSyncMode.RECONCILIATION->R.string.sync_reconciliation_mode}),
        getString(if(config.allowRemovals)R.string.sync_approved else R.string.sync_not_approved),config.days,config.types.joinToString{getString(it.displayLabelResource)})
}
