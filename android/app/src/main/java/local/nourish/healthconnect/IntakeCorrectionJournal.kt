package local.nourish.healthconnect

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

internal fun intakeNativeStatesJson(states:Map<String,IntakeNativeState>)=JSONArray(states.toSortedMap().values.map {
    JSONObject().put("nativeId",it.nativeId).put("clientId",it.clientId).put("version",it.version).put("fingerprint",it.fingerprint)
})
internal fun parseIntakeNativeStates(array:JSONArray,clients:Set<String>):Map<String,IntakeNativeState> {
    require(array.length()<=MAX_EXPORT_RECORDS)
    val states=linkedMapOf<String,IntakeNativeState>()
    for(index in 0 until array.length()){
        val value=array.getJSONObject(index);strictKeys(value,setOf("nativeId","clientId","version","fingerprint"))
        val version=value.get("version");require(version is Number&&version.toString()==version.toLong().toString())
        val state=IntakeNativeState(value.intakeText("nativeId"),value.intakeText("clientId"),version.toLong(),value.intakeText("fingerprint"))
        require(state.clientId in clients&&states.put(state.clientId,state)==null)
    }
    require(states.values.map { it.nativeId }.distinct().size==states.size)
    return states
}

fun intakeCorrectionJson(operation: IntakeCorrectionOperation): JSONObject {
    val review=operation.review;val plan=review.plan
    val receipts=plan.rows.associate { it.clientId to HealthWriteReceipt(it.clientId,operation.version,it) }
    return JSONObject().put("format","nourish-intake-correction").put("version",1)
        .put("operationId",operation.id).put("scope",plan.scope).put("reviewToken",plan.reviewToken)
        .put("type",plan.type.wire).put("writeVersion",operation.version)
        .put("rows",healthReceiptJson(plan.type,receipts))
        .put("labels",JSONArray(plan.rows.map { JSONObject().put("clientId",it.clientId).put("id",it.id).put("description",it.description) }))
        .put("before",intakeNativeStatesJson(review.before))
        .put("retire",JSONArray(plan.retire.sorted())).put("attemptedUpserts",JSONArray(operation.attemptedUpserts.sorted()))
        .put("attemptedRetirements",JSONArray(operation.attemptedRetirements.sorted()))
}

fun parseIntakeCorrection(json: JSONObject): IntakeCorrectionOperation {
    fun text(value:JSONObject,key:String)=value.get(key).also { require(it is String) } as String
    fun integer(value:JSONObject,key:String):Long { val n=value.get(key);require(n is Number && n.toString()==n.toLong().toString());return n.toLong() }
    fun strings(key:String):Set<String> {
        val array=json.getJSONArray(key);require(array.length()<=MAX_EXPORT_RECORDS)
        val rows=(0 until array.length()).map { array.get(it).also { v->require(v is String) } as String }
        require(rows.distinct().size==rows.size);return rows.toSet()
    }
    strictKeys(json,setOf("format","version","operationId","scope","reviewToken","type","writeVersion","rows","labels","before","retire","attemptedUpserts","attemptedRetirements"))
    require(text(json,"format")=="nourish-intake-correction" && json.get("version")==1)
    val type=HealthWriteType.fromWire(text(json,"type"));require(type.isIntake)
    val version=integer(json,"writeVersion");require(version>0)
    val receipts=parseHealthReceipts(type,json.getJSONObject("rows"));require(receipts.values.all { it.version==version && it.nativeId==it.row.clientId })
    val labels=json.getJSONArray("labels");require(labels.length()==receipts.size)
    val rows=(0 until labels.length()).map { index ->
        val label=labels.getJSONObject(index);strictKeys(label,setOf("clientId","id","description"))
        requireNotNull(receipts[text(label,"clientId")]).row.copy(id=text(label,"id"),description=text(label,"description"))
    }
    val plan=IntakeCorrectionPlan(text(json,"scope"),text(json,"reviewToken"),type,rows,strings("retire"))
    val before=parseIntakeNativeStates(json.getJSONArray("before"),plan.clients)
    return IntakeCorrectionOperation(text(json,"operationId"),IntakeCorrectionReview(plan,before),version,strings("attemptedUpserts"),strings("attemptedRetirements"))
}

/** One pending correction across this application process. Never cleared by hourly settings. */
class AndroidIntakeCorrectionJournal(context: Context): IntakeCorrectionJournal {
    private val prefs=context.applicationContext.getSharedPreferences("intake-correction-journal",Context.MODE_PRIVATE)
    companion object { private val lock=Any() }
    override fun load():IntakeCorrectionOperation?=synchronized(lock) {
        prefs.getString("pending",null)?.let { parseIntakeCorrection(JSONObject(it)) }
    }
    override fun save(operation:IntakeCorrectionOperation)=synchronized(lock) {
        val previous=load()
        require(previous==null || previous.id==operation.id && previous.review==operation.review && previous.version==operation.version &&
            operation.attemptedUpserts.containsAll(previous.attemptedUpserts) && operation.attemptedRetirements.containsAll(previous.attemptedRetirements)) { "An earlier correction is still pending." }
        val json=intakeCorrectionJson(operation);require(parseIntakeCorrection(json)==operation)
        check(prefs.edit().putString("pending",json.toString()).commit()) { "Could not retain the pending correction. No further native operation was requested." }
    }
    override fun finish(operationId:String)=synchronized(lock) {
        require(load()?.id==operationId) { "Pending correction identity changed." }
        check(prefs.edit().remove("pending").commit()) { "The native result was verified, but its pending journal could not be cleared." }
    }
}
