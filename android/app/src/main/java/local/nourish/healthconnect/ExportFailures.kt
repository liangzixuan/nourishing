package local.nourish.healthconnect

import java.io.IOException

enum class ExportFailureCode(val diagnostic:String) {
    TIME_ZONE("Set the device time zone to a named IANA region, such as America/Chicago or UTC."),
    DATE_FORMAT("Use YYYY-MM-DD for both dates."),
    CALENDAR_DATE("Choose real calendar dates."),
    RANGE_LENGTH("Select 1 to 30 days."),
    RECENT_WINDOW("Select dates within the last 30 calendar days, including today."),
    BYTE_LIMIT("The export exceeds $MAX_EXPORT_BYTES bytes. Select fewer dates or data types and read again. No partial export is available to save."),
    SAVE_REMOVED("Save failed. The incomplete destination was removed."),
    SAVE_REMAINS("Save failed. Delete the incomplete destination file before trying again.")
}

/** Only these producing exceptions establish an owned display reason. */
sealed interface OwnedExportFailure { val code:ExportFailureCode }
class ExportRangeFailure(override val code:ExportFailureCode,cause:Throwable?=null):IllegalArgumentException(code.diagnostic,cause),OwnedExportFailure
class ExportSaveFailure(val destinationRemoved:Boolean,cause:Throwable):IOException(if(destinationRemoved)ExportFailureCode.SAVE_REMOVED.diagnostic else ExportFailureCode.SAVE_REMAINS.diagnostic,cause),OwnedExportFailure {
    override val code=if(destinationRemoved)ExportFailureCode.SAVE_REMOVED else ExportFailureCode.SAVE_REMAINS
}
