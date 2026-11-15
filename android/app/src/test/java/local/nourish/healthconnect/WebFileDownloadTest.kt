package local.nourish.healthconnect

import java.nio.file.Files
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.Request
import okio.Buffer
import org.junit.Assert.*
import org.junit.Test

class WebFileDownloadTest {
    @Test fun streamClientKeepsStallAndAuthorityControlsWithoutATotalDurationLimit(){
        val client=WebFileDownload.defaultClient()
        assertEquals(0,client.callTimeoutMillis);assertEquals(15000,client.connectTimeoutMillis)
        assertEquals(30000,client.readTimeoutMillis);assertFalse(client.followRedirects)
        assertFalse(client.followSslRedirects);assertFalse(client.retryOnConnectionFailure)
        assertEquals(1024L*1024*1024,WebExportLimits.FILE_BYTES)
        assertEquals(32*1024*1024,WebExportLimits.MEMORY_BYTES)
    }
    @Test fun largeChunkedDownloadRetainsExactBytesAndRequestHeaders()=runBlocking {
        val dir=Files.createTempDirectory("nourishing-http-export-test").toFile()
        MockWebServer().use { server ->
            server.start();val store=WebDownloadStore(dir)
            val chunk=ByteArray(1024*1024){90};val body=Buffer();repeat(40){body.write(chunk)}
            server.enqueue(MockResponse.Builder().chunkedBody(body,16384).build())
            try {
                val file=WebFileDownload(store).stage(Request.Builder().url(server.url("/backup")).header("Cookie","fixture=value").build())
                assertEquals(40L*1024*1024,file.length())
                java.io.RandomAccessFile(file,"r").use{assertEquals(90,it.read());it.seek(file.length()-1);assertEquals(90,it.read())}
                assertEquals("fixture=value",server.takeRequest().headers["Cookie"])
                assertTrue(store.release(file));assertTrue(dir.listFiles()!!.isEmpty())
            } finally {dir.listFiles()?.forEach{it.delete()};dir.delete()}
        }
    }
    @Test fun failedAndOversizedResponsesCreateNoPickerFile()=runBlocking {
        val dir=Files.createTempDirectory("nourishing-http-reject-test").toFile()
        MockWebServer().use { server ->
            server.start();val downloader=WebFileDownload(WebDownloadStore(dir))
            try {
                for(response in listOf(MockResponse(code=403,body="denied"),MockResponse.Builder().code(302).setHeader("Location",server.url("/other")).build(),MockResponse.Builder().setHeader("Content-Length",WebExportLimits.FILE_BYTES+1).build())){
                    server.enqueue(response)
                    try{downloader.stage(Request.Builder().url(server.url("/backup")).build());fail("Invalid response accepted")}catch(expected:Exception){}
                    assertTrue(dir.listFiles()!!.isEmpty())
                }
                assertEquals(3,server.requestCount)
            } finally {dir.listFiles()?.forEach{it.delete()};dir.delete()}
        }
    }
    @Test fun cancellationDuringResponseBodyRemovesPartialFile()=runBlocking {
        val dir=Files.createTempDirectory("nourishing-http-cancel-test").toFile()
        MockWebServer().use { server ->
            server.start();server.enqueue(MockResponse.Builder().body("x".repeat(1024*1024)).throttleBody(1024,100,TimeUnit.MILLISECONDS).build())
            try {
                val task=launch{WebFileDownload(WebDownloadStore(dir)).stage(Request.Builder().url(server.url("/backup")).build());fail("Cancelled download delivered")}
                withTimeout(5000){while(dir.listFiles()!!.none{it.length()>0})delay(20)}
                task.cancelAndJoin()
                withTimeout(5000){while(dir.listFiles()!!.isNotEmpty())delay(20)}
                assertTrue(dir.listFiles()!!.isEmpty())
            } finally {dir.listFiles()?.forEach{it.delete()};dir.delete()}
        }
    }
}
