package local.nourish.healthconnect

import androidx.health.connect.client.records.SleepSessionRecord
import java.time.Instant

const val MAX_SLEEP_STAGES = 100_000

enum class ExportSleepStageType(val wireName: String) {
    UNKNOWN("unknown"), AWAKE("awake"), SLEEPING("sleeping"), OUT_OF_BED("out-of-bed"),
    LIGHT("light"), DEEP("deep"), REM("rem"), AWAKE_IN_BED("awake-in-bed")
}

data class ExportSleepStage(val start: Instant, val end: Instant, val stage: ExportSleepStageType)

/** Map documented provider values without inferring a stage for a new integer. */
fun sleepStageType(value: Int): ExportSleepStageType = when (value) {
    SleepSessionRecord.STAGE_TYPE_UNKNOWN -> ExportSleepStageType.UNKNOWN
    SleepSessionRecord.STAGE_TYPE_AWAKE -> ExportSleepStageType.AWAKE
    SleepSessionRecord.STAGE_TYPE_SLEEPING -> ExportSleepStageType.SLEEPING
    SleepSessionRecord.STAGE_TYPE_OUT_OF_BED -> ExportSleepStageType.OUT_OF_BED
    SleepSessionRecord.STAGE_TYPE_LIGHT -> ExportSleepStageType.LIGHT
    SleepSessionRecord.STAGE_TYPE_DEEP -> ExportSleepStageType.DEEP
    SleepSessionRecord.STAGE_TYPE_REM -> ExportSleepStageType.REM
    SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED -> ExportSleepStageType.AWAKE_IN_BED
    else -> throw IllegalArgumentException("Health Connect returned an unsupported sleep stage ($value). No partial file was exported.")
}

fun validateSleepStages(stages: List<ExportSleepStage>, start: Instant, end: Instant) {
    require(end > start) { "A sleep session has no positive duration." }
    require(stages.size <= MAX_SLEEP_STAGES) { "More than 100,000 sleep stages. Select fewer days; no partial file was exported." }
    var previousEnd = start
    for (stage in stages) {
        require(stage.start >= start && stage.end <= end && stage.end > stage.start) { "A sleep stage is outside its session or has no positive duration." }
        require(stage.start >= previousEnd) { "Sleep stages must be ordered and must not overlap." }
        previousEnd = stage.end
    }
}

/** Stage endpoints are Instants, without per-stage offsets. Keep their exact UTC
 * precision; do not reuse session offsets or infer a device-local stage offset. */
fun exportSleepStages(start: Instant, end: Instant, stages: List<SleepSessionRecord.Stage>): List<ExportSleepStage>? {
    require(stages.size <= MAX_SLEEP_STAGES) { "More than 100,000 sleep stages. Select fewer days; no partial file was exported." }
    val result = stages.map { ExportSleepStage(it.startTime, it.endTime, sleepStageType(it.stage)) }
    validateSleepStages(result, start, end)
    return result.takeIf { it.isNotEmpty() }
}
