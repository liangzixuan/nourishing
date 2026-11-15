package local.nourish.healthconnect

import android.content.Context
import android.content.ContextWrapper
import android.content.SharedPreferences
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.ContextThemeWrapper
import android.view.View
import android.widget.TextView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.time.Instant
import java.util.Locale
import java.util.UUID
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Isolated status preferences only; no scheduling, network calls or health writes. */
@RunWith(AndroidJUnit4::class)
class HourlyExportPresentationNativeTest {
    @Test fun english()=verify("en","Weight")
    @Test fun french()=verify("fr","Poids")
    @Test fun german()=verify("de","Gewicht")
    @Test fun portuguese()=verify("pt-BR","Peso")
    private fun verify(language:String,weight:String) {
        val instrumentation=InstrumentationRegistry.getInstrumentation();val base=instrumentation.targetContext
        val config=Configuration(base.resources.configuration).apply {setLocale(Locale.forLanguageTag(language));fontScale=1.3f}
        val themed=ContextThemeWrapper(base.createConfigurationContext(config),android.R.style.Theme_Material_Light_NoActionBar)
        val prefix="hourly-status-test-"+UUID.randomUUID()
        val context=object:ContextWrapper(themed) {
            override fun getSharedPreferences(name:String,mode:Int):SharedPreferences=base.getSharedPreferences(prefix+name,mode)
        }
        try {
            val raw=JSONObject().put("kind","weight").put("from","2026-11-07").put("to","2026-11-07").put("timeZone","America/Chicago").put("metric",JSONObject().put("type","My weight α").put("unit","kg")).toString()
            val saved=HourlyExportConfig(WorkspaceOrigin.parse("https://synthetic.test.ts.net:8443"),"synthetic@example.invalid",raw,1,"revision")
            val settings=HourlyExportSettings(context);settings.enable(saved)
            assertEquals(HourlyExportStatus.Enabled,settings.snapshots().single().status)
            val at=Instant.parse("2026-11-07T19:00:00Z");val status=HourlyExportStatus.Completed(at,2,7,3)
            settings.status(saved,status)
            val reopened=HourlyExportSettings(context).snapshots().single()
            assertEquals(status,reopened.status);assertEquals(raw,reopened.config.selection)
            val text=context.hourlyExportText(listOf(reopened))
            assertTrue(text.contains(weight));assertTrue(text.contains("My weight α (kg)"));assertTrue(text.contains("America/Chicago"));assertTrue(text.contains("synthetic@example.invalid"))
            assertTrue(text.contains(context.getString(R.string.hourly_export_completed,at.toString(),2,7,3)))
            val failed=HourlyExportStatus.Failed(at,4,1,SyncDiagnostic.Owned(SyncError.EXPORT_PERMISSION))
            settings.status(saved,failed)
            val failureText=context.hourlyExportStatusText(settings.snapshots().single().status)
            assertTrue(failureText.contains(context.getString(R.string.hourly_export_permission)))
            assertTrue(failureText.contains(context.getString(R.string.health_export_unknown_outcome,1)))
            assertEquals("Original diagnostic",context.hourlyExportStatusText(HourlyExportStatus.Literal("Original diagnostic")))
            assertEquals(saved,settings.configs().single())
            settings.stopAll();assertTrue(settings.snapshots().isEmpty())
            settings.status(saved,status);assertTrue(settings.snapshots().isEmpty())
            instrumentation.runOnMainSync {
                val rendered=text+"\n\n"+failureText
                val view=TextView(context).apply {textSize=16f;setPadding(16,16,16,16);setBackgroundColor(android.graphics.Color.WHITE);this.text=rendered}
                assertTrue(view.text.toString().contains("My weight α (kg)"))
                val width=(360*context.resources.displayMetrics.density).toInt()
                view.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(0,View.MeasureSpec.UNSPECIFIED));view.layout(0,0,width,view.measuredHeight)
                for(line in 0 until view.layout.lineCount)assertEquals(0,view.layout.getEllipsisCount(line))
                assertTrue(view.layout.height<=view.height-view.compoundPaddingTop-view.compoundPaddingBottom)
                val bitmap=Bitmap.createBitmap(width,view.height,Bitmap.Config.ARGB_8888);view.draw(Canvas(bitmap));File(base.getExternalFilesDir(null),"hourly-export-$language.png").outputStream().use {bitmap.compress(Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle()
            }
        } finally { assertTrue(base.deleteSharedPreferences(prefix+"hourly-health-export")) }
    }
}
