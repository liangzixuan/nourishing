package local.nourish.healthconnect

import android.os.Build
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.metadata.Metadata
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.security.MessageDigest
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Run only on the project's emulator, never on a personal connected device. */
@RunWith(AndroidJUnit4::class)
class IntakeReconciliationNativeTest {
    @Test fun exactHistoryLookupAndInterruptedCorrectionUseRealHealthConnect()=runBlocking {
        assumeTrue(Build.VERSION.SDK_INT>=34)
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val client=HealthConnectClient.getOrCreate(context);val native=AndroidIntakeReconciliationSink(context,client)
        val type=HealthWriteType.NUTRITION;assertTrue(native.permissions().containsAll(type.permissions))
        val journal=AndroidIntakeCorrectionJournal(context);assertNull("An earlier correction must be inspected before this fixture",journal.load())
        val prefix="synthetic-intake-"+UUID.randomUUID();val start=Instant.now().minusSeconds(120L*86400).truncatedTo(java.time.temporal.ChronoUnit.MINUTES)
        fun id(label:String)="nourish-export:nutrition:"+MessageDigest.getInstance("SHA-256").digest("$prefix:$label".toByteArray()).joinToString(""){"%02x".format(it)}
        fun row(label:String,kcal:Double)=HealthWriteRow(label,id(label),0.0,"",time=start,offset=ZoneOffset.UTC,description="Synthetic emulator correction",end=start.plusSeconds(60),endOffset=ZoneOffset.UTC,name="$prefix $label\nSynthetic exact source credit",nutrients=mapOf("energy" to kcal,"protein" to 0.0,"vitaminB12" to 7.5e-12))
        val original=listOf(row("anchor",200.0),row("correction",50.0),row("unrelated",999.0));val oldVersion=System.currentTimeMillis()
        val ids=native.insert(original.map { type.native(it,Metadata.manualEntry(clientRecordId=it.clientId,clientRecordVersion=oldVersion)) });assertEquals(3,ids.size)
        val plan=IntakeCorrectionPlan("emulator-only:$prefix","a".repeat(64),type,listOf(row("anchor",150.0)),setOf(id("correction"),id("never-written")))
        val review=reviewIntakeCorrection(plan,native);assertEquals(2,review.before.size);assertEquals(oldVersion,review.minimumVersion)
        var insertCalls=0;var loseReply=true
        val interrupted=object:IntakeReconciliationSink by native {
            override suspend fun insert(records:List<Record>):List<String>{insertCalls++;val result=native.insert(records);if(loseReply)throw java.io.IOException("Synthetic reply loss after real native commit");return result}
        }
        val version=oldVersion+1
        try{reconcileIntakeCorrection(review,interrupted,journal,prefix,version){};fail("Expected the injected reply loss")}catch(_:java.io.IOException){}
        val reopened=AndroidIntakeCorrectionJournal(context);val pending=requireNotNull(reopened.load());assertEquals(setOf(id("anchor")),pending.attemptedUpserts)
        loseReply=false;assertEquals(1,reconcileIntakeCorrection(pending.review,interrupted,reopened,prefix,version){})
        assertEquals(1,insertCalls);assertNull(reopened.load())
        val after=native.snapshot(type,plan.clients);assertEquals(setOf(id("anchor")),after.keys)
        val record=after.getValue(id("anchor")) as NutritionRecord
        assertEquals(150.0,record.energy!!.inKilocalories,0.0);assertEquals(0.0,record.protein!!.inGrams,0.0);assertNull(record.vitaminD)
        assertEquals(7.5e-12,record.vitaminB12!!.inGrams,1e-25);assertTrue(record.name!!.endsWith("Synthetic exact source credit"))
        val unrelated=native.snapshot(type,setOf(id("unrelated"))).getValue(id("unrelated")) as NutritionRecord;assertEquals(999.0,unrelated.energy!!.inKilocalories,0.0)
        client.deleteRecords(NutritionRecord::class,emptyList(),original.map { it.clientId })
        assertTrue(native.snapshot(type,original.map { it.clientId }.toSet()).isEmpty())
        File(context.filesDir,"intake-reconciliation-native.json").writeText(JSONObject().put("completedAt",Instant.now().toString()).put("sdk",Build.VERSION.SDK_INT).put("historyDays",120).put("insertCalls",insertCalls).put("retiredAbsent",true).put("unrelatedPreserved",true).put("cleanupVerified",true).put("personalDevice",false).toString())
        Unit
    }

