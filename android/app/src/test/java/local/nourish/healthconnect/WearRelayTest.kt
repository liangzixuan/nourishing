package local.nourish.healthconnect

import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import local.nourish.wearcontract.*
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class WearRelayTest {
    private val config=WearConfig(WorkspaceOrigin.parse("https://fixture.test.ts.net"),"owner@example.test","00000000-0000-4000-8000-000000000001")
    private val revision="00000000-0000-4000-8000-000000000002"
    private val choice="00000000-0000-4000-8000-000000000003"
    private fun fixture()=JSONObject(File(System.getProperty("nourish.wearReminderFixture")).readText())
    private inner class Harness {
        val run=WearRelayRun(config,"run")
        var current:WearRelayRun?=run
        var login=config.login
        var stored:WearRegistration?=null
        val requests=mutableListOf<String>()
        val posts=mutableListOf<Pair<String,JSONObject>>()
        var state=WatchAlertState(config.revision,choice,setOf("food"))
        var onState:()->Unit={}
        var onClaim:()->Unit={}
        var onDelivery:()->Unit={}
        var receiptId:String?=null
        var registerError:Exception?=null
        var responseLogin=config.login
        var serverRevision=revision
        val registrations=object:WearRelayRegistrations{
            override fun clientId(config:WearConfig,node:String)="a".repeat(64)
            override fun load(config:WearConfig,node:String)=stored
            override fun save(config:WearConfig,node:String,value:WearRegistration){stored=value}
        }
        val workspace=object:WearRelayWorkspace{
            override suspend fun identity(config:WearConfig)=WorkspaceIdentity(login)
            override suspend fun post(config:WearConfig,operation:String,input:JSONObject):JSONObject{
                posts.add(operation to input)
                val result=when(operation){
                    "register"->{registerError?.let{throw it};JSONObject().put("deviceId","b".repeat(64)).put("revision",serverRevision)}
                    "claim"->{onClaim();fixture()}
                    "ack"->JSONObject().put("id",input.getString("id")).put("outcome",input.getString("outcome"))
                    else->error("Unexpected operation")
                }
                return result.put("version",1).put("access",JSONObject().put("mode","private").put("origin",config.origin.value).put("login",responseLogin))
            }
        }
        val cycle=WearRelayCycle({current},workspace,registrations){_,path,bytes->
            requests.add(path)
            when(path){
                WATCH_ALERT_STATE_PATH->{assertEquals(config.revision,parseAlertStateRequest(bytes));onState();state.bytes()}
                WATCH_ALERT_DELIVERY_PATH->{val packet=WatchAlertDelivery.parse(bytes);onDelivery();WatchAlertReceipt(receiptId?:packet.event.id,"accepted","posted").bytes()}
                else->error("Unexpected watch path")
            }
        }
    }
    @Test fun verifiedAccountClaimsGenericEventsAndAcknowledgesMatchingReceipt()=runBlocking{
        val h=Harness();val result=h.cycle.deliver(h.run,"watch")
        assertEquals(1,result.accepted);assertEquals(listOf("register","claim","ack"),h.posts.map{it.first})
        assertEquals(setOf("food"),h.stored!!.kinds);assertEquals("accepted",h.posts.last().second.getString("outcome"))
        assertFalse(h.posts[0].second.has("previousRevision"))
        h.posts.clear();h.cycle.deliver(h.run,"watch");assertEquals(revision,h.posts.first().second.getString("previousRevision"))
    }
    @Test fun noConsentAndWrongPhoneRevisionNeverRegister()=runBlocking{
        for(state in listOf(WatchAlertState.unavailable(),WatchAlertState(config.revision,choice,emptySet()),WatchAlertState(revision,choice,setOf("food")))){
            val h=Harness();h.state=state
            runCatching{h.cycle.deliver(h.run,"watch")};assertTrue(h.posts.isEmpty())
        }
    }
    @Test fun wrongAccountAndChangedResponseAccountNeverDeliver()=runBlocking{
        val before=Harness();before.login="someone@example.test"
        try{before.cycle.deliver(before.run,"watch");fail()}catch(_:IllegalArgumentException){}
        assertTrue(before.posts.isEmpty());assertTrue(before.requests.isEmpty())
        val after=Harness();after.responseLogin="someone@example.test"
        try{after.cycle.deliver(after.run,"watch");fail()}catch(_:IllegalArgumentException){}
        assertEquals(listOf("register"),after.posts.map{it.first});assertFalse(after.requests.contains(WATCH_ALERT_DELIVERY_PATH))
    }
    @Test fun stoppingAfterStateOrClaimPreventsFurtherRequests()=runBlocking{
        for(stage in listOf("state","claim")){
            val h=Harness();if(stage=="state")h.onState={h.current=null} else h.onClaim={h.current=null}
            try{h.cycle.deliver(h.run,"watch");fail()}catch(_:CancellationException){}
            assertFalse(h.requests.contains(WATCH_ALERT_DELIVERY_PATH));assertFalse(h.posts.any{it.first=="ack"})
        }
    }
    @Test fun removedOrReplacedRegistrationsAreNotSilentlyRecreated()=runBlocking{
        val removed=Harness();removed.stored=WearRegistration("b".repeat(64),revision,setOf("food"));removed.registerError=WorkspaceTransferFailure("Removed",httpStatus=409)
        try{removed.cycle.deliver(removed.run,"watch");fail()}catch(_:WorkspaceTransferFailure){}
        assertEquals(1,removed.posts.size);assertEquals(revision,removed.posts.single().second.getString("previousRevision"))
        val replaced=Harness();replaced.stored=WearRegistration("b".repeat(64),revision,setOf("food"));replaced.serverRevision=choice
        try{replaced.cycle.deliver(replaced.run,"watch");fail()}catch(_:IllegalArgumentException){}
        assertEquals(listOf("register"),replaced.posts.map{it.first});assertEquals(revision,replaced.stored!!.revision)
    }
    @Test fun lostOrMismatchedWatchReceiptIsUnknownAndNeverRetried()=runBlocking{
        for(mismatch in listOf(false,true)){
            val h=Harness();if(mismatch)h.receiptId="d".repeat(64) else h.onDelivery={throw java.io.IOException("Disconnected")}
            val result=h.cycle.deliver(h.run,"watch");assertEquals(1,result.unknown)
            assertEquals("unknown",h.posts.last().second.getString("outcome"));assertEquals(1,h.requests.count{it==WATCH_ALERT_DELIVERY_PATH})
        }
    }
    @Test fun aNewRunCannotFinishTheOldRunsDelivery()=runBlocking{
        val h=Harness();h.onDelivery={h.current=h.run.copy(token="replacement")}
        try{h.cycle.deliver(h.run,"watch");fail()}catch(_:CancellationException){}
        assertEquals(listOf("register","claim"),h.posts.map{it.first})
    }
    @Test fun categoryChangeUsesCurrentRegistrationRevision()=runBlocking{
        val h=Harness();h.stored=WearRegistration("b".repeat(64),choice,setOf("fasting"))
        h.cycle.deliver(h.run,"watch");assertEquals(choice,h.posts.first().second.getString("previousRevision"));assertEquals(setOf("food"),h.stored!!.kinds)
    }
}
