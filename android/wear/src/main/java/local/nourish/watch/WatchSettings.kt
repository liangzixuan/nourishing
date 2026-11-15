package local.nourish.watch

import android.content.Context
import java.time.Instant
import java.util.UUID
import local.nourish.wearcontract.WatchAlertPolicy

data class WatchConnection(val phone:String?,val enabled:Boolean,val unit:String,val revision:String?,val preferenceRevision:String?,val kinds:Set<String>,val enabledAt:Instant?){
    fun policy():WatchAlertPolicy?=if(enabled&&phone!=null&&revision!=null&&preferenceRevision!=null&&enabledAt!=null)WatchAlertPolicy(phone,revision,preferenceRevision,kinds,enabledAt) else null
}
/** One owner for display selection and notification consent, shared with the listener service. */
class WatchSettings(context:Context){
    private val prefs=context.getSharedPreferences("watch-connection",Context.MODE_PRIVATE)
    fun read():WatchConnection=synchronized(lock){WatchConnection(prefs.getString("phone",null),prefs.getBoolean("enabled",false),prefs.getString("unit","kcal")?.takeIf{it in setOf("kcal","kJ")}?:"kcal",prefs.getString("revision",null),prefs.getString("preferenceRevision",null),prefs.getStringSet("kinds",emptySet())?.toSet().orEmpty(),prefs.getString("enabledAt",null)?.let{runCatching{Instant.parse(it)}.getOrNull()})}
    fun selectPhone(phone:String,now:Instant=Instant.now())=synchronized(lock){
        require(phone.isNotBlank()&&phone.length<=256)
        check(prefs.edit().putString("phone",phone).putBoolean("enabled",true).remove("revision").putStringSet("kinds",emptySet()).putString("preferenceRevision",UUID.randomUUID().toString()).putString("enabledAt",now.toString()).commit())
    }
    fun confirmRevision(phone:String,revision:String,now:Instant=Instant.now()):Boolean=synchronized(lock){
        val current=read();if(!current.enabled||current.phone!=phone)return@synchronized false
        require(revision.isNotBlank())
        if(current.revision!=revision)check(prefs.edit().putString("revision",revision).putStringSet("kinds",emptySet()).putString("preferenceRevision",UUID.randomUUID().toString()).putString("enabledAt",now.toString()).commit())
        true
    }
    fun setKinds(kinds:Set<String>,now:Instant=Instant.now())=synchronized(lock){
        require(kinds.all{it in setOf("food","fasting")});check(read().policy()!=null){"Connect to your phone first."}
        if(read().kinds!=kinds)check(prefs.edit().putStringSet("kinds",kinds).putString("preferenceRevision",UUID.randomUUID().toString()).putString("enabledAt",now.toString()).commit())
    }
    fun setUnit(unit:String)=synchronized(lock){require(unit in setOf("kcal","kJ"));check(prefs.edit().putString("unit",unit).commit())}
    fun disconnect()=synchronized(lock){val unit=read().unit;check(prefs.edit().clear().putString("unit",unit).commit())}
    companion object{internal val lock=Any()}
}
