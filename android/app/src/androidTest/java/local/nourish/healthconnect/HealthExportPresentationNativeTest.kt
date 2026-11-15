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
import java.util.Locale
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Actual native panel; no network connection or Health Connect writes. */
@RunWith(AndroidJUnit4::class)
class HealthExportPresentationNativeTest {
    @Test fun englishLayout() = verify("en", "Preview export")
    @Test fun frenchLayout() = verify("fr", "Aperçu de l’exportation")
    @Test fun germanLayout() = verify("de", "Exportvorschau")
    @Test fun portugueseLayout() = verify("pt-BR", "Prévia da exportação")

    private fun descendants(view: View): List<View> = listOf(view) +
        if(view is ViewGroup) (0 until view.childCount).flatMap { descendants(view.getChildAt(it)) } else emptyList()

    private fun verify(language: String, previewText: String) {
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val base=instrumentation.targetContext
        val configuration=Configuration(base.resources.configuration).apply { setLocale(Locale.forLanguageTag(language));fontScale=1.3f }
        val context=ContextThemeWrapper(base.createConfigurationContext(configuration),android.R.style.Theme_Material_Light_NoActionBar)
        instrumentation.runOnMainSync {
            val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main.immediate)
            var grants=0
            val panel=HealthExportPanel(context,scope,destination={null},dates={"2026-11-07" to "2026-11-07"},health={null},grant={grants++},onBusy={})
            try {
                val controls=descendants(panel)
                val details=controls.filterIsInstance<NativeDetails>()
                assertEquals(4,details.size)
                assertTrue(details.all { !it.expanded })
                assertEquals(View.GONE, controls.filterIsInstance<TextView>().single { it.text.toString()==context.getString(R.string.export_ui_source) }.visibility)
                assertEquals(View.GONE, controls.filterIsInstance<TextView>().single { it.text.toString()==context.getString(R.string.export_ui_secondary) }.visibility)
                val preview=controls.filterIsInstance<Button>().single { it.text.toString()==previewText }
                val confirm=controls.filterIsInstance<Button>().single { it.text.toString()==context.getString(R.string.export_ui_confirm) }
                assertTrue(preview.isEnabled);assertFalse(confirm.isEnabled)
                val typeLabels=HealthWriteType.entries.map { context.getString(it.displayLabelResource) }
                assertEquals(14,typeLabels.toSet().size)
                assertEquals("weight",HealthWriteType.WEIGHT.wire)
                assertEquals(listOf("logged","food","both"),HealthWaterChoice.entries.map { it.wire })
                assertEquals(3,HealthWaterChoice.entries.map { context.getString(it.labelResource) }.toSet().size)
                val plan=HealthWritePlan("token","{}",listOf(HealthWriteRow("record","client",2.0,"kg",time=java.time.Instant.parse("2026-11-07T10:00:00Z"),offset=java.time.ZoneOffset.UTC,description="Literal metric: 2 kg")),listOf("Literal source reason"),"America/Chicago",HealthWriteType.WEIGHT)
                val previewResult=context.healthExportPreviewText(WorkspaceOrigin.parse("https://synthetic.test.ts.net:8443") to WorkspaceIdentity("synthetic@example.invalid"),plan)
                assertTrue(previewResult.contains(typeLabels.first()))
                assertTrue(previewResult.contains("Literal metric: 2 kg"));assertTrue(previewResult.contains("Literal source reason"));assertTrue(previewResult.contains("America/Chicago"))
                val uncertain=context.healthExportProgressText(HealthWriteProgress(3,1))
                assertEquals(context.getString(R.string.health_export_unknown_outcome,1),uncertain)
                assertEquals(context.getString(R.string.health_export_verified,3),context.healthExportProgressText(HealthWriteProgress(3,3)))
                val outputs=controls.filterIsInstance<TextView>().filter { it !is Button }
                preview.performClick()
                assertTrue(outputs.any { it.text.toString()==context.getString(R.string.health_export_connection_first) })
                assertFalse(confirm.isEnabled);assertEquals(0,grants)
                // Optional text and its state survive a close/reopen; the controls are not rebuilt.
                val exportDetails=details.first()
                val original=exportDetails.body.getChildAt(0)
                exportDetails.setExpanded(true);assertSame(original,exportDetails.body.getChildAt(0))
                assertTrue(original is TextView && original.text.toString()==context.getString(R.string.export_help_records))
                exportDetails.setExpanded(false);assertSame(original,exportDetails.body.getChildAt(0))
                panel.setBackgroundColor(android.graphics.Color.WHITE)
                val width=(360*context.resources.displayMetrics.density).toInt()
                panel.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(0,View.MeasureSpec.UNSPECIFIED))
                panel.layout(0,0,width,panel.measuredHeight)
                for(view in controls.filterIsInstance<TextView>().filter { it is Button && it.parent===panel }){
                    if(view.visibility!=View.VISIBLE)continue
                    val layout=requireNotNull(view.layout)
                    for(line in 0 until layout.lineCount)assertEquals(view.text.toString(),0,layout.getEllipsisCount(line))
                    assertTrue(view.text.toString(),layout.height<=view.height-view.compoundPaddingTop-view.compoundPaddingBottom)
                }
                assertTrue(panel.indexOfChild(outputs.single { it.text.toString()==context.getString(R.string.health_export_connection_first) })<panel.indexOfChild(confirm))
                val bitmap=Bitmap.createBitmap(width,panel.height,Bitmap.Config.ARGB_8888);panel.draw(Canvas(bitmap))
                File(base.getExternalFilesDir(null),"health-export-ui-$language.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG,100,it) };bitmap.recycle()
                panel.setExternalBusy(true);assertFalse(preview.isEnabled)
                panel.setExternalBusy(false);assertTrue(preview.isEnabled)
            } finally { panel.dispose();scope.cancel() }
        }
    }
}
