package local.nourish.healthconnect

import android.content.Context
import org.json.JSONObject

/** All components use the default application process; mutations share this lock. */
class HourlyExportSettings(context:Context):HourlyExportStore {
    private val prefs=context.getSharedPreferences("hourly-health-export",Context.MODE_PRIVATE)
    companion object {private val lock=Any()}
    fun configs():List<HourlyExportConfig> = synchronized(lock) {
        if(NourishingWorkspace.cloudOrigin!=null)return@synchronized emptyList()
        HealthWriteType.entries.mapNotNull {type->
            val raw=prefs.getString("config:${type.wire}",null)?:return@mapNotNull null
            runCatching{val json=JSONObject(raw);HourlyExportConfig(WorkspaceOrigin.parse(json.getString("origin")),json.getString("login"),json.getString("selection"),json.getInt("days"),json.getString("revision")).also{require(it.type==type)}}.getOrNull()
        }
    }
    fun enable(config:HourlyExportConfig)=synchronized(lock){
        val json=JSONObject().put("origin",config.origin.value).put("login",config.login).put("selection",config.selection).put("days",config.days).put("revision",config.revision)
        check(prefs.edit().putString("config:${config.type.wire}",json.toString()).remove("ledger:${config.type.wire}")
            .putString("status:${config.type.wire}",encodeHourlyExportStatus(HourlyExportStatus.Enabled)).commit()){"Could not save hourly export consent."}
    }
    fun stopAll()=synchronized(lock){check(prefs.edit().clear().commit()){"Could not stop saved hourly exports."}}
    override fun current(config:HourlyExportConfig)=synchronized(lock){configs().any{it==config}}
    override fun receipts(config:HourlyExportConfig):Map<String,HealthWriteReceipt> = synchronized(lock) {
        check(current(config));val raw=prefs.getString("ledger:${config.type.wire}",null)?:return@synchronized emptyMap()
        try{parseHealthReceipts(config.type,JSONObject(raw))}catch(error:Exception){throw IllegalStateException("Export verification history is old or invalid. Preview this type and explicitly enable it again before writing.",error)}
    }
    override fun acknowledge(config:HourlyExportConfig,receipts:Map<String,HealthWriteReceipt>)=synchronized(lock){
        check(current(config)){"Hourly export was stopped or changed."}
        check(prefs.edit().putString("ledger:${config.type.wire}",healthReceiptJson(config.type,receipts).toString()).commit()){"Could not retain export acknowledgement. The next run will verify these stable identities again."}
    }
    fun invalidate(type:HealthWriteType)=synchronized(lock){check(prefs.edit().remove("ledger:${type.wire}").commit()){"Could not invalidate the prior export acknowledgement."}}
    fun status(config:HourlyExportConfig,status:HourlyExportStatus)=synchronized(lock){if(current(config))check(prefs.edit().putString("status:${config.type.wire}",encodeHourlyExportStatus(status)).commit())}
    fun snapshots():List<HourlyExportSnapshot> = synchronized(lock) {
        configs().map { config->HourlyExportSnapshot(config,prefs.getString("status:${config.type.wire}",null)?.let(::decodeHourlyExportStatus)) }
    }

}

object NativeHealthWrites {
    private var sequence:HealthWriteSequence?=null
    @Synchronized fun sequence(context:Context):HealthWriteSequence {
        return sequence?:run {
            val prefs=context.applicationContext.getSharedPreferences("health-write-sequence",Context.MODE_PRIVATE)
            HealthWriteSequence(previous={prefs.getLong("version",0)},persist={version->check(prefs.edit().putLong("version",version).commit()){"Could not retain the write revision. Nothing was written."}},beforeOrdinaryWrite={
                check(androidIntakeSessions(context).load()==null){"A food or water correction is pending. Resume it before another native write."}
            }).also{sequence=it}
        }
    }
}
