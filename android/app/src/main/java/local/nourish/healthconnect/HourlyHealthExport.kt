package local.nourish.healthconnect

import java.security.MessageDigest
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject

data class HourlyExportMetric(val name:String,val unit:String)
sealed interface HourlyExportMapping {
    data object Nutrition:HourlyExportMapping
    data class Hydration(val source:String):HourlyExportMapping
    data class Measurement(val metric:HourlyExportMetric):HourlyExportMapping
    data class Pressure(val systolic:HourlyExportMetric,val diastolic:HourlyExportMetric):HourlyExportMapping
}
data class HourlyExportConfig(val origin:WorkspaceOrigin,val login:String,val selection:String,val days:Int,val revision:String) {
    val type:HealthWriteType
    val timeZone:String
    val mapping:HourlyExportMapping
    init {
        require(login.isNotBlank()&&revision.isNotBlank()&&days in 1..30)
        val value=JSONObject(selection);type=HealthWriteType.fromWire(value.getString("kind"))
        timeZone=value.getString("timeZone");ZoneId.of(timeZone)
        fun metric(key:String):HourlyExportMetric {
            val raw=value.getJSONObject(key);val name=raw.getString("type");val unit=raw.getString("unit")
            require(name.isNotBlank()&&unit in type.units)
            return HourlyExportMetric(name,unit)
        }
        mapping=when(type) {
            HealthWriteType.NUTRITION->{require(value.getString("interval")=="recorded-minute");HourlyExportMapping.Nutrition}
            HealthWriteType.HYDRATION->{require(value.getString("interval")=="recorded-minute");val source=value.getString("waterSource");require(source in setOf("logged","food","both"));HourlyExportMapping.Hydration(source)}
            HealthWriteType.PRESSURE->HourlyExportMapping.Pressure(metric("metric"),metric("secondaryMetric"))
            else->HourlyExportMapping.Measurement(metric("metric"))
        }
    }
    fun selectionAt(now:Instant):JSONObject {
        val value=JSONObject(selection);val today=now.atZone(ZoneId.of(timeZone)).toLocalDate()
        return value.put("from",today.minusDays(days.toLong()-1).toString()).put("to",today.toString())
    }
}

fun reviewedHourlyExport(origin:WorkspaceOrigin,identity:WorkspaceIdentity,plan:HealthWritePlan,now:Instant,revision:String):HourlyExportConfig {
    val selected=JSONObject(plan.selection);val end=LocalDate.parse(selected.getString("to"));val start=LocalDate.parse(selected.getString("from"))
    require(end==now.atZone(ZoneId.of(plan.timeZone)).toLocalDate()){"Hourly export needs a reviewed range ending today in the selected time zone."}
    val days=ChronoUnit.DAYS.between(start,end)+1;require(days in 1..30){"Choose a rolling range of 1 to 30 days."}
    return HourlyExportConfig(origin,identity.login,selected.toString(),days.toInt(),revision)
}

/** One process owns all native writes. A revision is persisted before any insertion. */
class HealthWriteSequence(private val previous:()->Long,private val persist:(Long)->Unit,private val clock:()->Long=System::currentTimeMillis,private val beforeOrdinaryWrite:()->Unit={}) {
    private val mutex=Mutex()
    suspend fun <T> write(action:suspend(Long)->T):T=mutex.withLock {
        beforeOrdinaryWrite()
        val version=nextHealthWriteVersion(clock(),previous());persist(version);action(version)
    }
    /** Review/discard and correction writes share the ordinary writer's lock. */
    suspend fun <T> exclusive(action:suspend()->T):T=mutex.withLock { action() }
    suspend fun <T> correction(minimumVersion:Long,resumeVersion:Long?=null,action:suspend(Long)->T):T=mutex.withLock {
        require(minimumVersion>=0)
        val old=previous();require(old>=0)
        val version=resumeVersion?.also { require(it>minimumVersion) }?:nextHealthWriteVersion(clock(),maxOf(old,minimumVersion))
        if(version>old)persist(version)
        action(version)
    }
}

fun healthPayloadDigest(type:HealthWriteType,row:HealthWriteRow):String {
    val nutrients=JSONArray();row.nutrients.toSortedMap().forEach{(name,value)->nutrients.put(JSONArray().put(name).put(value))}
    val facts=JSONArray().put(type.wire).put(row.clientId).put(row.value).put(row.unit).put(row.secondary ?: JSONObject.NULL)
        .put(row.time.toString()).put(row.offset.toString()).put(row.end?.toString() ?: JSONObject.NULL)
        .put(row.endOffset?.toString() ?: JSONObject.NULL).put(row.name ?: JSONObject.NULL).put(nutrients)
    return MessageDigest.getInstance("SHA-256").digest(facts.toString().toByteArray(Charsets.UTF_8)).joinToString(""){"%02x".format(it)}
}

