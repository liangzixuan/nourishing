package local.nourish.healthconnect

import java.io.IOException
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ExportFailureTest {
    private val now=Instant.parse("2026-11-07T12:00:00Z")
    private val zone=ZoneId.of("America/Chicago")
    @Test fun exportLimitStatusRetainsIdentityInsteadOfEnglishDisplayText(){
        val status=SyncStatus.Failed(now,captureSyncDiagnostic(ExportByteLimitExceeded()))
        val encoded=encodeSyncStatus(status);val problem=JSONObject(encoded).getJSONObject("problem")
        assertEquals("export",problem.getString("kind"));assertEquals("BYTE_LIMIT",problem.getString("code"))
        assertFalse(encoded.contains("Select fewer"));assertEquals(status,decodeSyncStatus(encoded))
    }
    @Test fun actualDateBoundariesRetainDistinctReasons(){
        fun check(code:ExportFailureCode,from:String,to:String,selectedZone:ZoneId=zone){
            val failure=assertThrows(ExportRangeFailure::class.java){ExportRange.create(from,to,selectedZone,now)}
            assertEquals(code,failure.code)
        }
        check(ExportFailureCode.TIME_ZONE,"2026-11-07","2026-11-07",ZoneOffset.ofHours(-6))
        check(ExportFailureCode.DATE_FORMAT,"11/07/2026","2026-11-07")
        check(ExportFailureCode.DATE_FORMAT,"2026-11-07","2026-1-1")
        check(ExportFailureCode.CALENDAR_DATE,"2026-02-30","2026-11-07")
        check(ExportFailureCode.CALENDAR_DATE,"2026-11-01","2026-11-31")
        check(ExportFailureCode.RANGE_LENGTH,"2026-11-07","2026-11-06")
        check(ExportFailureCode.RANGE_LENGTH,"2026-10-08","2026-11-07")
        check(ExportFailureCode.RECENT_WINDOW,"2026-10-08","2026-10-08")
        check(ExportFailureCode.RECENT_WINDOW,"2026-11-08","2026-11-08")
        val range=ExportRange.create("2026-10-09","2026-11-07",zone,now)
        assertEquals(30,range.dates().size);assertEquals(now,range.endExclusive)
    }
    @Test fun ownedFailuresRoundTripThroughBothSavedStatusOwners(){
        val failures=listOf(ExportRangeFailure(ExportFailureCode.TIME_ZONE),ExportRangeFailure(ExportFailureCode.DATE_FORMAT),ExportRangeFailure(ExportFailureCode.CALENDAR_DATE),ExportRangeFailure(ExportFailureCode.RANGE_LENGTH),ExportRangeFailure(ExportFailureCode.RECENT_WINDOW),ExportByteLimitExceeded(),ExportSaveFailure(true,IOException("disk")),ExportSaveFailure(false,IOException("disk")))
        assertEquals(ExportFailureCode.entries.toSet(),failures.map{(it as OwnedExportFailure).code}.toSet())
        for(failure in failures){
            val problem=captureSyncDiagnostic(failure)
            assertEquals(SyncDiagnostic.Export((failure as OwnedExportFailure).code),problem)
            val sync=SyncStatus.Failed(now,problem)
            val hourly=HourlyExportStatus.Failed(now,2,1,problem)
            assertEquals(sync,decodeSyncStatus(encodeSyncStatus(sync)))
            assertEquals(hourly,decodeHourlyExportStatus(encodeHourlyExportStatus(hourly)))
        }
    }
    @Test fun unknownAndMalformedSavedReasonsRemainLiteral(){
        val sync=encodeSyncStatus(SyncStatus.Failed(now,SyncDiagnostic.Export(ExportFailureCode.BYTE_LIMIT)))
        val hourly=encodeHourlyExportStatus(HourlyExportStatus.Failed(now,1,0,SyncDiagnostic.Export(ExportFailureCode.BYTE_LIMIT)))
        for(value in listOf(JSONObject.NULL,7,"NEW_CODE")){
            val a=JSONObject(sync).apply{getJSONObject("problem").put("code",value)}.toString()
            val b=JSONObject(hourly).apply{getJSONObject("problem").put("code",value)}.toString()
            assertEquals(SyncStatus.Literal(a),decodeSyncStatus(a))
            assertEquals(HourlyExportStatus.Literal(b),decodeHourlyExportStatus(b))
        }
        val extra=JSONObject(sync).apply{getJSONObject("problem").put("extra",true)}.toString()
        assertEquals(SyncStatus.Literal(extra),decodeSyncStatus(extra))
    }
    @Test fun matchingExternalWordsDoNotEstablishOwnership(){
        for(code in ExportFailureCode.entries)assertEquals(SyncDiagnostic.Literal(code.diagnostic),captureSyncDiagnostic(IOException(code.diagnostic)))
    }
    @Test fun saveFailurePreservesCleanupOutcomeAndCause(){
        val cause=IOException("source detail")
        for(removed in listOf(true,false)){
            val failure=ExportSaveFailure(removed,cause)
            assertEquals(removed,failure.destinationRemoved);assertSame(cause,failure.cause)
            assertEquals(if(removed)ExportFailureCode.SAVE_REMOVED else ExportFailureCode.SAVE_REMAINS,failure.code)
        }
    }
}
