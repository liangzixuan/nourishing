package local.nourish.healthconnect

import java.io.File
import java.io.IOException
import org.junit.Assert.*
import org.junit.Test
import org.junit.Rule
import org.junit.rules.TemporaryFolder
import okhttp3.Request

class CloudHealthTransferTest {
    @get:Rule val temp=TemporaryFolder()
    private val token="a".repeat(64)
    private val counts="{\"added\":1,\"updated\":0,\"unchanged\":0}"
    private val preview="{\"reviewToken\":\"$token\",\"counts\":$counts,\"range\":{\"from\":\"2026-11-14\",\"to\":\"2026-11-14\",\"zone\":\"UTC\"},\"warnings\":[\"No records are deleted.\"]}"
    private inline fun <reified T:Throwable> rejects(block:()->Unit){try{block();fail("Expected ${T::class.simpleName}")}catch(error:Throwable){if(error !is T)throw error}}
    private class Fixture {
        var reply=CloudHttpReply(200,"{\"id\":\"account-A\"}")
        var cookie:String?="__Host-nourishing_session=synthetic"
        var failure:IOException?=null
        val requests=mutableListOf<Request>()
        val session=CloudAccountSession(CloudOrigin.parse("https://nourishing.app"),{cookie},CloudHttpTransport{request->requests.add(request);failure?.let{throw it};reply})
        val lease=session.connect()
        val transfer=CloudHealthTransfer(session)
    }
    private fun file():File=temp.newFile().apply{writeText("{\"format\":\"nourish-health-connect\",\"version\":1,\"records\":[]}")}
    @Test fun previewAndConfirmUseSameBytesAccountAndServerReview(){
        val f=Fixture();f.reply=CloudHttpReply(200,preview);val review=f.transfer.preview(f.lease,file())
        assertEquals("account-A",review.lease.account.id);assertEquals(1,review.counts.added)
        f.reply=CloudHttpReply(200,"{\"counts\":$counts}");assertEquals(1,f.transfer.import(review).added)
        val first=f.requests[1];val last=f.requests.last()
        assertEquals("/api/health-connect/preview?summary=1",first.url.encodedPath+"?"+first.url.encodedQuery)
        assertEquals("/api/health-connect/import",last.url.encodedPath);assertEquals(token,last.header("X-Nourish-Review-Token"));assertEquals("https://nourishing.app",last.header("Origin"))
        val a=okio.Buffer();val b=okio.Buffer();first.body!!.writeTo(a);last.body!!.writeTo(b);assertEquals(a.readUtf8(),b.readUtf8())
    }
    @Test fun changedFileOrAccountCannotImport(){
        val f=Fixture();f.reply=CloudHttpReply(200,preview);val file=file();val review=f.transfer.preview(f.lease,file);val calls=f.requests.size
        file.writeText("{\"changed\":true}");rejects<IllegalArgumentException>{f.transfer.import(review)};assertEquals(calls,f.requests.size)
        val next=f.transfer.preview(f.lease,file);f.cookie="__Host-nourishing_session=different"
        rejects<CloudSessionChanged>{f.transfer.import(next)};assertEquals(calls+1,f.requests.size)
    }
    @Test fun uncertainConfirmCanRetrySameReviewWithoutAutomaticReplay(){
        val f=Fixture();f.reply=CloudHttpReply(200,preview);val review=f.transfer.preview(f.lease,file())
        f.failure=IOException("offline");rejects<CloudHealthImportUncertain>{f.transfer.import(review)};assertEquals(3,f.requests.size)
        f.failure=null;f.reply=CloudHttpReply(200,"{\"counts\":$counts}");assertEquals(1,f.transfer.import(review).added)
        assertEquals(token,f.requests.last().header("X-Nourish-Review-Token"))
    }
    @Test fun rejectedConfirmIsDifferentFromMissingCommitResponse(){
        val f=Fixture();f.reply=CloudHttpReply(200,preview);val review=f.transfer.preview(f.lease,file())
        f.reply=CloudHttpReply(409,"{}");rejects<CloudApiFailure>{f.transfer.import(review)}
        f.reply=CloudHttpReply(200,"{}");rejects<CloudHealthImportUncertain>{f.transfer.import(review)}
    }
    @Test fun malformedPreviewIsRejectedBeforeAnImportCanBeReviewed(){
        for(body in listOf("{}",preview.replace(token,"bad"),preview.replace("\"added\":1","\"added\":-1"),preview.replace("\"UTC\"","\"invalid-zone\""))){
            val f=Fixture();f.reply=CloudHttpReply(200,body);rejects<CloudProtocolFailure>{f.transfer.preview(f.lease,file())}
        }
    }
}
