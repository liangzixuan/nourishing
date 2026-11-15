package local.nourish.healthconnect

import androidx.health.connect.client.records.HydrationRecord
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.metadata.Metadata
import java.security.MessageDigest
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import org.json.JSONArray
import org.json.JSONObject

/** snapshot must exhaust the authorized own-origin inventory.
 * Missing local receipts, a limited time window, or a failed read cannot implement absence. */
interface IntakeReconciliationSink : HealthWriteSink {
    suspend fun snapshot(type: HealthWriteType, clientIds: Set<String>): Map<String, Record>
    suspend fun deleteNative(type: HealthWriteType, nativeIds: List<String>)
}

data class IntakeCorrectionPlan(val scope: String, val reviewToken: String, val type: HealthWriteType,
    val rows: List<HealthWriteRow>, val retire: Set<String>) {
    val clients get() = rows.map { it.clientId }.toSet() + retire
    init {
        require(scope.isNotBlank() && Regex("[a-f0-9]{64}").matches(reviewToken) && type.isIntake)
        require(clients.isNotEmpty() && clients.size <= MAX_EXPORT_RECORDS)
        require(rows.map { it.clientId }.distinct().size == rows.size && rows.none { it.clientId in retire })
        require(clients.all { Regex("nourish-export:${type.wire}:[a-f0-9]{64}").matches(it) })
        // Validate every replacement before a pending operation can be persisted.
        rows.forEach { type.native(it, Metadata.manualEntry(clientRecordId = it.clientId, clientRecordVersion = 1)) }
    }
}

data class IntakeNativeState(val nativeId: String, val clientId: String, val version: Long, val fingerprint: String) {
    init { require(nativeId.isNotBlank() && clientId.isNotBlank() && version >= 0 && Regex("[a-f0-9]{64}").matches(fingerprint)) }
}

/** Full SDK payload, including fields that Nourish does not write. Unknown and zero differ. */
private fun intakeNativeFacts(type: HealthWriteType, record: Record): JSONObject {
    require(type.isIntake && type.recordClass.isInstance(record) && isNourishExport(record)) { "Unexpected native record type or origin." }
    val meta = record.metadata
    val data = JSONObject().put("type", type.wire).put("origin", meta.dataOrigin.packageName)
        .put("modified", meta.lastModifiedTime.toString()).put("method", meta.recordingMethod)
        .put("device", meta.device?.let { JSONObject().put("manufacturer", it.manufacturer ?: JSONObject.NULL).put("model", it.model ?: JSONObject.NULL).put("type", it.type) } ?: JSONObject.NULL)
    fun field(name: String, value: Any?) { data.put(name, value ?: JSONObject.NULL) }
    when (record) {
        is HydrationRecord -> {
            field("start", record.startTime.toString()); field("end", record.endTime.toString())
            field("startOffset", record.startZoneOffset?.toString()); field("endOffset", record.endZoneOffset?.toString())
            field("volumeLiters", record.volume.inLiters)
        }
        is NutritionRecord -> {
            field("start", record.startTime.toString()); field("end", record.endTime.toString())
            field("startOffset", record.startZoneOffset?.toString()); field("endOffset", record.endZoneOffset?.toString())
            field("name", record.name); field("mealType", record.mealType)
            val nutrients = linkedMapOf(
                "energy" to record.energy?.inKilocalories, "energyFromFat" to record.energyFromFat?.inKilocalories,
                "protein" to record.protein?.inGrams, "totalCarbohydrate" to record.totalCarbohydrate?.inGrams,
                "totalFat" to record.totalFat?.inGrams, "dietaryFiber" to record.dietaryFiber?.inGrams,
                "caffeine" to record.caffeine?.inGrams, "calcium" to record.calcium?.inGrams,
                "chloride" to record.chloride?.inGrams, "cholesterol" to record.cholesterol?.inGrams,
                "chromium" to record.chromium?.inGrams, "copper" to record.copper?.inGrams,
                "folate" to record.folate?.inGrams, "folicAcid" to record.folicAcid?.inGrams,
                "iodine" to record.iodine?.inGrams, "iron" to record.iron?.inGrams,
                "magnesium" to record.magnesium?.inGrams, "manganese" to record.manganese?.inGrams,
                "molybdenum" to record.molybdenum?.inGrams, "monounsaturatedFat" to record.monounsaturatedFat?.inGrams,
                "niacin" to record.niacin?.inGrams, "pantothenicAcid" to record.pantothenicAcid?.inGrams,
                "phosphorus" to record.phosphorus?.inGrams, "polyunsaturatedFat" to record.polyunsaturatedFat?.inGrams,
                "potassium" to record.potassium?.inGrams, "riboflavin" to record.riboflavin?.inGrams,
                "saturatedFat" to record.saturatedFat?.inGrams, "selenium" to record.selenium?.inGrams,
                "sodium" to record.sodium?.inGrams, "sugar" to record.sugar?.inGrams,
                "thiamin" to record.thiamin?.inGrams, "transFat" to record.transFat?.inGrams,
                "unsaturatedFat" to record.unsaturatedFat?.inGrams, "vitaminA" to record.vitaminA?.inGrams,
                "vitaminB12" to record.vitaminB12?.inGrams, "vitaminB6" to record.vitaminB6?.inGrams,
                "vitaminC" to record.vitaminC?.inGrams, "vitaminD" to record.vitaminD?.inGrams,
                "vitaminE" to record.vitaminE?.inGrams, "vitaminK" to record.vitaminK?.inGrams,
                "zinc" to record.zinc?.inGrams, "biotin" to record.biotin?.inGrams
            )
            for ((name, value) in nutrients) field(name, value)
        }
        else -> error("Unsupported intake type.")
    }
    return data
}

