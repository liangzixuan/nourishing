package local.nourish.healthconnect

import androidx.health.connect.client.HealthConnectClient
import java.time.Instant
import java.time.format.DateTimeFormatter
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject

fun aggregateObservationJson(observation:AggregateObservation,observedAt:Instant):JSONObject {
    val w=observation.window
    return JSONObject().put("metric",observation.metric.wireName).put("date",w.date.toString()).put("zone",w.zone.id).put("start",w.start.atZone(w.zone).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)).put("end",w.end.atZone(w.zone).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)).put("observedAt",observedAt.toString()).put("value",observation.value?:JSONObject.NULL)
}
fun reconciliationBatch(state:JSONObject,snapshot:HealthSnapshot,changes:List<TypedChange>,gaps:List<Pair<ExportType,String>>,observedAt:Instant):JSONObject {
    val projected=changes.sumOf{it.parent?.records?.size?:0}
    require(snapshot.records.size.toLong()+changes.size+projected+snapshot.aggregateObservations.size+gaps.size<=MAX_EXPORT_RECORDS){"Too many reconciliation records/events. No partial batch was staged."}
    return JSONObject().put("format","nourish-health-reconciliation").put("version",1).put("streamId",state.getString("streamId")).put("batchId",UUID.randomUUID().toString()).put("sequence",state.getLong("sequence")).put("previousReceipt",state.get("previousReceipt"))
        .put("observedAt",observedAt.toString()).put("snapshot",exportSnapshotJson(snapshot,observedAt))
        .put("nativeChanges",JSONArray(changes.map(::nativeChangeJson))).put("aggregateObservations",JSONArray(snapshot.aggregateObservations.map{aggregateObservationJson(it,observedAt)}))
        .put("gaps",JSONArray(gaps.map{JSONObject().put("type",it.first.label).put("reason",it.second)}))
}

suspend fun captureReconciliation(client:HealthConnectClient,range:ExportRange,selected:Set<ExportType>,store:ReconciliationStore,authority:PendingAuthority=PendingAuthority.Foreground) {
    require(selected.isNotEmpty()){ "Select at least one type." }
    suspend fun consent(){require(readPermissions(selected).all(client.permissionController.getGrantedPermissions()::contains)){"Grant all selected read permissions before reconciliation."}}
    consent();val state=store.captureState();val cursors=store.cursors(state);val reader=ChangesReader(AndroidChangeFeed(client,range.zone))
    val captured=captureChangesAroundBaseline(reader,selected,cursors,beforeRead={consent()}){HealthConnectReader(client).read(range,selected).also{require(it.denied.isEmpty())}}
    consent()
    val observedAt=Instant.now();require(observedAt>=range.readUntil){"The device clock moved backwards. Read again."}
    store.stage(state,reconciliationBatch(state,captured.baseline,captured.events,captured.gaps,observedAt),captured.candidates,selected,authority)
}
