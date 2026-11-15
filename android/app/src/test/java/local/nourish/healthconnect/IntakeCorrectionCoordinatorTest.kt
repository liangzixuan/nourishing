package local.nourish.healthconnect

import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.records.metadata.Metadata
import java.io.File
import java.io.IOException
import java.time.Instant
import kotlinx.coroutines.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class IntakeCorrectionCoordinatorTest {
    private val now=Instant.parse("2026-11-06T12:00:00Z")
    private val origin=WorkspaceOrigin.parse("https://synthetic.test.ts.net:8443")
    private val identity=WorkspaceIdentity("synthetic@example.invalid")
    private fun packet(name:String)=JSONObject(File(requireNotNull(System.getProperty("nourish.correctedIntakeFixture"))).readText()).getJSONObject("cases").getJSONObject(name)
    private inner class Fixture {
        val disk=MemoryIntakeSessions();val serialized get()=disk.pending
        var saveCalls=0;var rejectSaveAt=0;var rejectClear=false;var previousVersion=0L;var accessAllowed=true;var hourlyInvalidations=0
        init {disk.beforeWrite={value->if(value==null){check(!rejectClear){"Synthetic clear failure"}}else{saveCalls++;check(saveCalls!=rejectSaveAt){"Synthetic disk failure"}}}}
        fun reopen()=PersistedIntakeSessionStore(disk)
        val store=reopen()
        val source=parseCorrectedIntakePreview(packet("nutrition"),now);val committed=parseCorrectedIntakePreview(packet("committed"),now)
        val plan=source.nativePlan(origin,identity)!!;val anchor=plan.rows.single { it.id=="anchor" }
        val records=linkedMapOf<String,Record>();val nativeCalls=mutableListOf<String>();var afterInsert:(()->Unit)?=null;var afterDelete:(()->Unit)?=null
        fun native(row:HealthWriteRow,version:Long=5000):Record {
            val meta=Metadata::class.java.constructors.first { it.parameterCount==7 }.newInstance(Metadata.RECORDING_METHOD_MANUAL_ENTRY,"native:${row.clientId}",DataOrigin("local.nourish.healthconnect"),now.plusSeconds(version),row.clientId,version,null) as Metadata
            return HealthWriteType.NUTRITION.native(row,meta)
        }
        init {records[anchor.clientId]=native(anchor.copy(nutrients=mapOf("energy" to 200.0)));val id=plan.retire.single();records[id]=native(anchor.copy(id="correction",clientId=id,nutrients=mapOf("energy" to 50.0)))}
        val sink=object:IntakeReconciliationSink {
            override suspend fun permissions()=HealthWriteType.NUTRITION.permissions
            override suspend fun snapshot(type:HealthWriteType,clientIds:Set<String>)=records.filterKeys { it in clientIds }
            override suspend fun read(type:HealthWriteType,id:String)=records.values.single { it.metadata.id==id }
            override suspend fun insert(input:List<Record>):List<String>{
                nativeCalls.add("insert");val pending=requireNotNull(store.load());check(pending.activated)
                val ids=input.map { inputRow->val id=inputRow.metadata.clientRecordId!!;check(id in pending.operation.attemptedUpserts);records[id]=native(pending.operation.review.plan.rows.single { it.clientId==id },inputRow.metadata.clientRecordVersion);records.getValue(id).metadata.id }
                afterInsert?.invoke();return ids
            }
            override suspend fun deleteNative(type:HealthWriteType,nativeIds:List<String>){nativeCalls.add("delete");val pending=store.load()!!;check(nativeIds.all { id->pending.operation.review.before.values.any { it.nativeId==id&&it.clientId in pending.operation.attemptedRetirements } });records.entries.removeAll { it.value.metadata.id in nativeIds };afterDelete?.invoke()}
        }
        var account=identity;var loseActivationReply=false;var rejectVerify=false;var changedActivation=false;var activationCount=0
        val activationRequests=mutableListOf<String>();private val activatedIds=mutableSetOf<String>()
        val transport=object:IntakeCorrectionTransport {
            override suspend fun identity(origin:WorkspaceOrigin)=account
            override suspend fun preview(origin:WorkspaceOrigin,selection:JSONObject)=packet("nutrition")
            override suspend fun activate(origin:WorkspaceOrigin,packet:String):JSONObject {
                val request=JSONObject(packet);assertNotNull("Activation intent must be durable first",store.load());activationRequests.add(packet);val fresh=activatedIds.add(request.getJSONObject("save").getString("operationId"));if(fresh)activationCount++
                if(loseActivationReply){loseActivationReply=false;throw IOException("Synthetic lost activation reply")}
                val response=packet("committed");if(changedActivation)response.getJSONArray("records").getJSONObject(0).getJSONObject("nutrients").put("energy",123)
                return JSONObject().put("plan",response).put("replayed",!fresh).put("nativeWriteCompleted",false)
            }
            override suspend fun verify(origin:WorkspaceOrigin,selection:JSONObject,reviewToken:String):JSONObject {check(!rejectVerify){"Synthetic changed source"};require(reviewToken==committed.reviewToken);return JSONObject().put("valid",true).put("reviewToken",reviewToken).put("workspaceScope",committed.workspaceScope).put("nativeReviewRequired",true)}
        }
        val sequence=HealthWriteSequence({previousVersion},{previousVersion=it},{100L},{check(store.load()==null){"Pending correction"}})
        fun coordinator(storage:IntakeSessionStore=store)=IntakeCorrectionCoordinator(transport,sink,storage,sequence,access={o,i->check(accessAllowed&&o==origin&&i==identity)},invalidateHourly={hourlyInvalidations++},now={now})
        suspend fun review()=coordinator().review(origin,identity,source.selection)
    }
    private suspend fun fails(work:suspend()->Unit){try{work();fail("Expected failure")}catch(_:Exception){}}
    @Test fun reviewedActivationAndNativeReconciliationUseVersionAboveObservedPhoneRecords()=runBlocking {
        val f=Fixture();val review=f.review();assertEquals(5000,review.inspection.review.minimumVersion);assertEquals(2,review.inspection.beforeDescriptions.size);assertTrue(review.inspection.beforeDescriptions.values.any { it.contains("unknown") })
        assertEquals(2,f.coordinator().confirm(review));assertEquals(5001,f.previousVersion);assertEquals(listOf("insert","delete"),f.nativeCalls);assertEquals(1,f.activationCount);assertNull(f.store.load());assertEquals(1,f.hourlyInvalidations)
        assertEquals(150.0,(f.records.getValue(f.anchor.clientId) as NutritionRecord).energy!!.inKilocalories,0.0)
    }
    @Test fun lostActivationReplyReplaysExactPersistedPacketAfterStoreRecreation()=runBlocking {
        val f=Fixture();val review=f.review();f.loseActivationReply=true;fails { f.coordinator().confirm(review) }
        assertFalse(f.store.load()!!.activated);assertTrue(f.nativeCalls.isEmpty());val version=f.previousVersion
        assertEquals(2,f.coordinator(f.reopen()).resume());assertEquals(1,f.activationCount);assertEquals(2,f.activationRequests.size);assertEquals(f.activationRequests[0],f.activationRequests[1]);assertEquals(version,f.previousVersion)
    }
    @Test fun failedActivationAcknowledgementPersistenceRetainsReplayBeforeAnyNativeCall()=runBlocking {
        val f=Fixture();val review=f.review();f.rejectSaveAt=2;fails { f.coordinator().confirm(review) };assertFalse(f.store.load()!!.activated);assertTrue(f.nativeCalls.isEmpty())
        f.rejectSaveAt=0;f.coordinator(f.reopen()).resume();assertEquals(1,f.activationCount);assertEquals(listOf("insert","delete"),f.nativeCalls)
    }
    @Test fun initialPersistenceFailureCannotActivateOrWrite()=runBlocking {
        val f=Fixture();val review=f.review();f.rejectSaveAt=1;fails { f.coordinator().confirm(review) };assertEquals(0,f.activationCount);assertTrue(f.nativeCalls.isEmpty());assertNull(f.store.load())
    }
    @Test fun nativeReplyLossResumesSameVersionWithoutSecondActivationOrInsert()=runBlocking {
        val f=Fixture();val review=f.review();f.afterInsert={throw IOException("Lost native insert reply")};fails { f.coordinator().confirm(review) };assertTrue(f.store.load()!!.activated)
        val saved=f.store.load()!!.operation;assertTrue(saved.attemptedRetirements.isEmpty());f.afterInsert=null
        f.coordinator(f.reopen()).resume();assertEquals(listOf("insert","delete"),f.nativeCalls);assertEquals(1,f.activationRequests.size);assertEquals(saved.version,f.previousVersion)
    }
    @Test fun sourceChangeAfterInsertBlocksRemovalAndKeepsCompleteRecoveryContext()=runBlocking {
        val f=Fixture();val review=f.review();f.afterInsert={f.rejectVerify=true};fails { f.coordinator().confirm(review) }
        assertEquals(listOf("insert"),f.nativeCalls);assertTrue(f.records.containsKey(f.plan.retire.single()));val saved=f.store.load()!!;assertEquals(f.source.selection,saved.preview().selection)
        fails { f.coordinator().discardUnwritten() };assertNotNull(f.store.load());f.afterInsert=null;f.rejectVerify=false;f.coordinator(f.reopen()).resume();assertNull(f.store.load())
    }
    @Test fun accountOrCheckedDestinationChangeBlocksResumeWithoutNativeMutation()=runBlocking {
        val f=Fixture();val review=f.review();f.loseActivationReply=true;fails { f.coordinator().confirm(review) }
        f.account=WorkspaceIdentity("another@example.invalid");fails { f.coordinator().resume() };assertTrue(f.nativeCalls.isEmpty());assertEquals(1,f.activationRequests.size)
        f.account=identity;f.accessAllowed=false;fails { f.coordinator().resume() };assertTrue(f.nativeCalls.isEmpty());assertNotNull(f.store.load())
    }
    @Test fun changedNativePreimageAndChangedActivationActionsCannotWrite()=runBlocking {
        val f=Fixture();val review=f.review();f.records[f.anchor.clientId]=f.native(f.anchor.copy(nutrients=mapOf("energy" to 201.0)),5001);fails { f.coordinator().confirm(review) };assertNull(f.store.load());assertEquals(0,f.activationCount)
        val fresh=f.review();f.changedActivation=true;fails { f.coordinator().confirm(fresh) };assertTrue(f.nativeCalls.isEmpty());assertFalse(f.store.load()!!.activated)
    }
    @Test fun pendingSessionBlocksOrdinaryWritesButUnattemptedSessionCanBeExplicitlyDiscarded()=runBlocking {
        val f=Fixture();val review=f.review();f.loseActivationReply=true;fails { f.coordinator().confirm(review) };fails { f.sequence.write { fail("Ordinary write ran") } }
        f.coordinator().discardUnwritten();assertNull(f.store.load());f.sequence.write { assertTrue(it>5001) };assertTrue(f.nativeCalls.isEmpty())
    }
    @Test fun failedFinalClearAndLostDeleteReplyResumeWithoutRepeatingNativeCalls()=runBlocking {
        for(clearFailure in listOf(true,false)){
            val f=Fixture();val review=f.review();if(clearFailure)f.rejectClear=true else f.afterDelete={throw IOException("Lost delete reply")}
            fails { f.coordinator().confirm(review) };assertNotNull(f.store.load());assertFalse(f.records.containsKey(f.plan.retire.single()))
            f.rejectClear=false;f.afterDelete=null;f.coordinator(f.reopen()).resume();assertEquals(listOf("insert","delete"),f.nativeCalls);assertNull(f.store.load())
        }
    }
    @Test fun unattemptedLocalIntentCanBeForgottenWhenTheOldWorkspaceIsUnavailable()=runBlocking {
        val f=Fixture();f.loseActivationReply=true;fails { f.coordinator().confirm(f.review()) };f.accessAllowed=false;f.account=WorkspaceIdentity("different@example.invalid")
        f.coordinator().discardUnwritten();assertNull(f.store.load());assertEquals(1,f.activationCount);assertTrue(f.nativeCalls.isEmpty())
    }
    @Test fun sessionParserRejectsOriginSelectionAndNativeProgressTampering()=runBlocking {
        val f=Fixture();f.loseActivationReply=true;fails { f.coordinator().confirm(f.review()) };val original=f.serialized!!
        for(change in listOf<(JSONObject)->Unit>({it.put("login","other@example.invalid")},{val p=JSONObject(it.getString("activationPacket"));p.getJSONObject("selection").put("from","2020-01-01");it.put("activationPacket",p.toString())},{it.put("activated",true)},{it.getJSONObject("beforeDescriptions").put("unknown","wrong")},{it.put("extra",true)})){
            val json=JSONObject(original);change(json);assertThrows(Exception::class.java){parseIntakeSession(json)}
        }
        assertEquals(f.store.load(),parseIntakeSession(JSONObject(original)))
    }
    @Test fun sharedLockSerializesCorrectionWithOtherWritersAndPreservesResumeRevision()=runBlocking {
        var previous=0L;val sequence=HealthWriteSequence({previous},{previous=it},{10L});val entered=CompletableDeferred<Unit>();val release=CompletableDeferred<Unit>();val versions=mutableListOf<Long>()
        val correction=launch { sequence.correction(5000){versions.add(it);entered.complete(Unit);release.await()} };entered.await()
        val ordinary=launch { sequence.write { versions.add(it) } };yield();assertEquals(listOf(5001L),versions);release.complete(Unit);joinAll(correction,ordinary);assertEquals(listOf(5001L,5002L),versions)
        sequence.correction(5000,5001){assertEquals(5001,it)};assertEquals(5002,previous)
    }
    @Test fun changedSourceCanBeClosedOfflineOnlyAfterCurrentPhoneReviewWithHistory()=runBlocking {
        val f=Fixture();f.afterInsert={f.rejectVerify=true};fails { f.coordinator().confirm(f.review()) }
        val pending=f.store.load()!!;val attempts=f.nativeCalls.toList();f.accessAllowed=false;f.account=WorkspaceIdentity("offline@example.invalid")
        val review=f.coordinator().reviewCurrentPhoneState();assertEquals(3,review.inspection.beforeDescriptions.size)
        f.coordinator(f.reopen()).keepCurrentPhoneState(review)
        assertNull(f.store.load());assertEquals(attempts,f.nativeCalls);assertTrue(f.records.containsKey(f.plan.retire.single()))
        val history=f.reopen().history();assertEquals(1,history.size);val archive=f.reopen().resolution(history.single().operationId)!!
        assertEquals(pending,archive.session);assertEquals(review.inspection.review.before,archive.observed);assertEquals(review.inspection.beforeDescriptions,archive.descriptions)
        f.sequence.write { assertTrue(it>pending.operation.version) }
    }
    @Test fun changedPhoneOrPendingProgressRejectsAStaleKeepCurrentReview()=runBlocking {
        val f=Fixture();f.afterInsert={throw IOException("Lost native reply")};fails { f.coordinator().confirm(f.review()) }
        val review=f.coordinator().reviewCurrentPhoneState();f.records.remove(f.plan.retire.single())
        fails { f.coordinator().keepCurrentPhoneState(review) };assertNotNull(f.store.load());assertTrue(f.store.history().isEmpty())
        val fresh=f.coordinator().reviewCurrentPhoneState();val saved=f.store.load()!!
        f.store.save(saved.copy(operation=saved.operation.copy(attemptedRetirements=saved.operation.review.plan.retire)))
        fails { f.coordinator().keepCurrentPhoneState(fresh) };assertNotNull(f.store.load());assertTrue(f.store.history().isEmpty())
        f.coordinator().keepCurrentPhoneState(f.coordinator().reviewCurrentPhoneState());assertNull(f.store.load())
    }
    @Test fun archiveFailureRetainsPendingAndBlocksWritersUntilAnExplicitRetry()=runBlocking {
        val f=Fixture();f.afterInsert={throw IOException("Lost reply")};fails { f.coordinator().confirm(f.review()) }
        val review=f.coordinator().reviewCurrentPhoneState();f.disk.beforeArchive={throw IOException("Full disk")}
        fails { f.coordinator().keepCurrentPhoneState(review) };assertEquals(review.session,f.store.load());assertTrue(f.store.history().isEmpty())
        fails { f.sequence.write { fail("Pending write ran") } };f.disk.beforeArchive={};f.coordinator(f.reopen()).keepCurrentPhoneState(review)
        assertNull(f.store.load());assertEquals(1,f.store.history().size);fails { f.coordinator().keepCurrentPhoneState(review) };assertEquals(1,f.store.history().size)
    }
    @Test fun recoveryArchivePreservesAbsentAndZeroRecordsAndRejectsMalformedSnapshots()=runBlocking {
        val f=Fixture();f.afterDelete={throw IOException("Lost delete reply")};fails { f.coordinator().confirm(f.review()) }
        val review=f.coordinator().reviewCurrentPhoneState();f.coordinator().keepCurrentPhoneState(review)
        val archive=f.store.resolution(review.session.operation.id)!!;assertFalse(archive.observed.containsKey(f.plan.retire.single()))
        assertTrue(archive.descriptions.getValue(f.anchor.clientId).contains("protein: 0.0"))
        val json=intakeResolutionJson(archive);assertEquals(archive,parseIntakeResolution(json))
        for(change in listOf<(JSONObject)->Unit>({it.put("disposition","completed")},{it.getJSONObject("descriptions").put("foreign","wrong")},{it.getJSONArray("observed").put(it.getJSONArray("observed").get(0))})){
            val changed=JSONObject(json.toString());change(changed);assertThrows(Exception::class.java){parseIntakeResolution(changed)}
        }
    }
}
