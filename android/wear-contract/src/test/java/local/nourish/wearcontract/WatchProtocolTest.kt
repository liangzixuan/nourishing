package local.nourish.wearcontract

import java.io.File
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class WatchProtocolTest {
    private fun fixture()=JSONObject(File(requireNotNull(System.getProperty("nourish.wearFixture"))).readText())
    @Test fun translatedServerFactsSurvivePhoneAndWatchTransferWithoutReinterpretation(){
        val packets=org.json.JSONArray(File(requireNotNull(System.getProperty("nourish.wearLanguageFixtures"))).readText())
        assertEquals(4,packets.length())
        val languages=mutableSetOf<String>()
        for(index in 0 until packets.length()){
            val packet=packets.getJSONObject(index);val language=packet.getString("language");assertTrue(languages.add(language))
            for(kind in listOf("known","partial")){
                val source=packet.getJSONObject(kind);val parsed=WatchSummary.parse(source)
                val expected=if(kind=="known")if(language=="en")"100.5 kcal" else "100,5 kcal" else if(language=="en")"≥ 420.5 kJ" else "≥ 420,5 kJ"
                assertEquals(expected,parsed.energy.rows[0].value);assertEquals(if(kind=="known")"complete" else "partial",parsed.energy.rows[0].status)
                assertEquals("unknown",parsed.energy.rows[1].status)
                assertEquals(source.getJSONObject("energy").getJSONArray("rows").getJSONObject(0).getString("title"),parsed.energy.rows[0].title)
                assertEquals(source.getJSONArray("attributions").getString(0),parsed.attributions.single())
                assertEquals(parsed,WatchReply.parse(WatchReply.connected("revision-language",parsed).bytes()).summary)
            }
        }
        assertEquals(setOf("en","fr","de","pt-BR"),languages)
    }
    @Test fun serverFixtureRetainsUnknownsAndStripsAccountBeforeWatchTransfer() {
        val parsed=WatchSummary.parse(fixture())
        assertEquals("2026-11-03",parsed.date.toString())
        assertEquals("100 kcal",parsed.energy.rows[0].value)
        assertEquals("Unknown",parsed.energy.rows[1].value)
        val packet=WatchReply.connected("revision-1",parsed).bytes()
        assertFalse(packet.toString(Charsets.UTF_8).contains("owner@example.test"))
        assertEquals(parsed,WatchReply.parse(packet).summary)
        assertEquals(fixture().getJSONArray("attributions").getString(0),parsed.attributions.single())
        assertEquals(parsed.attributions,WatchSummary.parse(parsed.json()).attributions)
    }
    @Test fun invalidClockUnitVisibilityAndDuplicatesAreRejected() {
        fun reject(edit:(JSONObject)->Unit){val json=fixture();edit(json);assertThrows(IllegalArgumentException::class.java){WatchSummary.parse(json)}}
        reject{it.put("version",1)};reject{it.put("unit","cal")}
        reject{it.getJSONObject("calendar").put("today","2026-11-04")}
        reject{it.getJSONObject("scores").put("visible",false)}
        reject{val rows=it.getJSONObject("energy").getJSONArray("rows");rows.put(rows.getJSONObject(0))}
    }
    @Test fun requestsCannotChooseDestinationOrUnsupportedUnits() {
        assertEquals("kJ",parseWatchRequest(watchRequest("kJ")))
        assertThrows(IllegalArgumentException::class.java){parseWatchRequest("{\"version\":1,\"unit\":\"kcal\",\"origin\":\"https://other\"}".toByteArray())}
        assertThrows(IllegalArgumentException::class.java){watchRequest("cal")}
        assertThrows(IllegalArgumentException::class.java){WatchReply.parse(ByteArray(65537))}
    }
    @Test fun leavingOrChangingUnitRejectsLateReplies() {
        val gate=WatchRequestGate();val first=gate.begin();val second=gate.begin()
        assertFalse(gate.owns(first));assertTrue(gate.owns(second));gate.clear();assertFalse(gate.owns(second))
    }
    @Test fun missingMalformedAndDuplicateSourceCreditsAreRejectedWithoutDroppingThem(){
        val absent=fixture();absent.remove("attributions")
        assertThrows(org.json.JSONException::class.java){WatchSummary.parse(absent)}
        for(values in listOf(org.json.JSONArray().put(""),org.json.JSONArray().put(17),org.json.JSONArray().put("Credit").put("Credit"))){
            assertThrows(IllegalArgumentException::class.java){WatchSummary.parse(fixture().put("attributions",values))}
        }
        assertTrue(WatchSummary.parse(fixture().put("attributions",org.json.JSONArray())).attributions.isEmpty())
    }

}
