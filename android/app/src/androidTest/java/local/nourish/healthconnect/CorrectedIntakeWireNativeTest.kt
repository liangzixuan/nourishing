package local.nourish.healthconnect

import android.os.Build
import android.os.Process
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.metadata.Metadata
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.security.MessageDigest
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Explicitly invoked phases on the owned emulator. Do not run on a personal phone.
 * The runner must force-stop the target between stage and resume. Synthetic records
 * and the pending journal are intentionally retained if either phase fails. */
@RunWith(AndroidJUnit4::class)
class CorrectedIntakeWireNativeTest {
    private val instrumentation get()=InstrumentationRegistry.getInstrumentation()
    private val context get()=instrumentation.targetContext
    private val type=HealthWriteType.NUTRITION
    private fun preview(name:String):CorrectedIntakePreview {
        val data=instrumentation.context.assets.open("corrected-intake-previews.json").bufferedReader().use { JSONObject(it.readText()) }
        return parseCorrectedIntakePreview(data.getJSONObject("cases").getJSONObject(name),Instant.parse(data.getString("now")))
    }
    private fun plan(name:String)=requireNotNull(preview(name).also { assertFalse(it.activationRequired) }.nativePlan(WorkspaceOrigin.parse("https://synthetic.test.ts.net:8443"),WorkspaceIdentity("synthetic@example.invalid")))
    private fun file()=File(context.filesDir,"corrected-intake-wire-native.json")
    @Test fun stageInterruptedServerFixtureWrite()=runBlocking {
        assumeTrue(Build.VERSION.SDK_INT>=34)
        val client=HealthConnectClient.getOrCreate(context);val sink=AndroidIntakeReconciliationSink(context,client);val journal=AndroidIntakeCorrectionJournal(context)
        assertNull(journal.load());val p=plan("committed");assertTrue(sink.snapshot(type,p.clients).isEmpty())
        val anchor=p.rows.single { it.id=="anchor" };val correction=p.retire.single();val key=UUID.randomUUID().toString()
        val outside="nourish-export:nutrition:"+MessageDigest.getInstance("SHA-256").digest(key.toByteArray()).joinToString(""){"%02x".format(it)}
        val version=System.currentTimeMillis();val originals=listOf(anchor.copy(nutrients=mapOf("energy" to 200.0)),anchor.copy(id="correction",clientId=correction,name="Synthetic previously positive correction",nutrients=mapOf("energy" to 50.0)),anchor.copy(id="unrelated-native",clientId=outside,name="Synthetic unrelated native record",nutrients=mapOf("energy" to 999.0)))
        sink.insert(originals.map { type.native(it,Metadata.manualEntry(clientRecordId=it.clientId,clientRecordVersion=version)) })
        val review=reviewIntakeCorrection(p,sink);var inserts=0
        val interrupted=object:IntakeReconciliationSink by sink {
            override suspend fun insert(records:List<Record>):List<String>{inserts++;sink.insert(records);throw java.io.IOException("Synthetic lost reply after native commit; force-stop before resuming")}
        }
        try{reconcileIntakeCorrection(review,interrupted,journal,key,version+1){};fail("Expected injected lost reply")}catch(_:java.io.IOException){}
        assertEquals(1,inserts);val saved=requireNotNull(journal.load());assertEquals(p.rows.map { it.clientId }.toSet(),saved.attemptedUpserts);assertTrue(saved.attemptedRetirements.isEmpty())
        file().writeText(JSONObject().put("phase","interrupted").put("pid",Process.myPid()).put("operationId",key).put("outsideClientId",outside).put("insertCalls",inserts).put("stageAt",Instant.now().toString()).toString())
        if(InstrumentationRegistry.getArguments().getString("holdForProcessStop")=="true"){
            // Keep the original writer process alive until the harness verifies its
            // PID and explicitly force-stops it. The timeout retains pending evidence.
            kotlinx.coroutines.withTimeout(120000){while(true)kotlinx.coroutines.delay(1000)}
        }
        Unit
    }
    @Test fun resumeAfterExternalProcessStop()=runBlocking {
        assumeTrue(Build.VERSION.SDK_INT>=34)
        val proof=JSONObject(file().readText());assertEquals("interrupted",proof.getString("phase"));assertNotEquals("External force-stop must create a different process",proof.getInt("pid"),Process.myPid())
        val client=HealthConnectClient.getOrCreate(context);val sink=AndroidIntakeReconciliationSink(context,client);val journal=AndroidIntakeCorrectionJournal(context)
        val pending=requireNotNull(journal.load());val p=plan("committed");assertEquals(p,pending.review.plan);assertEquals(proof.getString("operationId"),pending.id)
        var inserts=0;var deletes=0
        val counted=object:IntakeReconciliationSink by sink {
            override suspend fun insert(records:List<Record>):List<String>{inserts++;return sink.insert(records)}
            override suspend fun deleteNative(type:HealthWriteType,nativeIds:List<String>){deletes++;sink.deleteNative(type,nativeIds)}
        }
        assertEquals(2,reconcileIntakeCorrection(pending.review,counted,journal,pending.id,pending.version){})
        assertEquals(0,inserts);assertEquals(1,deletes);assertNull(journal.load())
        val after=sink.snapshot(type,p.clients);assertEquals(p.rows.map { it.clientId }.toSet(),after.keys)
        val anchor=after.getValue(p.rows.single { it.id=="anchor" }.clientId) as NutritionRecord
        assertEquals(150.0,anchor.energy!!.inKilocalories,0.0);assertEquals(0.0,anchor.protein!!.inGrams,0.0);assertEquals(7.5e-12,anchor.vitaminB12!!.inGrams,1e-25);assertNull(anchor.vitaminD);assertTrue(anchor.name!!.endsWith("Exact synthetic source credit\nSecond line."))
        val outside=proof.getString("outsideClientId");assertEquals(999.0,(sink.snapshot(type,setOf(outside)).getValue(outside) as NutritionRecord).energy!!.inKilocalories,0.0)
        client.deleteRecords(NutritionRecord::class,emptyList(),(p.clients+outside).toList());assertTrue(sink.snapshot(type,p.clients+outside).isEmpty())
        proof.put("phase","completed").put("resumePid",Process.myPid()).put("resumeInsertCalls",inserts).put("deleteCalls",deletes).put("processRestartVerified",true).put("cleanupVerified",true).put("sourceCreditsRetained",true).put("completedAt",Instant.now().toString())
        file().writeText(proof.toString());Unit
    }
    @Test fun retirementOnlyServerFixtureUsesRealNativeDeletion()=runBlocking {
        assumeTrue(Build.VERSION.SDK_INT>=34)
        val client=HealthConnectClient.getOrCreate(context);val sink=AndroidIntakeReconciliationSink(context,client);val journal=AndroidIntakeCorrectionJournal(context)
        assertNull(journal.load());val p=plan("committedRetirementOnly");assertTrue(p.rows.isEmpty());assertTrue(sink.snapshot(type,p.clients).isEmpty())
        val anchor=plan("committed").rows.single { it.id=="anchor" };val version=System.currentTimeMillis()
        sink.insert(p.retire.map { id->type.native(anchor.copy(clientId=id),Metadata.manualEntry(clientRecordId=id,clientRecordVersion=version)) })
        val review=reviewIntakeCorrection(p,sink);assertEquals(2,review.before.size)
        assertEquals(0,reconcileIntakeCorrection(review,sink,journal,UUID.randomUUID().toString(),version+1){})
        assertNull(journal.load());assertTrue(sink.snapshot(type,p.clients).isEmpty())
        File(context.filesDir,"corrected-intake-retirement-native.json").writeText(JSONObject().put("completedAt",Instant.now().toString()).put("retirements",2).put("writes",0).put("cleanupVerified",true).toString());Unit
    }
}
