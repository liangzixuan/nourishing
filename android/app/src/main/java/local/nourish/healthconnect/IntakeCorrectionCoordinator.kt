package local.nourish.healthconnect

import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import org.json.JSONObject

interface IntakeCorrectionTransport {
    suspend fun identity(origin:WorkspaceOrigin):WorkspaceIdentity
    suspend fun preview(origin:WorkspaceOrigin,selection:JSONObject):JSONObject
    suspend fun activate(origin:WorkspaceOrigin,packet:String):JSONObject
    suspend fun verify(origin:WorkspaceOrigin,selection:JSONObject,reviewToken:String):JSONObject
}
class WorkspaceIntakeCorrections(private val client:WorkspaceClient=WorkspaceClient()):IntakeCorrectionTransport {
    override suspend fun identity(origin:WorkspaceOrigin)=client.identity(origin)
    override suspend fun preview(origin:WorkspaceOrigin,selection:JSONObject)=client.exchange(origin,"/api/health-connect/export/intake/corrected/preview",json=selection)
    override suspend fun activate(origin:WorkspaceOrigin,packet:String)=client.exchange(origin,"/api/health-connect/export/intake/corrected/activate",jsonText=packet)
    override suspend fun verify(origin:WorkspaceOrigin,selection:JSONObject,reviewToken:String)=client.exchange(origin,"/api/health-connect/export/intake/corrected/verify",json=JSONObject().put("selection",selection).put("reviewToken",reviewToken))
}
data class ReviewedIntakeCorrection(val origin:WorkspaceOrigin,val identity:WorkspaceIdentity,val capturedAt:Instant,val packet:String,val inspection:IntakeCorrectionInspection) {
    fun preview()=parseCorrectedIntakePreview(JSONObject(packet),capturedAt)
}

