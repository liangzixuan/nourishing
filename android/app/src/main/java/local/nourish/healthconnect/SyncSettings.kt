package local.nourish.healthconnect

import android.content.Context
import java.util.UUID

enum class BackgroundSyncMode { SNAPSHOT, RECONCILIATION }
data class BackgroundSyncConfig(val origin: WorkspaceOrigin, val login: String, val types: Set<ExportType>, val days: Int, val revision: String,
    val mode:BackgroundSyncMode=BackgroundSyncMode.SNAPSHOT,val allowRemovals:Boolean=false) {
    init { require(login.isNotBlank() && types.isNotEmpty() && days in 1..30 && revision.isNotBlank());require(mode==BackgroundSyncMode.RECONCILIATION||!allowRemovals){"Snapshot sync cannot gain removal authority."} }
}

/** SharedPreferences adapter values are parsed once. An old enabled snapshot
 * has no reconciliation or removal grant; malformed settings stay inactive. */
fun parseBackgroundSyncConfig(values:Map<String,*>):BackgroundSyncConfig?=runCatching {
    if(values["enabled"]!=true)return@runCatching null
    val types=values["types"] as? Set<*>?:error("Missing selected types")
    val mode=if(values.containsKey("mode"))BackgroundSyncMode.valueOf(values["mode"] as String) else BackgroundSyncMode.SNAPSHOT
    val removals=if(values.containsKey("allow-removals"))values["allow-removals"] as Boolean else false
    BackgroundSyncConfig(WorkspaceOrigin.parse(values["origin"] as String),values["login"] as String,types.map{ExportType.valueOf(it as String)}.toSet(),if(values.containsKey("days"))values["days"] as Int else 7,values["revision"] as String,mode,removals)
}.getOrNull()

class SyncSettings(context: Context) {
    private val preferences = context.getSharedPreferences("private-workspace-sync", Context.MODE_PRIVATE)
    val origin: String get() = preferences.getString("origin", "").orEmpty()
    val status: SyncStatus get() {
        val values=preferences.all
        if(values.containsKey("status-state"))return (values["status-state"] as? String)?.let(::decodeSyncStatus) ?: SyncStatus.Literal(values["status-state"].toString())
        return values["status"]?.let { SyncStatus.Literal(it.toString()) } ?: SyncStatus.Notice(SyncNotice.OFF)
    }
    private fun android.content.SharedPreferences.Editor.status(status: SyncStatus) = putString("status-state",encodeSyncStatus(status)).remove("status")
    fun saveOrigin(origin: WorkspaceOrigin) { checkSync(preferences.edit().putString("origin", origin.value).commit(),SyncError.SAVE_ADDRESS) }
    fun confirm(origin: WorkspaceOrigin, identity: WorkspaceIdentity) {
        checkSync(preferences.edit().putString("confirmed-origin", origin.value).putString("confirmed-login", identity.login).commit(),SyncError.SAVE_CONFIRMATION)
    }
    fun isConfirmed(origin: WorkspaceOrigin, identity: WorkspaceIdentity): Boolean =
        preferences.getString("confirmed-origin", null) == origin.value && preferences.getString("confirmed-login", null) == identity.login
    fun background(): BackgroundSyncConfig? = if(NourishingWorkspace.cloudOrigin!=null)null else parseBackgroundSyncConfig(preferences.all)
    fun enable(origin: WorkspaceOrigin, identity: WorkspaceIdentity, types: Set<ExportType>, days: Int,mode:BackgroundSyncMode=BackgroundSyncMode.SNAPSHOT,allowRemovals:Boolean=false): BackgroundSyncConfig {
        checkSync(isConfirmed(origin, identity),SyncError.CONFIRM_FIRST)
        val config = BackgroundSyncConfig(origin, identity.login, types.toSet(), days, UUID.randomUUID().toString(),mode,allowRemovals)
        checkSync(preferences.edit().putString("origin", origin.value).putString("login", config.login)
            .putStringSet("types", config.types.map { it.name }.toSet()).putInt("days", days)
            .putString("revision", config.revision).putString("mode",config.mode.name).putBoolean("allow-removals",config.allowRemovals).putBoolean("enabled", true)
            .status(SyncStatus.Notice(SyncNotice.ENABLED)).commit(),SyncError.SAVE_CONFIGURATION)
        return config
    }
    fun disable(notice: SyncNotice = SyncNotice.STOPPED) {
        require(notice in setOf(SyncNotice.STOPPED,SyncNotice.DESTINATION_EDITED,SyncNotice.SELECTION_EDITED))
        checkSync(preferences.edit().putBoolean("enabled", false).putString("revision", UUID.randomUUID().toString()).status(SyncStatus.Notice(notice)).commit(),SyncError.STOP_FAILED)
    }
    fun current(config: BackgroundSyncConfig): Boolean = background() == config
    fun status(config: BackgroundSyncConfig, status: SyncStatus) {
        if (current(config)) preferences.edit().status(status).apply()
    }
}
