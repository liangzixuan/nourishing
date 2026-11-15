package local.nourish.healthconnect

import org.junit.Assert.*
import org.junit.Test

class WearRelayStatusTest {
    private val config=WearConfig(WorkspaceOrigin.parse("https://fixture.test.ts.net"),"owner@example.invalid","00000000-0000-4000-8000-000000000001")
    @Test fun staleRunCannotOverwriteOrStopTheCurrentRun() {
        WearRelayControl.stop()
        try {
            val first=WearRelayControl.begin(config);val current=WearRelayControl.begin(config)
            WearRelayControl.update(first,WearRelayStatus.Notice(WearRelayNotice.PAUSED))
            WearRelayControl.stop(first,WearRelayStatus.Notice(WearRelayNotice.PERMISSIONS_CHANGED))
            assertEquals(current,WearRelayControl.run);assertEquals(WearRelayStatus.Notice(WearRelayNotice.STARTING),WearRelayControl.status)
            WearRelayControl.update(current,WearRelayStatus.Notice(WearRelayNotice.UNKNOWN))
            assertEquals(WearRelayStatus.Notice(WearRelayNotice.UNKNOWN),WearRelayControl.status)
            WearRelayControl.stop(current);assertNull(WearRelayControl.run)
            WearRelayControl.update(current,WearRelayStatus.Notice(WearRelayNotice.CONNECTED))
            assertEquals(WearRelayStatus.Notice(WearRelayNotice.STOPPED),WearRelayControl.status)
        } finally { WearRelayControl.stop() }
    }
    @Test fun noticesCannotReplaceAnActiveRunStatus() {
        WearRelayControl.stop()
        try {
            WearRelayControl.notice(WearRelayStatus.Notice(WearRelayNotice.ENABLE_FIRST))
            assertEquals(WearRelayStatus.Notice(WearRelayNotice.ENABLE_FIRST),WearRelayControl.status)
            WearRelayControl.begin(config);WearRelayControl.notice(WearRelayStatus.Notice(WearRelayNotice.RECONNECTED))
            assertEquals(WearRelayStatus.Notice(WearRelayNotice.STARTING),WearRelayControl.status)
        } finally { WearRelayControl.stop() }
    }
    @Test fun knownFailuresAndUnknownDeliveryEvidenceStayDistinct() {
        assertEquals(WearRelayStatus.Notice(WearRelayNotice.PERMISSIONS),wearRelayError(WearRelayFailure(WearRelayNotice.PERMISSIONS)))
        val failure=wearRelayError(WorkspaceTransferFailure("Literal response α",true,503)) as WearRelayStatus.Failure
        assertEquals(SyncDiagnostic.Workspace(null,"Literal response α",true,503),failure.problem)
        assertEquals(WearRelayStatus.Failure(SyncDiagnostic.Literal("Literal error β")),wearRelayError(IllegalStateException("Literal error β")))
    }
}
