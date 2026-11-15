package local.nourish.healthconnect


enum class WearRelayNotice {
    STOPPED, STARTING, CONNECTING, WAITING, CONSENT, PAUSED, UNKNOWN, CONNECTED, RETRY,
    ENABLE_FIRST, RECONNECTED, ACCESS_CHANGED, PERMISSIONS, PERMISSIONS_CHANGED
}
sealed interface WearRelayStatus {
    data class Notice(val code: WearRelayNotice): WearRelayStatus
    data class Failure(val problem: SyncDiagnostic): WearRelayStatus
}
class WearRelayFailure(val code: WearRelayNotice): IllegalArgumentException(code.name)
fun wearRelayError(error: Throwable): WearRelayStatus = if(error is WearRelayFailure)WearRelayStatus.Notice(error.code) else WearRelayStatus.Failure(captureSyncDiagnostic(error))
