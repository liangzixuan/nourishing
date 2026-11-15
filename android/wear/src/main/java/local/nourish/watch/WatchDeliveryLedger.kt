package local.nourish.watch

import android.content.Context
import java.time.Instant
import local.nourish.wearcontract.WatchReminderEvent
import org.json.JSONArray
import org.json.JSONObject

/** Durable claim precedes posting. Uncertain claims are never posted again. */
class WatchDeliveryLedger(context:Context){
    private val prefs=context.getSharedPreferences("watch-deliveries",Context.MODE_PRIVATE)
    private data class Record(val id:String,val expiresAt:Instant,val outcome:String)
    private fun read():MutableMap<String,Record>{
        val text=requireNotNull(prefs.getString("events","[]"));require(text.length<=256000);val rows=JSONArray(text);require(rows.length()<=1024)
        val records=mutableMapOf<String,Record>()
        for(index in 0 until rows.length()){val row=rows.getJSONObject(index);val id=row.getString("id");require(Regex("[a-f0-9]{64}").matches(id));val outcome=row.getString("outcome");require(outcome in setOf("accepted","unknown"));require(!records.containsKey(id));records[id]=Record(id,Instant.parse(row.getString("expiresAt")),outcome)}
        return records
    }
    private fun write(records:Map<String,Record>){val rows=JSONArray(records.values.map{JSONObject().put("id",it.id).put("expiresAt",it.expiresAt.toString()).put("outcome",it.outcome)});check(prefs.edit().putString("events",rows.toString()).commit())}
    fun claim(event:WatchReminderEvent,now:Instant):String?=synchronized(lock){
        val records=read();records[event.id]?.let{return@synchronized it.outcome}
        records.entries.removeAll{!now.isBefore(it.value.expiresAt)}
        require(records.size<1024){"Too many active watch deliveries."};require(now.isBefore(event.expiresAt))
        records[event.id]=Record(event.id,event.expiresAt,"unknown");write(records);null
    }
    fun accepted(id:String)=synchronized(lock){val records=read();val previous=requireNotNull(records[id]);records[id]=previous.copy(outcome="accepted");write(records)}
    companion object{private val lock=Any()}
}
