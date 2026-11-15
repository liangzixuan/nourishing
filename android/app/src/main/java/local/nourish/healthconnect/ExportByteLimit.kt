package local.nourish.healthconnect

import java.io.IOException
import java.io.OutputStream

const val MAX_EXPORT_BYTES = 20_000_000L

class ExportByteLimitExceeded : IOException(ExportFailureCode.BYTE_LIMIT.diagnostic),OwnedExportFailure { override val code=ExportFailureCode.BYTE_LIMIT }

/** Count encoded bytes and reject a write before it can exceed the file limit. */
internal class BoundedExportStream(private val target: OutputStream, private val limit: Long = MAX_EXPORT_BYTES) : OutputStream() {
    private var written = 0L
    init { require(limit >= 0) }
    private fun checkCapacity(length: Int) {
        if (length.toLong() > limit - written) throw ExportByteLimitExceeded()
    }
    override fun write(value: Int) {
        checkCapacity(1)
        target.write(value)
        written++
    }
    override fun write(buffer: ByteArray, offset: Int, length: Int) {
        if (offset < 0 || length < 0 || offset > buffer.size - length) throw IndexOutOfBoundsException()
        checkCapacity(length)
        target.write(buffer, offset, length)
        written += length
    }
    override fun flush() = target.flush()
    override fun close() = target.close()
}
