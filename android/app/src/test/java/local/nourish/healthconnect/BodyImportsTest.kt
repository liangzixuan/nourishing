package local.nourish.healthconnect

import androidx.health.connect.client.records.HeightRecord
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.units.Length
import androidx.health.connect.client.units.Percentage
import java.io.File
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import org.junit.Assert.*
import org.junit.Test

class BodyImportsTest {
    private val instant=Instant.parse("2026-10-31T05:20:30.123456789Z")
    private val modified=Instant.parse("2026-10-31T06:00:00Z")
    private val zone=ZoneId.of("America/Chicago")
    private fun metadata(id:String)=Metadata::class.java.constructors.first{it.parameterCount==7}.newInstance(Metadata.RECORDING_METHOD_AUTOMATICALLY_RECORDED,id,DataOrigin("fixture.synthetic.body"),modified,null,0L,null) as Metadata
    private fun parents()=listOf(
        requireNotNull(projectNativeParent(HeightRecord(time=instant,zoneOffset=ZoneOffset.ofHours(-4),height=Length.meters(1.825),metadata=metadata("height:opaque")),zone)),
        requireNotNull(projectNativeParent(BodyFatRecord(time=instant,zoneOffset=null,percentage=Percentage(21.25),metadata=metadata("fat:opaque")),zone))
    )
    @Test fun sdkRecordsPreserveIdentityUnitsTimeAndModificationInRealExport() {
        val parents=parents();val height=parents[0].records.single();val fat=parents[1].records.single()
        assertEquals("height:height:opaque",height.id);assertEquals("body-fat:fat:opaque",fat.id)
        assertEquals(182.5,height.value,0.000000001);assertEquals(21.25,fat.value,0.0)
        assertEquals("2026-10-31T01:20:30.123456789-04:00",height.start);assertEquals(instant.toString(),fat.start)
        assertEquals("00:20",height.time);assertEquals(modified,height.source.lastModifiedAt)
        val now=Instant.parse("2026-10-31T12:00:00Z");val range=ExportRange.create("2026-10-30","2026-10-31",zone,now)
        val snapshot=HealthSnapshot(range,parents.flatMap{it.records},setOf(ExportType.HEIGHT,ExportType.BODY_FAT),emptySet())
        val json=exportSnapshotJson(snapshot,now);assertEquals(2,json.getJSONArray("records").length())
        val directory=File(requireNotNull(System.getProperty("nourish.testFixtureDirectory")));directory.mkdirs();File(directory,"body-imports.json").writeText(json.toString(2))
        for(parent in parents){val changed=nativeChangeJson(TypedChange(parent.type,parent.source.recordId,parent));assertEquals(parent.type.label,changed.getString("type"));assertEquals(1,changed.getJSONArray("records").length());assertEquals(parent.source.recordId,changed.getString("recordId"))}
    }
    @Test fun newTypesAreOptInAndUseSeparateReadPermissions() {
        assertFalse(ExportType.HEIGHT.selectedInitially);assertFalse(ExportType.BODY_FAT.selectedInitially)
        assertEquals(7,ExportType.entries.count{it.selectedInitially})
        assertEquals(setOf("android.permission.health.READ_HEIGHT","android.permission.health.READ_BODY_FAT"),readPermissions(setOf(ExportType.HEIGHT,ExportType.BODY_FAT)))
        assertEquals(17,HEALTH_RECORD_TYPES.size)
    }
    @Test fun sourceBoundsAcceptMeasuredZeroAndRejectImpossibleWireValues() {
        val source=ExportSource("fixture.synthetic.body","native",modified)
        for((type,maximum) in listOf(ExportType.HEIGHT to 300.0,ExportType.BODY_FAT to 100.0)) {
            assertEquals(0.0,measurement(type,source,instant,0.0,zone).value,0.0)
            assertEquals(maximum,measurement(type,source,instant,maximum,zone).value,0.0)
            for(invalid in listOf(-1.0,maximum+0.01,Double.NaN,Double.POSITIVE_INFINITY))try{measurement(type,source,instant,invalid,zone);fail("Invalid body measurement accepted")}catch(_:IllegalArgumentException){}
        }
    }
}
