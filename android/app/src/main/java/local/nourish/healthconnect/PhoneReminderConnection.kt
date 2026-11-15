package local.nourish.healthconnect

import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject

internal fun JSONObject.reminderString(key:String):String=get(key) as? String ?: throw IllegalArgumentException("Invalid reminder field: $key")

data class PhoneReminderBinding(val origin:WorkspaceOrigin,val login:String,val projectId:String,val deviceId:String,val revision:String,val installationId:String,val label:String) {
    init {
        require(login.isNotBlank()&&login.length<=320)
        require(Regex("[a-z][a-z0-9-]{4,28}[a-z0-9]").matches(projectId))
        require(Regex("[a-f0-9]{64}").matches(deviceId))
        val uuid=UUID.fromString(revision);require(uuid.toString()==revision&&uuid.version()==4&&uuid.variant()==2)
        require(installationId.length in 1..8192&&installationId.all{it.code in 33..126})
        require(label.isNotBlank()&&label.length<=80)
    }
    fun json()=JSONObject().put("origin",origin.value).put("login",login).put("projectId",projectId).put("deviceId",deviceId).put("revision",revision).put("installationId",installationId).put("label",label)
    companion object {
        fun parse(value:JSONObject):PhoneReminderBinding {
            require(value.keys().asSequence().toSet()==setOf("origin","login","projectId","deviceId","revision","installationId","label"))
            return PhoneReminderBinding(WorkspaceOrigin.parse(value.reminderString("origin")),value.reminderString("login"),value.reminderString("projectId"),value.reminderString("deviceId"),value.reminderString("revision"),value.reminderString("installationId"),value.reminderString("label"))
        }
    }
}

data class PhoneReminderAuthority(val origin:WorkspaceOrigin,val login:String,val projectId:String,val label:String) {
    init {require(login.isNotBlank()&&login.length<=320);require(Regex("[a-z][a-z0-9-]{4,28}[a-z0-9]").matches(projectId));require(label.isNotBlank()&&label.length<=80)}
    fun json()=JSONObject().put("origin",origin.value).put("login",login).put("projectId",projectId).put("label",label)
    companion object {fun parse(value:JSONObject):PhoneReminderAuthority {require(value.keys().asSequence().toSet()==setOf("origin","login","projectId","label"));return PhoneReminderAuthority(WorkspaceOrigin.parse(value.reminderString("origin")),value.reminderString("login"),value.reminderString("projectId"),value.reminderString("label"))}}
}
val PhoneReminderBinding.authority get()=PhoneReminderAuthority(origin,login,projectId,label)
enum class PhoneReminderIssue { PERMISSION,NOT_CONFIGURED,PROJECT,ACCOUNT,CHANGED,PROTOCOL }
class PhoneReminderFailure(val issue:PhoneReminderIssue):Exception(issue.name.lowercase())
enum class PhoneReminderSync { COMPLETE,RETRY,ATTENTION }

sealed interface PhoneReminderChange {
    val authority:PhoneReminderAuthority
    data class Register(override val authority:PhoneReminderAuthority,val installationId:String,val previousRevision:String?):PhoneReminderChange {
        init {require(installationId.length in 1..8192&&installationId.all{it.code in 33..126});previousRevision?.let{val id=java.util.UUID.fromString(it);require(id.toString()==it&&id.version()==4&&id.variant()==2)}}
    }
    data class Disconnect(val binding:PhoneReminderBinding):PhoneReminderChange {override val authority get()=binding.authority}
    fun json():JSONObject=when(this){
        is Register->JSONObject().put("kind","register").put("authority",authority.json()).put("installationId",installationId).put("previousRevision",previousRevision?:JSONObject.NULL)
        is Disconnect->JSONObject().put("kind","disconnect").put("binding",binding.json())
    }
    companion object {
        fun parse(value:JSONObject):PhoneReminderChange=when(value.reminderString("kind")){
            "register"->{require(value.keys().asSequence().toSet()==setOf("kind","authority","installationId","previousRevision"));Register(PhoneReminderAuthority.parse(value.getJSONObject("authority")),value.reminderString("installationId"),if(value.isNull("previousRevision"))null else value.reminderString("previousRevision"))}
            "disconnect"->{require(value.keys().asSequence().toSet()==setOf("kind","binding"));Disconnect(PhoneReminderBinding.parse(value.getJSONObject("binding")))}
            else->error("Invalid phone reminder mutation")
        }
    }
}

