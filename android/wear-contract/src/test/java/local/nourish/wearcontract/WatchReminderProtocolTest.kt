package local.nourish.wearcontract

import java.io.File
import java.time.Instant
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class WatchReminderProtocolTest {
    private val phoneRevision="00000000-0000-4000-8000-000000000001"
    private val preferenceRevision="00000000-0000-4000-8000-000000000002"
    private fun fixture()=JSONObject(File(requireNotNull(System.getProperty("nourish.wearReminderFixture"))).readText())
    private fun delivery():WatchAlertDelivery {val batch=WatchReminderBatch.parse(fixture());return WatchAlertDelivery(phoneRevision,preferenceRevision,batch.asOf,batch.events.single())}
    @Test fun actualServerClaimProducesBoundedGenericWatchPacket(){
        val batch=WatchReminderBatch.parse(fixture());assertFalse(batch.paused);assertEquals("food",batch.events.single().kind)
        val packet=delivery().bytes();assertEquals(delivery(),WatchAlertDelivery.parse(packet))
        assertFalse(packet.toString(Charsets.UTF_8).contains("owner@example.test"));assertFalse(packet.toString(Charsets.UTF_8).contains("access"))
    }
    @Test fun invalidCategoryClockDuplicatesAndPausedPayloadAreRejected(){
        fun reject(change:(JSONObject)->Unit){val value=fixture();change(value);assertThrows(Exception::class.java){WatchReminderBatch.parse(value)}}
        reject{it.put("paused",true)};reject{it.getJSONArray("events").getJSONObject(0).put("kind","weight")}
        reject{it.put("asOf","2026-11-04T11:59:59Z")};reject{it.getJSONArray("events").getJSONObject(0).put("expiresAt","2026-11-04T13:00:00Z")}
        reject{val rows=it.getJSONArray("events");rows.put(rows.getJSONObject(0))}
        reject{it.getJSONArray("events").getJSONObject(0).put("id","not-an-id")}
        assertThrows(IllegalArgumentException::class.java){WatchAlertDelivery.parse(ByteArray(MAX_WATCH_BYTES+1))}
    }
    @Test fun preferencesAndReceiptsValidateVersionsAndAllowedTypes(){
        val state=WatchAlertState(phoneRevision,preferenceRevision,setOf("food","fasting"));assertEquals(state,WatchAlertState.parse(state.bytes()))
        assertEquals(WatchAlertState.unavailable(),WatchAlertState.parse(WatchAlertState.unavailable().bytes()))
        assertEquals(phoneRevision,parseAlertStateRequest(alertStateRequest(phoneRevision)))
        assertThrows(Exception::class.java){WatchAlertState.parse(JSONObject().put("version",1).put("available",true).put("phoneRevision",phoneRevision).put("preferenceRevision",preferenceRevision).put("kinds",JSONArray(listOf("food","food"))).toString().toByteArray())}
        val receipt=WatchAlertReceipt(delivery().event.id,"accepted","posted");assertEquals(receipt,WatchAlertReceipt.parse(receipt.bytes()))
        assertThrows(IllegalArgumentException::class.java){WatchAlertReceipt(delivery().event.id,"displayed","posted").bytes()}
    }
    @Test fun receiverPolicyBindsPhoneConsentPermissionAndTime(){
        val packet=delivery();val policy=WatchAlertPolicy("selected-phone",phoneRevision,preferenceRevision,setOf("food"),packet.event.dueAt.minusSeconds(60))
        assertNull(policy.rejection("selected-phone",packet,packet.asOf,true))
        assertEquals("wrong-phone",policy.rejection("other-phone",packet,packet.asOf,true))
        assertEquals("changed",policy.copy(preferenceRevision=phoneRevision).rejection("selected-phone",packet,packet.asOf,true))
        assertEquals("disabled",policy.copy(kinds=emptySet()).rejection("selected-phone",packet,packet.asOf,true))
        assertEquals("before-opt-in",policy.copy(enabledAt=packet.asOf).rejection("selected-phone",packet,packet.asOf,true))
        assertEquals("permission",policy.rejection("selected-phone",packet,packet.asOf,false))
        assertEquals("expired",policy.rejection("selected-phone",packet,packet.event.expiresAt,true))
    }
}
