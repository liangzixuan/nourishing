package local.nourish.healthconnect

import java.io.File
import java.time.Instant
import java.time.ZoneId
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.records.metadata.DataOrigin

class ReconciliationTest {
    private val now=Instant.parse("2026-10-30T12:00:00Z")
    private val range=ExportRange.create("2026-10-29","2026-10-30",ZoneId.of("America/Chicago"),now)
    private class DiskDocument(private val file:File):ReconciliationDocument {override fun read()=if(file.isFile)file.readText() else null;override fun write(value:String){file.writeText(value)}}
    private fun state()=JSONObject().put("streamId",UUID.randomUUID().toString()).put("sequence",1).put("previousReceipt",JSONObject.NULL).put("cursors",JSONObject())
    private fun batch(state:JSONObject)=reconciliationBatch(state,HealthSnapshot(range,emptyList(),setOf(ExportType.WEIGHT),emptySet()),emptyList(),listOf(ExportType.WEIGHT to "initial-baseline"),now)
    private fun counts()=JSONObject("""{"added":0,"updated":0,"unchanged":0,"deleted":2,"replaced":0,"invalidated":1}""")
    private fun receipt(batch:JSONObject,digest:String="a".repeat(64))=JSONObject().put("streamId",batch.getString("streamId")).put("sequence",batch.getLong("sequence")).put("batchId",batch.getString("batchId")).put("batchDigest",digest).put("receiptId","b".repeat(64)).put("counts",counts()).put("recoverySnapshotId",7)

