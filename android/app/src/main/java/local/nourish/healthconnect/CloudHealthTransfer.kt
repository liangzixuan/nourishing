package local.nourish.healthconnect

import java.io.File
import java.io.IOException
import java.security.MessageDigest
import java.time.LocalDate
import java.time.ZoneId
import org.json.JSONObject

data class CloudHealthReview(
    val lease:CloudAccountLease,val file:File,val digest:String,val reviewToken:String,
    val counts:ImportCounts,val from:String,val to:String,val zone:String,val warnings:List<String>
)
class CloudHealthImportUncertain:IOException("The import result was not received. Retry this review to check the same import.")

/** Foreground snapshot transfer. No background work, native writes or deletion permission. */
class CloudHealthTransfer(private val session:CloudAccountSession) {
    private data class Snapshot(val json:String,val digest:String)
    private fun snapshot(file:File):Snapshot {
        require(file.isFile&&file.length() in 1..MAX_EXPORT_BYTES){"Read Health Connect records first."}
        val bytes=file.inputStream().use{input->
            val result=java.io.ByteArrayOutputStream();val buffer=ByteArray(16*1024)
            while(true){val size=input.read(buffer);if(size<0)break;require(result.size().toLong()+size<=MAX_EXPORT_BYTES){"Select fewer records."};result.write(buffer,0,size)}
            result.toByteArray()
        }
        require(bytes.isNotEmpty()){ "Read Health Connect records first." }
        return Snapshot(bytes.toString(Charsets.UTF_8),MessageDigest.getInstance("SHA-256").digest(bytes).joinToString(""){"%02x".format(it)})
    }
    fun preview(lease:CloudAccountLease,file:File):CloudHealthReview {
        val captured=snapshot(file)
        val reply=session.request(lease,"/api/health-connect/preview?summary=1",captured.json)
        try {
            val json=JSONObject(reply.body);require(json.keys().asSequence().toSet()==setOf("reviewToken","counts","range","warnings"))
            val token=json.get("reviewToken");require(token is String&&Regex("[a-f0-9]{64}").matches(token))
            val range=json.getJSONObject("range");require(range.keys().asSequence().toSet()==setOf("from","to","zone"))
            val from=range.getString("from");val to=range.getString("to");val zone=range.getString("zone")
            require(!LocalDate.parse(from).isAfter(LocalDate.parse(to)));ZoneId.of(zone)
            val warnings=json.getJSONArray("warnings");require(warnings.length()<=50)
            val texts=(0 until warnings.length()).map{index->val value=warnings.get(index);require(value is String&&value.length<=2000);value}
            return CloudHealthReview(lease,file,captured.digest,token,importCounts(json.getJSONObject("counts")),from,to,zone,texts)
        }catch(_:Exception){throw CloudProtocolFailure()}
    }
    fun import(review:CloudHealthReview):ImportCounts {
        val captured=snapshot(review.file)
        require(captured.digest==review.digest){"The export changed. Preview it again."}
        if(!session.isCurrent(review.lease))throw CloudSessionChanged()
        val reply=try{session.request(review.lease,"/api/health-connect/import?summary=1",captured.json,review.reviewToken)}
            catch(error:CloudApiFailure){throw error}
            catch(_:IOException){throw CloudHealthImportUncertain()}
            catch(_:CloudSessionChanged){throw CloudHealthImportUncertain()}
            catch(_:CloudProtocolFailure){throw CloudHealthImportUncertain()}
        return try{
            val json=JSONObject(reply.body);require(json.keys().asSequence().toSet()==setOf("counts"))
            importCounts(json.getJSONObject("counts"))
        }catch(_:Exception){throw CloudHealthImportUncertain()}
    }
}
