package local.nourish.healthconnect

import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.records.metadata.Metadata
import java.io.File
import java.io.IOException
import java.time.Instant
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class CloudHealthExportTest {
    private val now=Instant.parse("2026-11-03T12:00:00Z")
    private val namespace="11111111-1111-4111-8111-111111111111"
    private fun fixture()=JSONArray(File("../fixtures/biometric-write-previews.json").readText()).getJSONObject(0)
    private inner class Connection {
        var cookie="__Host-nourishing_session=first";var account="owner";var lineage=namespace;var stale=false
        var source=fixture()
        val paths=mutableListOf<String>()
        val session=CloudAccountSession(CloudOrigin.parse("https://nourishing.app"),{cookie},CloudHttpTransport{request->
            val path=request.url.encodedPath;paths.add(path)
            val json=when {
                path=="/api/account"->JSONObject().put("id",account)
                path.endsWith("/verify")->if(stale)return@CloudHttpTransport CloudHttpReply(409,"{}") else JSONObject().put("valid",true).put("reviewToken",source.getString("reviewToken"))
                path.endsWith("/options")->JSONObject().put("version",1).put("metrics",JSONArray()).put("timeZone","UTC")
                else->JSONObject(source.toString())
            }
            if(path!="/api/account"&&!path.endsWith("/verify"))json.put("accountId",account).put("namespace",lineage)
            CloudHttpReply(200,json.toString())
        })
        val transfer=CloudHealthExport(session)
        fun preview()=session.acquire().let{lease->transfer.preview(lease,source.getJSONObject("selection"),now)}
    }
    private class Journal:CloudExportJournal {
        val pending=mutableMapOf<CloudExportOwner,CloudExportPending>()
        override fun load(owner:CloudExportOwner)=pending[owner]
        override fun save(value:CloudExportPending){pending[value.review.owner]=value}
        override fun finish(owner:CloudExportOwner){pending.remove(owner)}
    }
    private inner class Sink:HealthWriteSink {
        var calls=0;var loseReply=false;var onInsert:()->Unit={};val stored=mutableMapOf<String,WeightRecord>()
        var granted=HealthWriteType.WEIGHT.permissions
        override suspend fun permissions()=granted
        override suspend fun insert(records:List<Record>):List<String>{
            calls++;val ids=records.map {record->val row=record as WeightRecord;val id=requireNotNull(row.metadata.clientRecordId)
                val metadata=Metadata::class.java.constructors.first{it.parameterCount==7}.newInstance(Metadata.RECORDING_METHOD_MANUAL_ENTRY,id,DataOrigin("local.nourish.healthconnect"),now,id,row.metadata.clientRecordVersion,null) as Metadata
                stored[id]=WeightRecord(row.time,row.zoneOffset,row.weight,metadata);id}
            onInsert();if(loseReply)throw IOException("lost result");return ids
        }
        override suspend fun read(type:HealthWriteType,id:String):Record=stored.getValue(id)
    }
    private fun sequence():HealthWriteSequence{var version=0L;return HealthWriteSequence({version},{version=it},{100L})}

    @Test fun previewUsesOriginalNativePlanAndBindsAccountLineage() {
        val connection=Connection();val review=connection.preview()
        assertEquals(parseHealthWritePlan(fixture(),now),review.plan)
        assertEquals("owner",review.owner.accountId);assertEquals(namespace,review.owner.namespace)
        assertEquals(review,parseCloudExportPending(cloudExportPendingJson(CloudExportPending(review,100))).review)
        connection.account="different"
        assertThrows(IllegalArgumentException::class.java){connection.preview()}
    }
    @Test fun uncertainWriteSurvivesSessionChangeAndResumesSameVersionOnlyForSameOwner()=runBlocking {
        val connection=Connection();val review=connection.preview();val journal=Journal();val sink=Sink();val sequence=sequence()
        sink.loseReply=true
        try{connection.transfer.write(connection.session.acquire(),review,journal,sink,sequence);fail()}catch(_:HealthWriteFailure){}
        val pending=requireNotNull(journal.load(review.owner));assertTrue(pending.attempted);assertEquals(100L,pending.version)
        val roundtrip=parseCloudExportPending(cloudExportPendingJson(pending));assertEquals(pending,roundtrip)
        connection.cookie="__Host-nourishing_session=second";connection.session.refresh();connection.account="other"
        try{connection.transfer.write(connection.session.acquire(),review,journal,sink,sequence);fail()}catch(_:IllegalArgumentException){}
        assertEquals(1,sink.calls);assertNotNull(journal.load(review.owner))
        connection.account="owner";connection.cookie="__Host-nourishing_session=third";connection.session.refresh();sink.loseReply=false
        assertEquals(1,connection.transfer.write(connection.session.acquire(),review,journal,sink,sequence))
        assertEquals(1,sink.stored.size);assertEquals(100L,sink.stored.values.single().metadata.clientRecordVersion);assertNull(journal.load(review.owner))
    }
    @Test fun staleBackendReviewAndRestoredLineageCannotWrite()=runBlocking {
        for(mode in listOf("stale","lineage")){
            val connection=Connection();val review=connection.preview();val journal=Journal();val sink=Sink()
            if(mode=="stale")connection.stale=true else connection.lineage="22222222-2222-4222-8222-222222222222"
            try{connection.transfer.write(connection.session.acquire(),review,journal,sink,sequence());fail()}catch(_:Exception){}
            assertEquals(0,sink.calls)
        }
    }
    @Test fun logoutAfterNativeInsertRetainsReceiptAndRequiresNewExplicitResume()=runBlocking {
        val connection=Connection();val review=connection.preview();val journal=Journal();val sink=Sink()
        sink.onInsert={connection.cookie="";connection.session.refresh()}
        try{connection.transfer.write(connection.session.acquire(),review,journal,sink,sequence());fail()}catch(_:Exception){}
        val pending=requireNotNull(journal.load(review.owner));assertEquals(1,pending.receipts.size);assertTrue(pending.attempted)
    }
    @Test fun everySupportedTypeUsesSourceNativeConversionAndCorrectRoute() {
        val connection=Connection();val kinds=mutableSetOf<HealthWriteType>()
        for(file in listOf("biometric-write-previews.json","intake-write-previews.json")){
            val fixtures=JSONArray(File("../fixtures/$file").readText())
            for(index in 0 until fixtures.length()){
                connection.source=fixtures.getJSONObject(index)
                val review=connection.preview();kinds.add(review.plan.type)
                assertEquals(parseHealthWritePlan(connection.source,now),review.plan)
                assertEquals(healthExportEndpoint(review.plan.type,"preview"),connection.paths.last())
                assertEquals(review,parseCloudExportPending(cloudExportPendingJson(CloudExportPending(review,100))).review)
            }
        }
        assertEquals(HealthWriteType.entries.toSet(),kinds)
    }
    @Test fun pendingReviewCannotBeReplacedAndJournalRejectsForeignLineage()=runBlocking {
        val connection=Connection();val review=connection.preview();val journal=Journal();val sink=Sink();sink.loseReply=true
        try{connection.transfer.write(connection.session.acquire(),review,journal,sink,sequence());fail()}catch(_:HealthWriteFailure){}
        val saved=requireNotNull(journal.load(review.owner))
        val json=cloudExportPendingJson(saved).put("accountId","other")
        assertThrows(IllegalArgumentException::class.java){parseCloudExportPending(json)}
        connection.source.getJSONArray("records").getJSONObject(0).put("nativeValue",70.0)
        val replacement=connection.preview()
        try{connection.transfer.write(connection.session.acquire(),replacement,journal,sink,sequence());fail()}catch(_:IllegalArgumentException){}
        assertEquals(1,sink.calls);assertEquals(saved,journal.load(review.owner))
    }
    @Test fun missingNativePermissionNeverAttemptsInsertAndRetainsReviewForExplicitResume()=runBlocking {
        val connection=Connection();val review=connection.preview();val journal=Journal();val sink=Sink();sink.granted=emptySet()
        try{connection.transfer.write(connection.session.acquire(),review,journal,sink,sequence());fail()}catch(_:HealthWriteFailure){}
        assertEquals(0,sink.calls);assertFalse(requireNotNull(journal.load(review.owner)).attempted)
        sink.granted=HealthWriteType.WEIGHT.permissions
        assertEquals(1,connection.transfer.write(connection.session.acquire(),review,journal,sink,sequence()))
    }
}
