package local.nourish.healthconnect

import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.aggregate.AggregateMetric
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.HydrationRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.BodyTemperatureRecord
import androidx.health.connect.client.records.BodyWaterMassRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.OxygenSaturationRecord
import androidx.health.connect.client.records.RespiratoryRateRecord
import androidx.health.connect.client.records.BloodPressureRecord
import androidx.health.connect.client.records.BloodGlucoseRecord
import androidx.health.connect.client.records.HeightRecord
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Instant
import kotlin.reflect.KClass
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive

val HEALTH_RECORD_TYPES: Map<ExportType, KClass<out Record>> = linkedMapOf(
    ExportType.WEIGHT to WeightRecord::class,
    ExportType.BODY_TEMPERATURE to BodyTemperatureRecord::class,
    ExportType.BODY_WATER_MASS to BodyWaterMassRecord::class,
    ExportType.RESTING_HEART_RATE to RestingHeartRateRecord::class,
    ExportType.HRV_RMSSD to HeartRateVariabilityRmssdRecord::class,
    ExportType.OXYGEN_SATURATION to OxygenSaturationRecord::class,
    ExportType.RESPIRATORY_RATE to RespiratoryRateRecord::class,
    ExportType.BLOOD_PRESSURE to BloodPressureRecord::class,
    ExportType.BLOOD_GLUCOSE to BloodGlucoseRecord::class,
    ExportType.HEIGHT to HeightRecord::class,
    ExportType.BODY_FAT to BodyFatRecord::class,
    ExportType.HEART_RATE to HeartRateRecord::class,
    ExportType.SLEEP to SleepSessionRecord::class,
    ExportType.WATER to HydrationRecord::class,
    ExportType.STEPS to StepsRecord::class,
    ExportType.ACTIVE_ENERGY to ActiveCaloriesBurnedRecord::class,
    ExportType.EXERCISE_DURATION to ExerciseSessionRecord::class
)

fun readPermissions(types: Set<ExportType>): Set<String> = types.map { HealthPermission.getReadPermission(HEALTH_RECORD_TYPES.getValue(it)) }.toSet()

data class AggregateObservation(val metric: DailyActivityMetric, val window: DailyActivityWindow, val value: Double?)
data class HealthSnapshot(val range: ExportRange, val records: List<ExportRecord>, val granted: Set<ExportType>, val denied: Set<ExportType>, val aggregateObservations: List<AggregateObservation> = emptyList())

class HealthConnectReader(private val client: HealthConnectClient) {
    private suspend fun <T : Record> pages(type: KClass<T>, range: ExportRange, collector: RecordCollector, consume: suspend (T) -> Unit) {
        var token: String? = null
        do {
            currentCoroutineContext().ensureActive()
            val response = client.readRecords(ReadRecordsRequest(type, TimeRangeFilter.between(range.start, range.endExclusive),
                ascendingOrder = true, pageSize = 500, pageToken = token))
            for (record in response.records) {
                currentCoroutineContext().ensureActive()
                collector.examined()
                consume(record)
            }
            val next = response.pageToken?.takeIf { it.isNotEmpty() }
            check(next == null || next != token) { "Health Connect returned a repeated page. Select fewer days and try again." }
            token = next
        } while (token != null)
    }

    /** Caller owns foreground lifetime or checks the extra background-read permission. */
    suspend fun read(range: ExportRange, selected: Set<ExportType>): HealthSnapshot {
        require(selected.isNotEmpty()) { "Select at least one data type." }
        val permissions = client.permissionController.getGrantedPermissions()
        val granted = selected.filter { readPermissions(setOf(it)).all(permissions::contains) }.toSet()
        require(granted.isNotEmpty()) { "Grant read access to at least one selected type in Health Connect." }
        val collector = RecordCollector()
        val observations=mutableListOf<AggregateObservation>()
        suspend fun <T:Record> raw(type:kotlin.reflect.KClass<T>)=pages(type,range,collector){ row ->
            if (!isNourishExport(row)) for(record in requireNotNull(projectNativeParent(row,range.zone)).records){
                currentCoroutineContext().ensureActive()
                if(range.contains(Instant.parse(record.start))&&(record.end==null||Instant.parse(record.end)<=range.readUntil))collector.add(record)
            }
        }
        if(ExportType.WEIGHT in granted)raw(WeightRecord::class)
        if(ExportType.BODY_TEMPERATURE in granted)raw(BodyTemperatureRecord::class)
        if(ExportType.BODY_WATER_MASS in granted)raw(BodyWaterMassRecord::class)
        if(ExportType.RESTING_HEART_RATE in granted)raw(RestingHeartRateRecord::class)
        if(ExportType.HRV_RMSSD in granted)raw(HeartRateVariabilityRmssdRecord::class)
        if(ExportType.OXYGEN_SATURATION in granted)raw(OxygenSaturationRecord::class)
        if(ExportType.RESPIRATORY_RATE in granted)raw(RespiratoryRateRecord::class)
        if(ExportType.BLOOD_PRESSURE in granted)raw(BloodPressureRecord::class)
        if(ExportType.BLOOD_GLUCOSE in granted)raw(BloodGlucoseRecord::class)
        if(ExportType.HEIGHT in granted)raw(HeightRecord::class)
        if(ExportType.BODY_FAT in granted)raw(BodyFatRecord::class)
        if(ExportType.HEART_RATE in granted)raw(HeartRateRecord::class)
        if(ExportType.SLEEP in granted)raw(SleepSessionRecord::class)
        if(ExportType.WATER in granted)raw(HydrationRecord::class)
        val activityMetrics = buildSet<AggregateMetric<*>> {
            if (ExportType.STEPS in granted) add(StepsRecord.COUNT_TOTAL)
            if (ExportType.ACTIVE_ENERGY in granted) add(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL)
        }
        if (activityMetrics.isNotEmpty()) for (day in range.dates()) {
            currentCoroutineContext().ensureActive()
            val window = dailyActivityWindow(day, range.zone, range.readUntil) ?: continue
            // No origin filter: Health Connect owns Activity source priorities and deduplication.
            val aggregate = client.aggregate(AggregateRequest(activityMetrics, TimeRangeFilter.between(window.start, window.end)))
            fun observe(metric:DailyActivityMetric,value:Double?){collector.add(dailyActivityMeasurement(metric,window,value));observations.add(AggregateObservation(metric,window,value))}
            if(ExportType.STEPS in granted)observe(DailyActivityMetric.STEPS,aggregate[StepsRecord.COUNT_TOTAL]?.toDouble())
            if(ExportType.ACTIVE_ENERGY in granted)observe(DailyActivityMetric.ACTIVE_CALORIES,aggregate[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories)
        }
        if(ExportType.EXERCISE_DURATION in granted)raw(ExerciseSessionRecord::class)
        currentCoroutineContext().ensureActive()
        return HealthSnapshot(range, collector.records(), granted, selected - granted,observations)
    }
}
