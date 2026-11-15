package local.nourish.healthconnect

import android.content.Context
import java.util.UUID
import local.nourish.wearcontract.WatchReply
import local.nourish.wearcontract.WatchSummary
import org.json.JSONObject

data class WearConfig(val origin:WorkspaceOrigin,val login:String,val revision:String)
class WearSettings(context:Context) {
    private val prefs=context.getSharedPreferences("wear-access",Context.MODE_PRIVATE)
    fun config():WearConfig?=synchronized(lock){
        if(NourishingWorkspace.cloudOrigin!=null)return@synchronized null
        if(!prefs.getBoolean("enabled",false))null else runCatching{WearConfig(WorkspaceOrigin.parse(prefs.getString("origin",null)!!),prefs.getString("login",null)!!.also{require(it.isNotBlank())},prefs.getString("revision",null)!!.also{require(it.isNotBlank())})}.getOrNull()
    }
    fun enable(origin:WorkspaceOrigin,identity:WorkspaceIdentity)=synchronized(lock){check(prefs.edit().putBoolean("enabled",true).putString("origin",origin.value).putString("login",identity.login).putString("revision",UUID.randomUUID().toString()).commit())}
    fun clear()=synchronized(lock){check(prefs.edit().clear().commit())}
    companion object { private val lock=Any() }
}
/** Captured authority must still exist after the read finishes. */
suspend fun readWearReply(unit:String,current:()->WearConfig?,message:(WearReplyNotice)->String,fetch:suspend(WearConfig,String)->JSONObject):WatchReply {
    require(unit in setOf("kcal","kJ"))
    val requested=current()?:return WatchReply.unavailable(message(WearReplyNotice.DISABLED))
    val json=fetch(requested,unit)
    if(current()!=requested)return WatchReply.unavailable(message(WearReplyNotice.CHANGED))
    requireWearAccount(json,requested)
    val summary=WatchSummary.parse(json);require(summary.unit==unit)
    return WatchReply.connected(requested.revision,summary)
}
fun requireWearAccount(json:JSONObject,requested:WearConfig){
    val access=json.getJSONObject("access")
    require(access.getString("mode")=="private"&&access.getString("origin")==requested.origin.value&&access.getString("login")==requested.login){"The private workspace account changed."}
}
