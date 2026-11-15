package local.nourish.healthconnect

import java.io.File
import java.util.UUID

/** Separate picker lease: an outbox acknowledgement may delete its upload copy
 * while this immutable document copy remains owned by the pending picker. */
class DocumentExportOwner(private val directory:File,private val remove:(File)->Boolean={it.delete()}) {
    private val pattern=Regex("reconciliation-document-[0-9a-f-]{36}\\.json")
    fun owns(file:File):Boolean=pattern.matches(file.name)&&file.canonicalFile.parentFile==directory.canonicalFile
    fun restore(path:String?):File?=path?.let{File(it)}?.takeIf{owns(it)&&it.isFile}
    fun create(source:File):File {
        require(source.isFile&&source.length() in 1..MAX_EXPORT_BYTES){"The complete reconciliation document is unavailable."}
        check(directory.isDirectory||directory.mkdirs());val file=File(directory,"reconciliation-document-${UUID.randomUUID()}.json")
        try{file.outputStream().use{out->val bounded=BoundedExportStream(out);source.inputStream().use{it.copyTo(bounded)};bounded.flush();out.fd.sync()};return file}
        catch(error:Throwable){if(file.exists())remove(file);throw error}
    }
    fun release(file:File):Boolean {require(owns(file)){"This file is not owned by the document picker."};return !file.exists()||remove(file)}
    fun retryCleanup(keep:File?):Int=directory.listFiles().orEmpty().filter{owns(it)&&it!=keep}.count{!release(it)}
}

/** Persist only an outstanding document picker. A running copy is cancelled by
 * Activity stop and must not be restored as a picker with no future callback. */
class DocumentExportLease(private val owner:DocumentExportOwner) {
    private enum class Phase { NONE, PICKER, COPYING }
    @Volatile private var phase=Phase.NONE
    @Volatile var file:File?=null;private set
    val requested:Boolean get()=phase!=Phase.NONE
    val pickerPending:Boolean get()=phase==Phase.PICKER
    val savedPickerPath:String? get()=if(pickerPending)file?.absolutePath else null
    fun restore(requested:Boolean,path:String?){check(phase==Phase.NONE);phase=if(requested)Phase.PICKER else Phase.NONE;file=if(requested)owner.restore(path)else null}
    fun begin(source:File){check(phase==Phase.NONE){"Finish or cancel the existing document picker first."};file=owner.create(source);phase=Phase.PICKER}
    fun beginCopy(){check(phase==Phase.PICKER);phase=Phase.COPYING}
    fun finish():Boolean{val previous=file;file=null;phase=Phase.NONE;return previous==null||owner.release(previous)}
}
