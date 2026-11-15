package local.nourish.healthconnect

import android.content.Context
import android.health.connect.HealthConnectException
import android.health.connect.HealthConnectManager
import android.health.connect.ReadRecordsRequestUsingIds
import android.health.connect.ReadRecordsResponse
import android.os.OutcomeReceiver
import androidx.annotation.RequiresApi
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.Record
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.reflect.KClass

/** Android 14's exact client-ID query avoids inferring absence from a time-window scan. */
@RequiresApi(34)
class AndroidIntakeReconciliationSink(private val context:Context,private val client:HealthConnectClient):IntakeReconciliationSink {
    private val writer=AndroidHealthWriteSink(client)
    override suspend fun permissions()=writer.permissions()
    override suspend fun insert(records:List<Record>)=writer.insert(records)
    override suspend fun read(type:HealthWriteType,id:String)=writer.read(type,id)
    @Suppress("UNCHECKED_CAST")
    override suspend fun deleteNative(type:HealthWriteType,nativeIds:List<String>){
        require(type.isIntake && nativeIds.isNotEmpty() && nativeIds.size<=1000 && nativeIds.distinct().size==nativeIds.size && nativeIds.all { it.isNotBlank() })
        client.deleteRecords(type.recordClass as KClass<Record>,nativeIds,emptyList())
    }
    private suspend fun <T:android.health.connect.datatypes.Record> lookup(recordClass:Class<T>,ids:List<String>):List<T> = suspendCancellableCoroutine { continuation ->
        val manager=requireNotNull(context.getSystemService(HealthConnectManager::class.java))
        val request=ReadRecordsRequestUsingIds.Builder(recordClass).also { builder->ids.forEach { builder.addClientRecordId(it) } }.build()
        manager.readRecords(request,context.mainExecutor,object:OutcomeReceiver<ReadRecordsResponse<T>,HealthConnectException>{
            override fun onResult(result:ReadRecordsResponse<T>){
                if(!continuation.isActive)return
                if(result.nextPageToken != -1L)continuation.resumeWithException(IllegalStateException("Exact native identity query was incomplete. No absence was established."))
                else continuation.resume(result.records)
            }
            override fun onError(error:HealthConnectException){if(continuation.isActive)continuation.resumeWithException(error)}
        })
    }
    override suspend fun snapshot(type:HealthWriteType,clientIds:Set<String>):Map<String,Record>{
        require(type.isIntake && clientIds.size<=MAX_EXPORT_RECORDS && clientIds.all { Regex("nourish-export:${type.wire}:[a-f0-9]{64}").matches(it) })
        val result=linkedMapOf<String,Record>()
        // The platform permits at most 5000 combined native/client identities per request.
        for(batch in clientIds.sorted().chunked(5000)){
            currentCoroutineContext().ensureActive();require(permissions().containsAll(type.permissions))
            val native=when(type){
                HealthWriteType.NUTRITION->lookup(android.health.connect.datatypes.NutritionRecord::class.java,batch)
                HealthWriteType.HYDRATION->lookup(android.health.connect.datatypes.HydrationRecord::class.java,batch)
                else->error("Unsupported intake type")
            }
            for(row in native){
                currentCoroutineContext().ensureActive();val meta=row.metadata;val id=requireNotNull(meta.clientRecordId)
                require(id in batch && id !in result && meta.dataOrigin.packageName==context.packageName) { "Exact native query returned an unexpected identity or origin." }
                // Let the existing SDK own native conversion; do not copy its 42-field mapper.
                val actual=read(type,meta.id)
                require(actual.metadata.clientRecordId==id && actual.metadata.id==meta.id && actual.metadata.clientRecordVersion==meta.clientRecordVersion && actual.metadata.lastModifiedTime==meta.lastModifiedTime && actual.metadata.dataOrigin.packageName==context.packageName) { "Native record changed during its identity read. Review again." }
                result[id]=actual
            }
        }
        return result
    }
}