data class PhoneReminderState(val clientId:String,val enabled:Boolean=false,val desired:PhoneReminderAuthority?=null,val binding:PhoneReminderBinding?=null,val pending:PhoneReminderChange?=null,val pendingInstallationId:String?=null,val issue:PhoneReminderIssue?=null,val unregisterPending:Boolean=false,val choice:Long=0) {
    init {
        require(Regex("[a-f0-9]{64}").matches(clientId));require(!enabled||desired!=null);require(choice>=0)
        require(pending !is PhoneReminderChange.Disconnect||!enabled)
        pendingInstallationId?.let{require(it.length in 1..8192&&it.all{char->char.code in 33..126})}
    }
    fun deliveryBinding():PhoneReminderBinding?=binding?.takeIf{enabled&&issue==null&&pending==null&&it.authority==desired&&(pendingInstallationId==null||pendingInstallationId==it.installationId)}
    fun hasWork():Boolean=issue==null&&(pending!=null||if(enabled)binding==null||pendingInstallationId!=null else binding!=null||unregisterPending)
    fun json()=JSONObject().put("version",1).put("clientId",clientId).put("enabled",enabled).put("desired",desired?.json()?:JSONObject.NULL).put("binding",binding?.json()?:JSONObject.NULL).put("pending",pending?.json()?:JSONObject.NULL).put("pendingInstallationId",pendingInstallationId?:JSONObject.NULL).put("issue",issue?.name?:JSONObject.NULL).put("unregisterPending",unregisterPending).put("choice",choice)
    companion object {
        fun parse(value:JSONObject):PhoneReminderState {
            require(value.keys().asSequence().toSet()==setOf("version","clientId","enabled","desired","binding","pending","pendingInstallationId","issue","unregisterPending","choice"));require(value.get("version")==1)
            require(value.get("enabled") is Boolean&&value.get("unregisterPending") is Boolean)
            val choice=value.get("choice");require(choice is Long||choice is Int)
            return PhoneReminderState(value.reminderString("clientId"),value.getBoolean("enabled"),if(value.isNull("desired"))null else PhoneReminderAuthority.parse(value.getJSONObject("desired")),if(value.isNull("binding"))null else PhoneReminderBinding.parse(value.getJSONObject("binding")),if(value.isNull("pending"))null else PhoneReminderChange.parse(value.getJSONObject("pending")),if(value.isNull("pendingInstallationId"))null else value.reminderString("pendingInstallationId"),if(value.isNull("issue"))null else PhoneReminderIssue.valueOf(value.reminderString("issue")),value.getBoolean("unregisterPending"),(choice as Number).toLong())
        }
    }
}
interface PhoneReminderStateStore {
    fun read():PhoneReminderState
    fun update(change:(PhoneReminderState)->PhoneReminderState):PhoneReminderState
}
data class PhoneReminderInspection(val projectId:String?,val binding:PhoneReminderBinding?)
interface PhoneReminderBackend {
    suspend fun identity(origin:WorkspaceOrigin):String
    suspend fun inspect(clientId:String,authority:PhoneReminderAuthority):PhoneReminderInspection
    suspend fun register(clientId:String,change:PhoneReminderChange.Register):PhoneReminderBinding
    suspend fun disconnect(binding:PhoneReminderBinding)
}
interface PhoneReminderFirebase {
    val projectId:String?
    fun autoInitialize(enabled:Boolean)
    suspend fun register():String
    suspend fun unregister()
}

/** One mutation owner for UI and background work. Only explicit actions inspect
 * remote state; background retries retain the exact persisted request/revision. */
