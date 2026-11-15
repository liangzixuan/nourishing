package local.nourish.healthconnect

import androidx.health.connect.client.records.BloodPressureRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.units.Pressure
import java.io.File
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import org.junit.Assert.*
import org.junit.Test

class PressureImportsTest {
    private val instant=Instant.parse("2026-10-31T05:20:30.123456789Z")
    private val modified=Instant.parse("2026-10-31T06:00:00Z")
    private val zone=ZoneId.of("America/Chicago")
    private fun metadata(id:String)=Metadata::class.java.constructors.first{it.parameterCount==7}.newInstance(Metadata.RECORDING_METHOD_AUTOMATICALLY_RECORDED,id,DataOrigin("fixture.synthetic.pressure"),modified,null,0L,null) as Metadata
    private fun parent(id:String,systolic:Double,diastolic:Double)=requireNotNull(projectNativeParent(BloodPressureRecord(time=instant,zoneOffset=ZoneOffset.ofHours(-4),systolic=Pressure.millimetersOfMercury(systolic),diastolic=Pressure.millimetersOfMercury(diastolic),bodyPosition=BloodPressureRecord.BODY_POSITION_SITTING_DOWN,measurementLocation=BloodPressureRecord.MEASUREMENT_LOCATION_LEFT_UPPER_ARM,metadata=metadata(id)),zone))
    @Test fun sdkPairExportsDistinctComponentsWithOneNativeParentAndExactContext() {
        val parents=listOf(parent("pressure:A",120.5,80.25),parent("pressure:B",130.0,85.0))
        for(parent in parents){assertEquals(ExportType.BLOOD_PRESSURE,parent.type);assertEquals(2,parent.records.size)
            assertEquals(listOf("Systolic","Diastolic"),parent.records.map{it.measurementLabel})
            for(row in parent.records){assertEquals("mmHg",row.type.unit);assertEquals("2026-10-31T01:20:30.123456789-04:00",row.start);assertEquals("00:20",row.time);assertEquals(modified,row.source.lastModifiedAt)
                val context=requireNotNull(row.source.pressureContext);assertEquals(2,context.bodyPosition);assertEquals(3,context.measurementLocation);assertEquals("blood-pressure:${parent.source.recordId}:${context.component.wireName}",row.id)}
            val change=nativeChangeJson(TypedChange(parent.type,parent.source.recordId,parent));assertEquals("Blood pressure",change.getString("type"));assertEquals(2,change.getJSONArray("records").length());assertEquals("Systolic",change.getJSONArray("records").getJSONObject(0).getString("type"))
        }
        val now=Instant.parse("2026-10-31T12:00:00Z");val snapshot=HealthSnapshot(ExportRange.create("2026-10-30","2026-10-31",zone,now),parents.flatMap{it.records},setOf(ExportType.BLOOD_PRESSURE),emptySet())
        val directory=File(requireNotNull(System.getProperty("nourish.testFixtureDirectory")));directory.mkdirs();File(directory,"pressure-imports.json").writeText(exportSnapshotJson(snapshot,now).toString(2))
    }
    @Test fun nativeOptInAndContextAreSeparateFromOtherHealthSelections() {
        assertFalse(ExportType.BLOOD_PRESSURE.selectedInitially);assertEquals(7,ExportType.entries.count{it.selectedInitially})
        assertEquals(setOf("android.permission.health.READ_BLOOD_PRESSURE"),readPermissions(setOf(ExportType.BLOOD_PRESSURE)))
        val record=BloodPressureRecord(time=instant,zoneOffset=null,systolic=Pressure.millimetersOfMercury(120.0),diastolic=Pressure.millimetersOfMercury(80.0),metadata=metadata("unknown"))
        val row=requireNotNull(projectNativeParent(record,zone)).records.first();assertEquals(0,row.source.pressureContext!!.bodyPosition);assertEquals(0,row.source.pressureContext!!.measurementLocation)
        val unknown=row.source.copy(pressureContext=ExportPressureContext(PressureComponent.SYSTOLIC,123,456));assertEquals(unknown,measurement(ExportType.BLOOD_PRESSURE,unknown,instant,120.0,zone,sampleId="systolic").source)
    }
    @Test fun wireBoundsAllowDocumentedPlatformExtensionRangeWithoutDiscardingNativeComponents() {
        for(component in PressureComponent.entries){val source=ExportSource("fixture.synthetic.pressure","native",modified,pressureContext=ExportPressureContext(component,0,0))
            for(value in listOf(component.minimum,300.0))assertEquals(value,measurement(ExportType.BLOOD_PRESSURE,source,instant,value,zone,sampleId=component.wireName).value,0.0)
            for(value in listOf(component.minimum-0.01,300.01,Double.NaN))try{measurement(ExportType.BLOOD_PRESSURE,source,instant,value,zone);fail("Invalid pressure accepted")}catch(_:IllegalArgumentException){}
            try{measurement(ExportType.WEIGHT,source,instant,70.0,zone);fail("Pressure context on weight accepted")}catch(_:IllegalArgumentException){}
            try{measurement(ExportType.BLOOD_PRESSURE,source.copy(pressureContext=null),instant,120.0,zone);fail("Missing component context accepted")}catch(_:IllegalArgumentException){}
        }
    }
}
