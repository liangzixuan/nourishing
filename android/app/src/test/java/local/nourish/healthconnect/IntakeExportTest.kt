package local.nourish.healthconnect

import androidx.health.connect.client.records.*
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.units.Mass
import androidx.health.connect.client.units.Energy
import java.io.File
import java.time.Instant
import java.time.ZoneId
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test

class IntakeExportTest {
    private val now=Instant.parse("2026-11-03T12:00:00Z")
    private fun fixture(index:Int)=JSONArray(File(requireNotNull(System.getProperty("nourish.intakeWriteFixture"))).readText()).getJSONObject(index)
    private fun plan(index:Int)=parseHealthWritePlan(fixture(index),now)
    private fun metadata(row:Record)=Metadata::class.java.constructors.first{it.parameterCount==7}.newInstance(Metadata.RECORDING_METHOD_MANUAL_ENTRY,"native",DataOrigin("local.nourish.healthconnect"),now,row.metadata.clientRecordId,row.metadata.clientRecordVersion,null) as Metadata
    @Test fun serverFoodPreviewConstructsSdkNutritionWithThirtySevenFieldsAndPreservesUnknowns(){
        val plan=plan(0);assertEquals(1,plan.rows.size);val record=healthNativeRecords(plan,25).single() as NutritionRecord
        assertEquals("Synthetic complete food",record.name);assertEquals(0,record.mealType);assertEquals(Instant.parse("2026-10-31T13:00:00Z"),record.startTime);assertEquals(record.startTime.plusSeconds(60),record.endTime);assertEquals(-18000,record.startZoneOffset!!.totalSeconds);assertEquals(record.startZoneOffset,record.endZoneOffset)
        assertEquals(100.0,record.energy!!.inKilocalories,0.0);assertEquals(0.0,record.protein!!.inGrams,0.0);assertEquals(0.5,record.totalCarbohydrate!!.inGrams,0.0);assertEquals(0.0005,record.sodium!!.inGrams,0.0);assertEquals(0.0000005,record.vitaminB12!!.inGrams,0.0)
        assertNull(record.vitaminA);assertNull(record.folate);assertNull(record.vitaminE);assertNull(record.unsaturatedFat);assertNull(record.energyFromFat)
        assertEquals(37,plan.rows.single().nutrients.size)
        for((field,value) in plan.rows.single().nutrients){val getter="get"+field.replaceFirstChar{it.uppercase()};val native=record.javaClass.getMethod(getter).invoke(record);val actual=if(native is Mass)native.inGrams else (native as Energy).inKilocalories;assertEquals(field,value,actual,0.0)}
        assertEquals(25L,record.metadata.clientRecordVersion);assertEquals(plan.rows.single().clientId,record.metadata.clientRecordId);assertTrue(plan.rows.single().description.contains("Omitted:"))
    }
    @Test fun waterPreviewKeepsFoodWaterAndLoggedDrinksSeparateAndUsesLiters(){
        val plan=plan(1);val records=healthNativeRecords(plan,26).map{it as HydrationRecord};assertEquals(2,records.size);assertEquals(listOf(0.05,1.25),records.map{it.volume.inLiters});assertEquals(2,records.map{it.metadata.clientRecordId}.toSet().size)
        for(record in records){assertEquals(record.startTime.plusSeconds(60),record.endTime);assertTrue(isNourishExport(HealthWriteType.HYDRATION.native(plan.rows[records.indexOf(record)],metadata(record))))}
    }
    @Test fun intervalResolutionRejectsFutureEndAndDstAmbiguityWithoutGuessingMealDuration(){
        val json=fixture(0);val parsed=parseHealthWritePlan(json,Instant.parse("2026-10-31T13:00:30Z"));assertTrue(parsed.rows.isEmpty());assertTrue(parsed.skipped.single().contains("Future"))
        for((date,time) in listOf("2026-11-01" to "01:30","2026-03-08" to "02:30")){val sample=fixture(0);sample.getJSONArray("records").getJSONObject(0).put("date",date).put("time",time);assertTrue(parseHealthWritePlan(sample,now).rows.isEmpty())}
        val crossing=resolveExportClock("2026-03-08","01:59",ZoneId.of("America/Chicago"),now,true) as ExportClock;assertEquals(60L,crossing.end.epochSecond-crossing.start.epochSecond);assertEquals(-21600,crossing.offset.totalSeconds);assertEquals(-18000,crossing.endOffset.totalSeconds)
    }
    @Test fun sharedWriterVerifiesFoodAndHydrationAndRejectsInventedZeroForUnknownNutrient()=runBlocking {
        for(index in 0..1){val base=plan(index);val plan=base.copy(rows=listOf(base.rows.first()));var stored:Record?=null
            val sink=object:HealthWriteSink{
                override suspend fun permissions()=plan.type.permissions
                override suspend fun insert(records:List<Record>):List<String>{stored=plan.type.native(plan.rows.single(),metadata(records.single()));return listOf("native")}
                override suspend fun read(type:HealthWriteType,id:String)=requireNotNull(stored)
            };assertEquals(1,writeReviewedHealthRecords(plan,sink,31,HealthWriteProgress()){})
        }
        val base=plan(0);val plan=base.copy(rows=listOf(base.rows.single().copy(nutrients=mapOf("energy" to 100.0))))
        var stored:Record?=null
        val sink=object:HealthWriteSink{
            override suspend fun permissions()=plan.type.permissions
            override suspend fun insert(records:List<Record>):List<String>{val row=plan.rows.single();stored=NutritionRecord(startTime=row.time,startZoneOffset=row.offset,endTime=requireNotNull(row.end),endZoneOffset=row.endOffset,metadata=metadata(records.single()),name=row.name,energy=Energy.kilocalories(100.0),protein=Mass.grams(0.0));return listOf("native")}
            override suspend fun read(type:HealthWriteType,id:String)=requireNotNull(stored)
        }
        try{writeReviewedHealthRecords(plan,sink,32,HealthWriteProgress()){};fail("Unknown protein became measured zero")}catch(error:HealthWriteFailure){assertTrue(error.outcomeUnknown);assertEquals(0,error.confirmed)}
    }
    @Test fun nutritionAndHydrationPermissionsAreSeparateAndUnsupportedFieldsNeverReachWriter(){
        assertEquals(setOf("android.permission.health.READ_NUTRITION","android.permission.health.WRITE_NUTRITION"),HealthWriteType.NUTRITION.permissions)
        assertEquals(setOf("android.permission.health.READ_HYDRATION","android.permission.health.WRITE_HYDRATION"),HealthWriteType.HYDRATION.permissions)
        val unknown=fixture(0);unknown.getJSONArray("records").getJSONObject(0).getJSONObject("nutrients").put("unknownNutrient",12)
        try{parseHealthWritePlan(unknown,now);fail("Unknown native nutrient field accepted")}catch(_:IllegalArgumentException){}
        val excessive=fixture(0);excessive.getJSONArray("records").getJSONObject(0).getJSONObject("nutrients").put("sodium",101);val preview=parseHealthWritePlan(excessive,now);assertTrue(preview.rows.isEmpty());assertTrue(preview.skipped.single().contains("SDK"))
    }
    @Test fun sourceCreditBecomesPersistedNativeNameAndSurvivesReceiptRoundTrip(){
        val json=fixture(2);val input=json.getJSONArray("records").getJSONObject(0)
        val credit=input.getJSONArray("attributions").getString(0)
        val plan=parseHealthWritePlan(json,now);val row=plan.rows.single()
        val record=healthNativeRecords(plan,40).single() as NutritionRecord
        assertEquals(input.getString("name")+"\n"+credit,record.name)
        assertTrue(row.description.contains(credit));assertEquals(plan(0).rows.single().nutrients,row.nutrients)
        val receipt=HealthWriteReceipt("native",40,row)
        val restored=parseHealthReceipts(plan.type,healthReceiptJson(plan.type,mapOf(row.clientId to receipt))).getValue(row.clientId)
        assertEquals(record.name,restored.row.name)
        assertEquals(healthPayloadDigest(plan.type,row),healthPayloadDigest(plan.type,restored.row))
        val actual=plan.type.native(row,metadata(record));assertTrue(restored.matches(plan.type,actual))
        assertFalse(restored.matches(plan.type,plan.type.native(row.copy(name=input.getString("name")),actual.metadata)))
        assertNotEquals(healthPayloadDigest(plan.type,row),healthPayloadDigest(plan.type,row.copy(name=input.getString("name"))))
        val hydration=plan(3);assertEquals(1,hydration.rows.size);assertTrue(hydration.skipped.single().contains("source credits"))
    }
    @Test fun oldMissingMalformedDuplicateAndUnrepresentableSourceCreditsAreRejected(){
        val old=fixture(0).put("version",1)
        assertThrows(IllegalArgumentException::class.java){parseHealthWritePlan(old,now)}
        val missing=fixture(0);missing.getJSONArray("records").getJSONObject(0).remove("attributions")
        assertThrows(org.json.JSONException::class.java){parseHealthWritePlan(missing,now)}
        for(credits in listOf(JSONArray().put(""),JSONArray().put(123),JSONArray().put("Credit").put("Credit"))){
            val json=fixture(0);json.getJSONArray("records").getJSONObject(0).put("attributions",credits)
            assertThrows(IllegalArgumentException::class.java){parseHealthWritePlan(json,now)}
        }
        val water=fixture(1);water.getJSONArray("records").getJSONObject(0).put("attributions",JSONArray().put("Required credit"))
        assertThrows(IllegalArgumentException::class.java){parseHealthWritePlan(water,now)}
    }
    @Test fun hourlyExportUpdatesCreditOnlyChangesAndVerifiesPersistedNativeCredit()=runBlocking {
        var source=plan(2);val origin=WorkspaceOrigin.parse("https://fixture.test.ts.net")
        val config=HourlyExportConfig(origin,"owner",source.selection,7,"credits")
        var receipts=emptyMap<String,HealthWriteReceipt>();var actual:Record?=null;var calls=0;var revision=0L
        val store=object:HourlyExportStore {
            override fun current(config:HourlyExportConfig)=true
            override fun receipts(config:HourlyExportConfig)=receipts
            override fun acknowledge(config:HourlyExportConfig,value:Map<String,HealthWriteReceipt>){receipts=value}
        }
        val transport=object:HourlyExportTransport {
            override suspend fun preview(config:HourlyExportConfig,selection:org.json.JSONObject)=source.copy(selection=selection.toString())
            override suspend fun verify(config:HourlyExportConfig,plan:HealthWritePlan){}
        }
        val sink=object:HealthWriteSink {
            override suspend fun permissions()=source.type.permissions
            override suspend fun insert(records:List<Record>):List<String>{calls++;actual=source.type.native(source.rows.single(),metadata(records.single()));return listOf("native")}
            override suspend fun read(type:HealthWriteType,id:String)=requireNotNull(actual)
        }
        val coordinator=HourlyExportCoordinator(store,transport,sink,HealthWriteSequence({revision},{revision=it},{100L})){}
        assertEquals(1,coordinator.run(config,now).written);assertEquals(1,coordinator.run(config,now).unchanged);assertEquals(1,calls)
        val updated=fixture(2);updated.getJSONArray("records").getJSONObject(0).getJSONArray("attributions").put("Additional exact source reference")
        source=parseHealthWritePlan(updated,now)
        assertEquals(1,coordinator.run(config,now).written);assertEquals(2,calls)
        assertTrue((actual as NutritionRecord).name!!.endsWith("Additional exact source reference"))
        assertEquals(1,coordinator.run(config,now).unchanged)
    }

}
