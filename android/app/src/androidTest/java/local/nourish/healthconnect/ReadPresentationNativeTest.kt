package local.nourish.healthconnect

import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.ContextThemeWrapper
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.Locale
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Native resource/layout checks only: no Health Connect reads or writes. */
@RunWith(AndroidJUnit4::class)
class ReadPresentationNativeTest {
    @Test fun englishResources() = verify("en", "Read selected data", "Weight", "17")
    @Test fun frenchResources() = verify("fr", "Lire les données sélectionnées", "Poids", "17")
    @Test fun germanResources() = verify("de", "Ausgewählte Daten lesen", "Gewicht", "17")
    @Test fun portugueseResources() = verify("pt-BR", "Ler dados selecionados", "Peso", "17")
    private fun verify(language: String, readLabel: String, weightLabel: String, total: String) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val base = instrumentation.targetContext
        val config = Configuration(base.resources.configuration).apply { setLocale(Locale.forLanguageTag(language)); fontScale = 1.5f }
        val context = ContextThemeWrapper(base.createConfigurationContext(config), android.R.style.Theme_Material_Light_NoActionBar)
        assertEquals(readLabel, context.getString(R.string.read_selected))
        assertEquals(weightLabel, context.getString(ExportType.WEIGHT.displayLabelResource))
        val counts = readAccessStatus(readPermissions(HEALTH_RECORD_TYPES.keys))
        assertEquals(17, counts.total)
        val status = context.getString(R.string.access_status, counts.granted, counts.total, "America/Chicago")
        assertTrue(status.contains(total));assertTrue(status.contains("America/Chicago"));assertFalse(status.contains("%"))
        assertEquals(2, Regex("17").findAll(status).count())
        val types = ExportType.entries.map { context.getString(it.displayLabelResource) }
        assertEquals(17, types.toSet().size)
        assertEquals("Body temperature", ExportType.BODY_TEMPERATURE.label)
        assertEquals("°C", ExportType.BODY_TEMPERATURE.unit)
        assertTrue(context.getString(R.string.privacy_policy).contains("Tailscale"))
        assertTrue(context.getString(R.string.privacy_policy).contains("TLS"))
        val missing = context.getString(R.string.read_access_missing, weightLabel)
        val summary = context.resources.getQuantityString(R.plurals.staged_summary, 3, 3, context.getString(R.string.measurement_count, weightLabel, 3), " " + missing)
        assertTrue(summary.contains(weightLabel));assertFalse(summary.contains("%"))
        val singular = mapOf("en" to "measurement staged", "fr" to "mesure préparée", "de" to "Messung privat", "pt-BR" to "medição preparada").getValue(language)
        val singleSummary = context.resources.getQuantityString(R.plurals.staged_summary, 1, 1, weightLabel, "")
        assertTrue(singleSummary, singleSummary.contains(singular))
        assertFalse(summary, summary.contains(singular))
        instrumentation.runOnMainSync {
            val column = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; setPadding(16,16,16,16);setBackgroundColor(android.graphics.Color.WHITE) }
            val textViews = mutableListOf<TextView>()
            fun add(text: String, button: Boolean = false) {
                val view: TextView = if(button) Button(context) else TextView(context).apply { textSize=16f;setPadding(0,8,0,8) }
                view.text=text;column.addView(view);textViews.add(view)
            }
            add(status);add(context.getString(R.string.read_intro));add(context.getString(R.string.grant_read),true);add(readLabel,true);add(context.getString(R.string.save_json),true)
            for(type in ExportType.entries) add(context.getString(R.string.type_label,context.getString(type.displayLabelResource),type.unit))
            val width=(320*context.resources.displayMetrics.density).toInt()
            column.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(0,View.MeasureSpec.UNSPECIFIED));column.layout(0,0,width,column.measuredHeight)
            for(view in textViews){val layout=requireNotNull(view.layout);assertTrue(view.text.toString(),layout.lineCount>0);for(line in 0 until layout.lineCount)assertEquals(view.text.toString(),0,layout.getEllipsisCount(line));assertTrue(view.text.toString(),layout.height<=view.height-view.compoundPaddingTop-view.compoundPaddingBottom)}
            val bitmap=Bitmap.createBitmap(width,column.height,Bitmap.Config.ARGB_8888);column.draw(Canvas(bitmap));File(base.getExternalFilesDir(null),"read-presentation-"+language+".png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG,100,it) };bitmap.recycle()
        }
    }
}
