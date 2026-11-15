package local.nourish.healthconnect

import java.io.File
import java.time.Instant
import java.time.ZoneId
import java.util.UUID
import kotlinx.coroutines.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class BackgroundReconciliationTest {
    private class Fixture:AutoCloseable {
        val directory=File(System.getProperty("java.io.tmpdir"),"background-reconcile-${UUID.randomUUID()}").apply{mkdirs()}
        var raw:String?=null
        val store=ReconciliationStore(object:ReconciliationDocument{override fun read()=raw;override fun write(value:String){raw=value}},directory)
        val gate=ReconciliationGate()
        val origin=WorkspaceOrigin.parse("https://fixture.test.ts.net")
        val config=BackgroundSyncConfig(origin,"owner@example.test",setOf(ExportType.WEIGHT),7,"revision-one",BackgroundSyncMode.RECONCILIATION,true)
        var saved:BackgroundSyncConfig?=config
        var permitted=setOf(ExportType.WEIGHT)
        var backgroundPermission=true
        var actualLogin=config.login
        val events=mutableListOf<String>()
        var removals=false
        var committed:JSONObject?=null
        var receiptError:Exception?=null
        var applyError:Exception?=null
        var afterCapture:suspend()->Unit={}
        var afterPreview:suspend()->Unit={}
        var beforeApply:suspend()->Unit={}
        private fun counts()=ReconciliationCounts(1,0,0,if(removals)1 else 0,0,0)
        fun stage(authority:PendingAuthority=PendingAuthority.Background(config.revision),types:Set<ExportType> = config.types){
            val captured=store.captureState();val now=Instant.parse("2026-10-30T12:00:00Z");val range=ExportRange.create("2026-10-29","2026-10-30",ZoneId.of("America/Chicago"),now)
            val batch=reconciliationBatch(captured,HealthSnapshot(range,emptyList(),types,emptySet()),emptyList(),types.map{it to "initial-baseline"},now)
            store.stage(captured,batch,types.associateWith{"candidate-${it.name}"},types,authority)
        }
        fun receipt(pending:ReconciliationPending=requireNotNull(store.pending()))=JSONObject().put("streamId",pending.batch.getString("streamId")).put("sequence",pending.batch.getLong("sequence")).put("batchId",pending.batch.getString("batchId")).put("batchDigest",pending.digest?:"a".repeat(64)).put("receiptId","c".repeat(64)).put("counts",JSONObject().put("added",1).put("updated",0).put("unchanged",0).put("deleted",if(removals)1 else 0).put("replaced",0).put("invalidated",0)).put("recoverySnapshotId",if(removals)1 else JSONObject.NULL)
        val transport=object:ReconciliationTransport {
            private fun checkIdentity(identity:WorkspaceIdentity){require(identity.login==actualLogin){"Workspace account changed"}}
            override suspend fun receipt(origin:WorkspaceOrigin,identity:WorkspaceIdentity,pending:ReconciliationPending):JSONObject?{checkIdentity(identity);events.add("receipt");receiptError?.let{throw it};return committed}
            override suspend fun preview(origin:WorkspaceOrigin,identity:WorkspaceIdentity,pending:ReconciliationPending,file:File):ReconciliationReview{checkIdentity(identity);events.add("preview");assertEquals(pending.batch.toString(),file.readText());afterPreview();return ReconciliationReview("b".repeat(64),"a".repeat(64),counts(),emptyList(),false,null)}
            override suspend fun apply(origin:WorkspaceOrigin,identity:WorkspaceIdentity,pending:ReconciliationPending,review:ReconciliationReview,allowRemovals:Boolean):JSONObject{checkIdentity(identity);events.add("apply");assertTrue(!removals||allowRemovals);beforeApply();applyError?.let{if(it is WorkspaceTransferFailure&&!it.outcomeUnknown)throw it};val result=this@Fixture.receipt(pending);committed=result;applyError?.let{throw it};return result}
        }
        fun coordinator()=BackgroundReconciliationCoordinator(current={saved==it},access={_,types->events.add("access");check(backgroundPermission&&permitted.containsAll(types)){"revoked"}},openStore={events.add("open");store},capture={c,_->events.add("capture");stage(PendingAuthority.Background(c.revision),c.types);afterCapture()},transport=transport,directory=directory,gate=gate)
        override fun close(){directory.listFiles().orEmpty().forEach{if(it.isDirectory)it.listFiles().orEmpty().forEach(File::delete);it.delete()};directory.delete()}
    }
    private suspend fun fails(block:suspend()->Unit):Exception {try{block()}catch(error:Exception){return error};throw AssertionError("Expected failure")}

    @Test fun legacySnapshotAndDisabledConfigCannotReachReconciliation()=runBlocking {
        val prefs=mapOf<String,Any>("enabled" to true,"origin" to "https://fixture.test.ts.net","login" to "owner@example.test","types" to setOf("WEIGHT"),"days" to 7,"revision" to "old")
        val legacy=requireNotNull(parseBackgroundSyncConfig(prefs));assertEquals(BackgroundSyncMode.SNAPSHOT,legacy.mode);assertFalse(legacy.allowRemovals)
        assertNull(parseBackgroundSyncConfig(prefs+("mode" to "unknown")));assertNull(parseBackgroundSyncConfig(prefs+("allow-removals" to true)));assertNull(parseBackgroundSyncConfig(prefs+("days" to "7")));assertNull(parseBackgroundSyncConfig(prefs+("enabled" to false)))
        Fixture().use{f->f.saved=legacy;assertEquals(BackgroundReconciliationOutcome.Inactive,f.coordinator().run(legacy));assertTrue(f.events.isEmpty());f.saved=null;assertEquals(BackgroundReconciliationOutcome.Inactive,f.coordinator().run(f.config));assertTrue(f.events.isEmpty())}
    }
    @Test fun freshCapturePreviewsAppliesOnceAndAcknowledgesExactReceipt()=runBlocking {
        Fixture().use{f->assertTrue(f.coordinator().run(f.config) is BackgroundReconciliationOutcome.Acknowledged);assertEquals(listOf("capture","preview","apply"),f.events.filter{it in setOf("capture","preview","apply","receipt")});assertNull(f.store.pending());assertEquals("candidate-WEIGHT",f.store.cursors(f.store.captureState())[ExportType.WEIGHT]);assertEquals(2L,f.store.captureState().getLong("sequence"))}
    }
    @Test fun existingEligibleOutboxResumesWithoutReadingNewHealthData()=runBlocking {
        for(bound in listOf(false,true)){Fixture().use{f->f.stage();if(bound)f.store.bindDigest("a".repeat(64));assertTrue(f.coordinator().run(f.config) is BackgroundReconciliationOutcome.Acknowledged);assertFalse(f.events.contains("capture"));assertEquals(if(bound)listOf("receipt","preview","apply")else listOf("preview","apply"),f.events.filter{it in setOf("receipt","preview","apply")})}}
    }
    @Test fun committedReceiptAcknowledgesForegroundOrReplacedRevisionWithoutHealthPost()=runBlocking {
        for(authority in listOf(PendingAuthority.Foreground,PendingAuthority.Background("older"))){Fixture().use{f->f.stage(authority);f.store.bindDigest("a".repeat(64));f.committed=f.receipt();assertTrue(f.coordinator().run(f.config) is BackgroundReconciliationOutcome.Acknowledged);assertNull(f.store.pending());assertEquals(listOf("receipt"),f.events.filter{it in setOf("capture","receipt","preview","apply")})}}
    }
    @Test fun unconfirmedForegroundAndOldRevisionPendingAreHeldWhole()=runBlocking {
        for(authority in listOf(PendingAuthority.Foreground,PendingAuthority.Background("older"))){Fixture().use{f->f.stage(authority);val before=f.raw;assertTrue(f.coordinator().run(f.config) is BackgroundReconciliationOutcome.HeldForOwner);assertEquals(before,f.raw);assertFalse(f.events.any{it in setOf("capture","preview","apply")})}}
    }
    @Test fun foregroundPendingWithUnknownOutcomeOnlyChecksReceiptThenHolds()=runBlocking {
        Fixture().use{f->f.stage(PendingAuthority.Foreground);f.store.bindDigest("a".repeat(64));val before=f.raw;assertTrue(f.coordinator().run(f.config) is BackgroundReconciliationOutcome.HeldForOwner);assertEquals(listOf("receipt"),f.events.filter{it in setOf("receipt","preview","apply","capture")});assertEquals(before,f.raw)}
    }
    @Test fun lostApplyReplyRetainsCandidatesThenRecoversCommittedReceiptWithoutReplay()=runBlocking {
        Fixture().use{f->f.applyError=WorkspaceTransferFailure("lost",outcomeUnknown=true);assertTrue(fails{f.coordinator().run(f.config)} is WorkspaceTransferFailure);val pending=requireNotNull(f.store.pending());assertEquals("a".repeat(64),pending.digest);assertFalse(JSONObject(f.raw!!).getJSONObject("cursors").has("WEIGHT"));f.events.clear();assertTrue(f.coordinator().run(f.config) is BackgroundReconciliationOutcome.Acknowledged);assertEquals(listOf("receipt"),f.events.filter{it in setOf("receipt","preview","apply","capture")})}
    }
    @Test fun offlineReceiptFailureNeverRepreviewsOrOverwritesPending()=runBlocking {
        Fixture().use{f->f.stage();f.store.bindDigest("a".repeat(64));f.receiptError=java.io.IOException("offline");val before=f.raw;fails{f.coordinator().run(f.config)};assertEquals(before,f.raw);assertEquals(listOf("receipt"),f.events.filter{it in setOf("receipt","preview","apply","capture")})}
    }
    @Test fun unapprovedRemovalsHoldWholeBatchAndDoNotAdvanceAnyCursor()=runBlocking {
        Fixture().use{f->val config=f.config.copy(allowRemovals=false);f.saved=config;f.removals=true;val outcome=f.coordinator().run(config);assertEquals(BackgroundReconciliationOutcome.HeldForRemovals(ReconciliationCounts(1,0,0,1,0,0)),outcome);assertEquals(SyncStatus.HeldRemovals(ReconciliationCounts(1,0,0,1,0,0)),outcome.syncStatus());assertNotNull(f.store.pending());assertEquals("a".repeat(64),f.store.pending()!!.digest);assertFalse(f.events.contains("apply"));assertFalse(JSONObject(f.raw!!).getJSONObject("cursors").has("WEIGHT"))}
    }
    @Test fun revocationBeforePreviewOrApplyStopsUnsentPostAndPreservesPending()=runBlocking {
        for(afterPreview in listOf(false,true)){Fixture().use{f->if(afterPreview)f.afterPreview={f.permitted=emptySet()}else f.afterCapture={f.permitted=emptySet()};fails{f.coordinator().run(f.config)};assertNotNull(f.store.pending());assertFalse(f.events.contains("apply"));assertEquals(afterPreview,f.events.contains("preview"));assertFalse(JSONObject(f.raw!!).getJSONObject("cursors").has("WEIGHT"))}}
    }
    @Test fun configurationReplacementDuringPreviewCannotBorrowOldAuthority()=runBlocking {
        Fixture().use{f->f.afterPreview={f.saved=f.config.copy(revision="new-revision")};fails{f.coordinator().run(f.config)};assertFalse(f.events.contains("apply"));assertEquals(PendingAuthority.Background(f.config.revision),f.store.pending()!!.authority);f.afterPreview={};f.events.clear();assertTrue(f.coordinator().run(f.saved!!) is BackgroundReconciliationOutcome.HeldForOwner);assertEquals(listOf("receipt"),f.events.filter{it in setOf("receipt","preview","apply","capture")})}
    }
    @Test fun accountMismatchAndConflictingReviewLeaveSameStreamPending()=runBlocking {
        Fixture().use{f->f.stage();val stream=f.store.pending()!!.batch.getString("streamId");f.actualLogin="other@example.test";fails{f.coordinator().run(f.config)};assertEquals(stream,f.store.pending()!!.batch.getString("streamId"));assertFalse(f.events.contains("apply"))}
        Fixture().use{f->f.applyError=WorkspaceTransferFailure("stale",httpStatus=409);fails{f.coordinator().run(f.config)};assertNotNull(f.store.pending());assertEquals(1L,f.store.pending()!!.batch.getLong("sequence"));assertFalse(JSONObject(f.raw!!).getJSONObject("cursors").has("WEIGHT"))}
    }
    @Test fun malformedExactReceiptCannotAdvanceCursors()=runBlocking {
        Fixture().use{f->f.stage();f.store.bindDigest("a".repeat(64));f.committed=f.receipt().put("batchId",UUID.randomUUID().toString());fails{f.coordinator().run(f.config)};assertNotNull(f.store.pending());assertFalse(JSONObject(f.raw!!).getJSONObject("cursors").has("WEIGHT"))}
    }
    @Test fun pendingTypeScopeAndMissingBackgroundPermissionBlockUnsentData()=runBlocking {
        Fixture().use{f->f.stage(types=setOf(ExportType.WEIGHT,ExportType.SLEEP));val before=f.raw;fails{f.coordinator().run(f.config)};assertEquals(before,f.raw);assertFalse(f.events.any{it in setOf("capture","preview","apply")})}
        Fixture().use{f->f.backgroundPermission=false;fails{f.coordinator().run(f.config)};assertNull(f.store.pending());assertFalse(f.events.contains("open"))}
    }
    @Test fun privateAuthorityIsRetainedAcrossReopenButNeverEntersExportedBatch() {
        Fixture().use{f->f.stage();assertEquals(PendingAuthority.Background(f.config.revision),f.store.pending()!!.authority);val wire=JSONObject(f.store.file(f.directory).readText());assertFalse(wire.has("authority"));assertFalse(wire.has("candidates"));assertFalse(wire.toString().contains("revision-one"))}
    }
    @Test fun cancellationReleasesSharedGateAndRetainsUnacknowledgedBatch()=runBlocking {
        Fixture().use{f->val entered=CompletableDeferred<Unit>();val never=CompletableDeferred<Unit>();f.beforeApply={entered.complete(Unit);never.await()};val job=launch{f.coordinator().run(f.config)};withTimeout(2000){entered.await()};job.cancelAndJoin();assertNotNull(f.store.pending());assertFalse(JSONObject(f.raw!!).getJSONObject("cursors").has("WEIGHT"));withTimeout(2000){f.gate.withWorkspace(f.origin,WorkspaceIdentity(f.config.login)){assertNotNull(f.store.pending())}}}
    }
    @Test fun foregroundAndWorkerContendOnSameGateAndCancelledWaiterDoesNotEnter()=runBlocking {
        Fixture().use{f->val entered=CompletableDeferred<Unit>();val release=CompletableDeferred<Unit>();val foreground=launch{f.gate.withWorkspace(f.origin,WorkspaceIdentity(f.config.login)){entered.complete(Unit);release.await()}};entered.await();val worker=launch{f.coordinator().run(f.config)};yield();assertFalse(f.events.contains("open"));worker.cancelAndJoin();release.complete(Unit);foreground.join();withTimeout(2000){f.coordinator().run(f.config)};assertEquals(1,f.events.count{it=="capture"})}
    }
    @Test fun cleanupFailureRetainsOwnershipAfterAckAndRetriesBeforeNewCapture()=runBlocking {
        Fixture().use{f->var blocked:File?=null;f.beforeApply={val batch=f.store.pending()!!.batch;val file=File(f.directory,"reconciliation-${batch.getString("batchId")}.json");assertTrue(file.delete());assertTrue(file.mkdir());File(file,"owned-blocker").writeText("fixture");blocked=file}
            fails{f.coordinator().run(f.config)};assertNull(f.store.pending());assertTrue(JSONObject(f.raw!!).has("cleanupBatchId"));blocked!!.listFiles()!!.forEach(File::delete);assertTrue(blocked!!.delete());f.beforeApply={};f.events.clear();assertTrue(f.coordinator().run(f.config) is BackgroundReconciliationOutcome.Acknowledged);assertFalse(JSONObject(f.raw!!).has("cleanupBatchId"));assertEquals(1,f.events.count{it=="capture"})}
    }
    @Test fun pickerCopySurvivesAckAndRestoresWhileFailedCleanupRemainsOwned() {
        Fixture().use{f->f.stage();val source=f.store.file(f.directory);val dir=File(f.directory,"documents");var removeAllowed=false;val picker=DocumentExportOwner(dir){if(removeAllowed)it.delete() else false};val copy=picker.create(source);val bytes=copy.readBytes();assertNotNull(f.store.pending());f.store.bindDigest("a".repeat(64));f.store.acknowledge(f.receipt());assertFalse(source.exists());assertArrayEquals(bytes,copy.readBytes());assertEquals(copy,DocumentExportOwner(dir).restore(copy.absolutePath));assertEquals(0,picker.retryCleanup(copy));assertFalse(picker.release(copy));assertEquals(1,picker.retryCleanup(null));removeAllowed=true;assertEquals(0,picker.retryCleanup(null));assertNull(picker.restore(copy.absolutePath));assertNull(picker.restore(source.absolutePath))}
    }
    @Test fun pickerLeaseRestoresOutstandingPickerButNeverRestoresRunningCopy() {
        Fixture().use{f->f.stage();val source=f.store.file(f.directory);val owner=DocumentExportOwner(File(f.directory,"documents"));val original=DocumentExportLease(owner);original.begin(source);assertTrue(original.pickerPending);val path=original.savedPickerPath!!
            val restored=DocumentExportLease(owner);restored.restore(original.pickerPending,path);assertTrue(restored.requested);assertArrayEquals(source.readBytes(),restored.file!!.readBytes());restored.beginCopy();assertTrue(restored.requested);assertFalse(restored.pickerPending);assertNull(restored.savedPickerPath)
            val afterCopyRecreation=DocumentExportLease(owner);afterCopyRecreation.restore(restored.pickerPending,restored.savedPickerPath);assertFalse(afterCopyRecreation.requested);assertTrue(restored.finish());assertFalse(File(path).exists());assertNotNull(f.store.pending())}
    }
    @Test fun missingRestoredPickerKeepsItsKindUntilCancellationWithoutSnapshotFallback() {
        Fixture().use{f->val owner=DocumentExportOwner(File(f.directory,"documents"));val lease=DocumentExportLease(owner);lease.restore(true,File(f.directory,"missing.json").absolutePath);assertTrue(lease.requested);assertTrue(lease.pickerPending);assertNull(lease.file);assertTrue(lease.finish());assertFalse(lease.requested)}
    }
}
