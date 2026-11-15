package local.nourish.healthconnect

import java.io.File
import java.net.InetAddress
import java.time.Instant
import kotlinx.coroutines.runBlocking
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class HomeWidgetTest {
    private fun fixture() = JSONObject(File("../fixtures/home-widget.json").readText())
    private fun config(kind:WidgetKind=WidgetKind.CONSUMED) = HomeWidgetConfig(WorkspaceOrigin.parse("https://fixture.test.ts.net"),"owner@example.test","kcal",kind,"revision-one")
    @Test fun actualServerWriterParsesAllThreeCardsAndCalendar() {
        for(kind in WidgetKind.entries) {
            val snapshot=HomeWidgetSnapshot.parse(fixture(),config(kind))
            assertEquals(Instant.parse("2026-10-30T04:30:00Z"),snapshot.asOf)
            assertEquals("2026-10-29",snapshot.date.toString());assertEquals("America/Chicago",snapshot.zone.id)
            assertTrue(snapshot.card.title.isNotBlank())
        }
        val snapshot=HomeWidgetSnapshot.parse(fixture(),config());assertEquals("100 kcal",snapshot.card.value);assertEquals(5,snapshot.card.progress)
        assertEquals(config(),HomeWidgetConfig.parse(config().json()))
    }
    @Test fun accountOriginUnitAndCalendarAreBoundToTheSnapshotResponse() {
        for(key in listOf("origin","login","mode")) {
            val json=fixture();json.getJSONObject("access").put(key,"changed")
            assertThrows(Exception::class.java){HomeWidgetSnapshot.parse(json,config())}
        }
        val date=fixture();date.getJSONObject("calendar").put("today","2026-10-30")
        assertThrows(Exception::class.java){HomeWidgetSnapshot.parse(date,config())}
        assertThrows(Exception::class.java){HomeWidgetSnapshot.parse(fixture().put("unit","kJ"),config())}
        assertThrows(Exception::class.java){HomeWidgetSnapshot.parse(fixture().put("version","1"),config())}
    }
    @Test fun malformedProgressAndOversizedOrNonTextFieldsAreRejected() {
        for(value in listOf(-1,101,2.5,"5",true)) {
            val json=fixture();json.getJSONObject("cards").getJSONObject("consumed").put("progress",value)
            assertThrows(Exception::class.java){HomeWidgetSnapshot.parse(json,config())}
        }
        for(value in listOf("x".repeat(201),false,JSONObject.NULL)) {
            val json=fixture();json.getJSONObject("cards").getJSONObject("consumed").put("value",value)
            assertThrows(Exception::class.java){HomeWidgetSnapshot.parse(json,config())}
        }
        val unknown=fixture();unknown.getJSONObject("cards").getJSONObject("consumed").put("progress",JSONObject.NULL).put("value","Unknown")
        assertNull(HomeWidgetSnapshot.parse(unknown,config()).card.progress)
    }
    @Test fun aRemovedReconfiguredOrDifferentAccountWidgetCannotAcceptAPendingResult() {
        val requested=config()
        assertTrue(ownsWidgetResult(requested,requested))
        for(current in listOf(null,requested.copy(revision="revision-two"),requested.copy(login="other@example.test"),requested.copy(kind=WidgetKind.FASTING),requested.copy(unit="kJ")))assertFalse(ownsWidgetResult(current,requested))
    }
    @Test fun realTlsSummaryReadUsesOneGetAndRejectsRedirectOrChangedAccount() = runBlocking {
        val certificate=HeldCertificate.Builder().commonName("fixture.test.ts.net").addSubjectAlternativeName("fixture.test.ts.net").build()
        val server=MockWebServer();val serverTls=HandshakeCertificates.Builder().heldCertificate(certificate).build();server.useHttps(serverTls.sslSocketFactory());server.start()
        val trust=HandshakeCertificates.Builder().addTrustedCertificate(certificate.certificate).build()
        val http=WorkspaceClient.defaultClient().newBuilder().sslSocketFactory(trust.sslSocketFactory(),trust.trustManager).dns { listOf(InetAddress.getByName("127.0.0.1")) }.build()
        try {
            val config=config().copy(origin=WorkspaceOrigin.parse("https://fixture.test.ts.net:${server.port}"))
            val json=fixture();json.getJSONObject("access").put("origin",config.origin.value)
            server.enqueue(MockResponse(body=json.toString()))
            val client=WorkspaceClient(http);val snapshot=client.widgetSnapshot(config);assertEquals("kcal",snapshot.getString("unit"))
            val request=server.takeRequest();assertEquals("GET",request.method);assertEquals("/api/home-widgets?unit=kcal",request.target);assertNotNull(request.handshake);assertEquals(0,request.bodySize);assertNull(request.headers["Tailscale-User-Login"])
            json.getJSONObject("access").put("login","other@example.test");server.enqueue(MockResponse(body=json.toString()))
            try { client.widgetSnapshot(config);fail("Changed account accepted") }catch(_:IllegalArgumentException){}
            server.enqueue(MockResponse(code=302,headers=okhttp3.Headers.headersOf("Location","https://elsewhere.test")))
            try { client.widgetSnapshot(config);fail("Redirect accepted") }catch(_:WorkspaceTransferFailure){}
            assertEquals(3,server.requestCount)
        } finally {http.connectionPool.evictAll();http.dispatcher.executorService.shutdownNow();server.close()}
    }
    @Test fun creditsAreRequiredExactAndScopedToNutritionCards(){
        val json=fixture();val credit=json.getJSONObject("cards").getJSONObject("consumed").getJSONArray("attributions").getString(0)
        for(kind in listOf(WidgetKind.CONSUMED,WidgetKind.REMAINING))assertEquals(listOf(credit),HomeWidgetSnapshot.parse(json,config(kind)).card.attributions)
        assertTrue(HomeWidgetSnapshot.parse(json,config(WidgetKind.FASTING)).card.attributions.isEmpty())
        val missing=fixture();missing.getJSONObject("cards").getJSONObject("consumed").remove("attributions")
        assertThrows(org.json.JSONException::class.java){HomeWidgetSnapshot.parse(missing,config())}
        for(credits in listOf(org.json.JSONArray().put(""),org.json.JSONArray().put(false),org.json.JSONArray().put("Credit").put("Credit"))){
            val invalid=fixture();invalid.getJSONObject("cards").getJSONObject("consumed").put("attributions",credits)
            assertThrows(IllegalArgumentException::class.java){HomeWidgetSnapshot.parse(invalid,config())}
        }
        assertThrows(IllegalArgumentException::class.java){HomeWidgetSnapshot.parse(fixture().put("version",1),config())}
        val fasting=fixture();fasting.getJSONObject("cards").getJSONObject("fasting").put("attributions",org.json.JSONArray().put(credit))
        assertThrows(IllegalArgumentException::class.java){HomeWidgetSnapshot.parse(fasting,config(WidgetKind.FASTING))}
    }

}
