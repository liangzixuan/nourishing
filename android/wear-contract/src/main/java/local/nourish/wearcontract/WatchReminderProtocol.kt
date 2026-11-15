package local.nourish.wearcontract

import java.time.Duration
import java.time.Instant
import org.json.JSONArray
import org.json.JSONObject

const val WATCH_ALERT_STATE_PATH="/nourish/watch/alert-state"
const val WATCH_ALERT_DELIVERY_PATH="/nourish/watch/alert"
const val WATCH_CAPABILITY="nourish_watch_v1"
private val revisionPattern=Regex("[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}")
private fun revision(value:String)=value.also{require(revisionPattern.matches(it))}
private fun deliveryId(value:String)=value.also{require(Regex("[a-f0-9]{64}").matches(it))}
private fun packet(value:JSONObject)=value.toString().toByteArray(Charsets.UTF_8).also{require(it.size<=MAX_WATCH_BYTES)}
private fun kinds(array:JSONArray):Set<String>{require(array.length()<=2);val values=(0 until array.length()).map{array.get(it).also{v->require(v is String&&v in setOf("food","fasting"))} as String};require(values.distinct().size==values.size);return values.toSet()}
private fun JSONObject.flag(key:String)=get(key).also{require(it is Boolean)} as Boolean

data class WatchReminderEvent(val id:String,val kind:String,val dueAt:Instant,val expiresAt:Instant){
    init{deliveryId(id);require(kind in setOf("food","fasting"));require(Duration.between(dueAt,expiresAt)==Duration.ofMinutes(15))}
    fun json()=JSONObject().put("id",id).put("kind",kind).put("dueAt",dueAt.toString()).put("expiresAt",expiresAt.toString())
    companion object{fun parse(json:JSONObject)=WatchReminderEvent(json.text("id",64),json.text("kind",10),Instant.parse(json.text("dueAt",40)),Instant.parse(json.text("expiresAt",40)))}
}
/** Server authority is checked by the phone's WorkspaceClient owner before use. */
data class WatchReminderBatch(val asOf:Instant,val paused:Boolean,val events:List<WatchReminderEvent>){
    companion object{fun parse(json:JSONObject):WatchReminderBatch{
        require(json.get("version")==1);val at=Instant.parse(json.text("asOf",40));val paused=json.flag("paused");val rows=json.getJSONArray("events");require(rows.length()<=24&&(!paused||rows.length()==0))
        val events=(0 until rows.length()).map{WatchReminderEvent.parse(rows.getJSONObject(it))};require(events.map{it.id}.distinct().size==events.size);require(events.all{!at.isBefore(it.dueAt)&&!at.isAfter(it.expiresAt)})
        return WatchReminderBatch(at,paused,events)
    }}
}
fun alertStateRequest(phoneRevision:String)=packet(JSONObject().put("version",1).put("phoneRevision",revision(phoneRevision)))
fun parseAlertStateRequest(bytes:ByteArray):String{val json=readPacket(bytes);require(json.get("version")==1&&json.keys().asSequence().toSet()==setOf("version","phoneRevision"));return revision(json.text("phoneRevision",36))}
data class WatchAlertState(val phoneRevision:String?,val preferenceRevision:String?,val kinds:Set<String>){
    fun bytes():ByteArray{
        val json=JSONObject().put("version",1).put("available",phoneRevision!=null)
        if(phoneRevision!=null){revision(phoneRevision);revision(requireNotNull(preferenceRevision));require(kinds.all{it in setOf("food","fasting")});json.put("phoneRevision",phoneRevision).put("preferenceRevision",preferenceRevision).put("kinds",JSONArray(kinds.sorted()))}
        else require(preferenceRevision==null&&kinds.isEmpty())
        return packet(json)
    }
    companion object{
        fun unavailable()=WatchAlertState(null,null,emptySet())
        fun parse(bytes:ByteArray):WatchAlertState{val json=readPacket(bytes);require(json.get("version")==1);return if(!json.flag("available"))unavailable() else WatchAlertState(revision(json.text("phoneRevision",36)),revision(json.text("preferenceRevision",36)),kinds(json.getJSONArray("kinds")))}
    }
}
data class WatchAlertDelivery(val phoneRevision:String,val preferenceRevision:String,val asOf:Instant,val event:WatchReminderEvent){
    init{revision(phoneRevision);revision(preferenceRevision);require(!asOf.isBefore(event.dueAt)&&!asOf.isAfter(event.expiresAt))}
    fun bytes()=packet(JSONObject().put("version",1).put("phoneRevision",phoneRevision).put("preferenceRevision",preferenceRevision).put("asOf",asOf.toString()).put("event",event.json()))
    companion object{fun parse(bytes:ByteArray):WatchAlertDelivery{val json=readPacket(bytes);require(json.get("version")==1);return WatchAlertDelivery(json.text("phoneRevision",36),json.text("preferenceRevision",36),Instant.parse(json.text("asOf",40)),WatchReminderEvent.parse(json.getJSONObject("event")))}}
}
data class WatchAlertReceipt(val id:String,val outcome:String,val reason:String){
    fun bytes():ByteArray{deliveryId(id);require(outcome in setOf("accepted","rejected","unknown"));require(reason.length in 1..50);return packet(JSONObject().put("version",1).put("id",id).put("outcome",outcome).put("reason",reason))}
    companion object{fun parse(bytes:ByteArray):WatchAlertReceipt{val json=readPacket(bytes);require(json.get("version")==1);return WatchAlertReceipt(deliveryId(json.text("id",64)),json.text("outcome",20).also{require(it in setOf("accepted","rejected","unknown"))},json.text("reason",50))}}
}
data class WatchAlertPolicy(val phone:String,val phoneRevision:String,val preferenceRevision:String,val kinds:Set<String>,val enabledAt:Instant){
    fun rejection(sender:String,delivery:WatchAlertDelivery,now:Instant,permissionGranted:Boolean):String?=when{
        sender!=phone->"wrong-phone"
        delivery.phoneRevision!=phoneRevision||delivery.preferenceRevision!=preferenceRevision->"changed"
        delivery.event.kind !in kinds->"disabled"
        delivery.event.dueAt.isBefore(enabledAt)->"before-opt-in"
        !permissionGranted->"permission"
        now.isBefore(delivery.event.dueAt)||!now.isBefore(delivery.event.expiresAt)->"expired"
        else->null
    }
}
