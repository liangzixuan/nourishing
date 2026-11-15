package local.nourish.healthconnect

import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.metadata.Metadata
import java.time.Instant
import java.time.ZoneOffset
import org.json.JSONArray
import org.json.JSONObject

/** Verified native identity and reviewed payload, scoped by the saved export selection. */
data class HealthWriteReceipt(val nativeId:String,val version:Long,val row:HealthWriteRow) {
    init {require(nativeId.isNotBlank()&&version>0)}
    fun matches(type:HealthWriteType,actual:Record):Boolean = isNourishExport(actual)&&
        actual.metadata.id==nativeId&&actual.metadata.clientRecordId==row.clientId&&
        actual.metadata.clientRecordVersion==version&&actual.metadata.recordingMethod==Metadata.RECORDING_METHOD_MANUAL_ENTRY&&
        actual==type.native(row,actual.metadata)
}

fun healthReceiptJson(type:HealthWriteType,receipts:Map<String,HealthWriteReceipt>):JSONObject {
    require(receipts.size<=MAX_EXPORT_RECORDS)
    val rows=JSONArray()
    for((id,receipt) in receipts){
        require(id==receipt.row.clientId)
        val row=receipt.row
        rows.put(JSONObject().put("nativeId",receipt.nativeId).put("version",receipt.version).put("clientId",id)
            .put("value",row.value).put("unit",row.unit).put("secondary",row.secondary ?: JSONObject.NULL)
            .put("time",row.time.toString()).put("offset",row.offset.toString())
            .put("end",row.end?.toString() ?: JSONObject.NULL).put("endOffset",row.endOffset?.toString() ?: JSONObject.NULL)
            .put("name",row.name ?: JSONObject.NULL).put("nutrients",JSONObject(row.nutrients)))
    }
    return JSONObject().put("version",1).put("type",type.wire).put("receipts",rows)
}
fun parseHealthReceipts(type:HealthWriteType,json:JSONObject):Map<String,HealthWriteReceipt> {
    require(json.get("version")==1&&json.getString("type")==type.wire){"Export verification history needs a fresh preview and explicit enablement."}
    val rows=json.getJSONArray("receipts");require(rows.length()<=MAX_EXPORT_RECORDS)
    val receipts=linkedMapOf<String,HealthWriteReceipt>()
    for(i in 0 until rows.length()){
        val value=rows.getJSONObject(i)
        fun text(key:String)=value.get(key).also{require(it is String)} as String
        fun optionalText(key:String)=if(value.isNull(key))null else text(key)
        fun number(key:String)=(value.get(key).also{require(it is Number&&it.toDouble().isFinite())} as Number).toDouble()
        val id=text("clientId");require(Regex("nourish-export:${type.wire}:[a-f0-9]{64}").matches(id)&&id !in receipts)
        val version=value.get("version");require(version is Number&&version.toLong()>0&&version.toString()==version.toLong().toString())
        val nutrients=value.getJSONObject("nutrients").let{n->n.keys().asSequence().associateWith{key->(n.get(key).also{require(it is Number&&it.toDouble().isFinite())} as Number).toDouble()}}
        val row=HealthWriteRow(id,id,number("value"),text("unit"),if(value.isNull("secondary"))null else number("secondary"),Instant.parse(text("time")),ZoneOffset.of(text("offset")),"",optionalText("end")?.let(Instant::parse),optionalText("endOffset")?.let(ZoneOffset::of),optionalText("name"),nutrients)
        type.native(row,Metadata.manualEntry(clientRecordId=id,clientRecordVersion=version.toLong()))
        receipts[id]=HealthWriteReceipt(text("nativeId"),version.toLong(),row)
    }
    return receipts
}
