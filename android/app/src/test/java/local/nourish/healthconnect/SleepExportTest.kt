package local.nourish.healthconnect

import androidx.health.connect.client.records.SleepSessionRecord
import java.io.File
import java.io.StringWriter
import java.nio.file.Files
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import kotlinx.coroutines.Job
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class SleepExportTest {
    private val start = Instant.parse("2026-10-28T03:00:00.123456789Z")
    private val end = start.plusSeconds(8 * 3600)
    private val exportedAt = Instant.parse("2026-10-29T16:00:00Z")
    private val zone = ZoneId.of("America/Chicago")
    private val stages = (0..7).map { SleepSessionRecord.Stage(start.plusSeconds(it * 3600L), start.plusSeconds((it + 1) * 3600L), it) }
    private fun record(stages: List<ExportSleepStage>? = exportSleepStages(start, end, this.stages)) = measurement(
        ExportType.SLEEP, ExportSource("example.synthetic.sleep", "synthetic-sleep-stages", exportedAt, sleepStages = stages),
        start, elapsedValue(start, end, "h"), zone, isoWithOffset(start, ZoneOffset.ofHours(-5)), isoWithOffset(end, ZoneOffset.ofHours(-5)))
    private fun snapshot(records: List<ExportRecord> = listOf(record())) = HealthSnapshot(
        ExportRange.create("2026-10-27", "2026-10-28", zone, exportedAt), records, setOf(ExportType.SLEEP), emptySet())

    @Test fun mapsAllEightDocumentedStagesAndRejectsOtherIntegers() {
        assertEquals(listOf("unknown", "awake", "sleeping", "out-of-bed", "light", "deep", "rem", "awake-in-bed"), (0..7).map { sleepStageType(it).wireName })
        for (value in listOf(-1, 8, Int.MAX_VALUE)) assertThrows(IllegalArgumentException::class.java) { sleepStageType(value) }
    }
    @Test fun stageInstantsKeepNanosecondsWhileSessionKeepsItsSourceOffsetAndElapsedHours() {
        val row = record()
        assertEquals("2026-10-27T22:00:00.123456789-05:00", row.start)
        assertEquals("2026-10-28T06:00:00.123456789-05:00", row.end)
        assertEquals(8.0, row.value, 0.0)
        assertEquals(start, row.source.sleepStages!!.first().start)
        assertEquals(end, row.source.sleepStages!!.last().end)
        assertEquals("2026-10-28T03:00:00.123456789Z", row.source.sleepStages!!.first().start.toString())
    }
    @Test fun gapsAreRetainedAndTouchingStagesAreAllowedButOverlapAndOutOfBoundsFail() {
        val a = ExportSleepStage(start, start.plusNanos(1), ExportSleepStageType.LIGHT)
        val b = ExportSleepStage(start.plusNanos(1), start.plusNanos(2), ExportSleepStageType.DEEP)
        validateSleepStages(listOf(a, b), start, end)
        validateSleepStages(listOf(a, b.copy(start = start.plusSeconds(1), end = end)), start, end)
        for (bad in listOf(listOf(a, b.copy(start = start)), listOf(b, a), listOf(a.copy(start = start.minusNanos(1))), listOf(a.copy(end = end.plusNanos(1))), listOf(a.copy(end = start)))) {
            assertThrows(IllegalArgumentException::class.java) { validateSleepStages(bad, start, end) }
        }
    }
    @Test fun noStagesStayAbsentAndCannotAttachToOtherMeasurements() {
        assertNull(exportSleepStages(start, end, emptyList()))
        assertFalse(exportRecordJson(record(null)).getJSONObject("source").has("sleepStages"))
        assertThrows(IllegalArgumentException::class.java) { record().copy(type = ExportType.WEIGHT) }
        assertThrows(IllegalArgumentException::class.java) { record().copy(start = null) }
        val tooMany = List(MAX_SLEEP_STAGES + 1) { ExportSleepStage(start, end, ExportSleepStageType.UNKNOWN) }
        assertThrows(IllegalArgumentException::class.java) { validateSleepStages(tooMany, start, end) }
    }
    @Test fun actualWriterProducesCrossLanguageSchemaFixtureAndEscapesSourceIdentity() = runBlocking {
        val escaped = measurement(ExportType.WEIGHT, ExportSource("synthetic.\"quoted\nsource", "id\\with\\slashes"), start, 70.5, zone)
        val records = listOf(record(), record(null).copy(id = "sleep:synthetic-no-stages", source = ExportSource("example.synthetic.sleep", "synthetic-no-stages", exportedAt)), escaped)
        val writer = StringWriter();writeExportJson(writer, snapshot(records), exportedAt)
        val text = writer.toString();val parsed = JSONObject(text)
        assertEquals(1, parsed.getInt("version"));assertEquals(3, parsed.getJSONArray("records").length())
        val spans = parsed.getJSONArray("records").getJSONObject(0).getJSONObject("source").getJSONArray("sleepStages")
        assertEquals(8, spans.length());assertEquals(start.toString(), spans.getJSONObject(0).getString("start"))
        assertEquals("awake-in-bed", spans.getJSONObject(7).getString("stage"))
        assertEquals(escaped.source.app, parsed.getJSONArray("records").getJSONObject(2).getJSONObject("source").getString("app"))
        val directory = File(requireNotNull(System.getProperty("nourish.testFixtureDirectory")));check(directory.isDirectory || directory.mkdirs())
        File(directory, "sleep-export.json").writeText(text, Charsets.UTF_8)
    }
    @Test fun actualStagingWritesCompleteFileAndRemovesFailedOrCancelledFiles() {
        val directory = Files.createTempDirectory("nourish-sleep-writer-").toFile()
        try {
            val file = runBlocking { stageExport(directory, snapshot(), exportedAt) }
            assertEquals(8, JSONObject(file.readText()).getJSONArray("records").getJSONObject(0).getJSONObject("source").getJSONArray("sleepStages").length())
            assertTrue(file.delete())
            val oversized = record(null).copy(source = ExportSource("x".repeat(MAX_EXPORT_BYTES.toInt()), "large"))
            assertThrows(ExportByteLimitExceeded::class.java) { runBlocking { stageExport(directory, snapshot(listOf(oversized)), exportedAt) } }
            assertTrue(directory.listFiles()!!.isEmpty())
            assertThrows(java.util.concurrent.CancellationException::class.java) { runBlocking { coroutineContext[Job]!!.cancel();stageExport(directory, snapshot(), exportedAt) } }
            assertTrue(directory.listFiles()!!.isEmpty())
        } finally {
            directory.listFiles()?.forEach { check(it.delete()) };check(directory.delete())
        }
    }
}
