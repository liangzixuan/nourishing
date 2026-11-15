package local.nourish.healthconnect

import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.records.metadata.Metadata
import java.io.File
import java.io.IOException
import java.time.Instant
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class HourlyHealthExportTest {
    private val now=Instant.parse("2026-11-03T12:00:00Z")
    private val origin=WorkspaceOrigin.parse("https://fixture.test.ts.net")
    private fun plan():HealthWritePlan=parseHealthWritePlan(JSONArray(File(requireNotNull(System.getProperty("nourish.biometricWriteFixture"))).readText()).getJSONObject(0),now)
    private fun config(plan:HealthWritePlan=plan())=HourlyExportConfig(origin,"owner",plan.selection,7,"first")
    private inner class Store(var active:HourlyExportConfig?):HourlyExportStore {
        var ledger=emptyMap<String,HealthWriteReceipt>();var acknowledgements=0
        override fun current(config:HourlyExportConfig)=active==config
        override fun receipts(config:HourlyExportConfig)=ledger
        override fun acknowledge(config:HourlyExportConfig,receipts:Map<String,HealthWriteReceipt>){check(current(config));ledger=receipts;acknowledgements++}
    }
    private inner class Transport(var source:HealthWritePlan=plan()):HourlyExportTransport {
        var verifies=0;var stale=false;var onVerify:()->Unit={};var wrongSelection=false
        override suspend fun preview(config:HourlyExportConfig,selection:JSONObject)=source.copy(selection=JSONObject(selection.toString()).apply{if(wrongSelection)put("timeZone","UTC")}.toString())
        override suspend fun verify(config:HourlyExportConfig,plan:HealthWritePlan){verifies++;if(stale)throw IOException("stale review");onVerify()}
    }
    private inner class Sink:HealthWriteSink {
        var granted=HealthWriteType.WEIGHT.permissions;var calls=0;var fail=false;var onInsert:()->Unit={};var reads=0;var onRead:()->Unit={}
        val records=linkedMapOf<String,WeightRecord>()
        override suspend fun permissions()=granted
        override suspend fun insert(records:List<Record>):List<String>{
            calls++;onInsert();if(fail)throw IOException("lost result")
            return records.map{value->val row=value as WeightRecord;val id=requireNotNull(row.metadata.clientRecordId)
                val metadata=Metadata::class.java.constructors.first{it.parameterCount==7}.newInstance(Metadata.RECORDING_METHOD_MANUAL_ENTRY,id,DataOrigin("local.nourish.healthconnect"),now,id,row.metadata.clientRecordVersion,null) as Metadata
                this.records[id]=WeightRecord(time=row.time,zoneOffset=row.zoneOffset,weight=row.weight,metadata=metadata);id}
        }
        override suspend fun read(type:HealthWriteType,id:String):Record {reads++;onRead();return records.getValue(id)}
    }
    private fun sequence():HealthWriteSequence {var version=0L;return HealthWriteSequence({version},{version=it},{100L})}
    private fun coordinator(store:Store,transport:Transport,sink:Sink,access:suspend(HourlyExportConfig)->Unit={})=HourlyExportCoordinator(store,transport,sink,sequence(),access)
    private suspend fun fails(action:suspend()->Unit){try{action();fail("Expected rejection")}catch(error:Exception){if(error is CancellationException)throw error}}

    @Test fun reviewedEnablementRequiresTodayAndOneToThirtyDaysForAllFourteenKinds(){
        val sources=JSONArray(File(requireNotNull(System.getProperty("nourish.biometricWriteFixture"))).readText())
        val intake=JSONArray(File(requireNotNull(System.getProperty("nourish.intakeWriteFixture"))).readText())
        val types=mutableSetOf<HealthWriteType>()
        for(json in (0 until sources.length()).map{sources.getJSONObject(it)}+(0 until intake.length()).map{intake.getJSONObject(it)}){
            val p=parseHealthWritePlan(json,now);val selected=JSONObject(p.selection).put("from","2026-10-05").put("to","2026-11-03")
            val accepted=reviewedHourlyExport(origin,WorkspaceIdentity("owner"),p.copy(selection=selected.toString()),now,"revision")
            assertEquals(30,accepted.days);types.add(accepted.type)
            assertThrows(IllegalArgumentException::class.java){reviewedHourlyExport(origin,WorkspaceIdentity("owner"),p.copy(selection=selected.put("from","2026-10-04").toString()),now,"revision")}
            assertThrows(IllegalArgumentException::class.java){reviewedHourlyExport(origin,WorkspaceIdentity("owner"),p.copy(selection=selected.put("to","2026-11-02").toString()),now,"revision")}
        }
        assertEquals(HealthWriteType.entries.toSet(),types)
    }
    @Test fun rollingWindowUsesSelectedZoneAcrossDstAndPreservesMapping(){
        val config=config();val selection=config.selectionAt(Instant.parse("2026-11-02T05:30:00Z"))
        assertEquals("2026-11-01",selection.getString("to"));assertEquals("2026-10-26",selection.getString("from"))
        assertEquals(JSONObject(config.selection).getJSONObject("metric").getString("type"),selection.getJSONObject("metric").getString("type"))
        assertThrows(IllegalArgumentException::class.java){config.copy(days=31)}
    }
    @Test fun unchangedSourceIsSkippedChangedSourceUpsertsAndAbsentRowsOnlyPruneLedger()=runBlocking {
        val config=config();val store=Store(config);val transport=Transport();val sink=Sink();val runner=coordinator(store,transport,sink)
        assertEquals(1,runner.run(config,now).written);assertEquals(1,sink.calls)
        assertEquals(1,runner.run(config,now.plusSeconds(86400)).unchanged);assertEquals(1,sink.calls)
        transport.source=transport.source.copy(rows=transport.source.rows.map{it.copy(value=71.0)})
        assertEquals(1,runner.run(config,now).written);assertEquals(1,sink.records.size);assertEquals(71.0,sink.records.values.single().weight.inKilograms,0.0)
        transport.source=transport.source.copy(rows=emptyList());assertEquals(0,runner.run(config,now).written)
        assertTrue(store.ledger.isEmpty());assertEquals(1,sink.records.size);assertEquals(4,transport.verifies)
    }
    @Test fun staleWrongSelectionRevokedAccessAndStoppedConfigurationCannotInsert()=runBlocking {
        val config=config()
        for(mode in listOf("stale","selection","revoked","stopped","replaced")){
            val store=Store(config);val transport=Transport();val sink=Sink()
            transport.stale=mode=="stale";transport.wrongSelection=mode=="selection"
            if(mode=="stopped")store.active=null
            if(mode=="replaced")transport.onVerify={store.active=config.copy(revision="replacement")}
            fails{coordinator(store,transport,sink){if(mode=="revoked")error("Revoked")}.run(config,now)}
            assertEquals(mode,0,sink.calls);assertEquals(mode,0,store.acknowledgements)
        }
    }
    @Test fun stopDuringFirstBatchPreventsSecondBatchAndDoesNotAcknowledge()=runBlocking {
        val base=plan();val config=config(base);val store=Store(config);val transport=Transport(base.copy(rows=(0..1000).map{base.rows.single().copy(clientId="nourish-export:weight:"+it.toString().padStart(64,'0'))}))
        val sink=Sink();sink.onInsert={store.active=null};val progress=HealthWriteProgress()
        fails{coordinator(store,transport,sink).run(config,now,progress)}
        assertEquals(1,sink.calls);assertEquals(1000,progress.confirmed);assertEquals(0,store.acknowledgements)
    }
    @Test fun lostWriteResponseKeepsLedgerUnacknowledgedAndNextRunUsesStableIdentities()=runBlocking {
        val config=config();val store=Store(config);val transport=Transport();val sink=Sink();sink.fail=true;val progress=HealthWriteProgress();val runner=coordinator(store,transport,sink)
        fails{runner.run(config,now,progress)};assertEquals(1,progress.attempted);assertEquals(0,progress.confirmed);assertTrue(store.ledger.isEmpty())
        sink.fail=false;assertEquals(1,runner.run(config,now).written);assertEquals(1,sink.records.size)
    }
    @Test fun fingerprintRetainsNutritionIdentityAndDistinguishesUnknownFromZero(){
        val row=plan().rows.single();val a=row.copy(nutrients=mapOf("protein" to 1.0,"sodium" to 0.0))
        assertEquals(healthPayloadDigest(HealthWriteType.NUTRITION,a),healthPayloadDigest(HealthWriteType.NUTRITION,a.copy(nutrients=mapOf("sodium" to 0.0,"protein" to 1.0))))
        for(changed in listOf(a.copy(nutrients=mapOf("protein" to 1.0)),a.copy(end=now),a.copy(name="Changed"),a.copy(time=row.time.plusSeconds(60)),a.copy(clientId="another")))assertNotEquals(healthPayloadDigest(HealthWriteType.NUTRITION,a),healthPayloadDigest(HealthWriteType.NUTRITION,changed))
    }
    @Test fun writeSequenceSerializesManualAndBackgroundReservesBeforeCallAndSurvivesClockRollback()=runBlocking {
        var stored=99L;val entered=CompletableDeferred<Unit>();val release=CompletableDeferred<Unit>();val sequence=HealthWriteSequence({stored},{stored=it},{50L});val seen=mutableListOf<Long>()
        val first=launch{sequence.write{version->assertEquals(version,stored);seen.add(version);entered.complete(Unit);release.await()}}
        entered.await();val second=launch{sequence.write{version->seen.add(version)}};yield();assertEquals(listOf(100L),seen)
        val cancelled=launch{sequence.write{fail("Cancelled waiter entered native write")}};yield();cancelled.cancelAndJoin();release.complete(Unit);first.join();second.join()
        assertEquals(listOf(100L,101L),seen);assertEquals(101L,stored)
        val broken=HealthWriteSequence({stored},{throw IOException("disk failure")},{200L});fails{broken.write{fail("Unpersisted revision used")}}
        HealthWriteSequence({stored},{stored=it},{1L}).write{assertEquals(102L,it)}
    }
    @Test fun changedDeletedUnreadableAndForeignCopiesStopBeforeAnyInsertion()=runBlocking {
        for(mode in listOf("changed","deleted","unreadable","foreign","version")){
            val config=config();val store=Store(config);val transport=Transport();val sink=Sink();val runner=coordinator(store,transport,sink)
            runner.run(config,now);val receipt=store.ledger.values.single();val original=sink.records.getValue(receipt.nativeId)
            when(mode){
                "changed"->sink.records[receipt.nativeId]=WeightRecord(time=original.time,zoneOffset=original.zoneOffset,weight=androidx.health.connect.client.units.Mass.kilograms(90.0),metadata=original.metadata)
                "deleted"->sink.records.clear()
                "unreadable"->sink.onRead={throw IOException("Permission or provider unavailable")}
                else->{val meta=Metadata::class.java.constructors.first{it.parameterCount==7}.newInstance(Metadata.RECORDING_METHOD_MANUAL_ENTRY,receipt.nativeId,DataOrigin(if(mode=="foreign")"other.app" else "local.nourish.healthconnect"),now,receipt.row.clientId,if(mode=="version")receipt.version+1 else receipt.version,null) as Metadata
                    sink.records[receipt.nativeId]=WeightRecord(time=original.time,zoneOffset=original.zoneOffset,weight=original.weight,metadata=meta)}
            }
            // A local update must not hide a native conflict either.
            transport.source=transport.source.copy(rows=transport.source.rows.map{it.copy(value=72.0)}+transport.source.rows.map{it.copy(clientId="nourish-export:weight:"+"f".repeat(64))})
            fails{runner.run(config,now)};assertEquals(mode,1,sink.calls);assertEquals(mode,1,store.acknowledgements);assertEquals(receipt,store.ledger.values.single())
        }
    }
    @Test fun verifiedPartialWritesRemainAcknowledgedAfterReadFailure()=runBlocking {
        val base=plan();val config=config(base);val store=Store(config);val transport=Transport(base.copy(rows=base.rows+base.rows.map{it.copy(clientId="nourish-export:weight:"+"f".repeat(64))}));val sink=Sink();val runner=coordinator(store,transport,sink)
        sink.onRead={if(sink.reads==2)throw IOException("read failed")};val progress=HealthWriteProgress();fails{runner.run(config,now,progress)}
        assertEquals(2,progress.attempted);assertEquals(1,progress.confirmed);assertEquals(1,store.ledger.size)
        sink.onRead={};val result=runner.run(config,now);assertEquals(1,result.unchanged);assertEquals(1,result.written);assertEquals(2,store.ledger.size)
    }
    @Test fun cancellationAndStopDuringNativeVerificationCannotWrite()=runBlocking {
        for(mode in listOf("cancel","stop")){
            val config=config();val store=Store(config);val transport=Transport();val sink=Sink();val runner=coordinator(store,transport,sink);runner.run(config,now)
            transport.source=transport.source.copy(rows=transport.source.rows.map{it.copy(value=72.0)})
            sink.onRead={if(mode=="cancel")throw CancellationException("cancelled") else store.active=null}
            try{runner.run(config,now);fail("Expected interruption")}catch(_:CancellationException){}catch(_:IllegalStateException){}
            assertEquals(1,sink.calls);assertEquals(1,store.acknowledgements)
        }
    }

}
