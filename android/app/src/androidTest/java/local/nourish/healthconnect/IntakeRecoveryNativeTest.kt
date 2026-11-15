package local.nourish.healthconnect

import android.graphics.Rect
import android.os.Process
import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Button
import android.widget.TextView
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.metadata.Metadata
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.io.IOException
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Explicit phases on nourish-phone-36 only. Retain pending data on failure. */
@RunWith(AndroidJUnit4::class)
class IntakeRecoveryNativeTest {
    private val instrumentation get()=InstrumentationRegistry.getInstrumentation()
    private val context get()=instrumentation.targetContext
    private val origin=WorkspaceOrigin.parse("https://synthetic.test.ts.net:8443")
    private val identity=WorkspaceIdentity("synthetic@example.invalid")
    private val now=Instant.parse("2026-11-06T12:00:00Z")
    private fun packet(name:String)=instrumentation.context.assets.open("corrected-intake-previews.json").bufferedReader().use { JSONObject(it.readText()).getJSONObject("cases").getJSONObject(name) }
    private fun proof()=File(context.filesDir,"intake-recovery-native.json")
    private fun transport(allowActivation:Boolean)=object:IntakeCorrectionTransport {
        override suspend fun identity(origin:WorkspaceOrigin)=identity
        override suspend fun preview(origin:WorkspaceOrigin,selection:JSONObject)=packet("nutrition")
        override suspend fun activate(origin:WorkspaceOrigin,packet:String):JSONObject {
            check(allowActivation){"An acknowledged activation must not run again."}
            return JSONObject().put("plan",packet("committed")).put("replayed",false).put("nativeWriteCompleted",false)
        }
        override suspend fun verify(origin:WorkspaceOrigin,selection:JSONObject,reviewToken:String):JSONObject {
            val p=parseCorrectedIntakePreview(packet("committed"),now);require(reviewToken==p.reviewToken)
            return JSONObject().put("valid",true).put("nativeReviewRequired",true).put("reviewToken",p.reviewToken).put("workspaceScope",p.workspaceScope)
        }
    }
    private fun fixture():IntakeCorrectionSession {
        val json=packet("nutrition");val preview=parseCorrectedIntakePreview(json,now);val id=UUID.randomUUID().toString()
        val activation=JSONObject().put("selection",preview.selection.json()).put("reviewToken",preview.reviewToken)
            .put("save",JSONObject().put("operationId",id).put("scope",preview.saveScope).put("reviewToken",preview.reviewToken))
        return IntakeCorrectionSession(origin,identity,now,activation.toString(),json.toString(),IntakeCorrectionOperation(id,IntakeCorrectionReview(preview.nativePlan(origin,identity)!!,emptyMap()),1),emptyMap(),false)
    }
    @Test fun sqliteResolutionRollbackPagingAndLargeEnvelopeRead(){
        val name="test-intake-recovery-${UUID.randomUUID()}.db";var passed=false
        try {
            AndroidIntakeSessionPersistence(context,name).use { db->
                val store=PersistedIntakeSessionStore(db);val base=fixture();val client=base.operation.review.plan.rows.first().clientId
                val state=IntakeNativeState("synthetic-native",client,0,"a".repeat(64));val text="界".repeat(800000)
                val session=base.copy(operation=base.operation.copy(review=base.operation.review.copy(before=mapOf(client to state))),beforeDescriptions=mapOf(client to text))
                store.save(session);assertEquals(session,store.load())
                val resolution=IntakeCorrectionResolution(session,mapOf(client to state),mapOf(client to text),now)
                db.writableDatabase.execSQL("CREATE TRIGGER fail_resolution_clear BEFORE DELETE ON pending BEGIN SELECT RAISE(ABORT,'Synthetic disk failure'); END")
                try{store.keepCurrent(resolution);fail("Expected transaction failure")}catch(_:android.database.sqlite.SQLiteException){}
                assertEquals(session,store.load());assertTrue(store.history().isEmpty());assertNull(store.resolution(session.operation.id))
                db.writableDatabase.execSQL("DROP TRIGGER fail_resolution_clear");store.keepCurrent(resolution);assertNull(store.load());assertEquals(resolution,store.resolution(session.operation.id))
                for(index in 0 until 12){val next=fixture();store.save(next);store.keepCurrent(IntakeCorrectionResolution(next,emptyMap(),emptyMap(),now.plusSeconds(index.toLong())))}
            }
            AndroidIntakeSessionPersistence(context,name).use { db->
                val store=PersistedIntakeSessionStore(db);val first=store.history(limit=10);val second=store.history(first.last().sequence,10)
                assertEquals(10,first.size);assertEquals(3,second.size);assertEquals(13,(first+second).map { it.operationId }.distinct().size)
                assertTrue(store.history(second.last().sequence,10).isEmpty());assertEquals(800000,store.resolution(second.last().operationId)!!.descriptions.values.single().length)
                assertNull(store.load())
            }
            passed=true
        }finally {if(passed)assertTrue(context.deleteDatabase(name))}
        File(context.filesDir,"intake-recovery-sqlite.json").writeText(JSONObject().put("completedAt",Instant.now().toString()).put("rollbackVerified",true).put("largeUnicodeEnvelope",true).put("pagedArchives",13).put("reopened",true).put("cleanupVerified",true).toString())
    }
    @Test fun stageFullSessionAfterNativeCommit()=runBlocking {
        val store=androidIntakeSessions(context);assertNull(store.load())
        val health=HealthConnectClient.getOrCreate(context);val sink=AndroidIntakeReconciliationSink(context,health)
        val source=parseCorrectedIntakePreview(packet("nutrition"),now);val plan=source.nativePlan(origin,identity)!!
        assertTrue(sink.snapshot(HealthWriteType.NUTRITION,plan.clients).isEmpty())
        val anchor=plan.rows.single { it.id=="anchor" };val retire=plan.retire.single();val version=System.currentTimeMillis()
        sink.insert(listOf(anchor.copy(nutrients=mapOf("energy" to 200.0)),anchor.copy(clientId=retire,name="Synthetic old correction",nutrients=mapOf("energy" to 50.0))).map {
            HealthWriteType.NUTRITION.native(it,Metadata.manualEntry(clientRecordId=it.clientId,clientRecordVersion=version))
        })
        var calls=0
        val interrupted=object:IntakeReconciliationSink by sink {
            override suspend fun insert(records:List<Record>):List<String>{calls++;sink.insert(records);throw IOException("Synthetic lost native reply")}
        }
        val coordinator=IntakeCorrectionCoordinator(transport(true),interrupted,store,NativeHealthWrites.sequence(context),access={o,i->check(o==origin&&i==identity)},now={now})
        val review=coordinator.review(origin,identity,source.selection)
        try{coordinator.confirm(review);fail("Expected lost native reply")}catch(_:IOException){}
        val pending=store.load()!!;assertTrue(pending.activated);assertEquals(1,calls);assertEquals(2,pending.operation.attemptedUpserts.size);assertTrue(pending.operation.attemptedRetirements.isEmpty())
        val actual=inspectIntakeCorrection(plan,sink)
        proof().writeText(JSONObject().put("phase","interrupted").put("pid",Process.myPid()).put("operationId",pending.operation.id)
            .put("session",intakeSessionJson(pending)).put("observed",intakeNativeStatesJson(actual.review.before)).put("stageAt",Instant.now().toString()).toString())
        if(InstrumentationRegistry.getArguments().getString("holdForProcessStop")=="true")withTimeout(120000){while(true)delay(1000)}
        Unit
    }
    private fun descendants(view:View):List<View> = listOf(view)+if(view is ViewGroup)(0 until view.childCount).flatMap { descendants(view.getChildAt(it)) } else emptyList()
    private fun until(message:String,condition:()->Boolean){val end=System.nanoTime()+10_000_000_000;while(!condition()&&System.nanoTime()<end)Thread.sleep(25);assertTrue(message,condition())}
    @Test fun keepActualPartialStateAfterExternalProcessStop(){
        val evidence=JSONObject(proof().readText());assertEquals("interrupted",evidence.getString("phase"));assertNotEquals(evidence.getInt("pid"),Process.myPid())
        val store=androidIntakeSessions(context);val pending=store.load()!!;assertEquals(parseIntakeSession(evidence.getJSONObject("session")),pending)
        val plan=pending.operation.review.plan;val observed=parseIntakeNativeStates(evidence.getJSONArray("observed"),plan.clients)
        val sink=AndroidIntakeReconciliationSink(context,HealthConnectClient.getOrCreate(context))
        ActivityScenario.launch(MainActivity::class.java).use { scenario->
            fun views():List<View>{var found:List<View> = emptyList();scenario.onActivity { activity->val panel=descendants(activity.findViewById(android.R.id.content)).filterIsInstance<IntakeCorrectionPanel>().single();found=descendants(panel) };return found}
            fun button(label:String)=views().filterIsInstance<Button>().single { it.text.toString()==label }
            fun text():String {var result="";scenario.onActivity { result=views().filterIsInstance<TextView>().joinToString("\n"){it.text.toString()} };return result}
            scenario.onActivity { assertFalse(button("Forget unstarted phone operation").isEnabled);assertFalse(button("Keep current phone state and close").isEnabled);button("Review current phone state").performClick() }
            until("Current state was not shown"){text().contains("You can keep these records")}
            assertTrue(text().contains("energy: 150.0"));assertTrue(text().contains("energy: 50.0"));assertTrue(text().contains("protein: 0.0"))
            scenario.onActivity {val target=button("Keep current phone state and close");assertTrue(target.isEnabled);target.requestRectangleOnScreen(Rect(0,0,target.width,target.height),true);target.performClick()}
            instrumentation.waitForIdleSync();instrumentation.uiAutomation.waitForIdle(200,5000)
            val root=instrumentation.uiAutomation.rootInActiveWindow
            assertTrue(root.findAccessibilityNodeInfosByText("Keep current").single { it.text?.toString()?.equals("Keep current",ignoreCase=true)==true }.performAction(AccessibilityNodeInfo.ACTION_CLICK))
            until("Pending state was not resolved"){store.load()==null};until("Recovery result missing"){text().contains("incomplete correction was closed")}
            scenario.onActivity {assertFalse(button("Keep current phone state and close").isEnabled);button("View recovery history").performClick()}
            instrumentation.waitForIdleSync();instrumentation.uiAutomation.waitForIdle(200,5000)
            val title="${store.resolution(pending.operation.id)!!.resolvedAt}: Food nutrients"
            val entry=instrumentation.uiAutomation.rootInActiveWindow.findAccessibilityNodeInfosByText(title).single { it.text?.toString()==title }
            assertTrue(entry.performAction(AccessibilityNodeInfo.ACTION_CLICK));until("Archive is not inspectable"){text().contains("HISTORY: Current phone state was accepted")}
            assertTrue(text().contains("energy: 50.0"))
        }
        val archived=store.resolution(pending.operation.id)!!;assertEquals(pending,archived.session);assertEquals(observed,archived.observed)
        runBlocking {
            assertEquals(observed,inspectIntakeCorrection(plan,sink).review.before)
            NativeHealthWrites.sequence(context).write {assertTrue(it>pending.operation.version)}
            val health=HealthConnectClient.getOrCreate(context);health.deleteRecords(NutritionRecord::class,emptyList(),plan.clients.toList());assertTrue(sink.snapshot(HealthWriteType.NUTRITION,plan.clients).isEmpty())
        }
        // Retain the synthetic archive as evidence. Only the exact synthetic native records are removed.
        evidence.remove("session");evidence.remove("observed")
        evidence.put("phase","completed").put("resumePid",Process.myPid()).put("processRestartVerified",true).put("nativeStateUnchangedOnKeep",true)
            .put("archiveVisible",true).put("attemptsRetained",true).put("ordinaryWritesUnblocked",true).put("nativeCleanupVerified",true).put("completedAt",Instant.now().toString())
        proof().writeText(evidence.toString())
    }
    @Test fun resumeFullSessionAfterExternalProcessStop()=runBlocking {
        val evidence=JSONObject(proof().readText());assertEquals("interrupted",evidence.getString("phase"));assertNotEquals(evidence.getInt("pid"),Process.myPid())
        val store=androidIntakeSessions(context);val pending=store.load()!!;assertEquals(parseIntakeSession(evidence.getJSONObject("session")),pending)
        val plan=pending.operation.review.plan;val client=HealthConnectClient.getOrCreate(context);val sink=AndroidIntakeReconciliationSink(context,client)
        var inserts=0;var deletes=0
        val counted=object:IntakeReconciliationSink by sink {
            override suspend fun insert(records:List<Record>):List<String>{inserts++;return sink.insert(records)}
            override suspend fun deleteNative(type:HealthWriteType,nativeIds:List<String>){deletes++;sink.deleteNative(type,nativeIds)}
        }
        val coordinator=IntakeCorrectionCoordinator(transport(false),counted,store,NativeHealthWrites.sequence(context),access={o,i->check(o==origin&&i==identity)},now={now})
        assertEquals(2,coordinator.resume());assertEquals(0,inserts);assertEquals(1,deletes);assertNull(store.load())
        val after=sink.snapshot(HealthWriteType.NUTRITION,plan.clients);assertEquals(plan.rows.map { it.clientId }.toSet(),after.keys)
        val anchor=after.getValue(plan.rows.single { it.id=="anchor" }.clientId) as NutritionRecord
        assertEquals(150.0,anchor.energy!!.inKilocalories,0.0);assertEquals(0.0,anchor.protein!!.inGrams,0.0)
        assertEquals(7.5e-12,anchor.vitaminB12!!.inGrams,1e-25);assertTrue(anchor.name!!.endsWith("Exact synthetic source credit\nSecond line."))
        assertEquals(pending.operation.version,anchor.metadata.clientRecordVersion)
        client.deleteRecords(NutritionRecord::class,emptyList(),plan.clients.toList());assertTrue(sink.snapshot(HealthWriteType.NUTRITION,plan.clients).isEmpty())
        evidence.remove("session");evidence.remove("observed")
        evidence.put("phase","resumed").put("resumePid",Process.myPid()).put("processRestartVerified",true).put("insertCalls",inserts).put("deleteCalls",deletes)
            .put("zeroAndTraceValuesPreserved",true).put("sourceCreditsPreserved",true).put("sameWriteVersion",true).put("nativeCleanupVerified",true).put("completedAt",Instant.now().toString())
        File(context.filesDir,"intake-session-resume-native.json").writeText(evidence.toString());Unit
    }
}