    @Test fun tokensDrainAllPagesAndLastTypedParentEventWins()=runBlocking {
        val calls=mutableListOf<String>();val source=object:ChangeFeed {
            override suspend fun token(type:ExportType)="fresh"
            override suspend fun page(type:ExportType,token:String):ChangePage {calls.add(token);return if(token=="first")ChangePage(listOf(TypedChange(type,"parent",deleted=true)),"second",true,false) else ChangePage(listOf(TypedChange(type,"other",deleted=true)),"done",false,false)}
        }
        val read=ChangesReader(source).read(ExportType.HEART_RATE,"first");assertEquals(listOf("first","second"),calls);assertEquals("done",read.token);assertEquals(listOf("parent","other"),read.events.map{it.recordId});assertNull(read.gap)
    }
    @Test fun initialAndExpiredTokensReserveBeforeBaselineAndDiscardPartialExpiredEvents()=runBlocking {
        var fresh=0;var pages=0;val source=object:ChangeFeed{override suspend fun token(type:ExportType)="new-${++fresh}";override suspend fun page(type:ExportType,token:String):ChangePage{pages++;return if(token=="old")ChangePage(listOf(TypedChange(type,"must-not-delete",deleted=true)),"expired",true,false) else ChangePage(emptyList(),"unused",false,true)}}
        val reader=ChangesReader(source);assertEquals("initial-baseline",reader.read(ExportType.WEIGHT,null).gap);assertEquals(0,pages)
        val expired=reader.read(ExportType.WEIGHT,"old");assertEquals("token-expired",expired.gap);assertTrue(expired.events.isEmpty());assertEquals("new-2",expired.token)
    }
    @Test fun repeatedPagesAndRevokedAccessFailWithoutCandidateProgress()=runBlocking {
        val repeated=object:ChangeFeed{override suspend fun token(type:ExportType)="new";override suspend fun page(type:ExportType,token:String)=ChangePage(emptyList(),token,true,false)}
        try{ChangesReader(repeated).read(ExportType.SLEEP,"repeat");fail("Repeated page accepted")}catch(_:IllegalStateException){}
        val revoked=object:ChangeFeed{override suspend fun token(type:ExportType)="new";override suspend fun page(type:ExportType,token:String):ChangePage=throw SecurityException("revoked")}
        try{ChangesReader(revoked).read(ExportType.WATER,"old");fail("Revocation swallowed")}catch(_:SecurityException){}
    }
    @Test fun completeHeartRateChangeRetainsAllChildSamplesAndEmptyParentReplacement() {
        val source=ExportSource("fixture.synthetic","parent:opaque",now);val rows=listOf(now.minusSeconds(90000),now.minusSeconds(30)).map{measurement(ExportType.HEART_RATE,source,it,70.0,range.zone,sampleId=it.toString())}
        val json=nativeChangeJson(TypedChange(ExportType.HEART_RATE,source.recordId,NativeParent(ExportType.HEART_RATE,source,rows)))
        assertEquals(2,json.getJSONArray("records").length());assertTrue(json.getJSONArray("records").getJSONObject(0).getString("id").startsWith("heart-rate:parent:opaque:"));assertEquals(source.recordId,json.getJSONArray("records").getJSONObject(1).getJSONObject("source").getString("recordId"))
        assertEquals(0,nativeChangeJson(TypedChange(ExportType.HEART_RATE,source.recordId,NativeParent(ExportType.HEART_RATE,source,emptyList()))).getJSONArray("records").length())
        assertEquals(setOf("kind","type","recordId"),nativeChangeJson(TypedChange(ExportType.HEART_RATE,source.recordId,deleted=true)).keys().asSequence().toSet())
    }
    @Test fun actualSdkHeartRateParentProjectsSamplesOutsideSnapshotRangeWithoutFiltering() {
        val start=now.minusSeconds(10*86400);val old=start.plusSeconds(1);val recent=now.minusSeconds(30)
        // SDK metadata read fields have no public Kotlin factory. Construct a
        // synthetic returned-record fixture, never production/provider data.
        val metadata=Metadata::class.java.constructors.first{it.parameterCount==7}.newInstance(Metadata.RECORDING_METHOD_AUTOMATICALLY_RECORDED,"native-parent",DataOrigin("fixture.synthetic"),now,null,0L,null) as Metadata
        val record=HeartRateRecord(startTime=start,startZoneOffset=null,endTime=now,endZoneOffset=null,metadata=metadata,samples=listOf(HeartRateRecord.Sample(old,60),HeartRateRecord.Sample(recent,70)))
        val parent=requireNotNull(projectNativeParent(record,range.zone));assertEquals(2,parent.records.size);assertEquals(metadata.id,parent.source.recordId);assertFalse(range.contains(Instant.parse(parent.records.first().start)));assertTrue(range.contains(Instant.parse(parent.records.last().start)))
    }
    @Test fun activityUpsertsAreConsumedWithoutRawRowsAndSupersedeEarlierDelete()=runBlocking {
        val source=object:ChangeFeed{override suspend fun token(type:ExportType)="new";override suspend fun page(type:ExportType,token:String)=ChangePage(listOf(TypedChange(type,"native",deleted=true),TypedChange(type,"native")),"done",false,false)}
        val events=ChangesReader(source).read(ExportType.STEPS,"old").events;assertEquals(1,events.size);assertFalse(events.single().deleted);assertNull(events.single().parent)
    }
    @Test fun finalDrainAfterBaselineSupersedesOldParentAndActivityDeletion()=runBlocking {
        val calls=mutableListOf<String>();val source=ExportSource("fixture.synthetic","parent",now)
        fun parent(value:Double)=NativeParent(ExportType.WEIGHT,source,listOf(measurement(ExportType.WEIGHT,source,now,value,range.zone)))
        val feed=object:ChangeFeed {
            override suspend fun token(type:ExportType):String=error("No baseline token needed")
            override suspend fun page(type:ExportType,token:String):ChangePage{calls.add("${type.name}:$token");return when(type){
                ExportType.WEIGHT->ChangePage(listOf(TypedChange(type,"parent",parent(if(token=="w-old")70.0 else 71.0))),if(token=="w-old")"w-mid" else "w-final",false,false)
                ExportType.STEPS->ChangePage(listOf(if(token=="s-old")TypedChange(type,"activity",deleted=true) else TypedChange(type,"activity")),if(token=="s-old")"s-mid" else "s-final",false,false)
                else->error("Unexpected type")
            }}
        }
        val result=captureChangesAroundBaseline(ChangesReader(feed),linkedSetOf(ExportType.WEIGHT,ExportType.STEPS),mapOf(ExportType.WEIGHT to "w-old",ExportType.STEPS to "s-old")){calls.add("baseline");"baseline-result"}
        assertEquals(listOf("WEIGHT:w-old","STEPS:s-old","baseline","WEIGHT:w-mid","STEPS:s-mid"),calls);assertEquals("baseline-result",result.baseline);assertEquals(71.0,result.events.single().parent!!.records.single().value,0.0);assertEquals(mapOf(ExportType.WEIGHT to "w-final",ExportType.STEPS to "s-final"),result.candidates);assertTrue(result.gaps.isEmpty())
    }
    @Test fun gapTypesKeepPreBaselineTokenAndSecondDrainExpiryFailsWholeCapture()=runBlocking {
        val calls=mutableListOf<String>();val feed=object:ChangeFeed{override suspend fun token(type:ExportType):String{calls.add("token");return "reserved"};override suspend fun page(type:ExportType,token:String):ChangePage{calls.add(token);return ChangePage(emptyList(),if(token=="old")"mid" else "expired",false,token=="mid")}}
        val initial=captureChangesAroundBaseline(ChangesReader(feed),setOf(ExportType.SLEEP),emptyMap()){calls.add("baseline");Unit};assertEquals(listOf("token","baseline"),calls);assertEquals("reserved",initial.candidates[ExportType.SLEEP]);assertEquals(listOf(ExportType.SLEEP to "initial-baseline"),initial.gaps)
        calls.clear();try{captureChangesAroundBaseline(ChangesReader(feed),setOf(ExportType.SLEEP),mapOf(ExportType.SLEEP to "old")){calls.add("baseline");Unit};fail("Final expiry accepted")}catch(_:IllegalStateException){}
        assertEquals(listOf("old","baseline","mid","token"),calls)
    }
    @Test fun nullableAggregateObservationIsDistinctFromZeroAndUsesFinalCaptureInstant() {
        val window=requireNotNull(dailyActivityWindow(range.from,range.zone,now))
        val absent=aggregateObservationJson(AggregateObservation(DailyActivityMetric.STEPS,window,null),now);val zero=aggregateObservationJson(AggregateObservation(DailyActivityMetric.STEPS,window,0.0),now)
        assertTrue(absent.isNull("value"));assertEquals(0.0,zero.getDouble("value"),0.0);assertEquals(now.toString(),absent.getString("observedAt"));assertEquals(range.zone.id,absent.getString("zone"));assertTrue(absent.getString("start").contains("T00:00:00"))
    }
    @Test fun durablePendingSurvivesReopenAndOnlyExactReceiptCommitsCandidateCursors() {
        val file=File.createTempFile("reconcile-state-",".json");file.delete()
        try{val document=DiskDocument(file);val first=ReconciliationStore(document);val captured=first.captureState();val batch=batch(captured)
            first.stage(captured,batch,mapOf(ExportType.WEIGHT to "private-token"),setOf(ExportType.WEIGHT));assertFalse(first.pending()!!.batch.toString().contains("private-token"))
            val reopened=ReconciliationStore(document);assertEquals(batch.getString("batchId"),reopened.pending()!!.batch.getString("batchId"));assertThrows(IllegalArgumentException::class.java){reopened.captureState()}
            assertThrows(IllegalArgumentException::class.java){reopened.acknowledge(receipt(batch))};reopened.bindDigest("a".repeat(64))
            val wrong=receipt(batch).put("batchId",UUID.randomUUID().toString());assertThrows(IllegalArgumentException::class.java){reopened.acknowledge(wrong)};assertNotNull(reopened.pending())
            reopened.acknowledge(receipt(batch));val final=ReconciliationStore(document);assertNull(final.pending());assertEquals("private-token",final.cursors(final.captureState())[ExportType.WEIGHT]);assertEquals(2L,final.captureState().getLong("sequence"));assertEquals("b".repeat(64),final.captureState().getString("previousReceipt"))
        }finally{file.delete()}
    }
    @Test fun failedAcknowledgementWriteLeavesPendingAndOldCursorsTogether() {
        var stored:String?=null;var fail=false;val doc=object:ReconciliationDocument{override fun read()=stored;override fun write(value:String){if(fail)throw java.io.IOException("disk");stored=value}}
        val store=ReconciliationStore(doc);val captured=store.captureState();val batch=batch(captured);store.stage(captured,batch,mapOf(ExportType.SLEEP to "candidate"),setOf(ExportType.SLEEP));store.bindDigest("a".repeat(64));val before=stored;fail=true
        assertThrows(java.io.IOException::class.java){store.acknowledge(receipt(batch))};assertEquals(before,stored);assertNotNull(ReconciliationStore(doc).pending())
    }
    @Test fun explicitConflictResetCreatesNewBaselineStreamWithoutCommittingOldCandidates() {
        var stored:String?=null;val doc=object:ReconciliationDocument{override fun read()=stored;override fun write(value:String){stored=value}};val store=ReconciliationStore(doc);val captured=store.captureState();store.stage(captured,batch(captured),mapOf(ExportType.SLEEP to "unacknowledged"),setOf(ExportType.SLEEP))
        store.resetAfterConfirmedConflict();val next=store.captureState();assertNotEquals(captured.getString("streamId"),next.getString("streamId"));assertEquals(1L,next.getLong("sequence"));assertTrue(store.cursors(next).isEmpty());assertNull(store.pending());assertTrue(next.isNull("previousReceipt"))
    }
    @Test fun savingPendingFileDoesNotAcknowledgeAndRepairsOnlyItsDerivedCopy() {
        var stored:String?=null;val doc=object:ReconciliationDocument{override fun read()=stored;override fun write(value:String){stored=value}};val store=ReconciliationStore(doc);val captured=store.captureState();store.stage(captured,batch(captured),emptyMap(),setOf(ExportType.WEIGHT))
        val directory=File(System.getProperty("java.io.tmpdir"),"reconcile-${UUID.randomUUID()}");try{val file=store.file(directory);val before=stored;file.writeText("tampered");assertEquals(store.pending()!!.batch.toString(),store.file(directory).readText());assertEquals(before,stored);assertNotNull(store.pending())}finally{directory.listFiles()?.forEach{it.delete()};directory.delete()}
    }
    @Test fun batchSnapshotAndObservationsShareClockAndTokensNeverEnterWire() {
        val snapshot=HealthSnapshot(range,emptyList(),setOf(ExportType.STEPS),emptySet(),listOf(AggregateObservation(DailyActivityMetric.STEPS,requireNotNull(dailyActivityWindow(range.from,range.zone,now)),null)))
        val wire=reconciliationBatch(state(),snapshot,emptyList(),listOf(ExportType.STEPS to "initial-baseline"),now)
        assertEquals(now.toString(),wire.getString("observedAt"));assertEquals(wire.getString("observedAt"),wire.getJSONObject("snapshot").getString("exportedAt"));assertEquals(1,wire.getJSONArray("aggregateObservations").length());assertFalse(wire.has("cursors"));assertFalse(wire.has("candidates"))
        assertTrue(reconciliationCounts(counts()).removals);assertThrows(IllegalArgumentException::class.java){reconciliationCounts(counts().put("deleted","2"))}
    }
    @Test fun serializesReceiverFixtureWithCompleteParentDeletionAndNullableAggregates() {
        val weightSource=ExportSource("fixture.synthetic.weight","fixture-snapshot-weight",now)
        val weight=measurement(ExportType.WEIGHT,weightSource,now.minusSeconds(60),72.0,range.zone)
        val heartSource=ExportSource("fixture.synthetic.heart","fixture-complete-heart",now)
        val samples=listOf(now.minusSeconds(10*86400),now.minusSeconds(30)).map{measurement(ExportType.HEART_RATE,heartSource,it,70.0,range.zone,sampleId=it.toString())}
        val window=requireNotNull(dailyActivityWindow(range.from,range.zone,now))
        val snapshot=HealthSnapshot(range,listOf(weight),setOf(ExportType.WEIGHT,ExportType.HEART_RATE,ExportType.WATER,ExportType.STEPS,ExportType.ACTIVE_ENERGY),emptySet(),listOf(
            AggregateObservation(DailyActivityMetric.STEPS,window,null),AggregateObservation(DailyActivityMetric.ACTIVE_CALORIES,window,0.0)))
        val changes=listOf(TypedChange(ExportType.HEART_RATE,heartSource.recordId,NativeParent(ExportType.HEART_RATE,heartSource,samples)),TypedChange(ExportType.WATER,"fixture-deleted-water",deleted=true))
        val wire=reconciliationBatch(state(),snapshot,changes,listOf(ExportType.WEIGHT to "initial-baseline"),now)
        val text=wire.toString();assertTrue(text.toByteArray(Charsets.UTF_8).size<=MAX_EXPORT_BYTES)
        val decoded=JSONObject(text);assertEquals(2,decoded.getJSONArray("nativeChanges").length());assertEquals(2,decoded.getJSONArray("nativeChanges").getJSONObject(0).getJSONArray("records").length())
        assertEquals("delete",decoded.getJSONArray("nativeChanges").getJSONObject(1).getString("kind"));assertTrue(decoded.getJSONArray("aggregateObservations").getJSONObject(0).isNull("value"));assertEquals(0.0,decoded.getJSONArray("aggregateObservations").getJSONObject(1).getDouble("value"),0.0)
        assertEquals(decoded.getString("observedAt"),decoded.getJSONObject("snapshot").getString("exportedAt"));assertFalse(decoded.has("cursors"));assertFalse(decoded.has("candidates"))
        val directory=File(requireNotNull(System.getProperty("nourish.testFixtureDirectory")));check(directory.isDirectory||directory.mkdirs())
        File(directory,"reconciliation-export.json").writeText(text,Charsets.UTF_8)
    }

