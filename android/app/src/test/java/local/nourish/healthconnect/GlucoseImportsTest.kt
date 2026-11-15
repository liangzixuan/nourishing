package local.nourish.healthconnect

import androidx.health.connect.client.records.BloodGlucoseRecord
import androidx.health.connect.client.records.MealType
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.units.BloodGlucose
import java.io.File
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import org.junit.Assert.*
import org.junit.Test

class GlucoseImportsTest {
    private val instant=Instant.parse("2026-10-31T05:20:30.123456789Z")
    private val modified=Instant.parse("2026-10-31T06:00:00Z")
    private val zone=ZoneId.of("America/Chicago")
    private fun metadata(id:String)=Metadata::class.java.constructors.first{it.parameterCount==7}.newInstance(Metadata.RECORDING_METHOD_AUTOMATICALLY_RECORDED,id,DataOrigin("fixture.synthetic.glucose"),modified,null,0L,null) as Metadata
    @Test fun sdkRecordPreservesUnitsContextIdentityAndTimeInSnapshotAndChanges() {
        val native=BloodGlucoseRecord(time=instant,zoneOffset=ZoneOffset.ofHours(-4),level=BloodGlucose.millimolesPerLiter(5.25),specimenSource=BloodGlucoseRecord.SPECIMEN_SOURCE_CAPILLARY_BLOOD,mealType=MealType.MEAL_TYPE_BREAKFAST,relationToMeal=BloodGlucoseRecord.RELATION_TO_MEAL_BEFORE_MEAL,metadata=metadata("glucose:opaque"))
        val parent=requireNotNull(projectNativeParent(native,zone));val row=parent.records.single()
        assertEquals("blood-glucose:glucose:opaque",row.id);assertEquals(5.25,row.value,0.0)
        assertEquals("mmol/L",row.type.unit);assertEquals("00:20",row.time)
        assertEquals("2026-10-31T01:20:30.123456789-04:00",row.start)
        assertEquals(ExportGlucoseContext(2,1,3),row.source.glucoseContext)
        assertEquals(modified,row.source.lastModifiedAt)
        val now=Instant.parse("2026-10-31T12:00:00Z")
        val snapshot=HealthSnapshot(ExportRange.create("2026-10-30","2026-10-31",zone,now),listOf(row),setOf(ExportType.BLOOD_GLUCOSE),emptySet())
        val json=exportSnapshotJson(snapshot,now)
        val changed=nativeChangeJson(TypedChange(parent.type,parent.source.recordId,parent))
        assertEquals(json.getJSONArray("records").getJSONObject(0).toString(),changed.getJSONArray("records").getJSONObject(0).toString())
        val directory=File(requireNotNull(System.getProperty("nourish.testFixtureDirectory")));directory.mkdirs();File(directory,"glucose-imports.json").writeText(json.toString(2))
    }
    @Test fun unknownContextAndSdkUnitConversionArePreserved() {
        val level=BloodGlucose.milligramsPerDeciliter(100.0)
        val native=BloodGlucoseRecord(time=instant,zoneOffset=null,level=level,metadata=metadata("unknown"))
        val row=requireNotNull(projectNativeParent(native,zone)).records.single()
        assertEquals(level.inMillimolesPerLiter,row.value,0.0)
        assertEquals(ExportGlucoseContext(0,0,0),row.source.glucoseContext)
        val source=row.source.copy(glucoseContext=ExportGlucoseContext(123,456,789))
        assertEquals(source,measurement(ExportType.BLOOD_GLUCOSE,source,instant,5.0,zone).source)
    }
    @Test fun boundsAndContextAreRequiredWithoutSelectingOrGrantingTheType() {
        assertFalse(ExportType.BLOOD_GLUCOSE.selectedInitially)
        assertEquals(7,ExportType.entries.count{it.selectedInitially})
        assertEquals(setOf("android.permission.health.READ_BLOOD_GLUCOSE"),readPermissions(setOf(ExportType.BLOOD_GLUCOSE)))
        val source=ExportSource("fixture.synthetic.glucose","native",modified,glucoseContext=ExportGlucoseContext(0,0,0))
        for(value in listOf(0.0,50.0))assertEquals(value,measurement(ExportType.BLOOD_GLUCOSE,source,instant,value,zone).value,0.0)
        for(value in listOf(-1.0,50.01,Double.NaN,Double.POSITIVE_INFINITY))try{measurement(ExportType.BLOOD_GLUCOSE,source,instant,value,zone);fail("Invalid glucose accepted")}catch(_:IllegalArgumentException){}
        try{measurement(ExportType.BLOOD_GLUCOSE,source.copy(glucoseContext=null),instant,5.0,zone);fail("Missing context accepted")}catch(_:IllegalArgumentException){}
        try{measurement(ExportType.WEIGHT,source,instant,5.0,zone);fail("Context on other type accepted")}catch(_:IllegalArgumentException){}
    }
}
