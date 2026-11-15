package local.nourish.healthconnect

import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.units.Energy
import androidx.health.connect.client.units.Mass
import java.time.Instant
import java.time.ZoneOffset
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

/** The SDK records are real; native storage and IPC failure timing are controlled fakes. */
class IntakeReconciliationTest {
    private val time=Instant.parse("2026-11-01T12:00:00Z")
    private val type=HealthWriteType.NUTRITION
    private fun id(letter:Char)="nourish-export:nutrition:"+letter.toString().repeat(64)
    private fun row(letter:Char,energy:Double)=HealthWriteRow("entry:$letter",id(letter),0.0,"",time=time,offset=ZoneOffset.UTC,description="Synthetic $letter",end=time.plusSeconds(60),endOffset=ZoneOffset.UTC,name="Food $letter\nExact credit",nutrients=mapOf("energy" to energy,"protein" to 0.0))
    private fun plan()=IntakeCorrectionPlan("https://synthetic.test.ts.net/account/workspace","e".repeat(64),type,listOf(row('a',150.0)),setOf(id('b')))
    private fun metadata(native:String,client:String,version:Long,origin:String="local.nourish.healthconnect")=Metadata::class.java.constructors.first { it.parameterCount==7 }
        .newInstance(Metadata.RECORDING_METHOD_MANUAL_ENTRY,native,DataOrigin(origin),time.plusSeconds(version),client,version,null) as Metadata
    private fun native(row:HealthWriteRow,version:Long=1,nativeId:String="native:${row.id}",origin:String="local.nourish.healthconnect")=type.native(row,metadata(nativeId,row.clientId,version,origin))
    private class Journal : IntakeCorrectionJournal {
        var serialized:String?=null;var rejectSave=false;var rejectFinish=false
        override fun load()=serialized?.let { parseIntakeCorrection(JSONObject(it)) }
        override fun save(operation:IntakeCorrectionOperation){check(!rejectSave){"Synthetic disk failure"};serialized=intakeCorrectionJson(operation).toString()}
        override fun finish(operationId:String){require(load()?.id==operationId);check(!rejectFinish){"Synthetic final disk failure"};serialized=null}
    }
    private inner class Sink(val plan:IntakeCorrectionPlan,val journal:Journal):IntakeReconciliationSink {
        val records=linkedMapOf(id('a') to native(row('a',200.0)),id('b') to native(row('b',50.0)),id('c') to native(row('c',999.0)))
        val calls=mutableListOf<String>();var granted=type.permissions;var failSnapshot=false
        var afterInsert:(()->Unit)?=null;var afterDelete:(()->Unit)?=null;var ignoreInsert=false;var ignoreDelete=false
        override suspend fun permissions()=granted
        override suspend fun snapshot(type:HealthWriteType,clientIds:Set<String>):Map<String,Record>{check(!failSnapshot){"Synthetic read failure"};return records.filterKeys { it in clientIds }}
        override suspend fun insert(records:List<Record>):List<String>{
            calls.add("insert");val pending=requireNotNull(journal.load())
            return records.map { input ->
                val client=requireNotNull(input.metadata.clientRecordId);check(client in pending.attemptedUpserts)
                val nativeId=this.records[client]?.metadata?.id?:"new:$client"
                if(!ignoreInsert)this.records[client]=type.native(plan.rows.single { it.clientId==client },metadata(nativeId,client,input.metadata.clientRecordVersion))
                nativeId
            }.also { afterInsert?.invoke() }
        }
        override suspend fun read(type:HealthWriteType,id:String)=records.values.single { it.metadata.id==id }
        override suspend fun deleteNative(type:HealthWriteType,nativeIds:List<String>){
            calls.add("delete");val pending=requireNotNull(journal.load());check(nativeIds.all { n->pending.review.before.values.any { it.nativeId==n && it.clientId in pending.attemptedRetirements } })
            if(!ignoreDelete)records.entries.removeAll { it.value.metadata.id in nativeIds };afterDelete?.invoke()
        }
    }
    private suspend fun run(review:IntakeCorrectionReview,sink:Sink,journal:Journal)=reconcileIntakeCorrection(review,sink,journal,"operation",10){}

