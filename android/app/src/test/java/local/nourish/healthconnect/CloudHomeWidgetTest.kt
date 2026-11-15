package local.nourish.healthconnect

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class CloudHomeWidgetTest{
    private val binding=CloudNativeBinding(CloudOrigin.parse("https://nourishing.app"),"account-A","a".repeat(64))
    private val config=CloudWidgetConfig(binding,"kcal",WidgetKind.CONSUMED,"revision")
    private fun json()=JSONObject("""{"version":3,"unit":"kcal","access":{"mode":"cloud","origin":"https://nourishing.app","accountId":"account-A"},"calendar":{"asOf":"2026-11-14T18:00:00Z","today":"2026-11-14","timeZone":"America/Chicago"},"cards":{"consumed":{"title":"Consumed","value":"250 kcal","detail":"Today","expanded":"Protein 10 g","progress":25,"attributions":["Fixture source"]}}}""")
    private fun rejected(value:JSONObject){try{HomeWidgetSnapshot.parseCloud(value,config);fail("Expected rejection")}catch(_:IllegalArgumentException){}}
    @Test fun cloudProjectionRetainsCalendarValuesAndAttribution(){
        assertEquals(config,CloudWidgetConfig.parse(config.json()));val result=HomeWidgetSnapshot.parseCloud(json(),config)
        assertEquals("250 kcal",result.card.value);assertEquals("2026-11-14",result.date.toString());assertEquals(listOf("Fixture source"),result.card.attributions)
    }
    @Test fun otherAccountOriginVersionAndUnitAreRejected(){
        rejected(json().apply{getJSONObject("access").put("accountId","account-B")})
        rejected(json().apply{getJSONObject("access").put("origin","https://other.example")})
        rejected(json().put("version",2));rejected(json().put("unit","kJ"));rejected(json().apply{getJSONObject("access").put("mode","private")})
    }
    @Test fun originalCardAndCalendarConstraintsRemain(){
        rejected(json().apply{getJSONObject("calendar").put("today","2026-11-13")})
        rejected(json().apply{getJSONObject("cards").getJSONObject("consumed").put("progress",101)})
        rejected(json().apply{getJSONObject("cards").getJSONObject("consumed").put("attributions",org.json.JSONArray(listOf("A","A")))})
        val legacy=json().put("version",2).put("access",JSONObject().put("mode","private").put("origin","https://fixture.example.ts.net:8443").put("login","fixture@example.test"))
        assertEquals("250 kcal",HomeWidgetSnapshot.parse(legacy,HomeWidgetConfig(WorkspaceOrigin.parse("https://fixture.example.ts.net:8443"),"fixture@example.test","kcal",WidgetKind.CONSUMED,"revision")).card.value)
    }
}
