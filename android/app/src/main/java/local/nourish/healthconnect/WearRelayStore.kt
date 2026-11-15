package local.nourish.healthconnect

import android.content.Context
import java.security.MessageDigest
import java.util.UUID
import org.json.JSONObject

/** Registration evidence survives stopping the service; absence is never inferred from malformed data. */
class WearRelayStore(context:Context):WearRelayRegistrations{
    private val prefs=context.getSharedPreferences("wear-relay",Context.MODE_PRIVATE)
    private fun hash(text:String)=MessageDigest.getInstance("SHA-256").digest(text.toByteArray(Charsets.UTF_8)).joinToString(""){"%02x".format(it)}
    private fun key(config:WearConfig,node:String)=hash(config.origin.value+"\u0000"+config.login+"\u0000"+node)
    override fun clientId(config:WearConfig,node:String):String=synchronized(lock){
        var seed=prefs.getString("seed",null)
        if(seed==null){seed=UUID.randomUUID().toString();check(prefs.edit().putString("seed",seed).commit())}
        hash(seed+"\u0000"+key(config,node))
    }
    override fun load(config:WearConfig,node:String):WearRegistration?=synchronized(lock){
        val value=prefs.getString("registration-"+key(config,node),null)?:return@synchronized null
        val json=JSONObject(value);val array=json.getJSONArray("kinds");require(array.length()<=2)
        val kinds=(0 until array.length()).map{array.getString(it)};require(kinds.distinct().size==kinds.size)
        WearRegistration(json.getString("deviceId"),json.getString("revision"),kinds.toSet())
    }
    override fun save(config:WearConfig,node:String,value:WearRegistration)=synchronized(lock){check(prefs.edit().putString("registration-"+key(config,node),value.json().toString()).commit())}
    /** Explicit reconnect permits a server-removed device to register again with its stable client ID. */
    fun reconnect()=synchronized(lock){val edit=prefs.edit();prefs.all.keys.filter{it.startsWith("registration-")}.forEach{edit.remove(it)};check(edit.commit())}
    companion object{private val lock=Any()}
}

/** Process lifetime is intentional: a killed relay stays stopped until the user starts it again. */
object WearRelayControl{
    @Volatile var run:WearRelayRun?=null;private set
    @Volatile var status:WearRelayStatus=WearRelayStatus.Notice(WearRelayNotice.STOPPED);private set
    @Synchronized fun begin(config:WearConfig):WearRelayRun=WearRelayRun(config,UUID.randomUUID().toString()).also{run=it;status=WearRelayStatus.Notice(WearRelayNotice.STARTING)}
    @Synchronized fun update(expected:WearRelayRun,message:WearRelayStatus){if(run==expected)status=message}
    @Synchronized fun notice(message:WearRelayStatus){if(run==null)status=message}
    @Synchronized fun stop(expected:WearRelayRun?=run,message:WearRelayStatus=WearRelayStatus.Notice(WearRelayNotice.STOPPED)){if(run==expected){run=null;status=message}}
}
