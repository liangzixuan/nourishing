package local.nourish.healthconnect

import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

const val MAX_EXPORT_RECORDS = 100_000

enum class ExportType(val label: String, val unit: String, val idPrefix: String, val selectedInitially: Boolean = true, val minimum: Double = 0.0, val maximum: Double? = null, val wholeNumber: Boolean = false) {
    WEIGHT("Weight", "kg", "weight"),
    HEIGHT("Height", "cm", "height", false, maximum = 300.0),
    BODY_FAT("Body fat", "%", "body-fat", false, maximum = 100.0),
    BLOOD_PRESSURE("Blood pressure", "mmHg", "blood-pressure", false),
    BLOOD_GLUCOSE("Blood glucose", "mmol/L", "blood-glucose", false, maximum = 50.0),
    BODY_TEMPERATURE("Body temperature", "°C", "body-temperature", false, maximum = 100.0),
    BODY_WATER_MASS("Body water mass", "kg", "body-water-mass", false, maximum = 1000.0),
    RESTING_HEART_RATE("Resting heart rate", "bpm", "resting-heart-rate", false, maximum = 300.0, wholeNumber = true),
    HRV_RMSSD("HRV (RMSSD)", "ms", "hrv-rmssd", false, minimum = 1.0, maximum = 200.0),
    OXYGEN_SATURATION("Oxygen saturation", "%", "oxygen-saturation", false, maximum = 100.0),
    RESPIRATORY_RATE("Respiratory rate", "brpm", "respiratory-rate", false, maximum = 1000.0),
    HEART_RATE("Heart rate", "bpm", "heart-rate"),
    SLEEP("Sleep", "h", "sleep"),
    WATER("Water", "mL", "water"),
    STEPS("Steps", "count", "steps"),
    ACTIVE_ENERGY("Active energy", "kcal", "active-energy"),
    EXERCISE_DURATION("Exercise duration", "min", "exercise-duration")
}

data class ExportRange(val from: LocalDate, val to: LocalDate, val zone: ZoneId, val readUntil: Instant) {
    val start: Instant get() = from.atStartOfDay(zone).toInstant()
    val endExclusive: Instant get() = minOf(to.plusDays(1).atStartOfDay(zone).toInstant(), readUntil)
    fun contains(instant: Instant): Boolean = instant >= start && instant < endExclusive
    fun dates(): List<LocalDate> = (0..ChronoUnit.DAYS.between(from, to)).map { from.plusDays(it) }
    companion object {
        fun create(from: String, to: String, zone: ZoneId, now: Instant): ExportRange {
            if(zone.id !in ZoneId.getAvailableZoneIds())throw ExportRangeFailure(ExportFailureCode.TIME_ZONE)
            if(!Regex("\\d{4}-\\d{2}-\\d{2}").matches(from)||!Regex("\\d{4}-\\d{2}-\\d{2}").matches(to))throw ExportRangeFailure(ExportFailureCode.DATE_FORMAT)
            val first = try{LocalDate.parse(from)}catch(error:java.time.format.DateTimeParseException){throw ExportRangeFailure(ExportFailureCode.CALENDAR_DATE,error)}
            val last = try{LocalDate.parse(to)}catch(error:java.time.format.DateTimeParseException){throw ExportRangeFailure(ExportFailureCode.CALENDAR_DATE,error)}
            val today = now.atZone(zone).toLocalDate()
            if(ChronoUnit.DAYS.between(first,last) !in 0..29)throw ExportRangeFailure(ExportFailureCode.RANGE_LENGTH)
            if(first<today.minusDays(29)||last>today)throw ExportRangeFailure(ExportFailureCode.RECENT_WINDOW)
            return ExportRange(first, last, zone, now)
        }
    }
}

enum class DailyActivityMetric(val wireName: String, val type: ExportType, val idPrefix: String) {
    STEPS("steps", ExportType.STEPS, "steps"),
    ACTIVE_CALORIES("active-calories", ExportType.ACTIVE_ENERGY, "active-energy-daily")
}

data class ExportAggregation(val metric: DailyActivityMetric, val date: LocalDate) {
    val kind: String get() = "daily-total"
}

enum class PressureComponent(val wireName: String, val label: String, val minimum: Double) {
    SYSTOLIC("systolic", "Systolic", 20.0), DIASTOLIC("diastolic", "Diastolic", 10.0)
}
data class ExportPressureContext(val component: PressureComponent, val bodyPosition: Int, val measurementLocation: Int) {
    init { require(bodyPosition >= 0 && measurementLocation >= 0) { "Invalid native pressure context." } }
}

data class ExportExerciseContext(val exerciseType: Int, val title: String? = null, val notes: String? = null) {
    init { require(exerciseType >= 0) { "Invalid native exercise type." } }
}

data class ExportTemperatureContext(val measurementLocation: Int) {
    init { require(measurementLocation >= 0) { "Invalid native temperature location." } }
}

data class ExportGlucoseContext(val specimenSource: Int, val mealType: Int, val relationToMeal: Int) {
    init { require(specimenSource >= 0 && mealType >= 0 && relationToMeal >= 0) { "Invalid native glucose context." } }
}

