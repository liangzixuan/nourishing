package local.nourish.healthconnect

import java.io.ByteArrayInputStream
import java.nio.file.Files
import org.junit.Assert.*
import org.junit.Test

class WebDownloadStoreTest {
    @Test fun exactBoundsOverflowAndCancellationKeepNoPartialFiles() {
        val dir=Files.createTempDirectory("nourishing-bounds-test").toFile()
        try {
            val store=WebDownloadStore(dir)
            val exact=store.stage(ByteArrayInputStream(ByteArray(8)),8)
            assertEquals(8L,exact.length());assertTrue(store.release(exact))
            assertThrows(java.io.IOException::class.java){store.stage(ByteArrayInputStream(ByteArray(9)),8)}
            assertTrue(dir.listFiles()!!.isEmpty())
            var calls=0
            assertThrows(kotlinx.coroutines.CancellationException::class.java){store.stage(ByteArrayInputStream(ByteArray(64*1024))){if(++calls==2)throw kotlinx.coroutines.CancellationException("fixture")}}
            assertTrue(dir.listFiles()!!.isEmpty())
            val png=WebDownloadStore(dir,WebDownloadStore.FileType.PNG)
            assertThrows(IllegalArgumentException::class.java){png.stage(ByteArrayInputStream(byteArrayOf(1)),WebExportLimits.FILE_BYTES)}
        } finally {dir.listFiles()?.forEach{it.delete()};dir.delete()}
    }

    @Test fun completeBackupLargerThanOldMemoryLimitStreamsToDisk() {
        val dir=Files.createTempDirectory("nourishing-large-download-test").toFile()
        try {
            val size=40L*1024*1024
            val input=object:java.io.InputStream(){
                var remaining=size
                override fun read():Int=if(remaining-- > 0)90 else -1
                override fun read(bytes:ByteArray,offset:Int,length:Int):Int {
                    if(remaining==0L)return -1
                    val count=minOf(length.toLong(),remaining).toInt()
                    java.util.Arrays.fill(bytes,offset,offset+count,90.toByte());remaining-=count;return count
                }
            }
            val store=WebDownloadStore(dir)
            val file=store.stage(input)
            assertEquals(size,file.length())
            java.io.RandomAccessFile(file,"r").use{assertEquals(90,it.read());it.seek(size-1);assertEquals(90,it.read())}
            assertTrue(store.release(file))
        } finally {dir.listFiles()?.forEach{it.delete()};dir.delete()}
    }

    @Test fun stagedBytesSurvivePickerRestoreAndCleanupOnlyOwnsItsFiles() {
        val dir=Files.createTempDirectory("nourishing-download-test").toFile()
        try {
            val store=WebDownloadStore(dir)
            val bytes="a,b\n1,é\n".toByteArray()
            val file=store.stage(ByteArrayInputStream(bytes))
            assertArrayEquals(bytes,store.restore(file.name)!!.readBytes())
            val unrelated=dir.resolve("unrelated.json").apply{writeText("keep")}
            assertNull(store.restore("../"+file.name));assertNull(store.restore(unrelated.name))
            assertEquals(0,store.cleanup(file));assertTrue(file.exists())
            assertTrue(store.release(file));assertTrue(unrelated.exists())
            unrelated.delete()
        } finally { dir.delete() }
    }
    @Test fun interruptedStagingRetainsNoPartialExportAndFailedCleanupRetainsOwnership() {
        val dir=Files.createTempDirectory("nourishing-download-test").toFile()
        try {
            val store=WebDownloadStore(dir)
            val broken=object:java.io.InputStream(){var reads=0;override fun read():Int{if(reads++<4)return 65;throw java.io.IOException("interrupted")}}
            assertThrows(java.io.IOException::class.java){store.stage(broken)}
            assertTrue(dir.listFiles()!!.isEmpty())
            val file=store.stage(ByteArrayInputStream(byteArrayOf(1,2,3)))
            val failing=WebDownloadStore(dir){false}
            assertFalse(failing.release(file));assertEquals(1,failing.cleanup(null));assertNotNull(failing.restore(file.name))
            assertTrue(store.release(file))
        } finally { dir.delete() }
    }
    @Test fun pngStagingKeepsItsExtensionAndCleanupCannotClaimOtherExports() {
        val dir=Files.createTempDirectory("nourishing-image-test").toFile()
        try {
            val imageStore=WebDownloadStore(dir,WebDownloadStore.FileType.PNG)
            val binaryStore=WebDownloadStore(dir)
            val image=imageStore.stage(ByteArrayInputStream(byteArrayOf(1,2,3)))
            val binary=binaryStore.stage(ByteArrayInputStream(byteArrayOf(4,5)))
            assertTrue(image.name.endsWith(".png"));assertNotNull(imageStore.restore(image.name))
            assertNull(imageStore.restore(binary.name));assertNull(binaryStore.restore(image.name))
            assertEquals(0,imageStore.cleanup(null));assertFalse(image.exists());assertTrue(binary.exists())
            assertTrue(binaryStore.release(binary))
        } finally {dir.delete()}
    }
}