class IntakeCorrectionCoordinator(private val transport:IntakeCorrectionTransport,private val sink:IntakeReconciliationSink,
    private val store:IntakeSessionStore,private val sequence:HealthWriteSequence,
    private val access:suspend(WorkspaceOrigin,WorkspaceIdentity)->Unit,private val invalidateHourly:(HealthWriteType)->Unit={},private val now:()->Instant=Instant::now) {
    private suspend fun checked(origin:WorkspaceOrigin,identity:WorkspaceIdentity){
        currentCoroutineContext().ensureActive();access(origin,identity)
        require(transport.identity(origin)==identity){"Workspace account changed. Recheck the private connection."}
        access(origin,identity);currentCoroutineContext().ensureActive()
    }
    suspend fun review(origin:WorkspaceOrigin,identity:WorkspaceIdentity,selection:CorrectedIntakeSelection):ReviewedIntakeCorrection=sequence.exclusive {
        check(store.load()==null){"Resume or inspect the pending correction before starting another."};checked(origin,identity)
        val packet=transport.preview(origin,selection.json());val time=now();val preview=parseCorrectedIntakePreview(packet,time)
        require(preview.selection==selection){"The workspace returned another correction selection."}
        val plan=preview.nativePlan(origin,identity)?:error("This selection has no native updates or removals.")
        val inspection=inspectIntakeCorrection(plan,sink);checked(origin,identity)
        ReviewedIntakeCorrection(origin,identity,time,packet.toString(),inspection)
    }
    suspend fun confirm(reviewed:ReviewedIntakeCorrection):Int=sequence.correction(reviewed.inspection.review.minimumVersion){version->
        check(store.load()==null){"A correction is already pending."};checked(reviewed.origin,reviewed.identity)
        val preview=parseCorrectedIntakePreview(JSONObject(reviewed.packet),now());val plan=requireNotNull(preview.nativePlan(reviewed.origin,reviewed.identity))
        require(plan==reviewed.inspection.review.plan)
        val current=reviewIntakeCorrection(plan,sink);require(current.before==reviewed.inspection.review.before){"Phone records changed since review. Preview again."}
        val id=UUID.randomUUID().toString();val activation=JSONObject().put("selection",preview.selection.json()).put("reviewToken",preview.reviewToken)
            .put("save",JSONObject().put("operationId",id).put("scope",preview.saveScope).put("reviewToken",preview.reviewToken))
        store.save(IntakeCorrectionSession(reviewed.origin,reviewed.identity,reviewed.capturedAt,activation.toString(),reviewed.packet,
            IntakeCorrectionOperation(id,reviewed.inspection.review,version),reviewed.inspection.beforeDescriptions,false))
        complete(requireNotNull(store.load()))
    }
    suspend fun resume():Int {
        val captured=store.load()?:error("There is no pending correction.")
        return sequence.correction(captured.operation.review.minimumVersion,captured.operation.version){
            val current=store.load()?:error("The pending correction was already completed.")
            require(current.operation.id==captured.operation.id);complete(current)
        }
    }
    suspend fun discardUnwritten()=sequence.exclusive {
        val pending=store.load()?:error("There is no pending correction.")
        require(pending.operation.attemptedUpserts.isEmpty()&&pending.operation.attemptedRetirements.isEmpty()){ "Native changes were attempted. Keep this operation for recovery." }
        // This only forgets local intent. No native call was attempted, and any
        // server activation remains intact. An offline source need not block it.
        store.clear(pending.operation.id)
    }
    suspend fun reviewCurrentPhoneState():ReviewedIntakeRecovery=sequence.exclusive {
        val pending=store.load()?:error("There is no pending correction.")
        val inspection=inspectIntakeCorrection(pending.operation.review.plan,sink)
        require(store.load()==pending){"The pending correction changed. Inspect again."}
        ReviewedIntakeRecovery(pending,inspection)
    }
    suspend fun keepCurrentPhoneState(reviewed:ReviewedIntakeRecovery)=sequence.exclusive {
        require(store.load()==reviewed.session){"The pending correction changed. Review again."}
        val plan=reviewed.session.operation.review.plan
        require(reviewed.inspection.review.plan==plan)
        val current=inspectIntakeCorrection(plan,sink)
        require(current.review.before==reviewed.inspection.review.before){"Phone records changed since review. Review their current state again."}
        currentCoroutineContext().ensureActive()
        // This resolves local intent only, even when the former source is offline.
        // Invalidate hourly receipts before permitting another ordinary write.
        invalidateHourly(plan.type)
        store.keepCurrent(IntakeCorrectionResolution(reviewed.session,current.review.before,current.beforeDescriptions,now()))
    }
    private suspend fun complete(saved:IntakeCorrectionSession):Int {
        var session=saved;checked(session.origin,session.identity)
        parseCorrectedIntakePreview(JSONObject(session.previewPacket),now())
        if(!session.activated){
            val reply=transport.activate(session.origin,session.activationPacket);strictKeys(reply,setOf("plan","replayed","nativeWriteCompleted"))
            require(reply.get("replayed") is Boolean&&reply.get("nativeWriteCompleted")==false)
            val packet=reply.getJSONObject("plan");val committed=parseCorrectedIntakePreview(packet,now())
            require(!committed.activationRequired&&session.preview().sameReviewedActions(committed)){"Activation returned different actions. Keep the pending review; no native write was requested."}
            val newPlan=requireNotNull(committed.nativePlan(session.origin,session.identity))
            session=session.copy(previewPacket=packet.toString(),operation=session.operation.copy(review=session.operation.review.copy(plan=newPlan)),activated=true)
            store.save(session)
        }
        val captured=session
        suspend fun guard(){
            currentCoroutineContext().ensureActive();require(store.load()?.operation?.id==captured.operation.id){"Pending correction identity changed."}
            checked(captured.origin,captured.identity)
            val preview=parseCorrectedIntakePreview(JSONObject(captured.previewPacket),now())
            val reply=transport.verify(captured.origin,preview.selection.json(),preview.reviewToken)
            strictKeys(reply,setOf("valid","reviewToken","workspaceScope","nativeReviewRequired"))
            require(reply.get("valid")==true&&reply.get("nativeReviewRequired")==true&&reply.intakeText("reviewToken")==preview.reviewToken&&reply.intakeText("workspaceScope")==preview.workspaceScope){"The source review is no longer valid. Keep the pending correction for review."}
            currentCoroutineContext().ensureActive();access(captured.origin,captured.identity)
        }
        guard();invalidateHourly(captured.operation.review.plan.type)
        val journal=object:IntakeCorrectionJournal {
            override fun load():IntakeCorrectionOperation? {val current=store.load()?:return null;require(current.activated&&current.operation.id==captured.operation.id);return current.operation}
            override fun save(operation:IntakeCorrectionOperation){val current=store.load()?:error("Pending correction disappeared.");require(current.activated&&current.operation.id==operation.id);store.save(current.copy(operation=operation))}
            override fun finish(operationId:String)=store.clear(operationId)
        }
        return reconcileIntakeCorrection(captured.operation.review,sink,journal,captured.operation.id,captured.operation.version,::guard)
    }
}
