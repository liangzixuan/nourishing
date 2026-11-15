package local.nourish.healthconnect

import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.CheckBox
import android.widget.ScrollView
import android.widget.TextView
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.HydrationRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.lifecycle.lifecycleScope
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.net.InetAddress
import java.security.KeyStore
import java.security.MessageDigest
import java.security.cert.CertificateFactory
import java.time.Instant
import java.util.UUID
import java.util.concurrent.atomic.AtomicInteger
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Actual candidate server over HTTPS, real Health Connect, production panel and coordinator.
 * Only certificate trust, loopback DNS, and the checked synthetic destination are test inputs.
 * Run explicitly on the owned emulator with an ADB reverse mapping to the owned fixture. */
@RunWith(AndroidJUnit4::class)
class IntakeCorrectionEndToEndTest {
    private val instrumentation get()=InstrumentationRegistry.getInstrumentation()
    private val context get()=instrumentation.targetContext
    private fun descendants(view:View):List<View> = listOf(view)+if(view is ViewGroup)(0 until view.childCount).flatMap { descendants(view.getChildAt(it)) } else emptyList()
    private fun until(message:String,condition:()->Boolean){val end=System.nanoTime()+20_000_000_000;while(!condition()&&System.nanoTime()<end)Thread.sleep(30);assertTrue(message,condition())}
    @Test fun reviewedRealNativeChangesRecoverAfterActualServerDropsActivationReply()=runBlocking {
        val directory=File(context.getExternalFilesDir(null),"intake-e2e")
        val config=JSONObject(File(directory,"ready.json").readText());val origin=WorkspaceOrigin.parse(config.getString("origin"));val selection=parseCorrectedIntakeSelection(config.getJSONObject("selection"))
        val type=selection.type;val nutrition=type==HealthWriteType.NUTRITION;require(type.isIntake)
        val certificate=File(directory,"cert.pem").inputStream().use { CertificateFactory.getInstance("X.509").generateCertificate(it) }
        val trustStore=KeyStore.getInstance(KeyStore.getDefaultType()).apply {load(null);setCertificateEntry("synthetic-fixture",certificate)}
        val trust=TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply {init(trustStore)}.trustManagers.filterIsInstance<X509TrustManager>().single()
        val ssl=SSLContext.getInstance("TLS").apply {init(null,arrayOf(trust),null)}
        val activations=AtomicInteger();val verifications=AtomicInteger()
        val http=WorkspaceClient.defaultClient().newBuilder().sslSocketFactory(ssl.socketFactory,trust)
            .dns { hostname->require(hostname=="fixture.test.ts.net");listOf(InetAddress.getByName("127.0.0.1")) }
            .addNetworkInterceptor { chain->
                when(chain.request().url.encodedPath){
                    "/api/health-connect/export/intake/corrected/activate"->activations.incrementAndGet()
                    "/api/health-connect/export/intake/corrected/verify"->verifications.incrementAndGet()
                }
                chain.proceed(chain.request())
            }.build()
        try {
            val client=WorkspaceClient(http);val identity=client.identity(origin);assertEquals(config.getString("login"),identity.login)
            val sessions=androidIntakeSessions(context);assertNull(sessions.load())
            val preview=parseCorrectedIntakePreview(client.exchange(origin,"/api/health-connect/export/intake/corrected/preview",json=selection.json()),Instant.now())
            val plan=preview.nativePlan(origin,identity)!!;val health=HealthConnectClient.getOrCreate(context);val sink=AndroidIntakeReconciliationSink(context,health)
            assertTrue(sink.snapshot(type,plan.clients).isEmpty())
            val anchor=plan.rows.single { it.id=="anchor" };val retire=plan.retire.single()
            val outside="nourish-export:${type.wire}:"+MessageDigest.getInstance("SHA-256").digest(UUID.randomUUID().toString().toByteArray()).joinToString(""){"%02x".format(it)}
            val version=System.currentTimeMillis()
            fun amount(row:HealthWriteRow,value:Double)=if(nutrition)row.copy(nutrients=mapOf("energy" to value)) else row.copy(value=value)
            sink.insert(listOf(amount(anchor,if(nutrition)200.0 else 80.0),amount(anchor.copy(clientId=retire,name="Synthetic old correction"),if(nutrition)50.0 else 20.0),amount(anchor.copy(clientId=outside,name="Synthetic unrelated record"),999.0)).map {
                type.native(it,Metadata.manualEntry(clientRecordId=it.clientId,clientRecordVersion=version))
            })
            val before=inspectIntakeCorrection(plan,sink).review.before
            var reservedVersion=0L
            ActivityScenario.launch(MainActivity::class.java).use { scenario->
                lateinit var panel:IntakeCorrectionPanel
                scenario.onActivity { activity->
                    panel=IntakeCorrectionPanel(activity,activity.lifecycleScope,destination={origin to identity},selection={selection.json().also {it.remove("correctionDates");it.remove("useDrafts")}},health={health},onBusy={},client=client)
                    activity.setContentView(ScrollView(activity).apply {addView(panel)})
                }
                fun text():String {var value="";scenario.onActivity {value=descendants(panel).filterIsInstance<TextView>().joinToString("\n"){it.text.toString()}};return value}
                fun button(label:String)=descendants(panel).filterIsInstance<Button>().single {it.text.toString()==label}
                fun click(label:String){scenario.onActivity {val target=button(label);assertTrue("Disabled: $label",target.isEnabled);target.performClick()}}
                click("Load correction dates");until("Correction dates did not load: "+text()){text().contains("saved draft")}
                scenario.onActivity {
                    val checks=descendants(panel).filterIsInstance<CheckBox>()
                    checks.single {it.text.startsWith(selection.from.toString()+":")}.isChecked=true
                    checks.single {it.text.startsWith("Apply saved grouping changes")}.isChecked=true
                }
                click("Review corrections and phone records");until("Correction review did not load: "+text()){text().contains("No native change has been requested")}
                if(nutrition){assertTrue(text().contains("energy: 200.0"));assertTrue(text().contains("energy: 50.0"));assertTrue(text().contains("Exact HTTPS source credit"))}
                else {assertTrue(text().contains("volume Liters: 0.08"));assertTrue(text().contains("volume Liters: 0.02"))}
                assertEquals(0,activations.get());assertEquals(before,inspectIntakeCorrection(plan,sink).review.before)
                click("Confirm corrections and removals")
                until("Lost response was not reported: "+text()){text().contains("Could not reach your private workspace")}
                val pending=sessions.load()!!;assertFalse(pending.activated);assertTrue(pending.operation.attemptedUpserts.isEmpty());assertTrue(pending.operation.attemptedRetirements.isEmpty())
                reservedVersion=pending.operation.version;assertTrue(reservedVersion>version);assertEquals(1,activations.get())
                assertEquals(before,inspectIntakeCorrection(plan,sink).review.before)
                click("Inspect pending correction");until("Pending review not visible"){text().contains("activation response pending")}
                click("Resume saved correction");until("Recovery did not finish: "+text()){text().contains("Recovery completed: ${plan.rows.size} native records verified and 1 obsolete identities verified absent")}
                assertNull(sessions.load());assertEquals(2,activations.get());assertTrue(verifications.get()>0)
                scenario.onActivity {assertFalse(button("Resume saved correction").isEnabled);panel.dispose()}
            }
            val after=sink.snapshot(type,plan.clients);assertEquals(plan.rows.map {it.clientId}.toSet(),after.keys)
            val result=after.getValue(anchor.clientId);assertEquals(reservedVersion,result.metadata.clientRecordVersion)
            val outsideRecord=sink.snapshot(type,setOf(outside)).getValue(outside)
            if(nutrition){
                result as NutritionRecord
                assertEquals(150.0,result.energy!!.inKilocalories,0.0);assertEquals(0.0,result.protein!!.inGrams,0.0);assertEquals(7.5e-12,result.vitaminB12!!.inGrams,1e-25)
                assertTrue(result.name!!.endsWith("Exact HTTPS source credit"));assertEquals(999.0,(outsideRecord as NutritionRecord).energy!!.inKilocalories,0.0)
            }else{
                assertEquals(0.0,(result as HydrationRecord).volume.inLiters,0.0)
                assertEquals(.25,(after.getValue(plan.rows.single {it.id=="drink"}.clientId) as HydrationRecord).volume.inLiters,0.0)
                assertEquals(.999,(outsideRecord as HydrationRecord).volume.inLiters,0.0)
            }
            health.deleteRecords(type.recordClass,emptyList(),(plan.clients+outside).toList());assertTrue(sink.snapshot(type,plan.clients+outside).isEmpty())
            File(context.filesDir,"intake-correction-e2e-${type.wire}.json").writeText(JSONObject().put("completedAt",Instant.now().toString()).put("kind",type.wire).put("actualHttpsServer",true).put("realHealthConnect",true)
                .put("productionReviewControls",true).put("noNativeChangesBeforeConfirmation",true).put("lostActivationReplyPreservedIntent",true).put("activationRequests",activations.get())
                .put("verificationRequests",verifications.get()).put("updates",plan.rows.size).put("removals",1).put("sourceCreditsAndZeroAndTraceValues",nutrition).put("zeroWaterAndSeparateLoggedDrink",!nutrition).put("unrelatedRecordPreserved",true).put("nativeCleanupVerified",true).toString())
        }finally {http.connectionPool.evictAll();http.dispatcher.executorService.shutdownNow()}
    }
}
