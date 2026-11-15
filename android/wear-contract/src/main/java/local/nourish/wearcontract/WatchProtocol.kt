package local.nourish.wearcontract

import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import org.json.JSONArray
import org.json.JSONObject

const val WATCH_SUMMARY_PATH="/nourish/watch/summary"
const val WATCH_CLEAR_PATH="/nourish/watch/cleared"
const val PHONE_CAPABILITY="nourish_phone_v1"
const val MAX_WATCH_BYTES=65536
internal fun JSONObject.text(key:String,max:Int):String = get(key).let { require(it is String && it.length<=max);it }
internal fun readPacket(bytes:ByteArray):JSONObject {
    require(bytes.size in 1..MAX_WATCH_BYTES){"Invalid watch message size."}
    return JSONObject(Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString())
}
fun watchRequest(unit:String):ByteArray { require(unit in setOf("kcal","kJ"));return JSONObject().put("version",1).put("unit",unit).toString().toByteArray(Charsets.UTF_8) }
fun parseWatchRequest(bytes:ByteArray):String {
    val json=readPacket(bytes);require(json.keys().asSequence().toSet()==setOf("version","unit") && json.get("version")==1)
    return json.text("unit",4).also{require(it in setOf("kcal","kJ"))}
}
data class WatchRow(val id:String,val title:String,val value:String,val detail:String,val status:String) {
    fun json()=JSONObject().put("id",id).put("title",title).put("value",value).put("detail",detail).put("status",status)
    companion object { fun parse(json:JSONObject)=WatchRow(json.text("id",100),json.text("title",160),json.text("value",200),json.text("detail",2000),json.text("status",20)).also{require(it.status in setOf("unknown","partial","complete"))} }
}
data class WatchSection(val visible:Boolean,val rows:List<WatchRow>) {
    fun json()=JSONObject().put("visible",visible).put("rows",JSONArray(rows.map{it.json()}))
    companion object { fun parse(json:JSONObject,max:Int):WatchSection {
        val visible=json.get("visible");require(visible is Boolean);val array=json.getJSONArray("rows");require(array.length()<=max && (visible||array.length()==0))
        val rows=(0 until array.length()).map{WatchRow.parse(array.getJSONObject(it))};require(rows.map{it.id}.distinct().size==rows.size)
        return WatchSection(visible,rows)
    } }
}
data class WatchSummary(val asOf:Instant,val date:LocalDate,val zone:ZoneId,val unit:String,val energy:WatchSection,val scores:WatchSection,val targets:WatchSection,val attributions:List<String>) {
    fun json()=JSONObject().put("version",2).put("attributions",JSONArray(attributions)).put("calendar",JSONObject().put("asOf",asOf.toString()).put("today",date.toString()).put("timeZone",zone.id)).put("unit",unit).put("energy",energy.json()).put("scores",scores.json()).put("targets",targets.json())
    companion object { fun parse(json:JSONObject):WatchSummary {
        require(json.get("version")==2);val unit=json.text("unit",4);require(unit in setOf("kcal","kJ"))
        val calendar=json.getJSONObject("calendar");val at=Instant.parse(calendar.text("asOf",40));val date=LocalDate.parse(calendar.text("today",10));val zone=ZoneId.of(calendar.text("timeZone",100));require(at.atZone(zone).toLocalDate()==date)
        val credits=json.getJSONArray("attributions")
        val attributions=(0 until credits.length()).map{credits.get(it).also{credit->require(credit is String&&credit.isNotBlank()){"Invalid source credit."}} as String}
        require(attributions.distinct().size==attributions.size){"Duplicate source credits."}
        val energy=WatchSection.parse(json.getJSONObject("energy"),2);require(energy.visible&&energy.rows.map{it.id}==listOf("consumed","burned"))
        return WatchSummary(at,date,zone,unit,energy,WatchSection.parse(json.getJSONObject("scores"),8),WatchSection.parse(json.getJSONObject("targets"),8),attributions)
    } }
}
data class WatchReply(val status:String,val message:String,val revision:String?,val summary:WatchSummary?) {
    fun bytes():ByteArray {
        val json=JSONObject().put("version",1).put("status",status).put("message",message)
        if(summary!=null)json.put("revision",revision).put("summary",summary.json())
        return json.toString().toByteArray(Charsets.UTF_8).also{require(it.size<=MAX_WATCH_BYTES)}
    }
    companion object {
        fun connected(revision:String,summary:WatchSummary)=WatchReply("connected","",revision,summary)
        fun unavailable(message:String)=WatchReply("unavailable",message,null,null)
        fun parse(bytes:ByteArray):WatchReply {
            val json=readPacket(bytes);require(json.get("version")==1);val status=json.text("status",20);require(status in setOf("connected","unavailable"));val message=json.text("message",500)
            return if(status=="connected")WatchReply(status,message,json.text("revision",100).also{require(it.isNotBlank())},WatchSummary.parse(json.getJSONObject("summary"))) else WatchReply(status,message,null,null)
        }
    }
}
/** Foreground selection and lifetime own which asynchronous reply may render. */
class WatchRequestGate {
    private var revision=0L
    fun begin():Long=++revision
    fun owns(request:Long)=request==revision
    fun clear(){revision++}
}
