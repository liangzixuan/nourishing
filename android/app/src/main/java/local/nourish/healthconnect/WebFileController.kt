package local.nourish.healthconnect

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.DocumentsContract
import android.webkit.CookieManager
import android.webkit.URLUtil
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.lifecycleScope
import java.io.ByteArrayInputStream
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.Request

/** Owns a complete export across the Android document picker and recreation. */
class WebFileController(private val activity:ComponentActivity,private val policy:WebWorkspacePolicy,private val status:(String)->Unit) {
    private val store=WebDownloadStore(File(activity.filesDir,"web-downloads"))
    private val downloader=WebFileDownload(store)
    private var pending:File?=null
    private var busy=false
    private var pickerPending=false
    private val save=activity.registerForActivityResult(ActivityResultContracts.StartActivityForResult()){result ->
        pickerPending=false
        val file=pending
        if(result.resultCode!=android.app.Activity.RESULT_OK||result.data?.data==null){release();status(activity.getString(R.string.web_save_cancelled))}
        else if(file==null){status(activity.getString(R.string.web_export_lost))}
        else copy(file,requireNotNull(result.data?.data))
    }
    fun restore(state:Bundle?){pending=store.restore(state?.getString("web-download"));busy=pending!=null;pickerPending=busy;if(store.cleanup(pending)>0)status(activity.getString(R.string.web_cleanup_pending))}
    fun saveState(state:Bundle){if(pickerPending)pending?.let{state.putString("web-download",it.name)}}
    private fun reserve(){check(!busy){activity.getString(R.string.web_finish_export)};busy=true}
    private fun release(){val file=pending;pending=null;busy=false;pickerPending=false;if(file!=null&&!store.release(file))status(activity.getString(R.string.web_cleanup_pending))}
    fun bytes(name:String,mime:String,bytes:ByteArray){
        require(bytes.size<=WebExportLimits.MEMORY_BYTES){"Download exceeds the 32 MiB memory transfer limit."}
        reserve()
        activity.lifecycleScope.launch{
            try{stageAndChoose(name,mime){store.stage(ByteArrayInputStream(bytes),WebExportLimits.MEMORY_BYTES.toLong())}}
            catch(error:Exception){release();if(error is CancellationException)throw error;status(error.message?:activity.getString(R.string.web_download_failed))}
        }
    }
    fun url(url:String,agent:String,disposition:String?,mime:String?) {
        require(policy.isWorkspace(url)){"Only private workspace downloads are accepted."};reserve()
        val cookie=CookieManager.getInstance().getCookie(url)
        activity.lifecycleScope.launch {
            try {
                val name=URLUtil.guessFileName(url,disposition,mime)
                stageAndChoose(name,mime?:"application/octet-stream"){
                    val request=Request.Builder().url(url).header("User-Agent",agent).apply{if(cookie!=null)header("Cookie",cookie)}.build()
                    downloader.stage(request)
                }
            }catch(error:Exception){release();if(error is CancellationException)throw error;status(error.message?:activity.getString(R.string.web_download_failed))}
        }
    }
    private suspend fun stageAndChoose(name:String,mime:String,create:suspend ()->File){
        // Assign ownership inside IO, before cancellable dispatch back to main.
        withContext(Dispatchers.IO){pending=create()}
        pickerPending=true
        save.launch(Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
            .setType(mime.substringBefore(';')).putExtra(Intent.EXTRA_TITLE,webDownloadName(name)))
    }
    private fun copy(file:File,uri:Uri){
        activity.lifecycleScope.launch {
            try {
                withContext(Dispatchers.IO){
                    try {
                        val output=activity.contentResolver.openOutputStream(uri,"w")?:error("Document unavailable.")
                        output.use{out->file.inputStream().use{input->val buffer=ByteArray(16*1024);while(true){currentCoroutineContext().ensureActive();val size=input.read(buffer);if(size<0)break;out.write(buffer,0,size)};out.flush()}}
                    }catch(error:Throwable){
                        val removed=runCatching{DocumentsContract.deleteDocument(activity.contentResolver,uri)}.getOrDefault(false)
                        if(error is CancellationException)throw error
                        throw java.io.IOException(activity.getString(if(removed)R.string.web_save_failed_removed else R.string.web_save_failed_remaining),error)
                    }
                }
                status(activity.getString(R.string.web_saved))
            }catch(error:Exception){if(error is CancellationException)throw error;status(error.message?:activity.getString(R.string.web_download_failed))}
            finally{release()}
        }
    }
}
