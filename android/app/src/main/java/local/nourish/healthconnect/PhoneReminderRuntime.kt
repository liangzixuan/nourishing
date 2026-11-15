package local.nourish.healthconnect

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/** UI, Firebase callbacks and WorkManager share this instance and its mutation lock. */
class PhoneReminderRuntime internal constructor(context:Context,private val firebase:PhoneReminderFirebase=AndroidPhoneReminderFirebase(context),backend:PhoneReminderBackend=PrivatePhoneReminderBackend(),private val schedule:()->Unit={enqueuePhoneReminderWork(context)}) {
    private val context=context.applicationContext
    private val store=PhoneReminderStore(this.context)
    private val notifications=PhoneReminderNotifications(this.context)
    private val coordinator=PhoneReminderCoordinator(NourishingWorkspace.policy.origin,store,backend,firebase,notifications::allowed,::enqueuePending)
    fun enqueuePending(){if(NourishingWorkspace.cloudOrigin==null&&store.read().hasWork())schedule()}
    fun registered(installationId:String){store.savePendingInstallationId(installationId,firebase.projectId);enqueuePending()}
    suspend fun connect(label:String):PhoneReminderSync=withContext(Dispatchers.IO){coordinator.connect(label.trim())}
    fun requestDisconnect(){coordinator.requestDisconnect();notifications.clearDisplayed()}
    suspend fun finishDisconnect():PhoneReminderSync=withContext(Dispatchers.IO){coordinator.finishDisconnect()}
    suspend fun disconnect():PhoneReminderSync=withContext(Dispatchers.IO){requestDisconnect();coordinator.finishDisconnect()}
    suspend fun sync():PhoneReminderSync=withContext(Dispatchers.IO){coordinator.sync()}
    fun status():JSONObject {
        val project=firebase.projectId;val allowed=notifications.allowed()
        val state=runCatching{store.read()}.getOrElse{return JSONObject().put("configured",project!=null).put("projectId",project?:JSONObject.NULL).put("allowed",allowed).put("enabled",false).put("connected",false).put("pending",false).put("canDisconnect",false).put("issue","protocol")}
        val issue=state.issue?.name?.lowercase()?:when{project==null->"not_configured";state.enabled&&!allowed->"permission";state.enabled&&project!=state.desired?.projectId->"project";else->null}
        return JSONObject().put("configured",project!=null).put("projectId",project?:JSONObject.NULL).put("allowed",allowed).put("enabled",state.enabled).put("connected",allowed&&issue==null&&state.deliveryBinding()!=null).put("pending",state.hasWork()).put("canDisconnect",state.enabled||state.desired!=null||state.binding!=null||state.pending!=null||state.unregisterPending).put("issue",issue?:JSONObject.NULL)
    }
    companion object {
        @Volatile private var instance:PhoneReminderRuntime?=null
        fun get(context:Context):PhoneReminderRuntime=instance?:synchronized(this){instance?:PhoneReminderRuntime(context.applicationContext).also{instance=it}}
    }
}
