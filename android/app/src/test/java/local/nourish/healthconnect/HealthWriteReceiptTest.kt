package local.nourish.healthconnect

import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.records.metadata.Metadata
import java.io.File
import java.time.Instant
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class HealthWriteReceiptTest {
    private val now=Instant.parse("2026-11-03T12:00:00Z")
    private fun plans():List<HealthWritePlan> = listOf("nourish.biometricWriteFixture","nourish.intakeWriteFixture").flatMap{key->
        val rows=JSONArray(File(requireNotNull(System.getProperty(key))).readText());(0 until rows.length()).map{parseHealthWritePlan(rows.getJSONObject(it),now)}}
    private fun metadata(id:String,client:String,version:Long)=Metadata::class.java.constructors.first{it.parameterCount==7}.newInstance(Metadata.RECORDING_METHOD_MANUAL_ENTRY,id,DataOrigin("local.nourish.healthconnect"),now,client,version,null) as Metadata
    @Test fun allFourteenTypesRetainExactSdkPayloadAfterPersistentJsonRoundTrip(){
        val types=mutableSetOf<HealthWriteType>()
        for(plan in plans()){
            val row=plan.rows.first();val receipt=HealthWriteReceipt("native-"+plan.type.wire,123L,row)
            val encoded=healthReceiptJson(plan.type,mapOf(row.clientId to receipt)).toString()
            val actual=parseHealthReceipts(plan.type,JSONObject(encoded)).getValue(row.clientId)
            assertEquals(healthPayloadDigest(plan.type,row),healthPayloadDigest(plan.type,actual.row))
            assertTrue(actual.matches(plan.type,plan.type.native(row,metadata(receipt.nativeId,row.clientId,123L))))
            assertFalse(actual.matches(plan.type,plan.type.native(row,metadata(receipt.nativeId,row.clientId,124L))))
            assertFalse(actual.matches(plan.type,plan.type.native(row,metadata("different-native-id",row.clientId,123L))))
            assertFalse(actual.matches(plan.type,plan.type.native(row.copy(time=row.time.minusSeconds(60)),metadata(receipt.nativeId,row.clientId,123L))))
            types.add(plan.type)
        }
        assertEquals(HealthWriteType.entries.toSet(),types)
    }
    @Test fun oldCorruptDuplicateOrWrongTypeReceiptsNeverBecomeEmptyHistory(){
        val plan=plans().first();val row=plan.rows.first();fun encoded()=healthReceiptJson(plan.type,mapOf(row.clientId to HealthWriteReceipt("native",123,row)))
        assertThrows(Exception::class.java){parseHealthReceipts(plan.type,JSONObject().put(row.clientId,"old-fingerprint"))}
        for(field in listOf("nativeId","version","clientId","value","unit","time","offset","nutrients")){
            val json=encoded();json.getJSONArray("receipts").getJSONObject(0).put(field,JSONObject.NULL)
            assertThrows("Field: "+field,Exception::class.java){parseHealthReceipts(plan.type,json)}
        }
        val duplicate=encoded();duplicate.getJSONArray("receipts").put(duplicate.getJSONArray("receipts").getJSONObject(0))
        assertThrows(Exception::class.java){parseHealthReceipts(plan.type,duplicate)}
        assertThrows(Exception::class.java){parseHealthReceipts(HealthWriteType.NUTRITION,encoded())}
    }
}
