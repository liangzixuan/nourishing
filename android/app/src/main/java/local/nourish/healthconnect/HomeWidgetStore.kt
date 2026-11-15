package local.nourish.healthconnect

import android.content.Context
import org.json.JSONObject

class HomeWidgetStore(context: Context) {
    private val preferences = context.getSharedPreferences("home-screen-widgets",Context.MODE_PRIVATE)
    companion object { val lock = Any() }
    fun config(id: Int): HomeWidgetConfig? = synchronized(lock) { if(NourishingWorkspace.cloudOrigin!=null)return@synchronized null;runCatching { HomeWidgetConfig.parse(JSONObject(preferences.getString("config-$id",null) ?: return@synchronized null)) }.getOrNull() }
    fun snapshot(id: Int, config: HomeWidgetConfig): HomeWidgetSnapshot? = synchronized(lock) { runCatching { HomeWidgetSnapshot.parse(JSONObject(preferences.getString("snapshot-$id",null) ?: return@synchronized null),config) }.getOrNull() }
    fun save(id: Int, config: HomeWidgetConfig, json: JSONObject) = synchronized(lock) {
        HomeWidgetSnapshot.parse(json,config)
        check(preferences.edit().putString("config-$id",config.json().toString()).putString("snapshot-$id",json.toString()).commit()) { "Could not save widget." }
    }
    fun publish(id: Int, requested: HomeWidgetConfig, json: JSONObject?): Boolean = synchronized(lock) {
        if (!ownsWidgetResult(config(id),requested)) return@synchronized false
        if (json != null) HomeWidgetSnapshot.parse(json,requested)
        check(preferences.edit().putString("snapshot-$id",json?.toString()).commit()) { "Could not save widget refresh." }
        true
    }
    fun delete(id: Int) = synchronized(lock) { check(preferences.edit().remove("config-$id").remove("snapshot-$id").commit()) }
}
