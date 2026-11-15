package local.nourish.healthconnect

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import org.json.JSONObject

enum class WidgetKind(val key: String) { CONSUMED("consumed"), REMAINING("remaining"), FASTING("fasting") }
data class HomeWidgetConfig(val origin: WorkspaceOrigin, val login: String, val unit: String, val kind: WidgetKind, val revision: String) {
    init { require(login.isNotBlank() && login.length <= 320 && unit in setOf("kcal", "kJ") && revision.isNotBlank()) }
    fun json() = JSONObject().put("origin",origin.value).put("login",login).put("unit",unit).put("kind",kind.name).put("revision",revision)
    companion object {
        fun parse(json: JSONObject) = HomeWidgetConfig(WorkspaceOrigin.parse(json.getString("origin")),json.getString("login"),json.getString("unit"),WidgetKind.valueOf(json.getString("kind")),json.getString("revision"))
    }
}
data class HomeWidgetCard(val title: String, val value: String, val detail: String, val expanded: String, val progress: Int?, val attributions: List<String>)
data class HomeWidgetSnapshot(val asOf: Instant, val date: LocalDate, val zone: ZoneId, val card: HomeWidgetCard) {
    companion object {
        fun parse(json: JSONObject, config: HomeWidgetConfig): HomeWidgetSnapshot {
            require(json.get("version") == 2 && json.getString("unit") == config.unit) { "Update Nourish on the PC." }
            val access = json.getJSONObject("access")
            require(access.getString("mode") == "private" && access.getString("origin") == config.origin.value && access.getString("login") == config.login) { "The widget destination or account changed. Configure it again." }
            return parseCard(json,config.kind)
        }
        fun parseCloud(json:JSONObject,config:CloudWidgetConfig):HomeWidgetSnapshot{
            require(json.get("version")==3&&json.getString("unit")==config.unit){"Update Nourishing."}
            val access=json.getJSONObject("access")
            require(access.getString("mode")=="cloud"&&access.getString("origin")==config.binding.origin.value&&access.getString("accountId")==config.binding.accountId){"The widget account changed. Configure it again."}
            return parseCard(json,config.kind)
        }
        private fun parseCard(json:JSONObject,kind:WidgetKind):HomeWidgetSnapshot{
            val calendar = json.getJSONObject("calendar")
            val at = Instant.parse(calendar.getString("asOf"));val date = LocalDate.parse(calendar.getString("today"));val zone = ZoneId.of(calendar.getString("timeZone"))
            require(at.atZone(zone).toLocalDate() == date) { "Invalid widget date." }
            val card = json.getJSONObject("cards").getJSONObject(kind.key)
            fun text(key: String, limit: Int): String = card.get(key).let { require(it is String && it.length <= limit) { "Invalid widget text." };it }
            val credits=card.getJSONArray("attributions")
            val attributions=(0 until credits.length()).map{credits.get(it).also{credit->require(credit is String&&credit.isNotBlank()){"Invalid widget source credit."}} as String}
            require(attributions.distinct().size==attributions.size){"Duplicate widget source credits."}
            require(kind!=WidgetKind.FASTING||attributions.isEmpty()){"Fasting cards do not use nutrition source credits."}
            val progress = card.get("progress").let {
                if (it == JSONObject.NULL) null else { require(it is Number && it.toDouble().isFinite() && it.toDouble() % 1.0 == 0.0 && it.toDouble() in 0.0..100.0);it.toInt() }
            }
            return HomeWidgetSnapshot(at,date,zone,HomeWidgetCard(text("title",100),text("value",200),text("detail",2000),text("expanded",4000),progress,attributions))
        }
    }
}
suspend fun WorkspaceClient.widgetSnapshot(config: HomeWidgetConfig): JSONObject {
    val json = exchange(config.origin,"/api/home-widgets?unit=${config.unit}")
    HomeWidgetSnapshot.parse(json,config)
    return json
}

/** A response belongs only to the saved widget configuration that requested it. */
fun ownsWidgetResult(current: HomeWidgetConfig?, requested: HomeWidgetConfig): Boolean = current == requested