    @Test fun sharedJsonAndReconciliationNumberFailuresHaveOwnedIdentities() {
        val fields=assertThrows(WorkspaceValidationFailure::class.java){strictKeys(JSONObject().put("unexpected",1),setOf("expected"))}
        assertEquals(WorkspaceError.JSON_FIELDS,fields.code)
        val count=assertThrows(WorkspaceValidationFailure::class.java){reconciliationCounts(counts().put("deleted",-1))}
        assertEquals(WorkspaceError.RECON_NUMBER,count.code)
        val bound=assertThrows(WorkspaceValidationFailure::class.java){reconciliationCounts(counts().put("deleted",MAX_EXPORT_RECORDS+1))}
        assertEquals(WorkspaceError.RECON_COUNT,bound.code)
    }
    @Test fun typedPendingAndReceiptErrorsLeaveDurableStateUnchanged() {
        var stored:String?=null
        val document=object:ReconciliationDocument {override fun read()=stored;override fun write(value:String){stored=value}}
        val store=ReconciliationStore(document);val captured=store.captureState();val staged=batch(captured)
        store.stage(captured,staged,mapOf(ExportType.WEIGHT to "candidate"),setOf(ExportType.WEIGHT));store.bindDigest("a".repeat(64))
        val before=stored
        val pending=assertThrows(WorkspaceValidationFailure::class.java){store.captureState()}
        assertEquals(WorkspaceError.RECON_UNRESOLVED,pending.code);assertEquals(before,stored)
        val wrong=receipt(staged).put("batchId",UUID.randomUUID().toString())
        val failed=assertThrows(WorkspaceValidationFailure::class.java){store.acknowledge(wrong)}
        assertEquals(WorkspaceError.RECON_RECEIPT,failed.code);assertEquals(before,stored)
        assertEquals("candidate",ReconciliationStore(document).pending()!!.candidates[ExportType.WEIGHT])
    }
}
