package local.nourish.healthconnect

import java.time.Instant
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class HourlyExportStatusTest {
    private val at=Instant.parse("2026-11-07T19:00:00Z")
    @Test fun savedResultsRoundTripWithIndependentCountsAndDiagnostics() {
        val values=listOf(HourlyExportStatus.Enabled,HourlyExportStatus.Completed(at,2,7,3),HourlyExportStatus.Interrupted(at,4,1),HourlyExportStatus.Interrupted(at,0,0),
            HourlyExportStatus.Failed(at,5,2,SyncDiagnostic.Owned(SyncError.EXPORT_PERMISSION)),
            HourlyExportStatus.Failed(at,1,0,SyncDiagnostic.Workspace(null,"Literal source response",true,503)),
            HourlyExportStatus.Failed(at,0,0,SyncDiagnostic.Unspecified),HourlyExportStatus.Literal("Historic status text"))
        for(value in values)assertEquals(value,decodeHourlyExportStatus(encodeHourlyExportStatus(value)))
        assertFalse(encodeHourlyExportStatus(HourlyExportStatus.Completed(at,2,7,3)).contains("written and checked"))
    }
    @Test fun unreadableOrFutureStatusRemainsLiteralEvidence() {
        val interrupted=JSONObject(encodeHourlyExportStatus(HourlyExportStatus.Interrupted(at,3,1)))
        val values=listOf("Historic English message", "{}", "null", "[]", "{\"version\":2,\"kind\":\"enabled\"}",
            JSONObject(interrupted.toString()).put("attempted","3").toString(),JSONObject(interrupted.toString()).put("confirmed",4).toString(),
            JSONObject(interrupted.toString()).put("at","bad time").toString(),JSONObject(interrupted.toString()).put("extra",true).toString(),
            JSONObject(encodeHourlyExportStatus(HourlyExportStatus.Completed(at,1,2,3))).put("skipped",-1).toString(),
            JSONObject(encodeHourlyExportStatus(HourlyExportStatus.Failed(at,1,0,SyncDiagnostic.Unspecified))).put("problem",JSONObject().put("kind","new-kind")).toString())
        for(raw in values)assertEquals(raw,HourlyExportStatus.Literal(raw),decodeHourlyExportStatus(raw))
    }
    @Test fun invalidProgressCannotBeSerializedAsAResult() {
        for(value in listOf(HourlyExportStatus.Completed(at,-1,0,0),HourlyExportStatus.Interrupted(at,1,2),HourlyExportStatus.Failed(at,-1,0,SyncDiagnostic.Unspecified))) {
            try { encodeHourlyExportStatus(value);fail("Invalid counts accepted") } catch(_: IllegalArgumentException) { }
        }
    }
    @Test fun configurationOwnsTheParsedMappingAndPreservesTheOriginalSelection() {
        val raw=JSONObject().put("kind","pressure").put("from","2026-11-06").put("to","2026-11-07").put("timeZone","America/Chicago")
            .put("metric",JSONObject().put("type","My systolic α").put("unit","mmHg"))
            .put("secondaryMetric",JSONObject().put("type","My diastolic β").put("unit","mmHg")).toString()
        val config=HourlyExportConfig(WorkspaceOrigin.parse("https://synthetic.test.ts.net:8443"),"synthetic@example.invalid",raw,2,"revision")
        assertEquals(raw,config.selection);assertEquals("America/Chicago",config.timeZone)
        assertEquals(HourlyExportMapping.Pressure(HourlyExportMetric("My systolic α","mmHg"),HourlyExportMetric("My diastolic β","mmHg")),config.mapping)
        assertEquals("2026-11-06",config.selectionAt(at).getString("from"));assertEquals("2026-11-07",config.selectionAt(at).getString("to"))
        assertEquals(raw,config.selection)
    }
}
