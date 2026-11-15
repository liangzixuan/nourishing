package local.nourish.healthconnect

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import androidx.core.content.FileProvider
import java.io.ByteArrayInputStream
import java.io.File

class SharedImageProvider:FileProvider()

/** Only staged PNG images are exposed, with a temporary read grant selected by Android. */
class WebImageShare(private val context:Context) {
    private val directory=File(context.cacheDir,"shared-images")
    private val store=WebDownloadStore(directory,WebDownloadStore.FileType.PNG)
    init {
        val expires=System.currentTimeMillis()-24*60*60*1000L
        directory.listFiles().orEmpty().mapNotNull{store.restore(it.name)}.filter{it.lastModified()<expires}.forEach{store.release(it)}
    }
    fun share(name:String,mime:String,bytes:ByteArray){context.startActivity(createChooser(name,mime,bytes))}
    fun createChooser(name:String,mime:String,bytes:ByteArray):Intent {
        require(mime=="image/png"&&bytes.size<=WebExportLimits.MEMORY_BYTES){"Share a PNG image up to 32 MiB."}
        val bounds=BitmapFactory.Options().apply{inJustDecodeBounds=true}
        BitmapFactory.decodeByteArray(bytes,0,bytes.size,bounds)
        require(bounds.outMimeType=="image/png"&&bounds.outWidth>0&&bounds.outHeight>0){"The shared image is not a valid PNG."}
        val file=store.stage(ByteArrayInputStream(bytes))
        try {
            val uri=FileProvider.getUriForFile(context,context.packageName+".shared-images",file,webDownloadName(name))
            val send=Intent(Intent.ACTION_SEND).apply {
                type="image/png"
                putExtra(Intent.EXTRA_STREAM,uri)
                clipData=ClipData.newUri(context.contentResolver,"Nourishing image",uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            return Intent.createChooser(send,null)
        }catch(error:Exception){store.release(file);throw error}
    }
}
