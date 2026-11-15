package local.nourish.healthconnect

import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.records.metadata.DataOrigin
import java.io.File
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ExerciseContextTest {
    private val start=Instant.parse("2026-10-31T05:20:30.123456789Z")
    private val end=start.plusSeconds(1800)
    private val modified=Instant.parse("2026-10-31T07:00:00Z")
    private val zone=ZoneId.of("America/Chicago")
    private fun metadata(id:String)=Metadata::class.java.constructors.first{it.parameterCount==7}.newInstance(Metadata.RECORDING_METHOD_ACTIVELY_RECORDED,id,DataOrigin("fixture.synthetic.exercise"),modified,null,0L,null) as Metadata
    private fun session(id:String,code:Int,title:String?=null,notes:String?=null)=ExerciseSessionRecord(startTime=start,startZoneOffset=ZoneOffset.ofHours(-4),endTime=end,endZoneOffset=ZoneOffset.ofHours(-4),metadata=metadata(id),exerciseType=code,title=title,notes=notes)
    @Test fun nativeSessionContextSurvivesSnapshotAndChangeProjection() {
        val sessions=listOf(session("run:opaque",ExerciseSessionRecord.EXERCISE_TYPE_RUNNING,"Morning run <img src=x onerror=alert(1)>","Easy pace & shade\n<script>window.exerciseInjected=true</script>"),session("other:opaque",ExerciseSessionRecord.EXERCISE_TYPE_OTHER_WORKOUT),session("future:opaque",999,"",""))
        val parents=sessions.map{requireNotNull(projectNativeParent(it,zone))}
        val rows=parents.map{it.records.single()}
        for((native,parent) in sessions.zip(parents)) {
            val row=parent.records.single();assertEquals(ExportType.EXERCISE_DURATION,row.type);assertEquals(30.0,row.value,0.0)
            assertEquals(ExportExerciseContext(native.exerciseType,native.title,native.notes),row.source.exerciseContext)
            assertEquals("exercise-duration:${native.metadata.id}",row.id);assertEquals("2026-10-31T01:20:30.123456789-04:00",row.start);assertEquals("2026-10-31T01:50:30.123456789-04:00",row.end)
            assertEquals(exportRecordJson(row).toString(),nativeChangeJson(TypedChange(parent.type,parent.source.recordId,parent)).getJSONArray("records").getJSONObject(0).toString())
        }
        assertFalse(exportRecordJson(rows[1]).getJSONObject("source").getJSONObject("exerciseContext").has("title"))
        assertEquals("",exportRecordJson(rows[2]).getJSONObject("source").getJSONObject("exerciseContext").getString("title"))
        val now=Instant.parse("2026-10-31T12:00:00Z");val snapshot=HealthSnapshot(ExportRange.create("2026-10-30","2026-10-31",zone,now),rows,setOf(ExportType.EXERCISE_DURATION),emptySet())
        val directory=File(requireNotNull(System.getProperty("nourish.testFixtureDirectory")));directory.mkdirs();File(directory,"exercise-context.json").writeText(exportSnapshotJson(snapshot,now).toString(2))
    }
    @Test fun publishedActivityCodesComeFromThePinnedSdk() {
        val types=ExerciseSessionRecord::class.java.fields.filter{it.name.startsWith("EXERCISE_TYPE_") && it.type == Int::class.javaPrimitiveType}.associate{it.getInt(null).toString() to it.name}
        assertTrue(types.size>50);assertEquals("EXERCISE_TYPE_RUNNING",types["56"]);assertEquals("EXERCISE_TYPE_OTHER_WORKOUT",types["0"])
        val directory=File(requireNotNull(System.getProperty("nourish.testFixtureDirectory")));directory.mkdirs();File(directory,"exercise-types.json").writeText(JSONObject(types).toString(2))
    }
    @Test fun contextHasOneOwnerAndNoExtraPermission() {
        assertEquals(setOf("android.permission.health.READ_EXERCISE"),readPermissions(setOf(ExportType.EXERCISE_DURATION)))
        val source=ExportSource("fixture.synthetic.exercise","native",modified,exerciseContext=ExportExerciseContext(56))
        try{measurement(ExportType.WEIGHT,source,start,30.0,zone);fail("Exercise context attached to weight")}catch(_:IllegalArgumentException){}
        try{measurement(ExportType.EXERCISE_DURATION,source,start,30.0,zone);fail("Exercise context missing interval")}catch(_:IllegalArgumentException){}
        try{ExportExerciseContext(-1);fail("Negative code accepted")}catch(_:IllegalArgumentException){}
    }
}
