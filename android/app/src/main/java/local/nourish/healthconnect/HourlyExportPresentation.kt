package local.nourish.healthconnect

import android.content.Context

fun Context.hourlyExportStatusText(status: HourlyExportStatus?): String = when(status) {
    null -> getString(R.string.hourly_export_no_result)
    HourlyExportStatus.Enabled -> getString(R.string.hourly_export_enabled)
    is HourlyExportStatus.Completed -> getString(R.string.hourly_export_completed,status.at.toString(),status.written,status.unchanged,status.skipped)
    is HourlyExportStatus.Interrupted -> status.at.toString()+" · "+getString(R.string.health_export_interrupted)+" "+healthExportProgressText(HealthWriteProgress(status.attempted,status.confirmed))
    is HourlyExportStatus.Failed -> status.at.toString()+" · "+syncDiagnosticText(status.problem)+" "+healthExportProgressText(HealthWriteProgress(status.attempted,status.confirmed))+" "+getString(R.string.hourly_export_retry)
    is HourlyExportStatus.Literal -> status.text
}
fun Context.hourlyExportText(snapshots: List<HourlyExportSnapshot>): String = if(snapshots.isEmpty())getString(R.string.hourly_export_off) else snapshots.joinToString("\n\n") { snapshot ->
    val config=snapshot.config
    fun metric(value: HourlyExportMetric) = "${value.name} (${value.unit})"
    val mapping=when(val selection=config.mapping) {
        HourlyExportMapping.Nutrition -> getString(R.string.hourly_export_nutrition)
        is HourlyExportMapping.Hydration -> getString(HealthWaterChoice.entries.single { it.wire==selection.source }.labelResource)
        is HourlyExportMapping.Measurement -> metric(selection.metric)
        is HourlyExportMapping.Pressure -> getString(R.string.hourly_export_pressure,metric(selection.systolic),metric(selection.diastolic))
    }
    getString(R.string.hourly_export_configuration,getString(config.type.displayLabelResource),config.days,config.origin.value,config.login,mapping,config.timeZone,hourlyExportStatusText(snapshot.status))
}
