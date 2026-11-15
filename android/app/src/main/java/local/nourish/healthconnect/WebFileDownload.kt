package local.nourish.healthconnect

import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response

/** Owns the HTTP call until its response is fully staged, including cancellation. */
class WebFileDownload(private val store:WebDownloadStore,private val http:OkHttpClient=defaultClient()) {
    companion object {
        fun defaultClient():OkHttpClient=WorkspaceClient.defaultClient().newBuilder()
            .callTimeout(0,TimeUnit.MILLISECONDS).build()
    }
    suspend fun stage(request:Request):File=suspendCancellableCoroutine { continuation ->
        val call=http.newCall(request)
        continuation.invokeOnCancellation {call.cancel()}
        call.enqueue(object:Callback {
            override fun onFailure(call:Call,e:IOException){if(continuation.isActive)continuation.resumeWithException(e)}
            override fun onResponse(call:Call,response:Response){
                try {
                    val file=response.use {
                        check(it.isSuccessful){"Download failed (${it.code})."}
                        require(it.body.contentLength()<=WebExportLimits.FILE_BYTES){"Download exceeds the 1 GiB file limit."}
                        it.body.byteStream().use {input -> store.stage(input){if(!continuation.isActive)throw CancellationException("Download cancelled.")}}
                    }
                    continuation.resume(file,onCancellation={_,owned,_->store.release(owned)})
                }catch(error:Exception){if(continuation.isActive)continuation.resumeWithException(error)}
            }
        })
    }
}
