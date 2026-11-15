package local.nourish.healthconnect
import java.time.Instant
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class SyncStatusTest {
 private val at=Instant.parse("2026-11-07T12:00:00Z")
 private val counts=ReconciliationCounts(1,2,3,4,5,6)
 @Test fun persistedFactsRoundTripWithoutDisplayText() {
  val states=SyncNotice.entries.map { SyncStatus.Notice(it) } + SyncError.entries.map { SyncStatus.Failed(at,SyncDiagnostic.Owned(it)) } + listOf(
   SyncStatus.Snapshot(at,ImportCounts(1,2,3),setOf(ExportType.WEIGHT,ExportType.STEPS)),SyncStatus.Reconciled(counts),SyncStatus.HeldRemovals(counts),
   SyncStatus.Failed(at,SyncDiagnostic.Workspace(WorkspaceError.IMPORT_NO_RESULT,WorkspaceError.IMPORT_NO_RESULT.diagnostic,true,503)),
   SyncStatus.Failed(at,SyncDiagnostic.Workspace(null,"Literal server detail",true,503)),SyncStatus.Failed(at,SyncDiagnostic.Unspecified),
   SyncStatus.Failed(at,SyncDiagnostic.Literal("External text")),SyncStatus.Literal("{\"kind\":\"notice\",\"notice\":\"OFF\",\"version\":1}"))
  for(status in states)assertEquals(status,decodeSyncStatus(encodeSyncStatus(status)))
  assertFalse(encodeSyncStatus(SyncStatus.Notice(SyncNotice.ENABLED)).contains("Android decides"))
 }
 @Test fun malformedStatusRetainsEvidenceInsteadOfClaimingSuccessOrOff() {
  val snapshot=JSONObject(encodeSyncStatus(SyncStatus.Snapshot(at,ImportCounts(1,2,3),setOf(ExportType.WEIGHT))))
  val malformed=listOf("not json", "{}", "{\"version\":2,\"kind\":\"notice\",\"notice\":\"OFF\"}",
   "{\"version\":1,\"kind\":\"notice\",\"notice\":\"UNKNOWN\"}",
   snapshot.toString().replace("\"added\":1","\"added\":\"1\""),
   snapshot.toString().replace("[\"WEIGHT\"]","[\"WEIGHT\",\"WEIGHT\"]"),
   snapshot.toString().replace("2026-11-07T12:00:00Z","invalid instant"),
   JSONObject(encodeSyncStatus(SyncStatus.Notice(SyncNotice.OFF))).put("extra",true).toString(),
   JSONObject(encodeSyncStatus(SyncStatus.Failed(at,SyncDiagnostic.Workspace(null,"source",true,503)))).apply{getJSONObject("problem").put("outcomeUnknown","true")}.toString())
  for(raw in malformed)assertEquals(raw,SyncStatus.Literal(raw),decodeSyncStatus(raw))
 }
 @Test fun diagnosticIdentityComesOnlyFromTheProducingException() {
  assertEquals(SyncDiagnostic.Owned(SyncError.ACCESS_REVOKED),captureSyncDiagnostic(SyncStateFailure(SyncError.ACCESS_REVOKED)))
  assertEquals(SyncDiagnostic.Literal(SyncError.ACCESS_REVOKED.diagnostic),captureSyncDiagnostic(IllegalStateException(SyncError.ACCESS_REVOKED.diagnostic)))
  val raw=WorkspaceTransferFailure(WorkspaceError.ACCESS_DENIED.diagnostic,true,503)
  assertEquals(SyncDiagnostic.Workspace(null,raw.detail,true,503),captureSyncDiagnostic(raw))
  val owned=WorkspaceValidationFailure(WorkspaceError.PRIVATE_ADDRESS)
  assertEquals(SyncDiagnostic.Workspace(owned.code,owned.message!!,false,null),captureSyncDiagnostic(owned))
  assertEquals(SyncDiagnostic.Unspecified,captureSyncDiagnostic(Exception()))
 }
 @Test fun reconciliationResultsRetainDistinctHoldReasonsAndAllCounts() {
  assertEquals(SyncStatus.Notice(SyncNotice.PENDING_FOREGROUND),BackgroundReconciliationOutcome.HeldForOwner.syncStatus())
  assertEquals(SyncStatus.HeldRemovals(counts),BackgroundReconciliationOutcome.HeldForRemovals(counts).syncStatus())
  assertEquals(SyncStatus.Reconciled(counts),BackgroundReconciliationOutcome.Acknowledged(counts).syncStatus())
  assertEquals(SyncStatus.Notice(SyncNotice.RECONCILIATION_INACTIVE),BackgroundReconciliationOutcome.Inactive.syncStatus())
 }
}
