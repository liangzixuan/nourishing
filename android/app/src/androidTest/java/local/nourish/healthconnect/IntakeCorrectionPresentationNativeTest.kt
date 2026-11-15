package local.nourish.healthconnect

import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.ContextThemeWrapper
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.time.Instant
import java.util.Locale
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Synthetic preview and actual panel; no network calls or native health changes. */
@RunWith(AndroidJUnit4::class)
class IntakeCorrectionPresentationNativeTest {
    @Test fun english()=verify("en","Review corrections")
    @Test fun french()=verify("fr","Vérifier les corrections")
    @Test fun german()=verify("de","Korrekturen prüfen")
    @Test fun portuguese()=verify("pt-BR","Revisar correções")
    private fun descendants(view:View):List<View> = listOf(view)+if(view is ViewGroup)(0 until view.childCount).flatMap { descendants(view.getChildAt(it)) } else emptyList()
    private fun verify(language:String,reviewLabel:String) {
        val instrumentation=InstrumentationRegistry.getInstrumentation();val base=instrumentation.targetContext
        val config=Configuration(base.resources.configuration).apply { setLocale(Locale.forLanguageTag(language));fontScale=1.3f }
        val context=ContextThemeWrapper(base.createConfigurationContext(config),android.R.style.Theme_Material_Light_NoActionBar)
        val fixture=instrumentation.context.assets.open("corrected-intake-previews.json").bufferedReader().use { JSONObject(it.readText()) }
        val packet=fixture.getJSONObject("cases").getJSONObject("nutrition");val at=Instant.parse(fixture.getString("now"));val preview=parseCorrectedIntakePreview(packet,at)
        val origin=WorkspaceOrigin.parse("https://synthetic.test.ts.net:8443");val identity=WorkspaceIdentity("synthetic@example.invalid")
        val before=preview.rows.associate { it.clientId to "Literal phone observation α: 12.5 g" }
        val rendered=context.intakeCorrectionPreviewText(preview,origin,identity,before)
        assertTrue(rendered.contains(origin.value));assertTrue(rendered.contains(identity.login));assertTrue(rendered.contains(preview.selection.timeZone))
        for(group in preview.groups)assertTrue(rendered.contains(group.description))
        for(row in preview.rows){assertTrue(rendered.contains(row.description));assertTrue(rendered.contains(before.getValue(row.clientId)))}
        for(row in preview.retire){assertTrue(rendered.contains(row.id));assertTrue(rendered.contains(row.reason));assertTrue(rendered.contains(context.getString(R.string.correction_already_absent)))}
        val pending=IntakeCorrectionSession(origin,identity,at,"{}",packet.toString(),IntakeCorrectionOperation("synthetic-operation",IntakeCorrectionReview(preview.nativePlan(origin,identity)!!,emptyMap()),1),emptyMap(),false)
        val recovered=context.intakeCorrectionRecoveryText(pending,before)
        assertTrue(recovered.contains("synthetic-operation"));assertTrue(recovered.contains(context.getString(R.string.correction_recovery_header,origin.value,identity.login,context.getString(preview.selection.type.displayLabelResource),"synthetic-operation",0,0)))
        for(row in preview.rows){assertTrue(recovered.contains(row.description));assertTrue(recovered.contains(before.getValue(row.clientId)))}
        instrumentation.runOnMainSync {
            val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main.immediate)
            val panel=IntakeCorrectionPanel(context,scope,destination={null},selection={JSONObject().put("kind","nutrition")},health={null},onBusy={})
            try {
                val controls=descendants(panel);val details=controls.filterIsInstance<NativeDetails>()
                assertEquals(2,details.size);assertTrue(details.none { it.expanded });details.first().setExpanded(true)
                val review=controls.filterIsInstance<Button>().single { it.text.toString()==reviewLabel }
                val confirm=controls.filterIsInstance<Button>().single { it.text.toString()==context.getString(R.string.correction_confirm) }
                assertTrue(review.isEnabled);assertFalse(confirm.isEnabled);assertEquals(View.GONE,confirm.visibility)
                review.performClick()
                val output=controls.filterIsInstance<TextView>().single { it.text.toString().startsWith(context.getString(R.string.health_export_connection_first)) }
                assertEquals(context.getString(R.string.health_export_connection_first),output.text.toString())
                for(key in listOf(R.string.correction_inspect,R.string.correction_resume,R.string.correction_forget,R.string.correction_review_current,R.string.correction_keep_current,R.string.correction_older))
                    assertEquals(View.GONE,controls.filterIsInstance<Button>().single { it.text.toString()==context.getString(key) }.visibility)
                assertTrue(details.first().body.indexOfChild(output)<details.first().body.indexOfChild(confirm))
                assertFalse(confirm.isEnabled);assertFalse(details.last().expanded)
                panel.setBackgroundColor(android.graphics.Color.WHITE)
                val width=(360*context.resources.displayMetrics.density).toInt()
                panel.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(0,View.MeasureSpec.UNSPECIFIED));panel.layout(0,0,width,panel.measuredHeight)
                for(view in controls.filterIsInstance<TextView>().filter { it is Button && it.parent===details.first().body }) {
                    if(view.visibility!=View.VISIBLE)continue
                    val layout=requireNotNull(view.layout)
                    for(line in 0 until layout.lineCount)assertEquals(view.text.toString(),0,layout.getEllipsisCount(line))
                    assertTrue(view.text.toString(),layout.height<=view.height-view.compoundPaddingTop-view.compoundPaddingBottom)
                }
                val bitmap=Bitmap.createBitmap(width,panel.height,Bitmap.Config.ARGB_8888);panel.draw(Canvas(bitmap))
                File(base.getExternalFilesDir(null),"correction-ui-$language.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG,100,it) };bitmap.recycle()
                panel.setExternalBusy(true);assertFalse(review.isEnabled);panel.setExternalBusy(false);assertTrue(review.isEnabled)
            } finally { panel.dispose();scope.cancel() }
        }
    }
}
