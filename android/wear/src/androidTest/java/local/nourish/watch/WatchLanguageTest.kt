package local.nourish.watch

import android.Manifest
import android.app.LocaleManager
import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Rect
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
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import local.nourish.wearcontract.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
@SdkSuppress(minSdkVersion=33)
class WatchLanguageTest {
    @Test fun english()=verify("en","Connect / change phone","Your reminder is ready. Open Nourishing when convenient.")
    @Test fun french()=verify("fr","Connecter / changer de téléphone","Votre rappel est prêt. Ouvrez Nourishing quand vous voulez.")
    @Test fun german()=verify("de","Smartphone verbinden / wechseln","Ihre Erinnerung ist bereit. Nourishing bei Gelegenheit öffnen.")
    @Test fun portuguese()=verify("pt-BR","Conectar / trocar celular","Seu lembrete está pronto. Abra o Nourishing quando puder.")
    private fun views(view:View):List<View> = listOf(view)+if(view is ViewGroup)(0 until view.childCount).flatMap { views(view.getChildAt(it)) } else emptyList()
    private fun verify(language:String,connect:String,reminder:String){
        val instrument=InstrumentationRegistry.getInstrumentation();val base=instrument.targetContext
        val locales=base.getSystemService(LocaleManager::class.java);val before=locales.applicationLocales
        val manager=base.getSystemService(NotificationManager::class.java)
        instrument.uiAutomation.grantRuntimePermission(base.packageName,Manifest.permission.POST_NOTIFICATIONS)
        WatchNotifications(base).disconnect();base.getSharedPreferences("watch-deliveries",Context.MODE_PRIVATE).edit().clear().commit()
        try {
            locales.applicationLocales=LocaleList.forLanguageTags(language);instrument.waitForIdleSync()
            ActivityScenario.launch(WatchActivity::class.java).use { scenario->
                scenario.onActivity { activity->
                    assertEquals(language,activity.resources.configuration.locales[0].toLanguageTag())
                    val all=views(activity.window.decorView);assertTrue(all.filterIsInstance<Button>().any { it.text.toString()==connect })
                    val help=all.filterIsInstance<TextView>().single { it.text.toString()==activity.getString(R.string.watch_help) };assertEquals(View.GONE,help.visibility)
                    val details=all.filterIsInstance<Button>().single { it.text.toString()==activity.getString(R.string.watch_details) }
                    details.performClick();assertEquals(View.VISIBLE,help.visibility);assertEquals(activity.getString(R.string.watch_hide_details),details.text.toString());details.performClick();assertEquals(View.GONE,help.visibility)
                    val scroll=all.filterIsInstance<ScrollView>().single();val target=all.filterIsInstance<Button>().single { it.text.toString()==connect }
                    val rect=Rect(0,0,target.width,target.height);scroll.offsetDescendantRectToMyCoords(target,rect);scroll.scrollTo(0,rect.centerY()-scroll.height/2)
                }
                val ready=CountDownLatch(1);scenario.onActivity { activity->activity.window.decorView.viewTreeObserver.registerFrameCommitCallback{ready.countDown()};activity.window.decorView.invalidate() };assertTrue(ready.await(5,TimeUnit.SECONDS))
                instrument.uiAutomation.waitForIdle(250,5000)
                scenario.onActivity { activity->
                    val all=views(activity.window.decorView)
                    for(button in all.filterIsInstance<Button>()){
                        val layout=requireNotNull(button.layout);assertTrue(button.text.toString(),layout.height<=button.height-button.compoundPaddingTop-button.compoundPaddingBottom)
                        for(line in 0 until layout.lineCount)assertEquals(button.text.toString(),0,layout.getEllipsisCount(line))
                    }
                    val batch=WatchReminderBatch.parse(JSONObject(instrument.context.assets.open("wear-reminder-claim.json").bufferedReader().use{it.readText()}))
                    val revision="00000000-0000-4000-8000-000000000001";val settings=WatchSettings(activity)
                    settings.selectPhone("phone",batch.asOf.minusSeconds(60));assertTrue(settings.confirmRevision("phone",revision,batch.asOf.minusSeconds(60)))
                    val receiver=WatchNotifications(activity){batch.asOf};receiver.setKinds(setOf("food"),batch.asOf.minusSeconds(60))
                    val state=receiver.state("phone",revision);val packet=WatchAlertDelivery(revision,requireNotNull(state.preferenceRevision),batch.asOf,batch.events.single())
                    assertEquals("accepted",receiver.receive("phone",packet.bytes()).outcome)
                    val notification=manager.activeNotifications.single().notification
                    assertEquals("Nourishing",notification.extras.getString(Notification.EXTRA_TITLE));assertEquals(reminder,notification.extras.getString(Notification.EXTRA_TEXT))
                    assertEquals(activity.getString(R.string.watch_food_channel),manager.getNotificationChannel("nourish-food").name.toString())
                    receiver.disconnect();assertTrue(manager.activeNotifications.isEmpty())
                }
                val image=requireNotNull(instrument.uiAutomation.takeScreenshot());File(base.getExternalFilesDir(null),"wear-language-$language.png").outputStream().use { image.compress(Bitmap.CompressFormat.PNG,100,it) };image.recycle()
            }
        }finally{WatchNotifications(base).disconnect();locales.applicationLocales=before;instrument.waitForIdleSync()}
    }
}
