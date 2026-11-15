package local.nourish.healthconnect

import java.io.ByteArrayOutputStream
import java.io.OutputStreamWriter
import org.junit.Assert.*
import org.junit.Test

class ExportByteLimitTest {
    @Test fun acceptsExactLimitAndRejectsBeforeWritingPastIt() {
        val target = ByteArrayOutputStream()
        val stream = BoundedExportStream(target, 4)
        stream.write(byteArrayOf(1, 2, 3))
        stream.write(4)
        assertThrows(ExportByteLimitExceeded::class.java) { stream.write(5) }
        assertArrayEquals(byteArrayOf(1, 2, 3, 4), target.toByteArray())
    }
    @Test fun rejectedArrayWriteDoesNotWriteAPartialChunk() {
        val target = ByteArrayOutputStream()
        val stream = BoundedExportStream(target, 3)
        stream.write(1)
        assertThrows(ExportByteLimitExceeded::class.java) { stream.write(byteArrayOf(2, 3, 4)) }
        assertArrayEquals(byteArrayOf(1), target.toByteArray())
    }
    @Test fun limitCountsEncodedUtf8BytesInsteadOfCharacters() {
        val target = ByteArrayOutputStream()
        val writer = OutputStreamWriter(BoundedExportStream(target, 3), Charsets.UTF_8)
        writer.write("é")
        writer.flush()
        assertEquals(2, target.size())
        writer.write("é")
        assertThrows(ExportByteLimitExceeded::class.java) { writer.flush() }
        assertEquals(2, target.size())
    }
}
