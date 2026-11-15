package local.nourish.healthconnect
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.ContextThemeWrapper
import android.view.View
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.TextView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.Locale
import kotlinx.coroutines.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
@RunWith(AndroidJUnit4::class)
class ReconciliationPresentationNativeTest {
 @Test fun englishReconciliation()=verify("en","Foreground source reconciliation")
 @Test fun frenchReconciliation()=verify("fr","Réconciliation des sources au premier plan")
 @Test fun germanReconciliation()=verify("de","Quellabgleich im Vordergrund")
 @Test fun portugueseReconciliation()=verify("pt-BR","Reconciliação de fontes em primeiro plano")
 private fun verify(language:String,title:String) {
  val instrumentation=InstrumentationRegistry.getInstrumentation();val base=instrumentation.targetContext
  val config=Configuration(base.resources.configuration).apply{setLocale(Locale.forLanguageTag(language));fontScale=1.5f}
  val context=ContextThemeWrapper(base.createConfigurationContext(config),android.R.style.Theme_Material_Light_NoActionBar)
  val origin=WorkspaceOrigin.parse("https://fixture.test.ts.net");val identity=WorkspaceIdentity("owner@example.test")
  val range=JSONObject().put("from","2026-11-01").put("to","2026-11-02").put("zone","America/Chicago")
  val batch=JSONObject().put("snapshot",JSONObject().put("range",range))
  val pending=ReconciliationPending(batch,emptyMap(),setOf(ExportType.WEIGHT),"a".repeat(64))
  val warning="SOURCE-WARNING %1\$s <literal>"
  val review=ReconciliationReview("b".repeat(64),"a".repeat(64),ReconciliationCounts(1,2,3,4,5,6),listOf(warning),false,null)
  val before=batch.toString();val summary=context.reconciliationReviewText(origin,identity,pending,review)
  assertTrue(summary.contains(origin.value));assertTrue(summary.contains(identity.login));assertTrue(summary.contains("2026-11-01"));assertTrue(summary.contains("2026-11-02"));assertTrue(summary.contains("America/Chicago"));assertTrue(summary.contains(warning));assertTrue(summary.contains(context.reconciliationCountsText(review.counts)));assertFalse(summary.contains("\"from\""));assertEquals(before,batch.toString())
  val cleanup=WorkspaceTransferFailure(WorkspaceError.RECON_CLEANUP)
  assertFalse(cleanup.outcomeUnknown);assertEquals(context.getString(WorkspaceError.RECON_CLEANUP.displayResource),context.workspaceErrorText(cleanup))
  val uncertain=WorkspaceTransferFailure(WorkspaceError.RECON_INVALID_RESULT,true)
  assertTrue(context.workspaceErrorText(uncertain).contains(context.getString(R.string.transfer_error_unknown_outcome)))
  instrumentation.runOnMainSync {
   val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main.immediate);val busy=mutableListOf<Boolean>()
   val panel=ReconciliationPanel(context,scope,{error("No selection expected")},{null},{fail("No file save expected")},busy::add)
   try {
    assertEquals(title,(panel.getChildAt(0) as TextView).text.toString())
    val address=panel.getChildAt(2) as EditText;val output=panel.getChildAt(3) as TextView
    val consent=panel.getChildAt(4) as CheckBox;val baseline=panel.getChildAt(5) as CheckBox
    address.setText("http://wrong.example");(panel.getChildAt(6) as Button).performClick()
    assertEquals(context.getString(R.string.recon_failure,context.getString(WorkspaceError.PRIVATE_ADDRESS.displayResource)),output.text.toString())
    assertEquals(listOf(true,false),busy)
    consent.isChecked=true;baseline.isChecked=true;(panel.getChildAt(9) as Button).performClick()
    assertFalse(consent.isChecked)
    assertEquals(context.getString(R.string.recon_failure,context.getString(R.string.recon_check_first)),output.text.toString())
    address.setText("https://another.test.ts.net");assertFalse(consent.isChecked);assertFalse(baseline.isChecked)
    panel.setExternalBusy(true);for(i in 6 until panel.childCount)assertFalse(panel.getChildAt(i).isEnabled)
    panel.setExternalBusy(false);assertTrue(panel.getChildAt(6).isEnabled)
    // Render the actual review text in the panel while keeping confirmation unchecked.
    output.text=summary
    val width=(320*context.resources.displayMetrics.density).toInt();panel.setPadding(16,16,16,16);panel.setBackgroundColor(android.graphics.Color.WHITE)
    panel.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(0,View.MeasureSpec.UNSPECIFIED));panel.layout(0,0,width,panel.measuredHeight)
    for(i in 0 until panel.childCount){val view=panel.getChildAt(i) as? TextView ?: continue;if(view is EditText)continue;val layout=requireNotNull(view.layout);for(line in 0 until layout.lineCount)assertEquals(view.text.toString(),0,layout.getEllipsisCount(line));assertTrue(view.text.toString(),layout.height<=view.height-view.compoundPaddingTop-view.compoundPaddingBottom);view.jumpDrawablesToCurrentState()}
    val top=output.top;val bitmap=Bitmap.createBitmap(width,panel.height-top,Bitmap.Config.ARGB_8888);val canvas=Canvas(bitmap);canvas.translate(0f,-top.toFloat());panel.draw(canvas);File(base.getExternalFilesDir(null),"reconciliation-presentation-"+language+".png").outputStream().use{bitmap.compress(Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle()
    panel.dispose();for(i in 6 until panel.childCount)assertFalse(panel.getChildAt(i).isEnabled)
   } finally {panel.dispose();scope.cancel()}
  }
 }
}
