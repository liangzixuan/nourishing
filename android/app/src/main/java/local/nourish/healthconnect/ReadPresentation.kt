package local.nourish.healthconnect

import androidx.annotation.StringRes
import android.content.Context
import java.text.NumberFormat

val ExportFailureCode.displayResource:Int get()=when(this){
    ExportFailureCode.TIME_ZONE->R.string.export_error_time_zone
    ExportFailureCode.DATE_FORMAT->R.string.export_error_date_format
    ExportFailureCode.CALENDAR_DATE->R.string.export_error_calendar_date
    ExportFailureCode.RANGE_LENGTH->R.string.export_error_range_length
    ExportFailureCode.RECENT_WINDOW->R.string.export_error_recent_window
    ExportFailureCode.BYTE_LIMIT->R.string.export_error_byte_limit
    ExportFailureCode.SAVE_REMOVED->R.string.export_error_save_removed
    ExportFailureCode.SAVE_REMAINS->R.string.export_error_save_remains
}
fun Context.exportProblemText(code:ExportFailureCode):String=if(code==ExportFailureCode.BYTE_LIMIT)getString(code.displayResource,NumberFormat.getIntegerInstance(resources.configuration.locales[0]).format(MAX_EXPORT_BYTES)) else getString(code.displayResource)
fun Context.exportFailureText(error:Throwable):String?=(error as? OwnedExportFailure)?.let{exportProblemText(it.code)}

data class ReadAccessStatus(val granted: Int, val total: Int)
/** Both counts use the same supported-type owner as permission requests. */
fun readAccessStatus(permissions: Set<String>): ReadAccessStatus {
    val supported = HEALTH_RECORD_TYPES.keys
    return ReadAccessStatus(supported.count { readPermissions(setOf(it)).all(permissions::contains) }, supported.size)
}
/** Display resources are separate from the unchanged export labels and units. */
val ExportType.displayLabelResource: Int
    @StringRes get() = when (this) {
        ExportType.WEIGHT -> R.string.read_type_weight
        ExportType.HEIGHT -> R.string.read_type_height
        ExportType.BODY_FAT -> R.string.read_type_body_fat
        ExportType.BLOOD_PRESSURE -> R.string.read_type_blood_pressure
        ExportType.BLOOD_GLUCOSE -> R.string.read_type_blood_glucose
        ExportType.BODY_TEMPERATURE -> R.string.read_type_body_temperature
        ExportType.BODY_WATER_MASS -> R.string.read_type_body_water_mass
        ExportType.RESTING_HEART_RATE -> R.string.read_type_resting_heart_rate
        ExportType.HRV_RMSSD -> R.string.read_type_hrv_rmssd
        ExportType.OXYGEN_SATURATION -> R.string.read_type_oxygen_saturation
        ExportType.RESPIRATORY_RATE -> R.string.read_type_respiratory_rate
        ExportType.HEART_RATE -> R.string.read_type_heart_rate
        ExportType.SLEEP -> R.string.read_type_sleep
        ExportType.WATER -> R.string.read_type_water
        ExportType.STEPS -> R.string.read_type_steps
        ExportType.ACTIVE_ENERGY -> R.string.read_type_active_energy
        ExportType.EXERCISE_DURATION -> R.string.read_type_exercise_duration
    }
val ExportRecord.displayLabelResource: Int
    @StringRes get() = when (source.pressureContext?.component) {
        PressureComponent.SYSTOLIC -> R.string.read_pressure_systolic
        PressureComponent.DIASTOLIC -> R.string.read_pressure_diastolic
        null -> type.displayLabelResource
    }
