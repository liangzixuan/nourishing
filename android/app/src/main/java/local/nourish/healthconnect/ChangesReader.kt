package local.nourish.healthconnect

import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.changes.DeletionChange
import androidx.health.connect.client.changes.UpsertionChange
import androidx.health.connect.client.request.ChangesTokenRequest
import java.time.ZoneId
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import org.json.JSONArray
import org.json.JSONObject

data class TypedChange(val type: ExportType, val recordId: String, val parent: NativeParent? = null, val deleted: Boolean = false)
data class ChangePage(val changes: List<TypedChange>, val nextToken: String, val hasMore: Boolean, val expired: Boolean, val examined: Int = changes.size)
interface ChangeFeed { suspend fun token(type: ExportType): String; suspend fun page(type: ExportType, token: String): ChangePage }
data class TypedChanges(val token: String, val events: List<TypedChange>, val gap: String?)

class AndroidChangeFeed(private val client: HealthConnectClient, private val zone: ZoneId): ChangeFeed {
    override suspend fun token(type: ExportType) = client.getChangesToken(ChangesTokenRequest(setOf(HEALTH_RECORD_TYPES.getValue(type))))
    override suspend fun page(type: ExportType, token: String): ChangePage {
        val page=client.getChanges(token)
        return ChangePage(page.changes.mapNotNull { change -> when(change) {
            is DeletionChange -> TypedChange(type,change.recordId,deleted=true)
            is UpsertionChange -> {
                require(HEALTH_RECORD_TYPES.getValue(type).isInstance(change.record)) { "Health Connect returned a different record type." }
                if(isNourishExport(change.record))null else TypedChange(type,change.record.metadata.id,projectNativeParent(change.record,zone))
            }
            else -> error("Unsupported Health Connect change.")
        } },page.nextChangesToken,page.hasMore,page.changesTokenExpired,page.changes.size)
    }
}

/** Cursor is only a candidate. The outbox owner commits it after receiver ack. */
class ChangesReader(private val source: ChangeFeed) {
    suspend fun read(type: ExportType, cursor: String?): TypedChanges {
        if(cursor==null)return TypedChanges(source.token(type),emptyList(),"initial-baseline")
        var token:String=cursor;val visited=mutableSetOf<String>();val events=linkedMapOf<String,TypedChange>();var examined=0
        while(true){
            currentCoroutineContext().ensureActive()
            check(visited.add(token)) { "Health Connect repeated a change page. No progress was acknowledged." }
            val page=source.page(type,token)
            if(page.expired)return TypedChanges(source.token(type),emptyList(),"token-expired")
            require(page.nextToken.isNotBlank()) { "Health Connect returned an empty cursor." }
            require(page.examined >= page.changes.size && page.examined <= MAX_EXPORT_RECORDS-examined) { "Too many native changes, including excluded own exports. No partial reconciliation was staged." }
            examined+=page.examined
            for(event in page.changes){
                require(event.type==type && event.recordId.isNotBlank()) { "Invalid changes. No partial reconciliation was staged." }
                // Native activity upserts must supersede an earlier delete even
                // though their values are provided by the aggregate owner.
                events[event.recordId]=event
            }
            token=page.nextToken
            if(!page.hasMore)return TypedChanges(token,events.values.toList(),null)
        }
    }
}
data class ReconciliationChangeCapture<T>(val baseline:T,val candidates:Map<ExportType,String>,val events:List<TypedChange>,val gaps:List<Pair<ExportType,String>>)

/** Bracket the baseline with change drains. Otherwise a snapshot can observe a
 * newer parent than the complete projection obtained just before that read. */
suspend fun <T> captureChangesAroundBaseline(reader:ChangesReader,selected:Set<ExportType>,cursors:Map<ExportType,String>,beforeRead:suspend()->Unit={},baseline:suspend()->T):ReconciliationChangeCapture<T> {
    val first=linkedMapOf<ExportType,TypedChanges>();val finalEvents=linkedMapOf<Pair<ExportType,String>,TypedChange>();val candidates=linkedMapOf<ExportType,String>();val gaps=mutableListOf<Pair<ExportType,String>>()
    fun merge(events:List<TypedChange>){for(event in events)finalEvents[event.type to event.recordId]=event}
    for(type in selected){beforeRead();val read=reader.read(type,cursors[type]);first[type]=read;candidates[type]=read.token;merge(read.events);read.gap?.let{gaps.add(type to it)}}
    val captured=baseline()
    for((type,read)in first){
        if(read.gap!=null)continue
        beforeRead();val latest=reader.read(type,read.token)
        check(latest.gap==null){"A Health Connect cursor expired during the final read. No batch was staged or acknowledged; read again for a fresh baseline."}
        candidates[type]=latest.token;merge(latest.events)
    }
    // Keep activity upsert placeholders until every drain has been merged: a
    // later activity upsert must cancel an earlier delete of the same parent.
    return ReconciliationChangeCapture(captured,candidates,finalEvents.values.filter{it.deleted||it.parent!=null},gaps)
}
fun nativeChangeJson(event: TypedChange): JSONObject {
    val json=JSONObject().put("kind",if(event.deleted)"delete" else "upsert").put("type",event.type.label).put("recordId",event.recordId)
    if(!event.deleted){val parent=requireNotNull(event.parent);require(parent.type==event.type&&parent.source.recordId==event.recordId)
        json.put("app",parent.source.app).put("lastModifiedAt",requireNotNull(parent.source.lastModifiedAt).toString())
        json.put("records",JSONArray(parent.records.map(::exportRecordJson)))
    };return json
}