data class ExportSource(val app: String, val recordId: String, val lastModifiedAt: Instant? = null, val aggregation: ExportAggregation? = null, val sleepStages: List<ExportSleepStage>? = null, val glucoseContext: ExportGlucoseContext? = null, val pressureContext: ExportPressureContext? = null, val temperatureContext: ExportTemperatureContext? = null, val exerciseContext: ExportExerciseContext? = null) {
    init { require(app.isNotBlank() && recordId.isNotBlank()) { "Health Connect source identity is missing." } }
}

data class ExportRecord(
    val id: String,
    val type: ExportType,
    val date: LocalDate,
    val time: String,
    val value: Double,
    val source: ExportSource,
    val start: String? = null,
    val end: String? = null
) {
    val measurementLabel: String get() = source.pressureContext?.component?.label ?: type.label
    init {
        require(id.isNotBlank()) { "Health Connect record identity is missing." }
        require(value.isFinite() && value >= type.minimum && (type.maximum == null || value <= type.maximum) && (!type.wholeNumber || value % 1.0 == 0.0)) { "A Health Connect measurement is invalid." }
        require(Regex("\\d{2}:\\d{2}").matches(time)) { "A Health Connect time is invalid." }
        require((type == ExportType.BLOOD_GLUCOSE) == (source.glucoseContext != null)) { "Glucose records require their native context." }
        require((type == ExportType.BLOOD_PRESSURE) == (source.pressureContext != null)) { "Pressure records require native component context." }
        require((type == ExportType.BODY_TEMPERATURE) == (source.temperatureContext != null)) { "Temperature records require their native location context." }
        source.exerciseContext?.let { require(type == ExportType.EXERCISE_DURATION && source.aggregation == null && start != null && end != null) { "Exercise context requires a native exercise interval." } }
        source.pressureContext?.let { require(value >= it.component.minimum && value <= 300.0 && source.aggregation == null) { "Invalid native pressure measurement." } }
        source.sleepStages?.let { stages ->
            require(type == ExportType.SLEEP && source.aggregation == null && start != null && end != null) { "Sleep stages require a sleep session interval." }
            validateSleepStages(stages, Instant.parse(start), Instant.parse(end))
        }
    }
}

fun isoWithOffset(instant: Instant, offset: ZoneOffset?): String =
    if (offset == null) instant.toString() else instant.atOffset(offset).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)

fun elapsedValue(start: Instant, end: Instant, unit: String): Double {
    require(end > start) { "A Health Connect interval has no positive duration." }
    val seconds = Duration.between(start, end).let { it.seconds.toDouble() + it.nano / 1_000_000_000.0 }
    return when (unit) { "h" -> seconds / 3600.0; "min" -> seconds / 60.0; else -> error("Unsupported duration unit.") }
}

fun measurement(
    type: ExportType, source: ExportSource, instant: Instant, value: Double, zone: ZoneId,
    start: String = instant.toString(), end: String? = null, sampleId: String? = null
): ExportRecord {
    val local = instant.atZone(zone)
    val id = "${type.idPrefix}:${source.recordId}" + (sampleId?.let { ":$it" } ?: "")
    return ExportRecord(id, type, local.toLocalDate(), local.format(DateTimeFormatter.ofPattern("HH:mm")), value, source, start, end)
}

data class DailyActivityWindow(val date: LocalDate, val zone: ZoneId, val start: Instant, val end: Instant)

/** A skipped civil date or a day not yet started has no query window. */
fun dailyActivityWindow(date: LocalDate, zone: ZoneId, until: Instant): DailyActivityWindow? {
    val start = date.atStartOfDay(zone).toInstant()
    val end = minOf(date.plusDays(1).atStartOfDay(zone).toInstant(), until)
    return if (end > start) DailyActivityWindow(date, zone, start, end) else null
}

/** Missing aggregates stay absent. A measured zero remains an explicit zero. */
fun dailyActivityMeasurement(metric: DailyActivityMetric, window: DailyActivityWindow, value: Double?): ExportRecord? {
    if (value == null) return null
    require(value.isFinite() && value >= 0) { "A Health Connect activity aggregate is invalid." }
    require(metric != DailyActivityMetric.STEPS || value % 1.0 == 0.0) { "A Health Connect step aggregate must be a whole count." }
    val id = "${metric.idPrefix}:${window.date}:${window.zone.id}"
    return ExportRecord(id, metric.type, window.date, "00:00", value,
        ExportSource("Health Connect aggregate", id, aggregation = ExportAggregation(metric, window.date)),
        window.start.atZone(window.zone).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
        window.end.atZone(window.zone).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME))
}

class RecordCollector {
    private val rows = linkedMapOf<String, ExportRecord>()
    var rawRecordsExamined: Int = 0
        private set
    fun examined() {
        require(rawRecordsExamined < MAX_EXPORT_RECORDS) { "More than 100,000 source records. Select fewer days or types; no partial file was exported." }
        rawRecordsExamined++
    }
    fun add(record: ExportRecord?) {
        if (record == null) return
        require(rows.containsKey(record.id) || rows.size < MAX_EXPORT_RECORDS) { "More than 100,000 measurements. Select fewer days or types; no partial file was exported." }
        rows[record.id] = record
    }
    fun records(): List<ExportRecord> = rows.values.sortedWith(compareBy({ it.date }, { it.time }, { it.id }))
}
