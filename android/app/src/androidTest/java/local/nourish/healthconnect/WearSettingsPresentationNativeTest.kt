package local.nourish.healthconnect

import android.app.LocaleManager
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.LocaleList
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ScrollView
import android.widget.TextView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.SdkSuppress
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.Locale
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Real settings activity; only emulator app locales change, restored after each case. */
@RunWith(AndroidJUnit4::class)
@SdkSuppress(minSdkVersion=33)
class WearSettingsPresentationNativeTest {
    @Test fun english()=verify("en","Nourishing watch access")
    @Test fun french()=verify("fr","Accès montre Nourishing")
    @Test fun german()=verify("de","Nourishing-Uhrenzugriff")
    @Test fun portuguese()=verify("pt-BR","Acesso ao relógio Nourishing")
    private fun descendants(view:View):List<View> = listOf(view)+if(view is ViewGroup)(0 until view.childCount).flatMap { descendants(view.getChildAt(it)) } else emptyList()
    @android.annotation.SuppressLint("NewApi")
    private fun verify(language:String,title:String) {
        val instrumentation=InstrumentationRegistry.getInstrumentation();val base=instrumentation.targetContext
        val manager=base.getSystemService(LocaleManager::class.java);val previous=manager.applicationLocales
        assertNull(WearSettings(base).config());WearRelayControl.stop()
        try {
            manager.applicationLocales=LocaleList.forLanguageTags(language)
            instrumentation.waitForIdleSync()
            ActivityScenario.launch(WearSettingsActivity::class.java).use { scenario->
                scenario.onActivity { activity->
                    assertEquals(language,activity.resources.configuration.locales[0].toLanguageTag())
                    val views=descendants(activity.window.decorView)
                    assertTrue(views.filterIsInstance<TextView>().any { it.text.toString()==title })
                    val details=views.filterIsInstance<NativeDetails>();assertEquals(2,details.size);assertTrue(details.none { it.expanded })
                    val labels=WearRelayNotice.entries.map { activity.wearRelayStatusText(WearRelayStatus.Notice(it)) }
                    assertEquals(WearRelayNotice.entries.size,labels.toSet().size)
                    val retained=activity.wearRelayStatusText(wearRelayError(WorkspaceTransferFailure("Literal response α",true,503)))
                    assertTrue(retained.contains("Literal response α"));assertTrue(retained.contains(activity.getString(R.string.transfer_error_unknown_outcome)))
                    fun button(key:Int)=views.filterIsInstance<Button>().single { it.text.toString()==activity.getString(key) }
                    assertFalse(button(R.string.watch_enable).isEnabled)
                    button(R.string.watch_start).performClick()
                    assertNull(WearRelayControl.run);assertEquals(WearRelayStatus.Notice(WearRelayNotice.ENABLE_FIRST),WearRelayControl.status)
                    assertTrue(views.filterIsInstance<TextView>().any { it.text.toString()==activity.getString(R.string.relay_enable_first) })
                    val scroll=views.filterIsInstance<ScrollView>().single();val column=scroll.getChildAt(0)
                    val width=scroll.width.takeIf { it>0 }?:activity.resources.displayMetrics.widthPixels
                    column.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(0,View.MeasureSpec.UNSPECIFIED))
                    column.layout(0,0,width,column.measuredHeight)
                    for(button in views.filterIsInstance<Button>().filter { it.parent===column }) {
                        val layout=requireNotNull(button.layout)
                        for(line in 0 until layout.lineCount)assertEquals(button.text.toString(),0,layout.getEllipsisCount(line))
                        assertTrue(button.text.toString(),layout.height<=button.height-button.compoundPaddingTop-button.compoundPaddingBottom)
                    }
                    val bitmap=Bitmap.createBitmap(width,column.height,Bitmap.Config.ARGB_8888)
                    bitmap.eraseColor(android.graphics.Color.WHITE);column.draw(Canvas(bitmap))
                    File(base.getExternalFilesDir(null),"watch-settings-$language.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG,100,it) };bitmap.recycle()
                }
            }
        } finally { WearRelayControl.stop();manager.applicationLocales=previous;instrumentation.waitForIdleSync() }
    }
}
