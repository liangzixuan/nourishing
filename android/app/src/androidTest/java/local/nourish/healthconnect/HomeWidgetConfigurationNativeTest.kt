package local.nourish.healthconnect

import android.app.LocaleManager
import android.appwidget.AppWidgetHost
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.LocaleList
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.ScrollView
import android.widget.TextView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.SdkSuppress
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
@SdkSuppress(minSdkVersion=33)
class HomeWidgetConfigurationNativeTest {
    @Test fun english()=verify("en","Home-screen widget")
    @Test fun french()=verify("fr","Widget d’écran d’accueil")
    @Test fun german()=verify("de","Startbildschirm-Widget")
    @Test fun portuguese()=verify("pt-BR","Widget da tela inicial")
    private fun descendants(view:View):List<View> = listOf(view)+if(view is ViewGroup)(0 until view.childCount).flatMap { descendants(view.getChildAt(it)) } else emptyList()
    private fun verify(language:String,title:String){
        val instrumentation=InstrumentationRegistry.getInstrumentation();val base=instrumentation.targetContext
        val locales=base.getSystemService(LocaleManager::class.java);val previous=locales.applicationLocales
        val host=AppWidgetHost(base,44022);val id=host.allocateAppWidgetId()
        try {
            locales.applicationLocales=LocaleList.forLanguageTags(language);instrumentation.waitForIdleSync()
            instrumentation.uiAutomation.adoptShellPermissionIdentity("android.permission.BIND_APPWIDGET")
            try {assertTrue(AppWidgetManager.getInstance(base).bindAppWidgetIdIfAllowed(id,ComponentName(base,ConsumedWidget::class.java)))}finally{instrumentation.uiAutomation.dropShellPermissionIdentity()}
            val intent=Intent(base,HomeWidgetConfiguration::class.java).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id)
            ActivityScenario.launch<HomeWidgetConfiguration>(intent).use { scenario->
                scenario.onActivity { activity->
                    assertEquals(language,activity.resources.configuration.locales[0].toLanguageTag())
                    val views=descendants(activity.window.decorView)
                    assertTrue(views.filterIsInstance<TextView>().any { it.text.toString()==title })
                    val details=views.filterIsInstance<NativeDetails>().single();assertFalse(details.expanded)
                    val save=views.filterIsInstance<Button>().single { it.text.toString()==activity.getString(R.string.widget_save) };assertFalse(save.isEnabled)
                    val scroll=views.filterIsInstance<ScrollView>().single();val column=scroll.getChildAt(0)
                    val width=(360*activity.resources.displayMetrics.density).toInt()
                    column.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(0,View.MeasureSpec.UNSPECIFIED));column.layout(0,0,width,column.measuredHeight)
                    for(button in views.filterIsInstance<Button>().filter { it.parent===column }){
                        val layout=requireNotNull(button.layout);for(line in 0 until layout.lineCount)assertEquals(0,layout.getEllipsisCount(line))
                        assertTrue(layout.height<=button.height-button.compoundPaddingTop-button.compoundPaddingBottom)
                    }
                    val image=Bitmap.createBitmap(width,column.height,Bitmap.Config.ARGB_8888);image.eraseColor(android.graphics.Color.WHITE);column.draw(Canvas(image))
                    File(base.getExternalFilesDir(null),"widget-setup-$language.png").outputStream().use { image.compress(Bitmap.CompressFormat.PNG,100,it) };image.recycle()
                    views.filterIsInstance<EditText>().single().setText("not a private address")
                    views.filterIsInstance<Button>().single { it.text.toString()==activity.getString(R.string.widget_preview) }.performClick()
                }
                instrumentation.waitForIdleSync()
                scenario.onActivity { activity->
                    val views=descendants(activity.window.decorView)
                    assertFalse(views.filterIsInstance<Button>().single { it.text.toString()==activity.getString(R.string.widget_save) }.isEnabled)
                    assertTrue(views.filterIsInstance<Button>().single { it.text.toString()==activity.getString(R.string.widget_preview) }.isEnabled)
                    assertNull(HomeWidgetStore(activity).config(id))
                    views.filterIsInstance<NativeDetails>().single().setExpanded(true)
                    assertTrue(views.filterIsInstance<TextView>().any { it.text.toString()==activity.getString(R.string.widget_help_text)&&it.isShown })
                }
            }
        } finally {host.deleteAppWidgetId(id);host.deleteHost();locales.applicationLocales=previous;instrumentation.waitForIdleSync()}
    }
}
