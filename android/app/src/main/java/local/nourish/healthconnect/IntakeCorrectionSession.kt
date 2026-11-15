package local.nourish.healthconnect

import java.time.Instant
import org.json.JSONObject

data class IntakeCorrectionSession(val origin:WorkspaceOrigin,val identity:WorkspaceIdentity,val capturedAt:Instant,
    val activationPacket:String,val previewPacket:String,val operation:IntakeCorrectionOperation,val beforeDescriptions:Map<String,String>,val activated:Boolean) {
    fun preview()=parseCorrectedIntakePreview(JSONObject(previewPacket),capturedAt)
}
fun intakeSessionJson(session:IntakeCorrectionSession)=JSONObject().put("format","nourish-intake-session").put("version",1)
    .put("origin",session.origin.value).put("login",session.identity.login).put("capturedAt",session.capturedAt.toString())
    .put("activationPacket",session.activationPacket).put("previewPacket",session.previewPacket)
    .put("operation",intakeCorrectionJson(session.operation)).put("beforeDescriptions",JSONObject(session.beforeDescriptions)).put("activated",session.activated)

fun parseIntakeSession(json:JSONObject):IntakeCorrectionSession {
    require(json.toString().toByteArray(Charsets.UTF_8).size.toLong()<=MAX_EXPORT_BYTES)
    strictKeys(json,setOf("format","version","origin","login","capturedAt","activationPacket","previewPacket","operation","beforeDescriptions","activated"))
    require(json.intakeText("format")=="nourish-intake-session"&&json.get("version")==1&&json.get("activated") is Boolean)
    val origin=WorkspaceOrigin.parse(json.intakeText("origin"));val identity=WorkspaceIdentity(json.intakeText("login"));require(identity.login.isNotBlank())
    val captured=Instant.parse(json.intakeText("capturedAt"));val previewText=json.intakeText("previewPacket");val previewJson=JSONObject(previewText);val preview=parseCorrectedIntakePreview(previewJson,captured)
    val operation=parseIntakeCorrection(json.getJSONObject("operation"));require(operation.review.plan==preview.nativePlan(origin,identity))
    val activationText=json.intakeText("activationPacket");val packet=JSONObject(activationText);strictKeys(packet,setOf("selection","reviewToken","save"));val save=packet.getJSONObject("save");strictKeys(save,setOf("operationId","scope","reviewToken"))
    require(parseCorrectedIntakeSelection(packet.getJSONObject("selection"))==preview.selection&&save.intakeText("operationId")==operation.id&&save.intakeText("scope")==preview.saveScope)
    require(Regex("[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}").matches(operation.id))
    val originalToken=packet.intakeText("reviewToken");require(Regex("[a-f0-9]{64}").matches(originalToken)&&save.intakeText("reviewToken")==originalToken)
    val activated=json.getBoolean("activated")
    if(!activated)require(originalToken==preview.reviewToken&&operation.attemptedUpserts.isEmpty()&&operation.attemptedRetirements.isEmpty())
    else require(!preview.activationRequired)
    val descriptions=json.getJSONObject("beforeDescriptions");val values=descriptions.keys().asSequence().associateWith { descriptions.intakeText(it) }
    require(values.keys==operation.review.before.keys&&values.values.all { it.isNotBlank() })
    return IntakeCorrectionSession(origin,identity,captured,activationText,previewText,operation,values,activated)
}

interface IntakeSessionStore {
    fun load():IntakeCorrectionSession?
    fun save(session:IntakeCorrectionSession)
    fun clear(operationId:String)
    fun keepCurrent(resolution:IntakeCorrectionResolution)
    fun history(before:Long?=null,limit:Int=10):List<IntakeResolutionSummary>
    fun resolution(operationId:String):IntakeCorrectionResolution?
}

/** Writes must be synchronous. Archiving and clearing pending intent form one transaction. */
interface IntakeSessionPersistence {
    fun read():String?
    fun write(value:String?)
    fun archiveAndClear(expected:String,resolution:IntakeCorrectionResolution)
    fun history(before:Long?,limit:Int):List<IntakeResolutionSummary>
    fun resolution(operationId:String):String?
}

class PersistedIntakeSessionStore(private val persistence:IntakeSessionPersistence):IntakeSessionStore {
    companion object { private val lock=Any() }
    override fun load():IntakeCorrectionSession?=synchronized(lock){persistence.read()?.let { parseIntakeSession(JSONObject(it)) }}
    override fun save(session:IntakeCorrectionSession)=synchronized(lock){
        val next=parseIntakeSession(intakeSessionJson(session));val previous=load()
        if(previous==null)require(!next.activated&&next.operation.attemptedUpserts.isEmpty()&&next.operation.attemptedRetirements.isEmpty())
        else {
            require(previous.origin==next.origin&&previous.identity==next.identity&&previous.capturedAt==next.capturedAt&&previous.activationPacket==next.activationPacket&&previous.beforeDescriptions==next.beforeDescriptions)
            require(previous.operation.id==next.operation.id&&previous.operation.version==next.operation.version&&previous.operation.review.before==next.operation.review.before)
            require(previous.preview().sameReviewedActions(next.preview())&&(!previous.activated||next.activated))
            if(previous.activated||!next.activated)require(previous.previewPacket==next.previewPacket&&previous.operation.review.plan==next.operation.review.plan)
            require(next.operation.attemptedUpserts.containsAll(previous.operation.attemptedUpserts)&&next.operation.attemptedRetirements.containsAll(previous.operation.attemptedRetirements))
        }
        persistence.write(intakeSessionJson(next).toString())
    }
    override fun clear(operationId:String)=synchronized(lock){require(load()?.operation?.id==operationId);persistence.write(null)}
    override fun keepCurrent(resolution:IntakeCorrectionResolution)=synchronized(lock){
        val checked=parseIntakeResolution(intakeResolutionJson(resolution))
        val pending=persistence.read()?:error("There is no pending correction.")
        require(parseIntakeSession(JSONObject(pending))==checked.session){"The pending operation changed. Review its phone records again."}
        persistence.archiveAndClear(pending,checked)
    }
    override fun history(before:Long?,limit:Int):List<IntakeResolutionSummary> = synchronized(lock){
        require(before==null||before>0);require(limit in 1..100)
        persistence.history(before,limit)
    }
    override fun resolution(operationId:String):IntakeCorrectionResolution?=synchronized(lock){
        persistence.resolution(operationId)?.let { parseIntakeResolution(JSONObject(it)).also { value->require(value.session.operation.id==operationId) } }
    }
}
