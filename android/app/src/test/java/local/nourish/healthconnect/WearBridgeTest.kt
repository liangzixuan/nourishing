package local.nourish.healthconnect

import java.io.File
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class WearBridgeTest {
    private val config=WearConfig(WorkspaceOrigin.parse("https://fixture.test.ts.net"),"owner@example.test","revision-1")
    private fun fixture()=JSONObject(File(requireNotNull(System.getProperty("nourish.wearFixture"))).readText())
    private val message:(WearReplyNotice)->String={"Translated ${it.name}"}
    @Test fun disabledAccessDoesNotFetchAndChangedConfigurationCannotPublish()=runBlocking {
        var called=false
        val disabled=readWearReply("kcal",{null},message){_,_->called=true;fixture()}
        assertEquals("unavailable",disabled.status);assertEquals("Translated DISABLED",disabled.message);assertFalse(called)
        var current:WearConfig?=config
        val reply=readWearReply("kcal",{current},message){_,_->current=null;fixture()};assertEquals("unavailable",reply.status);assertNull(reply.summary);assertEquals("Translated CHANGED",reply.message)
    }
    @Test fun verifiedAccountPublishesOnlyContractFacts()=runBlocking {
        val reply=readWearReply("kcal",{config},message){_,_->fixture().put("privateUnexpectedField","DO_NOT_FORWARD")}
        assertEquals("connected",reply.status);assertEquals("100 kcal",reply.summary!!.energy.rows[0].value)
        assertFalse(reply.bytes().toString(Charsets.UTF_8).contains("DO_NOT_FORWARD"))
        try{readWearReply("kcal",{config},message){_,_->fixture().also{it.getJSONObject("access").put("login","different@example.test")}};fail("Changed account was accepted")}catch(_:IllegalArgumentException){}
        try{readWearReply("kJ",{config},message){_,_->fixture()};fail("Wrong units were accepted")}catch(_:IllegalArgumentException){}
    }
}
