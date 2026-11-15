package local.nourish.healthconnect

import android.graphics.Bitmap
import android.graphics.Rect
import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Button
import android.widget.TextView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Synthetic local intent only. No source connection or native health mutation. */
@RunWith(AndroidJUnit4::class)
class IntakeCorrectionPanelNativeTest {
    private val instrumentation get()=InstrumentationRegistry.getInstrumentation()
    private val context get()=instrumentation.targetContext
    private fun descendants(view:View):List<View> = listOf(view)+if(view is ViewGroup)(0 until view.childCount).flatMap { descendants(view.getChildAt(it)) } else emptyList()
    private fun until(message:String,condition:()->Boolean){val end=System.nanoTime()+5_000_000_000;while(!condition()&&System.nanoTime()<end)Thread.sleep(25);assertTrue(message,condition())}
    @Test fun pendingReviewBlocksWrongDestinationAndCanDiscardUnattemptedLocalIntent(){
        val store=androidIntakeSessions(context);val earlier=store.load()
        val fixtures=instrumentation.context.assets.open("corrected-intake-previews.json").bufferedReader().use { JSONObject(it.readText()) }
        val packet=fixtures.getJSONObject("cases").getJSONObject("nutrition");val captured=Instant.parse(fixtures.getString("now"));val preview=parseCorrectedIntakePreview(packet,captured)
        val origin=WorkspaceOrigin.parse("https://synthetic.test.ts.net:8443");val identity=WorkspaceIdentity("synthetic@example.invalid");val id=earlier?.operation?.id?:UUID.randomUUID().toString()
        val activation=JSONObject().put("selection",preview.selection.json()).put("reviewToken",preview.reviewToken).put("save",JSONObject().put("operationId",id).put("scope",preview.saveScope).put("reviewToken",preview.reviewToken))
        val fixture=IntakeCorrectionSession(origin,identity,captured,activation.toString(),packet.toString(),IntakeCorrectionOperation(id,IntakeCorrectionReview(preview.nativePlan(origin,identity)!!,emptyMap()),1),emptyMap(),false)
        if(earlier==null)store.save(fixture) else assertEquals("Only this exact unattempted fixture can be resumed by the test",fixture,earlier)
        runBlocking { try{NativeHealthWrites.sequence(context).write { fail("Pending session allowed an ordinary write") };fail("Expected pending-session block")}catch(_:IllegalStateException){} }
        ActivityScenario.launch(MainActivity::class.java).use { scenario->
            fun panel():IntakeCorrectionPanel {var found:IntakeCorrectionPanel?=null;scenario.onActivity { found=descendants(it.findViewById(android.R.id.content)).filterIsInstance<IntakeCorrectionPanel>().single() };return requireNotNull(found)}
            fun text():String {var value="";scenario.onActivity { value=descendants(panel()).filterIsInstance<TextView>().joinToString("\n"){it.text.toString()} };return value}
            fun button(label:String):Button=descendants(panel()).filterIsInstance<Button>().single { it.text.toString()==label }
            assertTrue(text().contains("Saved correction: Activation response pending"));scenario.onActivity { assertTrue(descendants(panel()).filterIsInstance<NativeDetails>().first().expanded);assertFalse(button("Confirm updates and removals").isEnabled);assertTrue(button("Resume correction").isEnabled);button("Resume correction").performClick() }
            until("Unselected destination did not block recovery"){text().contains("Check the same private workspace and account")}
            assertEquals(id,store.load()!!.operation.id);assertTrue(store.load()!!.operation.attemptedUpserts.isEmpty());assertTrue(store.load()!!.operation.attemptedRetirements.isEmpty())
            scenario.onActivity { val target=button("Forget unstarted operation");assertTrue(target.isEnabled);target.requestRectangleOnScreen(Rect(0,0,target.width,target.height),true);target.performClick() }
            instrumentation.waitForIdleSync();instrumentation.uiAutomation.waitForIdle(200,5000)
            val screenshot=requireNotNull(instrumentation.uiAutomation.takeScreenshot());File(context.getExternalFilesDir(null),"intake-correction-recovery-controls.png").outputStream().use { screenshot.compress(Bitmap.CompressFormat.PNG,100,it) };screenshot.recycle()
            val root=instrumentation.uiAutomation.rootInActiveWindow;val forget=root.findAccessibilityNodeInfosByText("Forget").single { it.text?.toString()?.equals("Forget",ignoreCase=true)==true }
            assertTrue(forget.performAction(AccessibilityNodeInfo.ACTION_CLICK));until("Unattempted operation was not forgotten"){store.load()==null}
            until("Discard result was not displayed"){text().contains("Unstarted operation forgotten")}
            scenario.onActivity { assertFalse(button("Resume correction").isEnabled);assertFalse(button("Forget unstarted operation").isEnabled) }
        }
        runBlocking { NativeHealthWrites.sequence(context).write { assertTrue(it>0) } }
        assertNull(store.load());File(context.filesDir,"intake-correction-panel-native.json").writeText(JSONObject().put("completedAt",Instant.now().toString()).put("pendingVisible",true).put("wrongDestinationBlocked",true).put("ordinaryWriterBlocked",true).put("explicitUnattemptedDiscard",true).put("cleanupVerified",true).put("nativeHealthMutated",false).toString())
    }
}
