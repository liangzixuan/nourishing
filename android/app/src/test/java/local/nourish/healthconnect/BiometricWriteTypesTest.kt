package local.nourish.healthconnect

import androidx.health.connect.client.records.*
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.records.metadata.DataOrigin
import java.io.File
import java.time.Instant
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test

class HealthWriteTypesTest {
    private val now=Instant.parse("2026-11-03T12:00:00Z")
    private fun fixtures()=JSONArray(File(requireNotNull(System.getProperty("nourish.biometricWriteFixture"))).readText())
    private fun plans()=fixtures().let{json->(0 until json.length()).map{parseHealthWritePlan(json.getJSONObject(it),now)}}
    private fun metadata(row:Record)=Metadata::class.java.constructors.first{it.parameterCount==7}.newInstance(Metadata.RECORDING_METHOD_MANUAL_ENTRY,"native",DataOrigin("local.nourish.healthconnect"),now,row.metadata.clientRecordId,row.metadata.clientRecordVersion,null) as Metadata
    @Test fun twelveServerPreviewsConstructActualSdkRecordsWithExactValuesAndUnknownContext(){
        val plans=plans();assertEquals(12,plans.size);val native=plans.associate{assertEquals(1,it.rows.size);it.type to healthNativeRecords(it,1234).single()}
        assertEquals(12,native.values.map{it::class}.toSet().size)
        assertEquals(70.25,(native.getValue(HealthWriteType.WEIGHT) as WeightRecord).weight.inKilograms,0.0)
        assertEquals(39.91612856,(native.getValue(HealthWriteType.WATER) as BodyWaterMassRecord).mass.inKilograms,0.0)
        assertEquals(20.0,(native.getValue(HealthWriteType.FAT) as BodyFatRecord).percentage.value,0.0)
        assertEquals(1.778,(native.getValue(HealthWriteType.HEIGHT) as HeightRecord).height.inMeters,0.0)
        val glucose=native.getValue(HealthWriteType.GLUCOSE) as BloodGlucoseRecord;assertEquals(90.0,glucose.level.inMilligramsPerDeciliter,0.0);assertEquals(5.0,glucose.level.inMillimolesPerLiter,0.0);assertEquals(0,glucose.specimenSource);assertEquals(0,glucose.mealType);assertEquals(0,glucose.relationToMeal)
        val pressure=native.getValue(HealthWriteType.PRESSURE) as BloodPressureRecord;assertEquals(120.0,pressure.systolic.inMillimetersOfMercury,0.0);assertEquals(80.0,pressure.diastolic.inMillimetersOfMercury,0.0);assertEquals(0,pressure.bodyPosition);assertEquals(0,pressure.measurementLocation)
        val temperature=native.getValue(HealthWriteType.TEMPERATURE) as BodyTemperatureRecord;assertEquals(37.0,temperature.temperature.inCelsius,0.0);assertEquals(0,temperature.measurementLocation)
        val heart=native.getValue(HealthWriteType.HEART) as HeartRateRecord;assertEquals(heart.startTime,heart.endTime);assertEquals(heart.startTime,heart.samples.single().time);assertEquals(72L,heart.samples.single().beatsPerMinute)
        assertEquals(57L,(native.getValue(HealthWriteType.RESTING) as RestingHeartRateRecord).beatsPerMinute)
        assertEquals(32.125,(native.getValue(HealthWriteType.HRV) as HeartRateVariabilityRmssdRecord).heartRateVariabilityMillis,0.0)
        assertEquals(98.25,(native.getValue(HealthWriteType.OXYGEN) as OxygenSaturationRecord).percentage.value,0.0)
        assertEquals(14.5,(native.getValue(HealthWriteType.RESPIRATION) as RespiratoryRateRecord).rate,0.0)
        for(plan in plans){val record=native.getValue(plan.type);assertEquals(Metadata.RECORDING_METHOD_MANUAL_ENTRY,record.metadata.recordingMethod);assertEquals(1234,record.metadata.clientRecordVersion.toInt());assertEquals(plan.rows.single().clientId,record.metadata.clientRecordId)}
    }
    @Test fun eachTypeRequestsOnlyItsOwnReadAndWritePermissions(){
        val permissions=HealthWriteType.entries.filter{!it.isIntake}.map{it.permissions};assertEquals(24,permissions.flatten().toSet().size)
        for(pair in permissions){assertEquals(2,pair.size);assertEquals(pair.single{"READ_" in it}.replace("READ_","WRITE_"),pair.single{"WRITE_" in it})}
    }
    @Test fun everyTypeWritesAndReadsBackItsOwnRecordAndRejectsDifferentValues()=runBlocking {
        for(plan in plans()){
            var record:Record?=null;var corrupt=false;var writes=0
            val sink=object:HealthWriteSink{
                override suspend fun permissions()=plan.type.permissions
                override suspend fun insert(records:List<Record>):List<String>{writes++;record=plan.type.native(plan.rows.single().let{if(corrupt)it.copy(value=it.value+1) else it},metadata(records.single()));return listOf("native")}
                override suspend fun read(type:HealthWriteType,id:String):Record{assertEquals(plan.type,type);return requireNotNull(record)}
            }
            assertEquals(1,writeReviewedHealthRecords(plan,sink,15,HealthWriteProgress()){})
            corrupt=true
            try{writeReviewedHealthRecords(plan,sink,16,HealthWriteProgress()){};fail("Changed ${plan.type} value accepted")}catch(error:HealthWriteFailure){assertEquals(0,error.confirmed);assertTrue(error.outcomeUnknown)}
            assertEquals(2,writes)
        }
    }
    @Test fun weightPermissionsCannotAuthorizeGlucoseAndRevocationBeforeWriteStopsIt()=runBlocking {
        val plan=plans().single{it.type==HealthWriteType.GLUCOSE};var granted=HealthWriteType.WEIGHT.permissions
        val sink=object:HealthWriteSink{
            override suspend fun permissions()=granted
            override suspend fun insert(records:List<Record>):List<String>{fail("Unexpected write");return emptyList()}
            override suspend fun read(type:HealthWriteType,id:String):Record=error("Unexpected read")
        }
        try{writeReviewedHealthRecords(plan,sink,1,HealthWriteProgress()){};fail("Wrong permission accepted")}catch(error:HealthWriteFailure){assertFalse(error.outcomeUnknown)}
        granted=plan.type.permissions
        try{writeReviewedHealthRecords(plan,sink,1,HealthWriteProgress()){granted=emptySet()};fail("Revocation ignored")}catch(error:HealthWriteFailure){assertFalse(error.outcomeUnknown)}
    }
}
