package local.nourish.healthconnect

import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import org.junit.Assert.*
import org.junit.Test

class ExportModelTest {
    private val zone = ZoneId.of("America/Chicago")
    private val now = Instant.parse("2026-10-28T16:00:00Z")
    private val source = ExportSource("example.synthetic", "record-1", now)

    @Test fun recentInclusiveRangeCapsAtTodayAndThirtyDays() {
        val range = ExportRange.create("2026-09-29", "2026-10-28", zone, now)
        assertEquals(30, range.dates().size)
        assertEquals(now, range.endExclusive)
        assertThrows(IllegalArgumentException::class.java) { ExportRange.create("2026-09-28", "2026-10-28", zone, now) }
        assertThrows(IllegalArgumentException::class.java) { ExportRange.create("2026-10-29", "2026-10-29", zone, now) }
        assertThrows(IllegalArgumentException::class.java) { ExportRange.create("2026-02-30", "2026-03-01", zone, now) }
        assertThrows(IllegalArgumentException::class.java) { ExportRange.create("2026-10-27", "2026-10-28", ZoneOffset.ofHours(2), now) }
    }
    @Test fun timeFilterIsStartInclusiveAndEndExclusive() {
        val range = ExportRange.create("2026-10-27", "2026-10-27", zone, now)
        assertTrue(range.contains(range.start))
        assertFalse(range.contains(range.start.minusNanos(1)))
        assertFalse(range.contains(range.endExclusive))
    }
    @Test fun localDayUsesZoneRulesAcrossDst() {
        val date = LocalDate.parse("2026-03-08")
        val row = dailyActivityMeasurement(DailyActivityMetric.STEPS, dailyActivityWindow(date, zone, Instant.parse("2026-03-10T00:00:00Z"))!!, 100.0)!!
        assertEquals(23, Duration.between(java.time.OffsetDateTime.parse(row.start).toInstant(), java.time.OffsetDateTime.parse(row.end).toInstant()).toHours())
        assertEquals("steps:2026-03-08:America/Chicago", row.id)
        assertTrue(row.start!!.endsWith("-06:00"))
        assertTrue(row.end!!.endsWith("-05:00"))
        assertEquals(ExportAggregation(DailyActivityMetric.STEPS, date), row.source.aggregation)
    }
    @Test fun unknownStepAggregateIsAbsentAndMeasuredZeroStaysZero() {
        val day = LocalDate.parse("2026-10-27")
        val window = dailyActivityWindow(day, zone, now)!!
        for (metric in DailyActivityMetric.entries) {
            assertNull(dailyActivityMeasurement(metric, window, null))
            assertEquals(0.0, dailyActivityMeasurement(metric, window, 0.0)!!.value, 0.0)
        }
    }
    @Test fun activeCaloriesPreserveFractionAndExplicitAggregateIdentity() {
        val day = LocalDate.parse("2026-10-27")
        val row = dailyActivityMeasurement(DailyActivityMetric.ACTIVE_CALORIES, dailyActivityWindow(day, zone, now)!!, 321.125)!!
        assertEquals("active-energy-daily:2026-10-27:America/Chicago", row.id)
        assertEquals(row.id, row.source.recordId)
        assertEquals("Health Connect aggregate", row.source.app)
        assertNull(row.source.lastModifiedAt)
        assertEquals("daily-total", row.source.aggregation!!.kind)
        assertEquals("active-calories", row.source.aggregation!!.metric.wireName)
        assertEquals(day, row.source.aggregation!!.date)
        assertEquals(ExportType.ACTIVE_ENERGY, row.type)
        assertEquals("kcal", row.type.unit)
        assertEquals("00:00", row.time)
        assertEquals(321.125, row.value, 0.0)
    }
    @Test fun fallBackDayHasTwentyFiveHoursAndTrueOffsetBoundaries() {
        val day = LocalDate.parse("2026-11-01")
        val window = dailyActivityWindow(day, zone, Instant.parse("2026-11-03T00:00:00Z"))!!
        val row = dailyActivityMeasurement(DailyActivityMetric.ACTIVE_CALORIES, window, 800.0)!!
        assertEquals(25, Duration.between(window.start, window.end).toHours())
        assertEquals("2026-11-01T00:00:00-05:00", row.start)
        assertEquals("2026-11-02T00:00:00-06:00", row.end)
    }
    @Test fun currentDayEndsAtCapturedReadClockAndRepeatedReadsKeepIdentity() {
        val day = LocalDate.parse("2026-10-28")
        val firstWindow = dailyActivityWindow(day, zone, now)!!
        val laterWindow = dailyActivityWindow(day, zone, now.plusSeconds(60))!!
        val first = dailyActivityMeasurement(DailyActivityMetric.ACTIVE_CALORIES, firstWindow, 99.25)!!
        val later = dailyActivityMeasurement(DailyActivityMetric.ACTIVE_CALORIES, laterWindow, 100.5)!!
        assertEquals(now, firstWindow.end)
        assertEquals("2026-10-28T11:00:00-05:00", first.end)
        assertEquals(first.id, later.id)
        val collector = RecordCollector()
        collector.add(first)
        collector.add(later)
        assertEquals(listOf(later), collector.records())
        assertNotEquals(first.id, dailyActivityMeasurement(DailyActivityMetric.ACTIVE_CALORIES,
            dailyActivityWindow(day, ZoneId.of("America/New_York"), now)!!, 99.25)!!.id)
    }
    @Test fun emptyAndSkippedCivilDaysHaveNoAggregateWindow() {
        val day = LocalDate.parse("2026-10-28")
        assertNull(dailyActivityWindow(day, zone, day.atStartOfDay(zone).toInstant()))
        assertNull(dailyActivityWindow(day.plusDays(1), zone, now))
        assertNull(dailyActivityWindow(LocalDate.parse("2011-12-30"), ZoneId.of("Pacific/Apia"), Instant.parse("2012-01-02T00:00:00Z")))
        val midnightGap = dailyActivityWindow(LocalDate.parse("2018-11-04"), ZoneId.of("America/Sao_Paulo"), Instant.parse("2018-11-06T00:00:00Z"))!!
        assertEquals("2018-11-04T01:00-02:00[America/Sao_Paulo]", midnightGap.start.atZone(midnightGap.zone).toString())
    }
    @Test fun invalidActivityTotalsFailAndRawRecordsRemainSeparate() {
        val window = dailyActivityWindow(LocalDate.parse("2026-10-27"), zone, now)!!
        for (metric in DailyActivityMetric.entries) for (value in listOf(-1.0, Double.NaN, Double.POSITIVE_INFINITY)) {
            assertThrows(IllegalArgumentException::class.java) { dailyActivityMeasurement(metric, window, value) }
        }
        assertThrows(IllegalArgumentException::class.java) { dailyActivityMeasurement(DailyActivityMetric.STEPS, window, 0.5) }
        val raw = measurement(ExportType.ACTIVE_ENERGY, source, window.start, 10.0, zone)
        val aggregate = dailyActivityMeasurement(DailyActivityMetric.ACTIVE_CALORIES, window, 10.0)!!
        assertNull(raw.source.aggregation)
        assertNotEquals(raw.id, aggregate.id)
    }
    @Test fun stableRawIdentityAndHeartSampleIdentityRetainSubminutePrecision() {
        val first = Instant.parse("2026-10-27T15:01:02.123Z")
        val second = first.plusSeconds(1)
        val a = measurement(ExportType.HEART_RATE, source, first, 70.0, zone, sampleId = first.toString())
        val b = measurement(ExportType.HEART_RATE, source, second, 71.0, zone, sampleId = second.toString())
        assertEquals("heart-rate:record-1:2026-10-27T15:01:02.123Z", a.id)
        assertNotEquals(a.id, b.id)
        assertEquals(a.time, b.time)
        assertEquals(first.toString(), a.start)
        assertEquals("weight:record-1", measurement(ExportType.WEIGHT, source, first, 70.0, zone).id)
    }
    @Test fun sourceOffsetAndFractionalDurationArePreserved() {
        val first = Instant.parse("2026-10-27T15:00:00Z")
        assertEquals("2026-10-27T10:00:00-05:00", isoWithOffset(first, ZoneOffset.ofHours(-5)))
        assertEquals(first.toString(), isoWithOffset(first, null))
        assertEquals(0.5, elapsedValue(first, first.plusSeconds(30), "min"), 0.0)
        assertEquals(7.5, elapsedValue(first, first.plusSeconds(27000), "h"), 0.0)
    }
    @Test fun invalidMeasurementsAndIntervalsFailBeforeExport() {
        assertThrows(IllegalArgumentException::class.java) { measurement(ExportType.WEIGHT, source, now, Double.NaN, zone) }
        assertThrows(IllegalArgumentException::class.java) { measurement(ExportType.WATER, source, now, -1.0, zone) }
        assertThrows(IllegalArgumentException::class.java) { elapsedValue(now, now, "min") }
        assertThrows(IllegalArgumentException::class.java) { ExportSource("", "id") }
    }
    @Test fun collectorDeduplicatesIdentitiesAndKeepsLatestReadValue() {
        val collector = RecordCollector()
        collector.add(measurement(ExportType.WEIGHT, source, now, 70.0, zone))
        collector.add(measurement(ExportType.WEIGHT, source, now, 71.0, zone))
        assertEquals(1, collector.records().size)
        assertEquals(71.0, collector.records().single().value, 0.0)
    }
    @Test fun rawRecordLimitFailsInsteadOfProducingAnUndisclosedPartialRead() {
        val collector = RecordCollector()
        repeat(MAX_EXPORT_RECORDS) { collector.examined() }
        assertThrows(IllegalArgumentException::class.java) { collector.examined() }
    }
}