class PhoneReminderCoordinator(private val origin:WorkspaceOrigin,private val store:PhoneReminderStateStore,private val backend:PhoneReminderBackend,private val firebase:PhoneReminderFirebase,private val permitted:()->Boolean,private val enqueue:()->Unit,private val mutex:Mutex=Mutex()) {
    private suspend fun requireAccount(authority:PhoneReminderAuthority){if(backend.identity(authority.origin)!=authority.login)throw PhoneReminderFailure(PhoneReminderIssue.ACCOUNT)}
    private fun changed(change:(PhoneReminderState)->PhoneReminderState){store.update(change);enqueue()}
    fun requestDisconnect(){changed{it.copy(enabled=false,pendingInstallationId=null,choice=Math.addExact(it.choice,1))};firebase.autoInitialize(false)}
    suspend fun connect(label:String):PhoneReminderSync=mutex.withLock {
        val choice=store.read().choice
        if(!permitted())throw PhoneReminderFailure(PhoneReminderIssue.PERMISSION)
        val project=firebase.projectId?:throw PhoneReminderFailure(PhoneReminderIssue.NOT_CONFIGURED)
        val login=backend.identity(origin);val old=store.read()
        if(old.desired?.let{it.origin!=origin||it.login!=login}==true)throw PhoneReminderFailure(PhoneReminderIssue.ACCOUNT)
        val authority=PhoneReminderAuthority(origin,login,project,label)
        // A reconnect first finishes the previous explicit disconnect. It must
        // acquire a new server revision even when the Firebase ID is unchanged.
        if(!old.enabled&&old.desired!=null){
            val result=reconcileDisconnect(old.desired)
            if(result!=PhoneReminderSync.COMPLETE)return@withLock result
        }
        val inspected=backend.inspect(store.read().clientId,authority)
        if(inspected.projectId!=project)throw PhoneReminderFailure(PhoneReminderIssue.PROJECT)
        val current=store.update{if(it.choice==choice)it.copy(enabled=true,desired=authority,binding=inspected.binding,pending=null,pendingInstallationId=null,issue=null,unregisterPending=true)else it};enqueue()
        if(current.choice!=choice)return@withLock syncLocked()
        try{
            if(store.read().enabled){firebase.autoInitialize(true);val id=firebase.register();store.update{if(it.enabled)it.copy(pendingInstallationId=id)else it}}
            syncLocked()
        }catch(error:CancellationException){throw error}catch(error:PhoneReminderFailure){attention(error.issue)}catch(_:IOException){PhoneReminderSync.RETRY}
    }
    suspend fun disconnect():PhoneReminderSync {
        requestDisconnect()
        return finishDisconnect()
    }
    suspend fun finishDisconnect():PhoneReminderSync {
        return mutex.withLock {
            // A newer explicit Connect owns the current connection.
            if(store.read().enabled)return@withLock PhoneReminderSync.COMPLETE
            store.read().desired?.let{reconcileDisconnect(it)}?:syncLocked()
        }
    }
    private suspend fun reconcileDisconnect(authority:PhoneReminderAuthority):PhoneReminderSync {return try{
        if(store.read().pending!=null&&store.read().issue==null){
            val outcome=syncLocked();if(outcome!=PhoneReminderSync.ATTENTION)return outcome
        }
        requireAccount(authority)
        val inspected=backend.inspect(store.read().clientId,authority)
        changed{it.copy(enabled=false,binding=inspected.binding,pending=null,pendingInstallationId=null,issue=null)}
        syncLocked()
    }catch(error:CancellationException){throw error}catch(error:PhoneReminderFailure){attention(error.issue)}catch(_:IOException){PhoneReminderSync.RETRY}}
    suspend fun sync():PhoneReminderSync=mutex.withLock {syncLocked()}
    private fun attention(issue:PhoneReminderIssue):PhoneReminderSync {store.update{it.copy(enabled=false,issue=issue)};firebase.autoInitialize(false);return PhoneReminderSync.ATTENTION}
    private suspend fun execute(change:PhoneReminderChange){
        requireAccount(change.authority)
        when(change){
            is PhoneReminderChange.Register->{
                val binding=backend.register(store.read().clientId,change)
                if(binding.authority!=change.authority||binding.installationId!=change.installationId)throw PhoneReminderFailure(PhoneReminderIssue.PROTOCOL)
                store.update{check(it.pending==change);it.copy(binding=binding,pending=null,pendingInstallationId=if(it.pendingInstallationId==change.installationId)null else it.pendingInstallationId)}
            }
            is PhoneReminderChange.Disconnect->{backend.disconnect(change.binding);store.update{check(it.pending==change);it.copy(binding=null,pending=null)}}
        }
    }
    private suspend fun syncLocked():PhoneReminderSync {return try {
        if(store.read().issue!=null)return PhoneReminderSync.ATTENTION
        if(store.read().enabled){
            if(!permitted())throw PhoneReminderFailure(PhoneReminderIssue.PERMISSION)
            if(firebase.projectId!=store.read().desired?.projectId)throw PhoneReminderFailure(PhoneReminderIssue.PROJECT)
        }
        store.read().pending?.let{execute(it)}
        var state=store.read()
        if(!state.enabled){
            firebase.autoInitialize(false)
            state.binding?.let{val change=PhoneReminderChange.Disconnect(it);store.update{current->current.copy(pending=change)};execute(change)}
            state=store.read()
            if(state.unregisterPending){if(firebase.projectId==state.desired?.projectId)firebase.unregister();store.update{it.copy(unregisterPending=false)}}
            store.update{it.copy(desired=null,pendingInstallationId=null)}
        }else{
            if(firebase.projectId!=state.desired?.projectId)throw PhoneReminderFailure(PhoneReminderIssue.PROJECT)
            if(state.pendingInstallationId==null&&state.binding==null){firebase.autoInitialize(true);val id=firebase.register();store.update{if(it.enabled)it.copy(pendingInstallationId=id,unregisterPending=true)else it}}
            state=store.read()
            val id=state.pendingInstallationId
            if(state.enabled&&id!=null){
                if(state.binding?.installationId==id&&state.binding?.authority==state.desired)store.update{if(it.pendingInstallationId==id)it.copy(pendingInstallationId=null)else it}
                else {val change=PhoneReminderChange.Register(requireNotNull(state.desired),id,state.binding?.revision);store.update{it.copy(pending=change)};execute(change)}
            }
        }
        val remaining=store.read()
        if(!remaining.enabled&&remaining.hasWork())syncLocked() else if(remaining.hasWork())PhoneReminderSync.RETRY else PhoneReminderSync.COMPLETE
    }catch(error:CancellationException){throw error}catch(error:PhoneReminderFailure){attention(error.issue)}catch(_:IOException){PhoneReminderSync.RETRY}}
}
