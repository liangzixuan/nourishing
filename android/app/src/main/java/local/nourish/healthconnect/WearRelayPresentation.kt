package local.nourish.healthconnect

import android.content.Context

val WearRelayNotice.displayResource: Int get()=when(this) {
    WearRelayNotice.STOPPED -> R.string.relay_stopped
    WearRelayNotice.STARTING -> R.string.relay_starting
    WearRelayNotice.CONNECTING -> R.string.relay_connecting
    WearRelayNotice.WAITING -> R.string.relay_waiting
    WearRelayNotice.CONSENT -> R.string.relay_consent
    WearRelayNotice.PAUSED -> R.string.relay_paused
    WearRelayNotice.UNKNOWN -> R.string.relay_unknown
    WearRelayNotice.CONNECTED -> R.string.relay_connected
    WearRelayNotice.RETRY -> R.string.relay_retry
    WearRelayNotice.ENABLE_FIRST -> R.string.relay_enable_first
    WearRelayNotice.RECONNECTED -> R.string.relay_reconnected
    WearRelayNotice.ACCESS_CHANGED -> R.string.relay_access_changed
    WearRelayNotice.PERMISSIONS -> R.string.relay_permissions
    WearRelayNotice.PERMISSIONS_CHANGED -> R.string.relay_permissions_changed
}
fun Context.wearRelayStatusText(status: WearRelayStatus): String=when(status) {
    is WearRelayStatus.Notice -> getString(status.code.displayResource)
    is WearRelayStatus.Failure -> syncDiagnosticText(status.problem)
}
