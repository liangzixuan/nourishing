package local.nourish.healthconnect

import android.content.Context
import org.json.JSONObject
import java.util.UUID

class CloudBackgroundSettings(context:Context){
    private val preferences=context.getSharedPreferences("cloud-health-sync",Context.MODE_PRIVATE)
    companion object{private val lock=Any()}
    fun config():CloudBackgroundConfig?=synchronized(lock){runCatching{CloudBackgroundConfig.parse(JSONObject(preferences.getString("config",null)?:return@synchronized null))}.getOrNull()}
    fun current(value:CloudBackgroundConfig)=config()==value
    fun enable(lease:CloudAccountLease,types:Set<ExportType>,days:Int):CloudBackgroundConfig=synchronized(lock){
        val value=CloudBackgroundConfig(CloudNativeBinding.from(lease),types.toSet(),days,UUID.randomUUID().toString())
        check(preferences.edit().putString("config",value.json().toString()).putString("status","Hourly import enabled").commit())
        value
    }
    fun disable(message:String="Hourly import stopped")=synchronized(lock){check(preferences.edit().remove("config").putString("status",message).commit());Unit}
    fun disableIfCurrent(config:CloudBackgroundConfig,message:String):Boolean=synchronized(lock){
        if(!current(config))false else {disable(message);true}
    }
    fun status(config:CloudBackgroundConfig,message:String)=synchronized(lock){if(current(config))check(preferences.edit().putString("status",message).commit());Unit}
    val status:String get()=preferences.getString("status","Hourly import off").orEmpty()
}

/** Kept apart from legacy PC widget preferences, which are never reassigned. */
class CloudWidgetStore(context:Context){
    private val preferences=context.getSharedPreferences("cloud-home-widgets",Context.MODE_PRIVATE)
    companion object{private val lock=Any()}
    fun config(id:Int):CloudWidgetConfig?=synchronized(lock){runCatching{CloudWidgetConfig.parse(JSONObject(preferences.getString("config-$id",null)?:return@synchronized null))}.getOrNull()}
    fun snapshot(id:Int,config:CloudWidgetConfig):HomeWidgetSnapshot?=synchronized(lock){if(config(id)!=config)return@synchronized null;runCatching{HomeWidgetSnapshot.parseCloud(JSONObject(preferences.getString("snapshot-$id",null)?:return@synchronized null),config)}.getOrNull()}
    fun save(id:Int,config:CloudWidgetConfig,json:JSONObject)=synchronized(lock){HomeWidgetSnapshot.parseCloud(json,config);check(preferences.edit().putString("config-$id",config.json().toString()).putString("snapshot-$id",json.toString()).commit())}
    fun publish(id:Int,requested:CloudWidgetConfig,json:JSONObject?):Boolean=synchronized(lock){
        if(config(id)!=requested)return@synchronized false
        if(json!=null)HomeWidgetSnapshot.parseCloud(json,requested)
        check(preferences.edit().putString("snapshot-$id",json?.toString()).commit());true
    }
    fun clearSnapshots()=synchronized(lock){val edit=preferences.edit();preferences.all.keys.filter{it.startsWith("snapshot-")}.forEach(edit::remove);check(edit.commit())}
    fun delete(id:Int)=synchronized(lock){check(preferences.edit().remove("config-$id").remove("snapshot-$id").commit())}
}
