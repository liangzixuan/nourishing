package local.nourish.healthconnect

import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.records.metadata.DataOrigin
import java.io.File
import java.io.IOException
import java.time.Instant
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.json.JSONArray
import androidx.health.connect.client.records.Record
import org.junit.Assert.*
import org.junit.Test

class BiometricExportTest {
    private val now=Instant.parse("2026-11-03T12:00:00Z")
    private fun fixture()=JSONArray(File(requireNotNull(System.getProperty("nourish.biometricWriteFixture"))).readText()).getJSONObject(0)
    private fun plan()=parseHealthWritePlan(fixture(),now)
    private fun stored(row:WeightRecord,id:String,app:String="local.nourish.healthconnect"):WeightRecord {
        val metadata=Metadata::class.java.constructors.first{it.parameterCount==7}.newInstance(Metadata.RECORDING_METHOD_MANUAL_ENTRY,id,DataOrigin(app),now,row.metadata.clientRecordId,row.metadata.clientRecordVersion,null) as Metadata
        return WeightRecord(time=row.time,zoneOffset=row.zoneOffset,weight=row.weight,metadata=metadata)
    }
    private inner class Sink:HealthWriteSink {
        var granted=HealthWriteType.WEIGHT.permissions;var inserts=0;var failAt=0;var cancel=false
        val values=linkedMapOf<String,WeightRecord>()
        override suspend fun permissions()=granted
        override suspend fun insert(records:List<Record>):List<String>{
            inserts++;if(cancel)throw CancellationException("interrupted");if(inserts==failAt)throw IOException("lost write response")
            return records.map{item->val row=item as WeightRecord;val id="native:"+row.metadata.clientRecordId;val old=values[id];if(old==null||row.metadata.clientRecordVersion>old.metadata.clientRecordVersion)values[id]=stored(row,id);id}
        }
        override suspend fun read(type:HealthWriteType,id:String)=values.getValue(id)
    }
    @Test fun serverPreviewProducesManualSdkWeightWithStableIdentityAndExplicitOffset(){
        val plan=plan();assertEquals(1,plan.rows.size);assertEquals(1,plan.skipped.size);val record=healthNativeRecords(plan,1234L).single() as WeightRecord
        assertEquals(70.25,record.weight.inKilograms,0.0);assertEquals(Instant.parse("2026-10-31T13:00:00Z"),record.time);assertEquals(-18000,record.zoneOffset!!.totalSeconds)
        assertEquals(Metadata.RECORDING_METHOD_MANUAL_ENTRY,record.metadata.recordingMethod);assertEquals(1234L,record.metadata.clientRecordVersion);assertEquals(plan.rows.single().clientId,record.metadata.clientRecordId)
        assertEquals(200L,nextHealthWriteVersion(100,199));assertEquals(300L,nextHealthWriteVersion(300,199))
    }
    @Test fun ambiguousMissingAndFutureInstantsAreNotGuessed(){
        for((date,time,reason) in listOf(Triple("2026-11-01","01:30","ambiguous"),Triple("2026-03-08","02:30","does not exist"),Triple("2026-12-01","08:00","Future"))){
            val json=fixture();json.getJSONArray("records").getJSONObject(0).put("date",date).put("time",time);val parsed=parseHealthWritePlan(json,now);assertTrue(parsed.rows.isEmpty());assertTrue(parsed.skipped.any{reason in it})
        }
        val malformed=fixture();malformed.getJSONArray("records").getJSONObject(0).put("nativeValue",1001)
        assertTrue(parseHealthWritePlan(malformed,now).rows.isEmpty())
    }
    @Test fun deniedPermissionAndStaleServerReviewPreventAnyNativeWrite()=runBlocking {
        val sink=Sink();sink.granted=emptySet()
        try{writeReviewedHealthRecords(plan(),sink,1,HealthWriteProgress()){fail("Server verify should not run")};fail("Permission denial ignored")}catch(error:HealthWriteFailure){assertFalse(error.outcomeUnknown)}
        assertEquals(0,sink.inserts);sink.granted=HealthWriteType.WEIGHT.permissions
        try{writeReviewedHealthRecords(plan(),sink,1,HealthWriteProgress()){throw IOException("stale review")};fail("Stale review ignored")}catch(error:HealthWriteFailure){assertFalse(error.outcomeUnknown)}
        assertEquals(0,sink.inserts)
    }
    @Test fun successfulReadsConfirmWritesAndRepeatsKeepOneNativeRecord()=runBlocking {
        val sink=Sink();val plan=plan();assertEquals(1,writeReviewedHealthRecords(plan,sink,10,HealthWriteProgress()){});assertEquals(1,writeReviewedHealthRecords(plan,sink,11,HealthWriteProgress()){});assertEquals(1,sink.values.size)
        val progress=HealthWriteProgress();try{writeReviewedHealthRecords(plan,sink,9,progress){};fail("Ignored old revision reported as success")}catch(error:HealthWriteFailure){assertTrue(error.outcomeUnknown);assertEquals(0,error.confirmed)}
        assertEquals(11L,sink.values.values.single().metadata.clientRecordVersion)
    }
    @Test fun partialBatchFailureAndCancellationDoNotReplayUnverifiedWrites()=runBlocking {
        val base=plan();val row=base.rows.single();val many=base.copy(rows=(0..1000).map{row.copy(id="row:$it",clientId="nourish-export:weight:"+it.toString().padStart(64,'0'))});val sink=Sink();sink.failAt=2;val progress=HealthWriteProgress()
        try{writeReviewedHealthRecords(many,sink,10,progress){};fail("Lost response reported as success")}catch(error:HealthWriteFailure){assertEquals(1000,error.confirmed);assertTrue(error.outcomeUnknown)}
        assertEquals(2,sink.inserts);assertEquals(1001,progress.attempted);assertEquals(1000,sink.values.size)
        val cancelled=Sink();cancelled.cancel=true;val cancellationProgress=HealthWriteProgress();try{writeReviewedHealthRecords(base,cancelled,11,cancellationProgress){};fail("Cancellation swallowed")}catch(_:CancellationException){}
        assertEquals(1,cancelled.inserts);assertEquals(1,cancellationProgress.attempted);assertEquals(0,cancellationProgress.confirmed)
    }
    @Test fun ownExportsAreFilteredWithoutDroppingOtherAppsRecords(){
        val native=healthNativeRecords(plan(),10).single() as WeightRecord;assertTrue(isNourishExport(stored(native,"native")));assertFalse(isNourishExport(stored(native,"native","another.app")))
        assertFalse(isNourishExport(WeightRecord(time=native.time,zoneOffset=native.zoneOffset,weight=native.weight,metadata=Metadata.manualEntry(clientRecordId="unrelated",clientRecordVersion=10))))
    }
    @Test fun excludedOwnExportsStillConsumeTheNativeChangeBudget()=runBlocking {
        val feed=object:ChangeFeed {
            override suspend fun token(type:ExportType)="initial"
            override suspend fun page(type:ExportType,token:String)=ChangePage(emptyList(),"next",false,false,MAX_EXPORT_RECORDS+1)
        }
        try{ChangesReader(feed).read(ExportType.WEIGHT,"initial");fail("Filtered native changes bypassed the read budget")}catch(_:IllegalArgumentException){}
    }
}
