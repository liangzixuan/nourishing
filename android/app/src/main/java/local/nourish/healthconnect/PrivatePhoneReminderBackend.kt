package local.nourish.healthconnect

import java.security.MessageDigest
import kotlinx.coroutines.CancellationException
import org.json.JSONException
import org.json.JSONObject

/** Native requests retain WorkspaceClient's TLS, account, size and no-replay rules. */
class PrivatePhoneReminderBackend(private val client:WorkspaceClient=WorkspaceClient()):PhoneReminderBackend {
    override suspend fun identity(origin:WorkspaceOrigin):String=checked{client.identity(origin).login}

    override suspend fun inspect(clientId:String,authority:PhoneReminderAuthority):PhoneReminderInspection=checked {
        val reply=post(authority,"inspect",JSONObject().put("clientId",clientId),setOf("projectId","registration"))
        val project=if(reply.isNull("projectId"))null else reply.reminderString("projectId").also{require(Regex("[a-z][a-z0-9-]{4,28}[a-z0-9]").matches(it))}
        val binding=if(reply.isNull("registration"))null else reply.getJSONObject("registration").let{ row ->
            keys(row,setOf("deviceId","revision","projectId","installationId","label"))
            PhoneReminderBinding(authority.origin,authority.login,row.reminderString("projectId"),row.reminderString("deviceId"),row.reminderString("revision"),row.reminderString("installationId"),row.reminderString("label")).also{require(it.deviceId==deviceId(authority.origin,clientId))}
        }
        PhoneReminderInspection(project,binding)
    }
    override suspend fun register(clientId:String,change:PhoneReminderChange.Register):PhoneReminderBinding=checked {
        val authority=change.authority
        val input=JSONObject().put("clientId",clientId).put("projectId",authority.projectId).put("installationId",change.installationId).put("label",authority.label)
        change.previousRevision?.let{input.put("previousRevision",it)}
        val reply=post(authority,"register",input,setOf("deviceId","revision"))
        PhoneReminderBinding(authority.origin,authority.login,authority.projectId,reply.reminderString("deviceId"),reply.reminderString("revision"),change.installationId,authority.label).also{require(it.deviceId==deviceId(authority.origin,clientId))}
    }
    override suspend fun disconnect(binding:PhoneReminderBinding){checked {
        val reply=post(binding.authority,"disconnect",JSONObject().put("deviceId",binding.deviceId).put("revision",binding.revision),setOf("disconnected"))
        require(reply.get("disconnected")==true)
    }}
    private suspend fun post(authority:PhoneReminderAuthority,operation:String,input:JSONObject,fields:Set<String>):JSONObject {
        val reply=client.exchange(authority.origin,"/api/android-reminders/"+operation,json=input)
        keys(reply,fields+setOf("version","access"));require(reply.get("version")==1)
        val access=reply.getJSONObject("access");keys(access,setOf("mode","origin","login"))
        if(access.reminderString("mode")!="private"||access.reminderString("origin")!=authority.origin.value||access.reminderString("login")!=authority.login)throw PhoneReminderFailure(PhoneReminderIssue.ACCOUNT)
        return reply
    }
    private fun keys(value:JSONObject,expected:Set<String>){require(value.keys().asSequence().toSet()==expected)}
    private fun deviceId(origin:WorkspaceOrigin,clientId:String):String {
        require(Regex("[a-f0-9]{64}").matches(clientId))
        return MessageDigest.getInstance("SHA-256").digest((origin.value+'\u0000'+"android-fcm"+'\u0000'+clientId).toByteArray(Charsets.UTF_8)).joinToString(""){"%02x".format(it)}
    }
    private suspend fun <T> checked(operation:suspend()->T):T=try{operation()}
    catch(error:CancellationException){throw error}
    catch(error:WorkspaceTransferFailure){
        val issue=when {
            error.httpStatus in setOf(401,403)->PhoneReminderIssue.ACCOUNT
            error.httpStatus==409->PhoneReminderIssue.CHANGED
            error.httpStatus!=null&&error.httpStatus in 300..499->PhoneReminderIssue.PROTOCOL
            error.code in setOf(WorkspaceError.RESPONSE_LARGE,WorkspaceError.INVALID_SUMMARY,WorkspaceError.RESPONSE_UNREADABLE,WorkspaceError.REDIRECT)->PhoneReminderIssue.PROTOCOL
            else->null
        }
        if(issue!=null)throw PhoneReminderFailure(issue) else throw error
    }
    catch(_:JSONException){throw PhoneReminderFailure(PhoneReminderIssue.PROTOCOL)}
    catch(_:IllegalArgumentException){throw PhoneReminderFailure(PhoneReminderIssue.PROTOCOL)}
}
