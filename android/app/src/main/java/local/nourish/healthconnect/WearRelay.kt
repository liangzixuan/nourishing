package local.nourish.healthconnect

import kotlinx.coroutines.CancellationException
import local.nourish.wearcontract.*
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

data class WearRelayRun(val config:WearConfig,val token:String)
data class WearRegistration(val deviceId:String,val revision:String,val kinds:Set<String>){
    init{
        require(Regex("[a-f0-9]{64}").matches(deviceId))
        val uuid=UUID.fromString(revision);require(uuid.toString()==revision&&uuid.version()==4&&uuid.variant()==2)
        require(kinds.all{it in setOf("food","fasting")})
    }
    fun json()=JSONObject().put("deviceId",deviceId).put("revision",revision).put("kinds",JSONArray(kinds.sorted()))
}
interface WearRelayRegistrations{
    fun clientId(config:WearConfig,node:String):String
    fun load(config:WearConfig,node:String):WearRegistration?
    fun save(config:WearConfig,node:String,value:WearRegistration)
}
interface WearRelayWorkspace{
    suspend fun identity(config:WearConfig):WorkspaceIdentity
    suspend fun post(config:WearConfig,operation:String,input:JSONObject):JSONObject
}
class PrivateWearRelayWorkspace(private val client:WorkspaceClient=WorkspaceClient()):WearRelayWorkspace{
    override suspend fun identity(config:WearConfig)=client.identity(config.origin)
    override suspend fun post(config:WearConfig,operation:String,input:JSONObject):JSONObject{
        require(operation in setOf("register","claim","ack"))
        return client.exchange(config.origin,"/api/wear-reminders/$operation",json=input)
    }
}
data class WearRelayResult(val consent:Boolean,val paused:Boolean=false,val accepted:Int=0,val rejected:Int=0,val unknown:Int=0)

/** The PC owns due events. This cycle transports each reserved event at most once. */
class WearRelayCycle(
    private val current:()->WearRelayRun?,
    private val workspace:WearRelayWorkspace,
    private val registrations:WearRelayRegistrations,
    private val request:suspend(node:String,path:String,bytes:ByteArray)->ByteArray
){
    private fun check(run:WearRelayRun){if(current()!=run)throw CancellationException("Watch relay stopped or changed.")}
    private suspend fun post(run:WearRelayRun,operation:String,input:JSONObject):JSONObject{
        check(run);val result=workspace.post(run.config,operation,input);check(run)
        require(result.get("version")==1);requireWearAccount(result,run.config);return result
    }
    suspend fun deliver(run:WearRelayRun,node:String):WearRelayResult{
        check(run);val identity=workspace.identity(run.config);check(run)
        require(identity.login==run.config.login){"The private workspace account changed. Check watch access again."}
        val stateBytes=request(node,WATCH_ALERT_STATE_PATH,alertStateRequest(run.config.revision));check(run)
        val state=WatchAlertState.parse(stateBytes)
        if(state.phoneRevision==null)return WearRelayResult(false)
        require(state.phoneRevision==run.config.revision){"Reconnect this watch to the current phone account."}
        if(state.kinds.isEmpty())return WearRelayResult(false)
        val previous=registrations.load(run.config,node)
        val registration=JSONObject().put("clientId",registrations.clientId(run.config,node)).put("label","My Nourish watch").put("kinds",JSONArray(state.kinds.sorted()))
        previous?.let{registration.put("previousRevision",it.revision)}
        val response=post(run,"register",registration)
        val registered=WearRegistration(response.getString("deviceId"),response.getString("revision"),state.kinds)
        if(previous!=null){
            require(previous.deviceId==registered.deviceId){"The watch registration changed. Reconnect it explicitly."}
            if(previous.kinds==registered.kinds)require(previous.revision==registered.revision){"The watch registration was replaced. Reconnect it explicitly."}
        }
        registrations.save(run.config,node,registered)
        fun binding()=JSONObject().put("deviceId",registered.deviceId).put("revision",registered.revision)
        val batch=WatchReminderBatch.parse(post(run,"claim",binding().put("kinds",JSONArray(state.kinds.sorted()))))
        require(batch.events.all{it.kind in state.kinds}){"The workspace returned an unselected alert type."}
        var accepted=0;var rejected=0;var unknown=0
        for(event in batch.events){
            check(run)
            val packet=WatchAlertDelivery(run.config.revision,requireNotNull(state.preferenceRevision),batch.asOf,event)
            val outcome=try{
                val bytes=request(node,WATCH_ALERT_DELIVERY_PATH,packet.bytes());check(run)
                val receipt=WatchAlertReceipt.parse(bytes);require(receipt.id==event.id);receipt.outcome
            }catch(error:CancellationException){throw error}catch(_:Exception){"unknown"}
            check(run)
            val acknowledgement=post(run,"ack",binding().put("id",event.id).put("outcome",outcome))
            require(acknowledgement.getString("id")==event.id&&acknowledgement.getString("outcome")==outcome){"The workspace did not confirm this delivery outcome."}
            when(outcome){"accepted"->accepted++;"rejected"->rejected++;else->unknown++}
        }
        return WearRelayResult(true,batch.paused,accepted,rejected,unknown)
    }
}