fun intakeNativeState(type: HealthWriteType, record: Record): IntakeNativeState {
    val data=intakeNativeFacts(type,record);val meta=record.metadata
    // JSONObject key iteration is not a serialization contract; sort at the owning boundary.
    fun canonical(value: Any): Any = when (value) {
        is JSONObject -> JSONArray().also { array -> value.keys().asSequence().sorted().forEach { key -> array.put(JSONArray().put(key).put(canonical(value.get(key)))) } }
        else -> value
    }
    val payload = JSONArray().put(meta.id).put(meta.clientRecordId).put(meta.clientRecordVersion).put(canonical(data)).toString()
    val digest = MessageDigest.getInstance("SHA-256").digest(payload.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    return IntakeNativeState(meta.id, requireNotNull(meta.clientRecordId), meta.clientRecordVersion, digest)
}

private fun describeNativeIntake(type:HealthWriteType,record:Record):String {
    val facts=intakeNativeFacts(type,record)
    val units=if(type==HealthWriteType.NUTRITION)"Energy is in kcal; nutrient masses are in grams." else "Volume is in liters."
    return "${type.label}: native record ${record.metadata.id}\n$units\n"+facts.keys().asSequence().sorted().joinToString("\n") { key->
        val label=key.replace(Regex("([a-z])([A-Z])"),"$1 $2")
        "$label: ${if(facts.isNull(key))"unknown" else facts.get(key)}"
    }
}

data class IntakeCorrectionReview(val plan: IntakeCorrectionPlan, val before: Map<String, IntakeNativeState>) {
    val minimumVersion get() = before.values.maxOfOrNull { it.version } ?: 0L
}
data class IntakeCorrectionOperation(val id: String, val review: IntakeCorrectionReview, val version: Long,
    val attemptedUpserts: Set<String> = emptySet(), val attemptedRetirements: Set<String> = emptySet()) {
    init {
        require(id.isNotBlank() && version > review.minimumVersion)
        require(attemptedUpserts.all { id -> review.plan.rows.any { it.clientId == id } })
        require(attemptedRetirements.all { it in review.plan.retire })
    }
}

/** Implementations must durably retain a complete operation before returning from save. */
interface IntakeCorrectionJournal {
    fun load(): IntakeCorrectionOperation?
    fun save(operation: IntakeCorrectionOperation)
    fun finish(operationId: String)
}

private suspend fun intakeSnapshot(plan: IntakeCorrectionPlan, sink: IntakeReconciliationSink): Map<String, Record> {
    currentCoroutineContext().ensureActive()
    require(sink.permissions().containsAll(plan.type.permissions)) { "Grant intake read and write permissions before reviewing a correction." }
    val records = sink.snapshot(plan.type, plan.clients)
    require(records.keys.all { it in plan.clients } && records.values.map { it.metadata.id }.distinct().size == records.size) { "Native inventory returned unexpected identities." }
    for ((id, record) in records) require(intakeNativeState(plan.type, record).clientId == id) { "Native inventory client identity changed." }
    return records
}

data class IntakeCorrectionInspection(val review:IntakeCorrectionReview,val beforeDescriptions:Map<String,String>)
suspend fun inspectIntakeCorrection(plan: IntakeCorrectionPlan, sink: IntakeReconciliationSink): IntakeCorrectionInspection {
    val captured = plan.copy(rows = plan.rows.map { it.copy(nutrients = it.nutrients.toMap()) }, retire = plan.retire.toSet())
    val records = intakeSnapshot(captured, sink)
    return IntakeCorrectionInspection(IntakeCorrectionReview(captured, records.mapValues { intakeNativeState(captured.type, it.value) }),records.mapValues { describeNativeIntake(captured.type,it.value) })
}
suspend fun reviewIntakeCorrection(plan: IntakeCorrectionPlan, sink: IntakeReconciliationSink): IntakeCorrectionReview = inspectIntakeCorrection(plan,sink).review

/** The caller holds NativeHealthWrites' process lock and has explicit user confirmation.
 * A resumed operation must be the journal's exact captured operation, never a new plan. */
suspend fun reconcileIntakeCorrection(review: IntakeCorrectionReview, sink: IntakeReconciliationSink,
    journal: IntakeCorrectionJournal, operationId: String, version: Long, guard: suspend () -> Unit): Int {
    val plan = review.plan
    suspend fun checkAccess() { currentCoroutineContext().ensureActive(); guard(); currentCoroutineContext().ensureActive() }
    checkAccess()
    var operation = journal.load()
    if (operation == null) {
        val current = intakeSnapshot(plan, sink).mapValues { intakeNativeState(plan.type, it.value) }
        check(current == review.before) { "Phone records changed after review. Review them again before writing." }
        operation = IntakeCorrectionOperation(operationId, review, version)
        journal.save(operation)
    } else check(operation.id == operationId && operation.review == review && operation.version == version) { "An earlier correction must be reconciled before another operation." }

    fun desired(row: HealthWriteRow, actual: Record?, attempted: Boolean): Boolean = actual != null && attempted &&
        HealthWriteReceipt(actual.metadata.id, version, row).matches(plan.type, actual)
    fun unchanged(id: String, actual: Record?): Boolean = actual?.let { intakeNativeState(plan.type, it) } == review.before[id]
    suspend fun classify(): Pair<List<HealthWriteRow>, List<String>> {
        checkAccess(); val current = intakeSnapshot(plan, sink); val upserts = mutableListOf<HealthWriteRow>(); val deletes = mutableListOf<String>()
        for (row in plan.rows) {
            val actual = current[row.clientId]
            if (desired(row, actual, row.clientId in operation!!.attemptedUpserts)) continue
            check(unchanged(row.clientId, actual)) { "A retained phone record changed or disappeared. Review the pending correction." }
            upserts.add(row)
        }
        for (id in plan.retire) {
            val actual = current[id]
            if (actual == null && (review.before[id] == null || id in operation!!.attemptedRetirements)) continue
            check(unchanged(id, actual)) { "A phone record selected for removal changed or disappeared. Review the pending correction." }
            deletes.add(id)
        }
        return upserts to deletes
    }
    val (upserts, _) = classify()
    for (batch in upserts.chunked(1000)) {
        checkAccess()
        // Recheck all affected identities before each native call; no blind retry.
        val pending = classify().first.map { it.clientId }.toSet(); val rows = batch.filter { it.clientId in pending }
        if (rows.isEmpty()) continue
        val native = rows.map { plan.type.native(it, Metadata.manualEntry(clientRecordId = it.clientId, clientRecordVersion = version)) }
        operation = operation!!.copy(attemptedUpserts = operation!!.attemptedUpserts + rows.map { it.clientId }); journal.save(operation!!)
        checkAccess();val ids = sink.insert(native)
        check(ids.size == rows.size && ids.distinct().size == ids.size) { "Native update returned incomplete identities. Reconcile the pending correction." }
        for ((index, id) in ids.withIndex()) {
            val actual = sink.read(plan.type, id)
            check(HealthWriteReceipt(id, version, rows[index]).matches(plan.type, actual)) { "Native update did not retain the reviewed payload. Reconcile the pending correction." }
        }
    }
    // Never remove an old contribution until every retained replacement is verified.
    val (remaining, retirements) = classify();check(remaining.isEmpty()) { "Replacement records are not verified; no removals were attempted." }
    for (batch in retirements.chunked(1000)) {
        checkAccess();val (changed, currentRetirements) = classify();check(changed.isEmpty())
        val ids = batch.filter { it in currentRetirements };if (ids.isEmpty()) continue
        operation = operation!!.copy(attemptedRetirements = operation!!.attemptedRetirements + ids);journal.save(operation!!)
        checkAccess();sink.deleteNative(plan.type, ids.map { requireNotNull(review.before[it]).nativeId })
    }
    val (remainingWrites, remainingDeletes) = classify()
    check(remainingWrites.isEmpty() && remainingDeletes.isEmpty()) { "Native correction is incomplete. Keep its pending operation for reconciliation." }
    checkAccess();journal.finish(operationId)
    return plan.rows.size
}
