package local.nourish.healthconnect

import androidx.health.connect.client.records.HydrationRecord
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.metadata.Metadata
import java.io.File
import java.time.Instant
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class CorrectedIntakePreviewTest {
    private fun fixture()=JSONObject(File(requireNotNull(System.getProperty("nourish.correctedIntakeFixture"))).readText())
    private fun packet(name:String="nutrition")=fixture().getJSONObject("cases").getJSONObject(name)
    private val now=Instant.parse("2026-11-06T12:00:00Z")
    private val origin=WorkspaceOrigin.parse("https://synthetic.test.ts.net:8443")
    private val identity=WorkspaceIdentity("synthetic@example.invalid")
    private fun parse(value:JSONObject)=parseCorrectedIntakePreview(value,now)
    private fun rejects(value:JSONObject){assertThrows(Exception::class.java){parse(value)}}
    @Test fun actualServerNutritionPlanPreservesNativeCreditZeroTraceUnknownAndGroupMembership(){
        val p=parse(packet());assertTrue(p.activationRequired);assertEquals(2,p.rows.size);assertEquals(1,p.retire.size)
        val row=p.rows.single { it.id=="anchor" };val native=p.selection.type.native(row,Metadata.manualEntry(clientRecordId=row.clientId,clientRecordVersion=2)) as NutritionRecord
        assertEquals(150.0,native.energy!!.inKilocalories,0.0);assertEquals(0.0,native.protein!!.inGrams,0.0);assertEquals(7.5e-12,native.vitaminB12!!.inGrams,1e-26)
        assertNull(native.vitaminD);assertNull(native.vitaminA);assertNull(native.folate);assertNull(native.vitaminE)
        assertTrue(native.name!!.endsWith("Exact synthetic source credit\nSecond line."));assertEquals(60L,native.endTime.epochSecond-native.startTime.epochSecond)
        assertEquals(setOf("anchor","correction"),p.groups.single().entryIds);assertEquals("correction",p.retire.single().id)
        assertEquals(setOf(p.retire.single().clientId),p.nativePlan(origin,identity)!!.retire)
    }
    @Test fun actualServerWaterPlanKeepsZeroAndLoggedWaterSeparate(){
        val p=parse(packet("water"));assertEquals(3,p.rows.size)
        val records=p.rows.associate { row->row.id to (p.selection.type.native(row,Metadata.manualEntry(clientRecordId=row.clientId,clientRecordVersion=2)) as HydrationRecord) }
        assertEquals(0.0,records.getValue("anchor").volume.inLiters,0.0);assertEquals(.25,records.getValue("drink").volume.inLiters,0.0)
        assertEquals(3,records.values.map { it.metadata.clientRecordId }.toSet().size)
    }
    @Test fun actualServerRetirementOnlyAndNoActionPlansStayDistinct(){
        val p=parse(packet("retirementOnly"));assertTrue(p.rows.isEmpty());assertEquals(setOf("anchor","correction"),p.retire.map { it.id }.toSet());assertNotNull(p.nativePlan(origin,identity))
        val empty=parse(packet("empty"));assertTrue(empty.rows.isEmpty());assertTrue(empty.retire.isEmpty());assertNull(empty.nativePlan(origin,identity))
    }
    @Test fun activationChangesTokenWithoutChangingReviewedActionsAndAccountScopeIsExact(){
        val before=parse(packet());val after=parse(packet("committed"));assertNotEquals(before.reviewToken,after.reviewToken);assertFalse(after.activationRequired);assertTrue(before.sameReviewedActions(after))
        assertNotEquals(after.nativePlan(origin,identity)!!.scope,after.nativePlan(origin,WorkspaceIdentity("other@example.invalid"))!!.scope)
        val changed=packet("committed");changed.getJSONArray("records").getJSONObject(0).getJSONObject("nutrients").put("energy",123.0)
        assertFalse(before.sameReviewedActions(parse(changed)))
    }
    @Test fun oneSdkRejectedReplacementRejectsEveryRemovalRatherThanSkippingIt(){
        for(amount in listOf(-1.0,101.0)){
            val json=packet();json.getJSONArray("records").getJSONObject(1).getJSONObject("nutrients").put("sodium",amount);rejects(json)
        }
        val water=packet("water");water.getJSONArray("records").getJSONObject(1).put("milliliters",100001);rejects(water)
    }
    @Test fun futureIntervalAndAmbiguousOrMissingClockRejectTheEntireCorrection(){
        assertThrows(IllegalArgumentException::class.java){parseCorrectedIntakePreview(packet(),Instant.parse("2026-11-04T12:00:30Z"))}
        for((day,time) in listOf("2026-11-01" to "01:30","2026-03-08" to "02:30")){
            val value=packet();value.getJSONObject("selection").put("timeZone","America/Chicago");value.getJSONArray("policies").getJSONObject(0).put("timeZone","America/Chicago")
            value.getJSONArray("records").getJSONObject(0).put("date",day).put("time",time);rejects(value)
        }
    }
    @Test fun dateMovesAreDisclosedAndOutsideRecordsCannotLoseTheirRelatedHistory(){
        val p=parse(packet("moved"));assertEquals(2,p.related.size);assertTrue(p.groups.single().description.contains("2026-11-05"));assertEquals(2,p.selection.correctionDates.size)
        val missing=packet("moved");missing.put("related",JSONArray());rejects(missing)
    }
    @Test fun incompleteRemovalSetsOverlappingActionsAndUnknownHistoryCannotAuthorizeDeletion(){
        val missing=packet();missing.put("retire",JSONArray());rejects(missing)
        val overlap=packet();overlap.getJSONArray("retire").getJSONObject(0).put("clientRecordId",overlap.getJSONArray("records").getJSONObject(0).getString("clientRecordId"));rejects(overlap)
        val unknown=packet();unknown.getJSONArray("retire").getJSONObject(0).put("id","unknown");rejects(unknown)
        val duplicate=packet();duplicate.getJSONArray("retire").put(duplicate.getJSONArray("retire").getJSONObject(0));rejects(duplicate)
    }
    @Test fun malformedSelectionsFlagsVersionsAndUnsupportedRecordFieldsFailStrictly(){
        for(change in listOf<(JSONObject)->Unit>(
            {it.put("version",2)}, {it.put("nativeReviewRequired",false)}, {it.put("activationRequired","true")}, {it.put("extra",true)},
            {it.getJSONObject("selection").put("useDrafts","true")}, {it.getJSONObject("selection").put("extra",true)},
            {it.getJSONObject("selection").getJSONArray("correctionDates").put("2026-11-04")},
            {it.getJSONArray("records").getJSONObject(0).put("extra",true)},
            {it.getJSONArray("records").getJSONObject(0).getJSONObject("nutrients").put("unsupported",1)}
        )){val value=packet();change(value);rejects(value)}
    }
    @Test fun exactCreditsAndTypedDetailsAreRequiredBeforeSdkConstruction(){
        val water=packet("water");water.getJSONArray("records").getJSONObject(0).getJSONArray("attributions").put("Required credit");rejects(water)
        val duplicate=packet();val credits=duplicate.getJSONArray("records").getJSONObject(0).getJSONArray("attributions");credits.put(credits.get(0));rejects(duplicate)
        val malformed=packet();malformed.getJSONArray("records").getJSONObject(0).getJSONArray("details").getJSONObject(0).put("value","150");rejects(malformed)
    }
    @Test fun parsedPreviewDoesNotRetainMutableTransportJson(){
        val input=packet();val p=parse(input);input.getJSONArray("records").getJSONObject(0).getJSONObject("nutrients").put("energy",999);input.getJSONObject("selection").put("from","2000-01-01")
        assertTrue(p.rows.none { it.nutrients["energy"]==999.0 });assertEquals("2026-11-04",p.selection.from)
    }
    @Test fun oversizedReviewIsRejectedAtTheSameLimitAsTheTransport(){
        val input=packet();input.getJSONArray("records").getJSONObject(0).put("name","x".repeat(MAX_TRANSFER_RESPONSE_BYTES));rejects(input)
    }
}
