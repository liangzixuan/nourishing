package local.nourish.healthconnect

import androidx.health.connect.client.records.*
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.units.*
import java.io.File
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import org.junit.Assert.*
import org.junit.Test

class VitalsImportsTest {
    private val instant=Instant.parse("2026-10-31T05:20:30.123456789Z")
    private val modified=Instant.parse("2026-10-31T06:00:00Z")
    private val zone=ZoneId.of("America/Chicago")
    private val offset=ZoneOffset.ofHours(-4)
    private val types=setOf(ExportType.BODY_TEMPERATURE,ExportType.BODY_WATER_MASS,ExportType.RESTING_HEART_RATE,ExportType.HRV_RMSSD,ExportType.OXYGEN_SATURATION,ExportType.RESPIRATORY_RATE)
    private fun metadata(id:String)=Metadata::class.java.constructors.first{it.parameterCount==7}.newInstance(Metadata.RECORDING_METHOD_AUTOMATICALLY_RECORDED,id,DataOrigin("fixture.synthetic.vitals"),modified,null,0L,null) as Metadata
    private fun records():List<Record> = listOf(
        BodyTemperatureRecord(time=instant,zoneOffset=offset,temperature=Temperature.celsius(36.75),measurementLocation=BodyTemperatureMeasurementLocation.MEASUREMENT_LOCATION_FOREHEAD,metadata=metadata("temperature:opaque")),
        BodyWaterMassRecord(time=instant,zoneOffset=offset,mass=Mass.grams(40250.0),metadata=metadata("water-mass:opaque")),
        RestingHeartRateRecord(time=instant,zoneOffset=offset,beatsPerMinute=57L,metadata=metadata("resting:opaque")),
        HeartRateVariabilityRmssdRecord(time=instant,zoneOffset=offset,heartRateVariabilityMillis=32.125,metadata=metadata("rmssd:opaque")),
        OxygenSaturationRecord(time=instant,zoneOffset=offset,percentage=Percentage(98.25),metadata=metadata("oxygen:opaque")),
        RespiratoryRateRecord(time=instant,zoneOffset=offset,rate=14.5,metadata=metadata("respiration:opaque"))
    )
    @Test fun sdkSnapshotsAndChangesRetainSixDistinctNativeMeasurements() {
        val parents=records().map{requireNotNull(projectNativeParent(it,zone))};val rows=parents.map{it.records.single()}
        assertEquals(listOf(36.75,40.25,57.0,32.125,98.25,14.5),rows.map{it.value})
        assertEquals(listOf("°C","kg","bpm","ms","%","brpm"),rows.map{it.type.unit})
        assertEquals(types,rows.map{it.type}.toSet());assertEquals(ExportTemperatureContext(3),rows.first().source.temperatureContext)
        for((parent,row) in parents.zip(rows)){assertEquals("${row.type.idPrefix}:${parent.source.recordId}",row.id);assertEquals("2026-10-31T01:20:30.123456789-04:00",row.start);assertEquals("00:20",row.time);assertEquals(modified,row.source.lastModifiedAt)
            val changed=nativeChangeJson(TypedChange(parent.type,parent.source.recordId,parent));assertEquals(row.measurementLabel,changed.getString("type"));assertEquals(exportRecordJson(row).toString(),changed.getJSONArray("records").getJSONObject(0).toString())}
        val now=Instant.parse("2026-10-31T12:00:00Z");val snapshot=HealthSnapshot(ExportRange.create("2026-10-30","2026-10-31",zone,now),rows,types,emptySet())
        val directory=File(requireNotNull(System.getProperty("nourish.testFixtureDirectory")));directory.mkdirs();File(directory,"vitals-imports.json").writeText(exportSnapshotJson(snapshot,now).toString(2))
    }
    @Test fun sdkConversionUnknownLocationAndMeasuredZeroStayExplicit() {
        val native=BodyTemperatureRecord(time=instant,zoneOffset=null,temperature=Temperature.fahrenheit(98.6),metadata=metadata("fahrenheit"))
        val row=requireNotNull(projectNativeParent(native,zone)).records.single();assertEquals(37.0,row.value,0.000000001);assertEquals(ExportTemperatureContext(0),row.source.temperatureContext)
        val future=row.source.copy(temperatureContext=ExportTemperatureContext(123));assertEquals(future,measurement(ExportType.BODY_TEMPERATURE,future,instant,37.0,zone).source)
        val zero=RestingHeartRateRecord(time=instant,zoneOffset=null,beatsPerMinute=0L,metadata=metadata("zero-resting"));assertEquals(0.0,requireNotNull(projectNativeParent(zero,zone)).records.single().value,0.0)
        try{HeartRateVariabilityRmssdRecord(time=instant,zoneOffset=null,heartRateVariabilityMillis=0.0,metadata=metadata("zero-hrv"));fail("SDK accepted zero HRV")}catch(_:IllegalArgumentException){}
    }
    @Test fun allSixTypesStartUncheckedAndHaveSeparateReadPermissions() {
        assertTrue(types.all{!it.selectedInitially});assertEquals(7,ExportType.entries.count{it.selectedInitially});assertEquals(17,HEALTH_RECORD_TYPES.size)
        val expected=setOf("BODY_TEMPERATURE","BODY_WATER_MASS","RESTING_HEART_RATE","HEART_RATE_VARIABILITY","OXYGEN_SATURATION","RESPIRATORY_RATE").map{"android.permission.health.READ_$it"}.toSet()
        assertEquals(expected,readPermissions(types));assertEquals(6,types.map{readPermissions(setOf(it)).single()}.toSet().size)
    }
    @Test fun wireBoundsAndTemperatureContextApplyAtTheMeasurementOwner() {
        for(type in types){val source=ExportSource("fixture.synthetic.vitals","native",modified,temperatureContext=if(type==ExportType.BODY_TEMPERATURE)ExportTemperatureContext(0) else null)
            for(value in listOf(type.minimum,requireNotNull(type.maximum)))assertEquals(value,measurement(type,source,instant,value,zone).value,0.0)
            for(value in listOf(type.minimum-0.01,requireNotNull(type.maximum)+0.01,Double.NaN,Double.POSITIVE_INFINITY))try{measurement(type,source,instant,value,zone);fail("Invalid $type accepted")}catch(_:IllegalArgumentException){}
        }
        val source=ExportSource("fixture.synthetic.vitals","native",modified)
        try{measurement(ExportType.RESTING_HEART_RATE,source,instant,57.5,zone);fail("Fractional resting beats accepted")}catch(_:IllegalArgumentException){}
        try{measurement(ExportType.BODY_TEMPERATURE,source,instant,37.0,zone);fail("Missing temperature context accepted")}catch(_:IllegalArgumentException){}
        try{measurement(ExportType.OXYGEN_SATURATION,source.copy(temperatureContext=ExportTemperatureContext(0)),instant,98.0,zone);fail("Temperature context attached to oxygen")}catch(_:IllegalArgumentException){}
    }
}
