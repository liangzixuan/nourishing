package local.nourish.healthconnect

import androidx.health.connect.client.records.*
import androidx.health.connect.client.records.metadata.Metadata
import java.time.ZoneId

data class NativeParent(val type: ExportType, val source: ExportSource, val records: List<ExportRecord>)

/** Complete native parent projection. Date filtering belongs to snapshot callers,
 * never this owner: a changed HR parent may have lost or moved child samples. */
fun projectNativeParent(record: Record, zone: ZoneId): NativeParent? {
    fun source(metadata: Metadata) = ExportSource(metadata.dataOrigin.packageName, metadata.id, metadata.lastModifiedTime)
    val type: ExportType
    val origin = source(record.metadata)
    val records: List<ExportRecord>
    when (record) {
        is BodyTemperatureRecord -> { type=ExportType.BODY_TEMPERATURE; records=listOf(measurement(type,origin.copy(temperatureContext=ExportTemperatureContext(record.measurementLocation)),record.time,record.temperature.inCelsius,zone,isoWithOffset(record.time,record.zoneOffset))) }
        is BodyWaterMassRecord -> { type=ExportType.BODY_WATER_MASS; records=listOf(measurement(type,origin,record.time,record.mass.inKilograms,zone,isoWithOffset(record.time,record.zoneOffset))) }
        is RestingHeartRateRecord -> { type=ExportType.RESTING_HEART_RATE; records=listOf(measurement(type,origin,record.time,record.beatsPerMinute.toDouble(),zone,isoWithOffset(record.time,record.zoneOffset))) }
        is HeartRateVariabilityRmssdRecord -> { type=ExportType.HRV_RMSSD; records=listOf(measurement(type,origin,record.time,record.heartRateVariabilityMillis,zone,isoWithOffset(record.time,record.zoneOffset))) }
        is OxygenSaturationRecord -> { type=ExportType.OXYGEN_SATURATION; records=listOf(measurement(type,origin,record.time,record.percentage.value,zone,isoWithOffset(record.time,record.zoneOffset))) }
        is RespiratoryRateRecord -> { type=ExportType.RESPIRATORY_RATE; records=listOf(measurement(type,origin,record.time,record.rate,zone,isoWithOffset(record.time,record.zoneOffset))) }
        is BloodPressureRecord -> {
            type=ExportType.BLOOD_PRESSURE
            records=PressureComponent.entries.map { component ->
                val value=if(component==PressureComponent.SYSTOLIC) record.systolic.inMillimetersOfMercury else record.diastolic.inMillimetersOfMercury
                measurement(type,origin.copy(pressureContext=ExportPressureContext(component,record.bodyPosition,record.measurementLocation)),record.time,value,zone,isoWithOffset(record.time,record.zoneOffset),sampleId=component.wireName)
            }
        }
        is BloodGlucoseRecord -> { type=ExportType.BLOOD_GLUCOSE; records=listOf(measurement(type,origin.copy(glucoseContext=ExportGlucoseContext(record.specimenSource,record.mealType,record.relationToMeal)),record.time,record.level.inMillimolesPerLiter,zone,isoWithOffset(record.time,record.zoneOffset))) }
        is HeightRecord -> { type=ExportType.HEIGHT; records=listOf(measurement(type,origin,record.time,record.height.inMeters * 100.0,zone,isoWithOffset(record.time,record.zoneOffset))) }
        is BodyFatRecord -> { type=ExportType.BODY_FAT; records=listOf(measurement(type,origin,record.time,record.percentage.value,zone,isoWithOffset(record.time,record.zoneOffset))) }
        is WeightRecord -> { type=ExportType.WEIGHT; records=listOf(measurement(type,origin,record.time,record.weight.inKilograms,zone,isoWithOffset(record.time,record.zoneOffset))) }
        is HeartRateRecord -> { type=ExportType.HEART_RATE; records=record.samples.map { measurement(type,origin,it.time,it.beatsPerMinute.toDouble(),zone,sampleId=it.time.toString()) } }
        is SleepSessionRecord -> { type=ExportType.SLEEP; records=listOf(measurement(type,origin.copy(sleepStages=exportSleepStages(record.startTime,record.endTime,record.stages)),record.startTime,elapsedValue(record.startTime,record.endTime,"h"),zone,isoWithOffset(record.startTime,record.startZoneOffset),isoWithOffset(record.endTime,record.endZoneOffset))) }
        is HydrationRecord -> { type=ExportType.WATER; records=listOf(measurement(type,origin,record.startTime,record.volume.inMilliliters,zone,isoWithOffset(record.startTime,record.startZoneOffset),isoWithOffset(record.endTime,record.endZoneOffset))) }
        is ExerciseSessionRecord -> { type=ExportType.EXERCISE_DURATION; records=listOf(measurement(type,origin.copy(exerciseContext=ExportExerciseContext(record.exerciseType,record.title,record.notes)),record.startTime,elapsedValue(record.startTime,record.endTime,"min"),zone,isoWithOffset(record.startTime,record.startZoneOffset),isoWithOffset(record.endTime,record.endZoneOffset))) }
        is StepsRecord, is ActiveCaloriesBurnedRecord -> return null // aggregate owner, not raw activity.
        else -> error("Unsupported changed Health Connect record.")
    }
    require(records.size<=MAX_EXPORT_RECORDS) { "Too many parent measurements. No partial reconciliation was staged." }
    return NativeParent(type,origin,records)
}