    @Test fun retirementOnlyResumesLostRemovalReplyWithoutInsertingOrRepeatingDeletion()=runBlocking {
        val p=plan().copy(rows=emptyList(),retire=setOf(id('a'),id('b')));val journal=Journal();val sink=Sink(p,journal)
        val unrelated=sink.records[id('c')];val review=reviewIntakeCorrection(p,sink)
        sink.afterDelete={throw IllegalStateException("Synthetic lost retirement-only reply")}
        try{run(review,sink,journal);fail()}catch(_:IllegalStateException){}
        val saved=requireNotNull(journal.load());assertTrue(saved.review.plan.rows.isEmpty());assertEquals(p.retire,saved.attemptedRetirements)
        assertEquals(saved,parseIntakeCorrection(JSONObject(intakeCorrectionJson(saved).toString())))
        sink.afterDelete=null;assertEquals(0,run(saved.review,sink,journal))
        assertEquals(listOf("delete"),sink.calls);assertEquals(mapOf(id('c') to unrelated),sink.records);assertNull(journal.load())
    }
    @Test fun retirementOnlyRejectsChangedPreimageBeforeAnyDeletion()=runBlocking {
        val p=plan().copy(rows=emptyList());val journal=Journal();val sink=Sink(p,journal);val review=reviewIntakeCorrection(p,sink)
        sink.records[id('b')]=native(row('b',75.0),2)
        try{run(review,sink,journal);fail()}catch(_:IllegalStateException){}
        assertTrue(sink.calls.isEmpty());assertNull(journal.load());assertTrue(sink.records.containsKey(id('b')))
    }
    @Test fun retirementOnlyVerifiesExistingAbsenceWithoutNativeMutation()=runBlocking {
        val p=plan().copy(rows=emptyList());val journal=Journal();val sink=Sink(p,journal);sink.records.remove(id('b'))
        val before=sink.records.toMap();assertEquals(0,run(reviewIntakeCorrection(p,sink),sink,journal))
        assertTrue(sink.calls.isEmpty());assertNull(journal.load());assertEquals(before,sink.records)
        assertThrows(IllegalArgumentException::class.java){p.copy(retire=emptySet())}
        Unit
    }