interface HourlyExportTransport {
    suspend fun preview(config:HourlyExportConfig,selection:JSONObject):HealthWritePlan
    suspend fun verify(config:HourlyExportConfig,plan:HealthWritePlan)
}
interface HourlyExportStore {
    fun current(config:HourlyExportConfig):Boolean
    fun receipts(config:HourlyExportConfig):Map<String,HealthWriteReceipt>
    fun acknowledge(config:HourlyExportConfig,receipts:Map<String,HealthWriteReceipt>)
}
data class HourlyExportResult(val written:Int,val unchanged:Int,val skipped:Int)

fun sameHealthExportSelection(a:JSONObject,b:JSONObject):Boolean {
    val type=HealthWriteType.fromWire(a.getString("kind"))
    if(listOf("kind","from","to","timeZone").any{a.getString(it)!=b.getString(it)})return false
    fun metric(key:String):Boolean {val x=a.getJSONObject(key);val y=b.getJSONObject(key);return listOf("type","unit").all{x.getString(it)==y.getString(it)}}
    return if(type.isIntake)a.getString("interval")==b.getString("interval")&&(type!=HealthWriteType.HYDRATION||a.getString("waterSource")==b.getString("waterSource"))
        else metric("metric")&&(type!=HealthWriteType.PRESSURE||metric("secondaryMetric"))
}

/** Upserts only. Verify acknowledged native copies before applying a fresh source review. */
class HourlyExportCoordinator(private val store:HourlyExportStore,private val transport:HourlyExportTransport,
    private val sink:HealthWriteSink,private val sequence:HealthWriteSequence,private val access:suspend(HourlyExportConfig)->Unit) {
    suspend fun run(config:HourlyExportConfig,now:Instant,progress:HealthWriteProgress=HealthWriteProgress()):HourlyExportResult {
        suspend fun guard(){check(store.current(config)){"Hourly export was stopped or changed."};access(config);check(store.current(config)){"Hourly export was stopped or changed."}}
        guard()
        val selection=config.selectionAt(now);val plan=transport.preview(config,selection)
        require(sameHealthExportSelection(JSONObject(plan.selection),selection)&&plan.type==config.type){"Workspace returned a different export selection."}
        return sequence.write { version->
            guard()
            val saved=store.receipts(config)
            val activeIds=plan.rows.map{it.clientId}.toSet()
            val retained=saved.filterKeys{it in activeIds}
            // Read all retained copies before any insertion, including locally changed rows.
            for(receipt in retained.values){
                kotlinx.coroutines.currentCoroutineContext().ensureActive()
                check(store.current(config)){"Hourly export was stopped or changed."}
                val actual=try{sink.read(plan.type,receipt.nativeId)}catch(error:kotlinx.coroutines.CancellationException){throw error}
                    catch(error:Exception){throw IllegalStateException("A previously exported record is missing or cannot be read. Nothing new was written. Review Health Connect and preview this type again.",error)}
                check(receipt.matches(plan.type,actual)){"A previously exported record changed in Health Connect. Nothing new was written. Review the phone copy before a manual export or new enablement."}
            }
            val changed=plan.rows.filter{row->retained[row.clientId]?.let{healthPayloadDigest(plan.type,it.row)}!=healthPayloadDigest(plan.type,row)}
            transport.verify(config,plan);guard()
            val verified=linkedMapOf<String,HealthWriteReceipt>()
            try {
                val count=if(changed.isEmpty())0 else writeReviewedHealthRecords(plan.copy(rows=changed),sink,version,progress,
                    onVerified={verified[it.row.clientId]=it},beforeWrite={guard()},beforeBatch={guard()})
                guard();store.acknowledge(config,retained+verified)
                HourlyExportResult(count,plan.rows.size-changed.size,plan.skipped.size)
            }catch(error:Throwable){
                // Keep verified partial writes; a failed/unknown write is never acknowledged.
                if(verified.isNotEmpty()&&store.current(config))try{store.acknowledge(config,saved+verified)}catch(persist:Exception){error.addSuppressed(persist)}
                throw error
            }
        }
    }
}
