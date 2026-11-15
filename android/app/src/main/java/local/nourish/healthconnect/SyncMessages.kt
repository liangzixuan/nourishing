package local.nourish.healthconnect

enum class SyncNotice { OFF, STOPPED, ENABLED, DESTINATION_EDITED, SELECTION_EDITED, HEALTH_UNAVAILABLE, PERMISSION_UNAVAILABLE, RECONCILIATION_INACTIVE, PENDING_FOREGROUND, CACHE_CLEANUP }
enum class SyncError(val diagnostic: String) {
    EXPORT_UNAVAILABLE("Health Connect is unavailable."),
    EXPORT_PERMISSION("Background or selected read/write permission was revoked. Open the app to grant it or stop hourly exports."),
    RECONCILIATION_STOPPED("Hourly reconciliation was stopped or replaced."),
    BACKGROUND_UNAVAILABLE("Background read access is unavailable."),
    RECONCILIATION_PERMISSION("Background/selected read permission was revoked. Reconciliation remains pending."),
    RECONCILIATION_CHANGED("Hourly reconciliation configuration changed."),
    NO_PENDING("No pending reconciliation."),
    PENDING_AUTHORITY("This pending batch has no authority under the saved hourly configuration."),
    CACHE_UNAVAILABLE("Private sync cache is unavailable."),
    CACHE_OLD("An old private sync file could not be removed. Open the app and retry later."),
    CONFIG_CHANGED("Hourly sync configuration changed. No further health data was sent."),
    ACCESS_CHANGED("Background read access became unavailable. No further health data was sent."),
    ACCESS_REVOKED("Health Connect read access was revoked after staging. No further health data was sent."),
    GUARD_STOPPED("Hourly configuration was replaced or stopped. Pending reconciliation is retained."),
    GUARD_CHANGED("Hourly configuration changed during the permission check."),
    CAPTURE_INCOMPLETE("Capture did not stage a complete batch."),
    CAPTURE_AUTHORITY("Capture authority changed. Foreground action is required."),
    PENDING_TYPES("Pending data includes types outside this saved configuration. Foreground action is required."),
    SAVE_ADDRESS("Could not save the private address."),
    SAVE_CONFIRMATION("Could not save the destination confirmation. Check the workspace before importing again."),
    CONFIRM_FIRST("Preview and import once to confirm this private destination first."),
    SAVE_CONFIGURATION("Could not save the hourly sync configuration."),
    STOP_FAILED("Could not save the stopped sync state. Check the hourly sync settings before leaving the app.")
}
class SyncStateFailure(val code: SyncError): IllegalStateException(code.diagnostic)
internal fun checkSync(condition: Boolean, code: SyncError) { if(!condition)throw SyncStateFailure(code) }
