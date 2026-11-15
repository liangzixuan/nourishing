package local.nourish.healthconnect

import android.app.LocaleConfig
import android.app.LocaleManager
import android.graphics.Bitmap
import android.graphics.Rect
import android.os.LocaleList
import android.os.SystemClock
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.ImageButton
import android.widget.TextView
import android.webkit.WebView
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
class AppLanguageNativeTest {
    private val instrumentation get()=InstrumentationRegistry.getInstrumentation()
    private val context get()=instrumentation.targetContext
    private fun descendants(view:View):List<View> = listOf(view)+if(view is ViewGroup)(0 until view.childCount).flatMap { descendants(view.getChildAt(it)) } else emptyList()
    private fun until(message:String,condition:()->Boolean){val end=System.nanoTime()+5_000_000_000;while(!condition()&&System.nanoTime()<end)Thread.sleep(50);assertTrue(message,condition())}
    @Test fun manifestAdvertisesOnlyTheFourSupportedLanguages(){
        val config=LocaleConfig(context);assertEquals(LocaleConfig.STATUS_SUCCESS,config.status)
        val locales=requireNotNull(config.supportedLocales)
        assertEquals(4,locales.size())
        assertEquals(setOf("en","fr","de","pt-BR"),(0 until locales.size()).map { locales[it].toLanguageTag() }.toSet())
    }
    @Test fun platformChoiceSurvivesActivityRecreationAndCanFollowSystem(){
        val manager=context.getSystemService(LocaleManager::class.java);val before=manager.applicationLocales
        try {
            for((language,title) in listOf("en" to "Nourishing watch access","fr" to "Accès montre Nourishing","de" to "Nourishing-Uhrenzugriff","pt-BR" to "Acesso ao relógio Nourishing")){
                manager.applicationLocales=LocaleList.forLanguageTags(language);instrumentation.waitForIdleSync()
                ActivityScenario.launch(WearSettingsActivity::class.java).use { scenario->
                    fun check(){scenario.onActivity { activity->
                        assertEquals(language,activity.resources.configuration.locales[0].toLanguageTag())
                        assertTrue(descendants(activity.window.decorView).filterIsInstance<TextView>().any { it.text.toString()==title })
                    }}
                    check();scenario.recreate();check();assertEquals(language,manager.applicationLocales.toLanguageTags())
                }
            }
            manager.applicationLocales=LocaleList.getEmptyLocaleList();instrumentation.waitForIdleSync();assertTrue(manager.applicationLocales.isEmpty)
        }finally{manager.applicationLocales=before;instrumentation.waitForIdleSync()}
    }
    @Test fun appMenuOpensTheAndroidLanguagePickerForNourishing(){
        val manager=context.getSystemService(LocaleManager::class.java);val before=manager.applicationLocales
        try {
            manager.applicationLocales=LocaleList.forLanguageTags("en");instrumentation.waitForIdleSync()
            ActivityScenario.launch(NourishingActivity::class.java).use { scenario->
                scenario.onActivity { activity->descendants(activity.window.decorView).filterIsInstance<ImageButton>().single { it.contentDescription.toString()==activity.getString(R.string.web_menu) }.performClick() }
                until("Android language shortcut missing") { instrumentation.uiAutomation.rootInActiveWindow?.findAccessibilityNodeInfosByText("Android language")?.isNotEmpty()==true }
                val node=instrumentation.uiAutomation.rootInActiveWindow.findAccessibilityNodeInfosByText("Android language").first()
                val bounds=Rect();node.getBoundsInScreen(bounds);assertFalse(bounds.isEmpty)
                val now=SystemClock.uptimeMillis()
                for(action in listOf(MotionEvent.ACTION_DOWN,MotionEvent.ACTION_UP)){
                    val event=MotionEvent.obtain(now,SystemClock.uptimeMillis(),action,bounds.exactCenterX(),bounds.exactCenterY(),0)
                    try{instrumentation.sendPointerSync(event)}finally{event.recycle()}
                }
                until("Nourishing language picker did not open") {
                    val root=instrumentation.uiAutomation.rootInActiveWindow
                    root?.packageName?.toString()=="com.android.settings"&&root.findAccessibilityNodeInfosByText("Nourishing").isNotEmpty()
                }
                instrumentation.uiAutomation.waitForIdle(250,5000)
                val image=requireNotNull(instrumentation.uiAutomation.takeScreenshot())
                File(context.getExternalFilesDir(null),"android-language-picker.png").outputStream().use { image.compress(Bitmap.CompressFormat.PNG,100,it) };image.recycle()
                assertTrue(instrumentation.uiAutomation.performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK))
                scenario.onActivity { activity->assertNotNull(activity.window.decorView.findViewWithTag<WebView>("nourishing-webview")) }
            }
        }finally{manager.applicationLocales=before;instrumentation.waitForIdleSync()}
    }
}
