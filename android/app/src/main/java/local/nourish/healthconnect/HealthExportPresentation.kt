package local.nourish.healthconnect

import android.content.Context
import androidx.annotation.StringRes

/** Display names never change native record identities or caller-selected metrics. */
val HealthWriteType.displayLabelResource: Int
    @StringRes get() = when(this) {
        HealthWriteType.WEIGHT -> R.string.read_type_weight
        HealthWriteType.WATER -> R.string.read_type_body_water_mass
        HealthWriteType.FAT -> R.string.read_type_body_fat
        HealthWriteType.HEIGHT -> R.string.read_type_height
        HealthWriteType.GLUCOSE -> R.string.read_type_blood_glucose
        HealthWriteType.PRESSURE -> R.string.read_type_blood_pressure
        HealthWriteType.TEMPERATURE -> R.string.read_type_body_temperature
        HealthWriteType.HEART -> R.string.read_type_heart_rate
        HealthWriteType.RESTING -> R.string.read_type_resting_heart_rate
        HealthWriteType.HRV -> R.string.read_type_hrv_rmssd
        HealthWriteType.OXYGEN -> R.string.read_type_oxygen_saturation
        HealthWriteType.RESPIRATION -> R.string.read_type_respiratory_rate
        HealthWriteType.NUTRITION -> R.string.health_export_food
        HealthWriteType.HYDRATION -> R.string.health_export_hydration
    }

enum class HealthWaterChoice(val wire: String, @StringRes val labelResource: Int) {
    LOGGED("logged", R.string.health_export_water_logged),
    FOOD("food", R.string.health_export_water_food),
    BOTH("both", R.string.health_export_water_both)
}

fun Context.healthExportPreviewText(target: Pair<WorkspaceOrigin, WorkspaceIdentity>, plan: HealthWritePlan): String =
    listOf(getString(R.string.health_export_preview_header,target.first.value,target.second.login,getString(plan.type.displayLabelResource),plan.timeZone,plan.rows.size,plan.skipped.size),
        plan.rows.joinToString("\n") { it.description }, plan.skipped.joinToString("\n"), getString(R.string.health_export_preview_footer))
        .filter { it.isNotEmpty() }.joinToString("\n\n")

fun Context.healthExportProgressText(progress: HealthWriteProgress): String = getString(
    if(progress.attempted>progress.confirmed) R.string.health_export_unknown_outcome else R.string.health_export_verified,progress.confirmed)
