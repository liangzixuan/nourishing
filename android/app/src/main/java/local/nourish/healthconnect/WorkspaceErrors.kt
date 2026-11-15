package local.nourish.healthconnect

import java.io.IOException

/** Identities belong to the producer. Server diagnostics never acquire a code by text matching. */
enum class WorkspaceError(val diagnostic: String) {
    ADDRESS_SYNTAX("Use your private Nourish HTTPS address."),
    PRIVATE_ADDRESS("Use only your private https://…ts.net address, without a path, credentials, query or fragment."),
    INVALID_COUNT("Invalid workspace count."),
    EXPORT_INCOMPLETE("Read selected data again to create a complete export."),
    PREVIEW_REQUIRED("Preview the import again before confirming."),
    EXPORT_REQUIRED("Read selected data again before transfer."),
    IMPORT_NO_RESULT("The workspace did not return an import result."),
    UNREACHABLE("Could not reach your private workspace. Keep the PC awake, Nourish running and Tailscale connected on both devices."),
    REDIRECT("The workspace redirected this request. Use its exact private HTTPS address."),
    RESPONSE_LARGE("The workspace response is too large. Update Nourish on the PC and try again."),
    INVALID_SUMMARY("The workspace returned an invalid summary. Check Nourish on the PC."),
    ACCESS_DENIED("Private access was refused. Use the configured Nourish address and the same Tailscale account on both devices."),
    REJECTED("The workspace rejected this request."),
    IMPORT_UNREADABLE("The import response could not be read."),
    RESPONSE_UNREADABLE("The private workspace response could not be read."),
    PRIVATE_WORKSPACE("Use the private Tailscale HTTPS workspace."),
    CONFIGURED_ADDRESS("This is not the configured private workspace address."),
    ACCOUNT_PREVIEW("The workspace account changed. Check the connection again before transfer."),
    WARNINGS_LIMIT("Too many workspace warnings."),
    INCOMPLETE_PREVIEW("The import preview is incomplete. Preview again."),
    STAGED_CHANGED("The staged file changed. Preview again before importing."),
    ACCOUNT_IMPORT("The workspace account changed. Preview again before importing."),
    INVALID_IMPORT_SUMMARY("The workspace returned an invalid import summary."),
    INVALID_IDENTITY("The workspace returned an invalid account identity."),
    JSON_FIELDS("Unexpected JSON fields."),
    RECON_NUMBER("Invalid reconciliation number."),
    RECON_COUNT("Invalid reconciliation count."),
    RECON_RECEIPT("The receipt does not acknowledge this exact pending batch."),
    RECON_ACCOUNT_UNSENT("The workspace account changed. No reconciliation was sent."),
    RECON_PREVIEW_REQUIRED("Preview the pending reconciliation first."),
    RECON_ACCOUNT_CHANGED("The workspace account changed."),
    RECON_STAGED_CHANGED("The staged reconciliation changed. Reopen its durable pending batch."),
    RECON_REVIEW_TOKEN("Malformed reconciliation review token."),
    RECON_RANGE_CHANGED("The preview range changed."),
    RECON_REPLAY_SUMMARY("Malformed reconciliation replay summary."),
    RECON_REMOVAL_APPROVAL("Review and explicitly approve the removal counts first."),
    TRANSFER_LIMIT("The request exceeds the transfer limit."),
    RECON_INVALID_RESULT("The reconciliation result is invalid."),
    RECON_AUTHORITY("Invalid private reconciliation authority."),
    RECON_UNRESOLVED("An unresolved reconciliation is pending. Check its receipt or transfer it before reading again."),
    RECON_ALREADY_PENDING("An unresolved reconciliation is already pending."),
    RECON_BATCH_LIMIT("Reconciliation exceeds 20 MB. No partial batch was staged."),
    RECON_DIGEST("Invalid reconciliation digest."),
    RECON_IDENTITY_CHANGED("The pending batch identity changed."),
    RECON_CLEANUP("Receipt was acknowledged, but its private upload copy could not be removed. Cleanup remains owned and will be retried before another capture. No batch will be replayed."),
    RECON_BATCH_MISMATCH("The reconciliation batch identity does not match the reviewed batch."),
    RECON_WARNINGS("The reconciliation warnings exceed the supported limits."),
    RECON_DIRECTORY("The private reconciliation directory is unavailable."),
    RECON_PENDING_REQUIRED("No pending reconciliation batch.")
}
class WorkspaceValidationFailure(val code: WorkspaceError) : IllegalArgumentException(code.diagnostic)
internal fun requireWorkspace(condition: Boolean, code: WorkspaceError) {
    if (!condition) throw WorkspaceValidationFailure(code)
}
class WorkspaceTransferFailure private constructor(
    val detail: String, val code: WorkspaceError?, val outcomeUnknown: Boolean, val httpStatus: Int?
) : IOException(detail + if (outcomeUnknown) " The import outcome is unknown. Preview again to check the workspace before another import." else "") {
    constructor(message: String, outcomeUnknown: Boolean = false, httpStatus: Int? = null) : this(message, null, outcomeUnknown, httpStatus)
    constructor(code: WorkspaceError, outcomeUnknown: Boolean = false, httpStatus: Int? = null) : this(code.diagnostic, code, outcomeUnknown, httpStatus)
}
