package local.nourish.healthconnect

import java.io.File
import java.io.InputStream
import java.io.IOException
import java.util.UUID

/** Files remain owned after failed cleanup and are retried at next launch. */
class WebDownloadStore(private val directory:File,private val type:FileType=FileType.BINARY,private val remove:(File)->Boolean={it.delete()}) {
    enum class FileType(val extension:String,val limitBytes:Long){BINARY("bin",WebExportLimits.FILE_BYTES),PNG("png",WebExportLimits.MEMORY_BYTES.toLong())}
    private val pattern=Regex("web-download-[0-9a-f-]{36}\\.${type.extension}")
    private fun owns(file:File)=pattern.matches(file.name)&&file.canonicalFile.parentFile==directory.canonicalFile
    fun restore(name:String?):File?=name?.takeIf{pattern.matches(it)}?.let{File(directory,it)}?.takeIf{owns(it)&&it.isFile}
    fun stage(source:InputStream,limitBytes:Long=type.limitBytes,checkActive:()->Unit={}):File {
        require(limitBytes in 0..type.limitBytes)
        check(directory.isDirectory||directory.mkdirs())
        val file=File(directory,"web-download-${UUID.randomUUID()}.${type.extension}")
        try {
            file.outputStream().use{out ->
                val buffer=ByteArray(16*1024);var total=0L
                while(true){checkActive();val read=source.read(buffer);if(read<0)break;total+=read;if(total>limitBytes)throw IOException("Download exceeds the supported file size.");out.write(buffer,0,read)}
                checkActive()
                out.fd.sync()
            }
            return file
        } catch(error:Throwable){if(file.exists())remove(file);throw error}
    }
    fun release(file:File):Boolean{require(owns(file));return !file.exists()||remove(file)}
    fun cleanup(keep:File?):Int=directory.listFiles().orEmpty().filter{owns(it)&&it!=keep}.count{!release(it)}
}
