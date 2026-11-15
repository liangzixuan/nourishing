package local.nourish.healthconnect

import java.time.Instant
import org.json.JSONObject

/** Keeping current records acknowledges a possibly partial result, never completion. */
data class ReviewedIntakeRecovery(val session:IntakeCorrectionSession,val inspection:IntakeCorrectionInspection)
data class IntakeCorrectionResolution(val session:IntakeCorrectionSession,val observed:Map<String,IntakeNativeState>,
    val descriptions:Map<String,String>,val resolvedAt:Instant)
data class IntakeResolutionSummary(val sequence:Long,val operationId:String,val resolvedAt:Instant,val type:HealthWriteType)

fun intakeResolutionJson(value:IntakeCorrectionResolution)=JSONObject().put("format","nourish-intake-resolution").put("version",1)
    .put("disposition","kept-current").put("resolvedAt",value.resolvedAt.toString()).put("session",intakeSessionJson(value.session))
    .put("observed",intakeNativeStatesJson(value.observed)).put("descriptions",JSONObject(value.descriptions))

fun parseIntakeResolution(json:JSONObject):IntakeCorrectionResolution {
    // A resolution contains the original envelope plus a second full observation.
    require(json.toString().toByteArray(Charsets.UTF_8).size.toLong()<=MAX_EXPORT_BYTES*2)
    strictKeys(json,setOf("format","version","disposition","resolvedAt","session","observed","descriptions"))
    require(json.intakeText("format")=="nourish-intake-resolution"&&json.get("version")==1&&json.intakeText("disposition")=="kept-current")
    val session=parseIntakeSession(json.getJSONObject("session"))
    val observed=parseIntakeNativeStates(json.getJSONArray("observed"),session.operation.review.plan.clients)
    val descriptions=json.getJSONObject("descriptions");val values=descriptions.keys().asSequence().associateWith { descriptions.intakeText(it) }
    require(values.keys==observed.keys&&values.values.all { it.isNotBlank() })
    return IntakeCorrectionResolution(session,observed,values,Instant.parse(json.intakeText("resolvedAt")))
}