    @Test fun hydrationCancellationAndLostDeleteReplyReconcileWithoutRepeatWrites()=runBlocking {
        assumeTrue(Build.VERSION.SDK_INT>=34)
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val client=HealthConnectClient.getOrCreate(context);val native=AndroidIntakeReconciliationSink(context,client)
        val type=HealthWriteType.HYDRATION;assertTrue(native.permissions().containsAll(type.permissions))
        val journal=AndroidIntakeCorrectionJournal(context);assertNull(journal.load())
        val prefix="synthetic-water-"+UUID.randomUUID();val start=Instant.now().minusSeconds(120L*86400).truncatedTo(java.time.temporal.ChronoUnit.MINUTES)
        fun id(label:String)="nourish-export:hydration:"+MessageDigest.getInstance("SHA-256").digest("$prefix:$label".toByteArray()).joinToString(""){"%02x".format(it)}
        fun row(label:String,ml:Double)=HealthWriteRow(label,id(label),ml,"mL",time=start,offset=ZoneOffset.UTC,description="Synthetic water correction",end=start.plusSeconds(60),endOffset=ZoneOffset.UTC)
        val original=listOf(row("anchor",200.0),row("correction",50.0),row("unrelated",999.0));val oldVersion=System.currentTimeMillis()
        native.insert(original.map { type.native(it,Metadata.manualEntry(clientRecordId=it.clientId,clientRecordVersion=oldVersion)) })
        val plan=IntakeCorrectionPlan("emulator-only:$prefix","b".repeat(64),type,listOf(row("anchor",0.0)),setOf(id("correction")))
        val review=reviewIntakeCorrection(plan,native);assertEquals(2,review.before.size)
        var insertCalls=0;var deleteCalls=0;var loseReply=true
        val interrupted=object:IntakeReconciliationSink by native {
            override suspend fun insert(records:List<Record>):List<String>{insertCalls++;return native.insert(records)}
            override suspend fun deleteNative(type:HealthWriteType,nativeIds:List<String>){deleteCalls++;native.deleteNative(type,nativeIds);if(loseReply)throw java.io.IOException("Synthetic reply loss after real native deletion")}
        }
        val version=oldVersion+1
        try{reconcileIntakeCorrection(review,interrupted,journal,prefix,version){};fail("Expected the injected delete reply loss")}catch(_:java.io.IOException){}
        val reopened=AndroidIntakeCorrectionJournal(context);val pending=requireNotNull(reopened.load());assertEquals(setOf(id("correction")),pending.attemptedRetirements)
        loseReply=false;reconcileIntakeCorrection(pending.review,interrupted,reopened,prefix,version){}
        assertEquals(1,insertCalls);assertEquals(1,deleteCalls);assertNull(reopened.load())
        val after=native.snapshot(type,plan.clients);assertEquals(setOf(id("anchor")),after.keys)
        assertEquals(0.0,(after.getValue(id("anchor")) as androidx.health.connect.client.records.HydrationRecord).volume.inLiters,0.0)
        val unrelated=native.snapshot(type,setOf(id("unrelated"))).getValue(id("unrelated")) as androidx.health.connect.client.records.HydrationRecord;assertEquals(.999,unrelated.volume.inLiters,1e-15)
        client.deleteRecords(androidx.health.connect.client.records.HydrationRecord::class,emptyList(),original.map { it.clientId })
        assertTrue(native.snapshot(type,original.map { it.clientId }.toSet()).isEmpty())
        File(context.filesDir,"intake-hydration-native.json").writeText(JSONObject().put("completedAt",Instant.now().toString()).put("sdk",Build.VERSION.SDK_INT).put("historyDays",120).put("insertCalls",insertCalls).put("deleteCalls",deleteCalls).put("zeroRetained",true).put("retiredAbsent",true).put("unrelatedPreserved",true).put("cleanupVerified",true).put("personalDevice",false).toString())
        Unit
    }
}
