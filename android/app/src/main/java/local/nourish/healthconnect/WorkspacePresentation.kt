package local.nourish.healthconnect

import android.content.Context

val WorkspaceError.displayResource: Int get() = when (this) {
    WorkspaceError.ADDRESS_SYNTAX -> R.string.transfer_error_address_syntax
    WorkspaceError.PRIVATE_ADDRESS -> R.string.transfer_error_private_address
    WorkspaceError.INVALID_COUNT -> R.string.transfer_error_invalid_count
    WorkspaceError.EXPORT_INCOMPLETE -> R.string.transfer_error_export_incomplete
    WorkspaceError.PREVIEW_REQUIRED -> R.string.transfer_error_preview_required
    WorkspaceError.EXPORT_REQUIRED -> R.string.transfer_error_export_required
    WorkspaceError.IMPORT_NO_RESULT -> R.string.transfer_error_import_no_result
    WorkspaceError.UNREACHABLE -> R.string.transfer_error_unreachable
    WorkspaceError.REDIRECT -> R.string.transfer_error_redirect
    WorkspaceError.RESPONSE_LARGE -> R.string.transfer_error_response_large
    WorkspaceError.INVALID_SUMMARY -> R.string.transfer_error_invalid_summary
    WorkspaceError.ACCESS_DENIED -> R.string.transfer_error_access_denied
    WorkspaceError.REJECTED -> R.string.transfer_error_rejected
    WorkspaceError.IMPORT_UNREADABLE -> R.string.transfer_error_import_unreadable
    WorkspaceError.RESPONSE_UNREADABLE -> R.string.transfer_error_response_unreadable
    WorkspaceError.PRIVATE_WORKSPACE -> R.string.transfer_error_private_workspace
    WorkspaceError.CONFIGURED_ADDRESS -> R.string.transfer_error_configured_address
    WorkspaceError.ACCOUNT_PREVIEW -> R.string.transfer_error_account_preview
    WorkspaceError.WARNINGS_LIMIT -> R.string.transfer_error_warnings_limit
    WorkspaceError.INCOMPLETE_PREVIEW -> R.string.transfer_error_incomplete_preview
    WorkspaceError.STAGED_CHANGED -> R.string.transfer_error_staged_changed
    WorkspaceError.ACCOUNT_IMPORT -> R.string.transfer_error_account_import
    WorkspaceError.INVALID_IMPORT_SUMMARY -> R.string.transfer_error_invalid_import_summary
    WorkspaceError.INVALID_IDENTITY -> R.string.transfer_error_invalid_identity
    WorkspaceError.JSON_FIELDS -> R.string.transfer_error_json_fields
    WorkspaceError.RECON_NUMBER -> R.string.transfer_error_recon_number
    WorkspaceError.RECON_COUNT -> R.string.transfer_error_recon_count
    WorkspaceError.RECON_RECEIPT -> R.string.transfer_error_recon_receipt
    WorkspaceError.RECON_ACCOUNT_UNSENT -> R.string.transfer_error_recon_account_unsent
    WorkspaceError.RECON_PREVIEW_REQUIRED -> R.string.transfer_error_recon_preview_required
    WorkspaceError.RECON_ACCOUNT_CHANGED -> R.string.transfer_error_recon_account_changed
    WorkspaceError.RECON_STAGED_CHANGED -> R.string.transfer_error_recon_staged_changed
    WorkspaceError.RECON_REVIEW_TOKEN -> R.string.transfer_error_recon_review_token
    WorkspaceError.RECON_RANGE_CHANGED -> R.string.transfer_error_recon_range_changed
    WorkspaceError.RECON_REPLAY_SUMMARY -> R.string.transfer_error_recon_replay_summary
    WorkspaceError.RECON_REMOVAL_APPROVAL -> R.string.transfer_error_recon_removal_approval
    WorkspaceError.TRANSFER_LIMIT -> R.string.transfer_error_transfer_limit
    WorkspaceError.RECON_INVALID_RESULT -> R.string.transfer_error_recon_invalid_result
    WorkspaceError.RECON_AUTHORITY -> R.string.transfer_error_recon_authority
    WorkspaceError.RECON_UNRESOLVED -> R.string.transfer_error_recon_unresolved
    WorkspaceError.RECON_ALREADY_PENDING -> R.string.transfer_error_recon_already_pending
    WorkspaceError.RECON_BATCH_LIMIT -> R.string.transfer_error_recon_batch_limit
    WorkspaceError.RECON_DIGEST -> R.string.transfer_error_recon_digest
    WorkspaceError.RECON_IDENTITY_CHANGED -> R.string.transfer_error_recon_identity_changed
    WorkspaceError.RECON_CLEANUP -> R.string.transfer_error_recon_cleanup
    WorkspaceError.RECON_BATCH_MISMATCH -> R.string.transfer_error_recon_batch_mismatch
    WorkspaceError.RECON_WARNINGS -> R.string.transfer_error_recon_warnings
    WorkspaceError.RECON_DIRECTORY -> R.string.transfer_error_recon_directory
    WorkspaceError.RECON_PENDING_REQUIRED -> R.string.transfer_error_recon_pending_required
}
fun Context.workspaceErrorText(error: Throwable): String = when (error) {
    is OwnedExportFailure -> exportProblemText(error.code)
    is SyncStateFailure -> getString(error.code.displayResource)
    is WorkspaceValidationFailure -> getString(error.code.displayResource)
    is WorkspaceTransferFailure -> {
        val detail = error.code?.let { getString(it.displayResource) } ?: error.detail
        if (error.outcomeUnknown) detail + " " + getString(R.string.transfer_error_unknown_outcome) else detail
    }
    else -> error.message ?: getString(R.string.transfer_error_request_failed)
}

fun Context.importCountsText(counts: ImportCounts): String = getString(R.string.transfer_counts, counts.added, counts.updated, counts.unchanged)