    @Test fun replacesAnchorAndRemovesPreviouslyPositiveCorrectionOnlyAfterReadback()=runBlocking {
        val journal=Journal();val p=plan();val sink=Sink(p,journal);val unrelated=sink.records[id('c')];val review=reviewIntakeCorrection(p,sink)
        assertEquals(1,run(review,sink,journal));assertEquals(listOf("insert","delete"),sink.calls);assertNull(journal.load())
        assertEquals(150.0,(sink.records.getValue(id('a')) as NutritionRecord).energy!!.inKilocalories,0.0)
        assertFalse(sink.records.containsKey(id('b')));assertEquals(unrelated,sink.records[id('c')])
    }
    @Test fun lostInsertResponseReconcilesPersistedIntentWithoutDuplicatingInsert()=runBlocking {
        val journal=Journal();val p=plan();val sink=Sink(p,journal);val review=reviewIntakeCorrection(p,sink)
        sink.afterInsert={throw IllegalStateException("Synthetic lost reply")}
        try{run(review,sink,journal);fail()}catch(_:IllegalStateException){}
        val persisted=requireNotNull(journal.load());assertEquals(setOf(id('a')),persisted.attemptedUpserts);assertTrue(sink.records.containsKey(id('b')))
        sink.afterInsert=null;run(persisted.review,sink,journal);assertEquals(listOf("insert","delete"),sink.calls);assertNull(journal.load())
    }
    @Test fun lostDeleteResponseReconcilesAbsenceWithoutRepeatingRemoval()=runBlocking {
        val journal=Journal();val sink=Sink(plan(),journal);val review=reviewIntakeCorrection(sink.plan,sink)
        sink.afterDelete={throw IllegalStateException("Synthetic lost delete reply")};try{run(review,sink,journal);fail()}catch(_:IllegalStateException){}
        assertFalse(sink.records.containsKey(id('b')));val persisted=requireNotNull(journal.load());assertEquals(setOf(id('b')),persisted.attemptedRetirements)
        sink.afterDelete=null;run(persisted.review,sink,journal);assertEquals(listOf("insert","delete"),sink.calls)
    }
    @Test fun cancellationAfterInsertKeepsJournalAndDoesNotRemoveOldContribution()=runBlocking {
        val journal=Journal();val sink=Sink(plan(),journal);val review=reviewIntakeCorrection(sink.plan,sink)
        sink.afterInsert={throw CancellationException("Synthetic cancellation")};try{run(review,sink,journal);fail()}catch(_:CancellationException){}
        assertTrue(sink.records.containsKey(id('b')));assertNotNull(journal.load());sink.afterInsert=null
        run(requireNotNull(journal.load()).review,sink,journal);assertEquals(listOf("insert","delete"),sink.calls)
    }
    @Test fun ignoredOlderVersionCannotTriggerDeletion()=runBlocking {
        val journal=Journal();val sink=Sink(plan(),journal);val review=reviewIntakeCorrection(sink.plan,sink);sink.ignoreInsert=true
        try{run(review,sink,journal);fail()}catch(_:IllegalStateException){}
        assertEquals(listOf("insert"),sink.calls);assertTrue(sink.records.containsKey(id('b')));assertNotNull(journal.load())
    }
    @Test fun unchangedRemovalResultRemainsPendingAndCanBeRetried()=runBlocking {
        val journal=Journal();val sink=Sink(plan(),journal);val review=reviewIntakeCorrection(sink.plan,sink);sink.ignoreDelete=true
        try{run(review,sink,journal);fail()}catch(_:IllegalStateException){}
        assertNotNull(journal.load());sink.ignoreDelete=false;run(requireNotNull(journal.load()).review,sink,journal)
        assertEquals(listOf("insert","delete","delete"),sink.calls);assertNull(journal.load())
    }
    @Test fun staleNativePayloadStopsBeforeJournalOrMutation()=runBlocking {
        val journal=Journal();val sink=Sink(plan(),journal);val review=reviewIntakeCorrection(sink.plan,sink)
        sink.records[id('b')]=native(row('b',75.0),2)
        try{run(review,sink,journal);fail()}catch(_:IllegalStateException){}
        assertTrue(sink.calls.isEmpty());assertNull(journal.load())
    }
    @Test fun changedRetirementDuringPartialWriteBlocksRemovalAndPreservesPendingReview()=runBlocking {
        val journal=Journal();val sink=Sink(plan(),journal);val review=reviewIntakeCorrection(sink.plan,sink)
        sink.afterInsert={sink.records[id('b')]=native(row('b',75.0),2)}
        try{run(review,sink,journal);fail()}catch(_:IllegalStateException){}
        assertEquals(listOf("insert"),sink.calls);assertNotNull(journal.load());assertEquals(75.0,(sink.records.getValue(id('b')) as NutritionRecord).energy!!.inKilocalories,0.0)
    }
    @Test fun nativeReadFailureNeverBecomesAbsence()=runBlocking {
        val journal=Journal();val sink=Sink(plan(),journal);val review=reviewIntakeCorrection(sink.plan,sink);sink.failSnapshot=true
        try{run(review,sink,journal);fail()}catch(_:IllegalStateException){}
        assertTrue(sink.calls.isEmpty());assertNull(journal.load())
    }
    @Test fun journalFailureAndRevokedPermissionPreventNativeCalls()=runBlocking {
        val journal=Journal();val sink=Sink(plan(),journal);val review=reviewIntakeCorrection(sink.plan,sink);journal.rejectSave=true
        try{run(review,sink,journal);fail()}catch(_:IllegalStateException){};assertTrue(sink.calls.isEmpty())
        journal.rejectSave=false;sink.granted=emptySet();try{run(review,sink,journal);fail()}catch(_:IllegalArgumentException){};assertTrue(sink.calls.isEmpty())
    }
    @Test fun finalJournalClearFailureCanFinishWithoutAnotherNativeMutation()=runBlocking {
        val journal=Journal();val sink=Sink(plan(),journal);val review=reviewIntakeCorrection(sink.plan,sink);journal.rejectFinish=true
        try{run(review,sink,journal);fail()}catch(_:IllegalStateException){};assertNotNull(journal.load())
        journal.rejectFinish=false;run(requireNotNull(journal.load()).review,sink,journal);assertEquals(listOf("insert","delete"),sink.calls);assertNull(journal.load())
    }
    @Test fun cancellationAfterDeletionRetainsEvidenceUntilFinalVerification()=runBlocking {
        val journal=Journal();val sink=Sink(plan(),journal);val review=reviewIntakeCorrection(sink.plan,sink)
        sink.afterDelete={throw CancellationException("Synthetic cancellation during finalization")}
        try{run(review,sink,journal);fail()}catch(_:CancellationException){}
        assertNotNull(journal.load());assertFalse(sink.records.containsKey(id('b')))
        sink.afterDelete=null;run(requireNotNull(journal.load()).review,sink,journal)
        assertEquals(listOf("insert","delete"),sink.calls);assertNull(journal.load())
    }
    @Test fun accountGuardChangeAfterInsertBlocksRemovalAndKeepsThePendingOperation()=runBlocking {
        val journal=Journal();val sink=Sink(plan(),journal);val review=reviewIntakeCorrection(sink.plan,sink);var authorized=true
        sink.afterInsert={authorized=false}
        try{reconcileIntakeCorrection(review,sink,journal,"operation",10){check(authorized){"Synthetic account change"}};fail()}catch(_:IllegalStateException){}
        assertEquals(listOf("insert"),sink.calls);assertTrue(sink.records.containsKey(id('b')));assertNotNull(journal.load())
        try{reconcileIntakeCorrection(requireNotNull(journal.load()).review,sink,journal,"operation",10){check(authorized)};fail()}catch(_:IllegalStateException){}
        assertEquals(listOf("insert"),sink.calls)
    }
    @Test fun wrongScopeOrOperationCannotReplaceAPendingJournal()=runBlocking {
        val journal=Journal();val sink=Sink(plan(),journal);val review=reviewIntakeCorrection(sink.plan,sink)
        journal.save(IntakeCorrectionOperation("old-operation",review,10))
        try{run(review,sink,journal);fail()}catch(_:IllegalStateException){};assertTrue(sink.calls.isEmpty());assertEquals("old-operation",journal.load()!!.id)
    }
    @Test fun validationRejectsNegativeRowsOverlapsAndAnInsufficientRevisionBeforeMutation()=runBlocking {
        val p=plan();assertThrows(IllegalArgumentException::class.java){p.copy(rows=listOf(row('a',-1.0)))}
        assertThrows(IllegalArgumentException::class.java){p.copy(retire=setOf(id('a')))}
        val journal=Journal();val sink=Sink(p,journal);sink.records[id('b')]=native(row('b',50.0),50);val review=reviewIntakeCorrection(p,sink)
        assertEquals(50L,review.minimumVersion);try{run(review,sink,journal);fail()}catch(_:IllegalArgumentException){};assertTrue(sink.calls.isEmpty());assertNull(journal.load())
    }
    @Test fun fingerprintIncludesUnsupportedNutrientsUnknownsCreditsAndNativeMetadata(){
        val base=row('a',200.0);val record=native(base) as NutritionRecord
        val extra=NutritionRecord(startTime=record.startTime,startZoneOffset=record.startZoneOffset,endTime=record.endTime,endZoneOffset=record.endZoneOffset,metadata=record.metadata,name=record.name,energy=record.energy,protein=record.protein,vitaminA=Mass.grams(0.001))
        assertNotEquals(intakeNativeState(type,record),intakeNativeState(type,extra))
        assertNotEquals(intakeNativeState(type,record),intakeNativeState(type,native(base.copy(name="Changed credit"))))
        assertNotEquals(intakeNativeState(type,record),intakeNativeState(type,native(base.copy(nutrients=mapOf("energy" to 200.0)))))
        assertThrows(IllegalArgumentException::class.java){intakeNativeState(type,native(base,origin="another.app"))}
    }
    @Test fun journalRoundTripRetainsOpaqueRowsCompletePlanAndAttemptedSets()=runBlocking {
        val p=plan().copy(rows=listOf(row('a',150.0).copy(id=" opaque : \"id\" ",description="Exact\nsource facts")))
        val journal=Journal();val sink=Sink(p,journal);val operation=IntakeCorrectionOperation("operation",reviewIntakeCorrection(p,sink),10,setOf(id('a')),setOf(id('b')))
        val json=intakeCorrectionJson(operation);assertEquals(operation,parseIntakeCorrection(JSONObject(json.toString())))
        assertThrows(IllegalArgumentException::class.java){parseIntakeCorrection(JSONObject(json.toString()).put("extra",true))}
        assertThrows(IllegalArgumentException::class.java){parseIntakeCorrection(JSONObject(json.toString()).put("writeVersion",0))}
        Unit
    }
}
