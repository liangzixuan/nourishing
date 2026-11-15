package local.nourish.healthconnect

import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset

sealed interface ExportClockResult
data class ExportClock(val start:Instant,val offset:ZoneOffset,val end:Instant,val endOffset:ZoneOffset):ExportClockResult
data class ExcludedExportClock(val reason:String):ExportClockResult

/** Resolve only the recorded minute; interval exports disclose its precision. */
fun resolveExportClock(day:String,clock:String,zone:ZoneId,now:Instant,minuteInterval:Boolean=false):ExportClockResult {
    require(Regex("\\d{4}-\\d{2}-\\d{2}").matches(day)&&Regex("(?:[01]\\d|2[0-3]):[0-5]\\d").matches(clock))
    val local=LocalDateTime.parse("${day}T$clock");val offsets=zone.rules.getValidOffsets(local)
    if(offsets.size!=1)return ExcludedExportClock("$day $clock: ${if(offsets.isEmpty())"Time does not exist" else "Time is ambiguous"} in ${zone.id}; no timestamp was guessed.")
    val start=local.toInstant(offsets.single());val end=if(minuteInterval)start.plusSeconds(60) else start
    if(end>now)return ExcludedExportClock("$day $clock: Future measurement time or interval end in ${zone.id}.")
    return ExportClock(start,offsets.single(),end,zone.rules.getOffset(end))
}
