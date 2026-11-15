package local.nourish.healthconnect

import java.time.Instant
import org.json.JSONObject

/** Persist export facts; interpret language only when displaying the saved result. */
sealed interface HourlyExportStatus {
    data object Enabled: HourlyExportStatus
    data class Completed(val at: Instant, val written: Int, val unchanged: Int, val skipped: Int): HourlyExportStatus
    data class Interrupted(val at: Instant, val attempted: Int, val confirmed: Int): HourlyExportStatus
    data class Failed(val at: Instant, val attempted: Int, val confirmed: Int, val problem: SyncDiagnostic): HourlyExportStatus
    data class Literal(val text: String): HourlyExportStatus
}
private fun keys(json: JSONObject, vararg keys: String) { require(json.keys().asSequence().toSet()==keys.toSet()) }
private fun JSONObject.count(key: String) = (get(key) as Int).also { require(it>=0) }
private fun progress(attempted: Int, confirmed: Int) { require(confirmed>=0 && attempted>=confirmed) }
fun encodeHourlyExportStatus(status: HourlyExportStatus): String {
    val json=when(status) {
        HourlyExportStatus.Enabled -> JSONObject().put("kind","enabled")
        is HourlyExportStatus.Completed -> {
            require(status.written>=0 && status.unchanged>=0 && status.skipped>=0)
            JSONObject().put("kind","completed").put("at",status.at.toString()).put("written",status.written).put("unchanged",status.unchanged).put("skipped",status.skipped)
        }
        is HourlyExportStatus.Interrupted -> {
            progress(status.attempted,status.confirmed)
            JSONObject().put("kind","interrupted").put("at",status.at.toString()).put("attempted",status.attempted).put("confirmed",status.confirmed)
        }
        is HourlyExportStatus.Failed -> {
            progress(status.attempted,status.confirmed)
            JSONObject().put("kind","failed").put("at",status.at.toString()).put("attempted",status.attempted).put("confirmed",status.confirmed).put("problem",syncDiagnosticJson(status.problem))
        }
        is HourlyExportStatus.Literal -> JSONObject().put("kind","literal").put("text",status.text)
    }
    return json.put("version",1).toString()
}
/** Historic or unreadable status is retained verbatim, never reported as success. */
fun decodeHourlyExportStatus(raw: String): HourlyExportStatus = try {
    val json=JSONObject(raw);require(json.get("version")==1)
    when(json.get("kind") as String) {
        "enabled" -> { keys(json,"version","kind");HourlyExportStatus.Enabled }
        "completed" -> { keys(json,"version","kind","at","written","unchanged","skipped");HourlyExportStatus.Completed(Instant.parse(json.get("at") as String),json.count("written"),json.count("unchanged"),json.count("skipped")) }
        "interrupted" -> {
            keys(json,"version","kind","at","attempted","confirmed");val attempted=json.count("attempted");val confirmed=json.count("confirmed");progress(attempted,confirmed)
            HourlyExportStatus.Interrupted(Instant.parse(json.get("at") as String),attempted,confirmed)
        }
        "failed" -> {
            keys(json,"version","kind","at","attempted","confirmed","problem");val attempted=json.count("attempted");val confirmed=json.count("confirmed");progress(attempted,confirmed)
            HourlyExportStatus.Failed(Instant.parse(json.get("at") as String),attempted,confirmed,parseSyncDiagnostic(json.getJSONObject("problem")))
        }
        "literal" -> { keys(json,"version","kind","text");HourlyExportStatus.Literal(json.get("text") as String) }
        else -> error("Unknown hourly export status")
    }
} catch(_: Exception) { HourlyExportStatus.Literal(raw) }

data class HourlyExportSnapshot(val config: HourlyExportConfig, val status: HourlyExportStatus?)
