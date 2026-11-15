package local.nourish.healthconnect

import java.time.Instant
import org.json.JSONArray
import org.json.JSONObject

/** Persist facts; resolve display language only at the Android presentation boundary. */
sealed interface SyncStatus {
    data class Notice(val notice: SyncNotice): SyncStatus
    data class Snapshot(val at: Instant, val counts: ImportCounts, val denied: Set<ExportType>): SyncStatus
    data class Reconciled(val counts: ReconciliationCounts): SyncStatus
    data class HeldRemovals(val counts: ReconciliationCounts): SyncStatus
    data class Failed(val at: Instant, val problem: SyncDiagnostic): SyncStatus
    data class Literal(val text: String): SyncStatus
}
sealed interface SyncDiagnostic {
    data class Export(val code:ExportFailureCode): SyncDiagnostic
    data class Owned(val code: SyncError): SyncDiagnostic
    data class Workspace(val code: WorkspaceError?, val detail: String, val outcomeUnknown: Boolean, val httpStatus: Int?): SyncDiagnostic
    data class Literal(val text: String): SyncDiagnostic
    data object Unspecified: SyncDiagnostic
}
fun captureSyncDiagnostic(error: Throwable): SyncDiagnostic = when(error) {
    is OwnedExportFailure -> SyncDiagnostic.Export(error.code)
    is SyncStateFailure -> SyncDiagnostic.Owned(error.code)
    is WorkspaceValidationFailure -> SyncDiagnostic.Workspace(error.code, error.code.diagnostic, false, null)
    is WorkspaceTransferFailure -> SyncDiagnostic.Workspace(error.code, error.detail, error.outcomeUnknown, error.httpStatus)
    else -> error.message?.let { SyncDiagnostic.Literal(it.take(2000)) } ?: SyncDiagnostic.Unspecified
}
private fun statusKeys(json: JSONObject, vararg names: String) { require(json.keys().asSequence().toSet() == names.toSet()) }
private fun JSONObject.statusString(key: String) = get(key) as String
private fun importCountsJson(counts: ImportCounts) = JSONObject().put("added",counts.added).put("updated",counts.updated).put("unchanged",counts.unchanged)
private fun reconciliationCountsJson(counts: ReconciliationCounts) = JSONObject().put("added",counts.added).put("updated",counts.updated).put("unchanged",counts.unchanged).put("deleted",counts.deleted).put("replaced",counts.replaced).put("invalidated",counts.invalidated)
internal fun syncDiagnosticJson(problem: SyncDiagnostic): JSONObject = when(problem) {
    is SyncDiagnostic.Export -> JSONObject().put("kind","export").put("code",problem.code.name)
    is SyncDiagnostic.Owned -> JSONObject().put("kind","owned").put("code",problem.code.name)
    is SyncDiagnostic.Workspace -> JSONObject().put("kind","workspace").put("code",problem.code?.name ?: JSONObject.NULL).put("detail",problem.detail).put("outcomeUnknown",problem.outcomeUnknown).put("httpStatus",problem.httpStatus ?: JSONObject.NULL)
    is SyncDiagnostic.Literal -> JSONObject().put("kind","literal").put("text",problem.text)
    SyncDiagnostic.Unspecified -> JSONObject().put("kind","unspecified")
}
internal fun parseSyncDiagnostic(json: JSONObject): SyncDiagnostic = when(json.statusString("kind")) {
    "export" -> { statusKeys(json,"kind","code");SyncDiagnostic.Export(ExportFailureCode.valueOf(json.statusString("code"))) }
    "owned" -> { statusKeys(json,"kind","code");SyncDiagnostic.Owned(SyncError.valueOf(json.statusString("code"))) }
    "workspace" -> {
        statusKeys(json,"kind","code","detail","outcomeUnknown","httpStatus")
        val status=if(json.isNull("httpStatus"))null else (json.get("httpStatus") as Int).also{require(it in 100..599)}
        SyncDiagnostic.Workspace(if(json.isNull("code"))null else WorkspaceError.valueOf(json.statusString("code")),json.statusString("detail"),json.get("outcomeUnknown") as Boolean,status)
    }
    "literal" -> {statusKeys(json,"kind","text");SyncDiagnostic.Literal(json.statusString("text"))}
    "unspecified" -> {statusKeys(json,"kind");SyncDiagnostic.Unspecified}
    else -> error("Unknown sync diagnostic")
}
fun encodeSyncStatus(status: SyncStatus): String {
    val json=when(status) {
        is SyncStatus.Notice -> JSONObject().put("kind","notice").put("notice",status.notice.name)
        is SyncStatus.Snapshot -> JSONObject().put("kind","snapshot").put("at",status.at.toString()).put("counts",importCountsJson(status.counts)).put("denied",JSONArray(status.denied.map{it.name}))
        is SyncStatus.Reconciled -> JSONObject().put("kind","reconciled").put("counts",reconciliationCountsJson(status.counts))
        is SyncStatus.HeldRemovals -> JSONObject().put("kind","held-removals").put("counts",reconciliationCountsJson(status.counts))
        is SyncStatus.Failed -> JSONObject().put("kind","failed").put("at",status.at.toString()).put("problem",syncDiagnosticJson(status.problem))
        is SyncStatus.Literal -> JSONObject().put("kind","literal").put("text",status.text)
    }
    return json.put("version",1).toString()
}
/** Unknown or malformed status remains visible evidence, never a fabricated success/off state. */
fun decodeSyncStatus(raw: String): SyncStatus = try {
    val json=JSONObject(raw);require(json.get("version")==1)
    when(json.statusString("kind")) {
        "notice" -> {statusKeys(json,"version","kind","notice");SyncStatus.Notice(SyncNotice.valueOf(json.statusString("notice")))}
        "snapshot" -> {
            statusKeys(json,"version","kind","at","counts","denied")
            val counts=json.getJSONObject("counts");statusKeys(counts,"added","updated","unchanged")
            val denied=json.getJSONArray("denied");require(denied.length()<=ExportType.entries.size)
            val types=(0 until denied.length()).map{ExportType.valueOf(denied.get(it) as String)};require(types.distinct().size==types.size)
            SyncStatus.Snapshot(Instant.parse(json.statusString("at")),importCounts(counts),types.toSet())
        }
        "reconciled" -> {statusKeys(json,"version","kind","counts");SyncStatus.Reconciled(reconciliationCounts(json.getJSONObject("counts")))}
        "held-removals" -> {statusKeys(json,"version","kind","counts");SyncStatus.HeldRemovals(reconciliationCounts(json.getJSONObject("counts")))}
        "failed" -> {statusKeys(json,"version","kind","at","problem");SyncStatus.Failed(Instant.parse(json.statusString("at")),parseSyncDiagnostic(json.getJSONObject("problem")))}
        "literal" -> {statusKeys(json,"version","kind","text");SyncStatus.Literal(json.statusString("text"))}
        else -> error("Unknown sync status")
    }
} catch (_: Exception) { SyncStatus.Literal(raw) }
fun BackgroundReconciliationOutcome.syncStatus(): SyncStatus = when(this) {
    BackgroundReconciliationOutcome.Inactive -> SyncStatus.Notice(SyncNotice.RECONCILIATION_INACTIVE)
    BackgroundReconciliationOutcome.HeldForOwner -> SyncStatus.Notice(SyncNotice.PENDING_FOREGROUND)
    is BackgroundReconciliationOutcome.HeldForRemovals -> SyncStatus.HeldRemovals(counts)
    is BackgroundReconciliationOutcome.Acknowledged -> SyncStatus.Reconciled(counts)
}
