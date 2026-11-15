package local.nourish.healthconnect

import java.io.File
import java.io.OutputStreamWriter
import java.io.Writer
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import org.json.JSONArray
import org.json.JSONObject

/** JSONObject owns escaping and number serialization on Android and in JVM
 * tests. Only one record is serialized at a time; the file stays byte-bounded. */
internal fun exportRecordJson(row: ExportRecord): JSONObject {
    val source = JSONObject().put("app", row.source.app).put("recordId", row.source.recordId)
    row.source.lastModifiedAt?.let { source.put("lastModifiedAt", it.toString()) }
    row.source.exerciseContext?.let { context ->
        val native=JSONObject().put("exerciseType",context.exerciseType)
        context.title?.let { native.put("title",it) };context.notes?.let { native.put("notes",it) }
        source.put("exerciseContext",native)
    }
    row.source.temperatureContext?.let { source.put("temperatureContext", JSONObject().put("measurementLocation",it.measurementLocation)) }
    row.source.pressureContext?.let { source.put("pressureContext", JSONObject().put("component",it.component.wireName).put("bodyPosition",it.bodyPosition).put("measurementLocation",it.measurementLocation)) }
    row.source.glucoseContext?.let { source.put("glucoseContext", JSONObject().put("specimenSource",it.specimenSource).put("mealType",it.mealType).put("relationToMeal",it.relationToMeal)) }
    row.source.aggregation?.let {
        source.put("aggregation", JSONObject().put("kind", it.kind).put("metric", it.metric.wireName).put("date", it.date.toString()))
    }
    row.source.sleepStages?.let { stages ->
        validateSleepStages(stages, Instant.parse(row.start!!), Instant.parse(row.end!!))
        source.put("sleepStages", JSONArray(stages.map {
            JSONObject().put("start", it.start.toString()).put("end", it.end.toString()).put("stage", it.stage.wireName)
        }))
    }
    return JSONObject().put("id", row.id).put("type", row.measurementLabel).put("date", row.date.toString())
        .put("time", row.time).put("value", row.value).put("unit", row.type.unit).put("source", source)
        .also { json -> row.start?.let { json.put("start", it) }; row.end?.let { json.put("end", it) } }
}

private fun snapshotHeader(snapshot:HealthSnapshot,exportedAt:Instant)=JSONObject()
    .put("format","nourish-health-connect").put("version",1).put("exportedAt",exportedAt.toString())
    .put("range",JSONObject().put("from",snapshot.range.from.toString()).put("to",snapshot.range.to.toString()).put("zone",snapshot.range.zone.id))

internal suspend fun writeExportJson(writer: Writer, snapshot: HealthSnapshot, exportedAt: Instant) {
    require(snapshot.records.size <= MAX_EXPORT_RECORDS)
    writer.write(snapshotHeader(snapshot,exportedAt).toString().dropLast(1))
    writer.write(",\"records\":[")
    for ((index, row) in snapshot.records.withIndex()) {
        currentCoroutineContext().ensureActive()
        if (index > 0) writer.write(",")
        writer.write(exportRecordJson(row).toString())
    }
    writer.write("]}")
}

/** Same record owner as streamed snapshot export; reconciliation retains the
 * complete snapshot as one object inside its bounded durable batch. */
internal fun exportSnapshotJson(snapshot:HealthSnapshot,exportedAt:Instant):JSONObject = snapshotHeader(snapshot,exportedAt)
    .put("records",JSONArray(snapshot.records.map(::exportRecordJson)))

/** Stage a complete file in app-private cache before opening the document picker. */
suspend fun stageExport(cache: File, snapshot: HealthSnapshot, exportedAt: Instant = Instant.now()): File {
    require(snapshot.records.size <= MAX_EXPORT_RECORDS)
    val file = File(cache, "nourish-export-${UUID.randomUUID()}.json")
    try {
        OutputStreamWriter(BoundedExportStream(file.outputStream()), Charsets.UTF_8).use { writeExportJson(it, snapshot, exportedAt) }
        return file
    } catch (error: Throwable) {
        file.delete()
        throw error
    }
}
