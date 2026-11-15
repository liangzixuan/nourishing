package local.nourish.healthconnect

import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.Record
import kotlin.reflect.KClass
import androidx.health.connect.client.records.metadata.Metadata
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import org.json.JSONObject

const val NOURISH_WRITE_PREFIX="nourish-export:"
fun isNourishExport(record:Record)=record.metadata.dataOrigin.packageName=="local.nourish.healthconnect" && record.metadata.clientRecordId?.startsWith(NOURISH_WRITE_PREFIX)==true

data class HealthWriteRow(val id:String,val clientId:String,val value:Double,val unit:String,val secondary:Double?=null,val time:Instant,val offset:ZoneOffset,val description:String,val end:Instant?=null,val endOffset:ZoneOffset?=null,val name:String?=null,val nutrients:Map<String,Double> = emptyMap())
data class HealthWritePlan(val reviewToken:String,val selection:String,val rows:List<HealthWriteRow>,val skipped:List<String>,val timeZone:String,val type:HealthWriteType)
private fun JSONObject.strictText(key:String)=get(key).also{require(it is String){"Invalid biometric export $key."}} as String
fun parseHealthWritePlan(json:JSONObject,now:Instant):HealthWritePlan {
    if(json.getJSONObject("selection").optString("kind") in setOf("nutrition","hydration"))return parseIntakeWritePlan(json,now)
    require(json.get("version")==1){"Unsupported biometric export version."}
    val token=json.strictText("reviewToken");require(Regex("[a-f0-9]{64}").matches(token))
    val selection=json.getJSONObject("selection");val zone=ZoneId.of(selection.strictText("timeZone"));require(zone.id in ZoneId.getAvailableZoneIds())
    val type=HealthWriteType.fromWire(selection.strictText("kind"));val metric=selection.getJSONObject("metric");val unit=metric.strictText("unit");require(unit in type.units);val label=metric.strictText("type")
    val rows=mutableListOf<HealthWriteRow>();val skipped=mutableListOf<String>();val ids=mutableSetOf<String>();val records=json.getJSONArray("records");require(records.length()<=MAX_EXPORT_RECORDS)
    val excluded=json.getJSONArray("skipped");require(excluded.length()<=MAX_EXPORT_RECORDS)
    for(i in 0 until excluded.length()){val row=excluded.getJSONObject(i);skipped.add("${row.strictText("date")}: ${row.strictText("reason")}")}
    for(i in 0 until records.length()){
        val row=records.getJSONObject(i);val id=row.strictText("id");val clientId=row.strictText("clientRecordId");require(id.isNotBlank()&&ids.add(clientId)&&Regex("nourish-export:${type.wire}:[a-f0-9]{64}").matches(clientId))
        val day=row.strictText("date");val clock=row.strictText("time")
        val value=row.get("nativeValue");require(value is Number&&value.toDouble().isFinite());require(row.strictText("unit")==unit)
        val original=row.get("value");require(original is Number&&original.toDouble().isFinite())
        val resolved=resolveExportClock(day,clock,zone,now)
        if(resolved is ExcludedExportClock){skipped.add(resolved.reason);continue};resolved as ExportClock
        val secondary=if(type==HealthWriteType.PRESSURE){require(row.strictText("secondaryId").isNotBlank());val v=row.get("nativeSecondary");require(v is Number&&v.toDouble().isFinite());v.toDouble()}else null
        val description="$day $clock "+zone.id+": $label $original $unit"+(if(secondary!=null)" / "+selection.getJSONObject("secondaryMetric").strictText("type")+" $secondary mmHg" else "")
        val prepared=HealthWriteRow(id,clientId,value.toDouble(),unit,secondary,resolved.start,resolved.offset,description)
        try{type.native(prepared,Metadata.manualEntry(clientRecordId=clientId,clientRecordVersion=1))}catch(error:IllegalArgumentException){skipped.add("$description: Unsupported by this phone's Health Connect SDK ("+error.message+").");continue}
        rows.add(prepared)
    }
    return HealthWritePlan(token,selection.toString(),rows.toList(),skipped.toList(),zone.id,type)
}
fun healthNativeRecords(plan:HealthWritePlan,version:Long):List<Record>{
    require(version>0)
    return plan.rows.map{plan.type.native(it,Metadata.manualEntry(clientRecordId=it.clientId,clientRecordVersion=version))}
}
fun nextHealthWriteVersion(now:Long,previous:Long):Long {require(now>0&&previous>=0&&previous<Long.MAX_VALUE);return maxOf(now,previous+1)}

interface HealthWriteSink {
    suspend fun permissions():Set<String>
    suspend fun insert(records:List<Record>):List<String>
    suspend fun read(type:HealthWriteType,id:String):Record
}
class AndroidHealthWriteSink(private val client:HealthConnectClient):HealthWriteSink {
    override suspend fun permissions()=client.permissionController.getGrantedPermissions()
    override suspend fun insert(records:List<Record>)=client.insertRecords(records).recordIdsList
    @Suppress("UNCHECKED_CAST")
    override suspend fun read(type:HealthWriteType,id:String)=client.readRecord(type.recordClass as KClass<Record>,id).record
}
data class HealthWriteProgress(var attempted:Int=0,var confirmed:Int=0)
class HealthWriteFailure(message:String,val confirmed:Int,val outcomeUnknown:Boolean):Exception(message)

/** One explicit captured plan; no retries or native deletions. SDK limit: 1000 per write. */
suspend fun writeReviewedHealthRecords(plan:HealthWritePlan,sink:HealthWriteSink,version:Long,progress:HealthWriteProgress,onVerified:(HealthWriteReceipt)->Unit={},beforeBatch:suspend()->Unit={},beforeWrite:suspend()->Unit):Int {
    require(plan.rows.isNotEmpty()){"No eligible records to write."}
    val native=healthNativeRecords(plan,version)
    try {
        require(sink.permissions().containsAll(plan.type.permissions)){"Grant selected record type read and write permissions first."}
        beforeWrite();currentCoroutineContext().ensureActive()
        for(batch in native.chunked(1000)){
            currentCoroutineContext().ensureActive();require(sink.permissions().containsAll(plan.type.permissions)){"Selected record type permission was revoked. Preview again after granting access."}
            beforeBatch();currentCoroutineContext().ensureActive()
            progress.attempted+=batch.size
            val ids=sink.insert(batch);require(ids.size==batch.size&&ids.toSet().size==ids.size){"Health Connect returned incomplete write identities."}
            for(id in ids){
                currentCoroutineContext().ensureActive();val actual=sink.read(plan.type,id)
                val receipt=HealthWriteReceipt(id,version,plan.rows[progress.confirmed])
                require(receipt.matches(plan.type,actual)){"Health Connect did not retain the reviewed record identity and revision. Preview again; check the phone clock if this persists."}
                progress.confirmed++;onVerified(receipt)
            }
        }
        return progress.confirmed
    } catch(error:CancellationException){throw error}
      catch(error:Exception){throw HealthWriteFailure(error.message?:"Health export failed.",progress.confirmed,progress.attempted>progress.confirmed)}
}
