package local.nourish.healthconnect

import android.content.res.Configuration
import android.os.LocaleList
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import local.nourish.wearcontract.WatchReply
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class WearReplyLanguageNativeTest {
    @Test fun english()=verify("en",listOf("Enable watch access in Nourishing on your phone.","Watch access changed. Connect again.","Refresh in progress. Try again shortly.","Check Nourishing and Tailscale on your phone, then refresh."))
    @Test fun french()=verify("fr",listOf("Activez l’accès à la montre dans Nourishing sur votre téléphone.","L’accès à la montre a changé. Reconnectez-vous.","Actualisation en cours. Réessayez dans un instant.","Vérifiez Nourishing et Tailscale sur votre téléphone, puis actualisez."))
    @Test fun german()=verify("de",listOf("Aktivieren Sie den Uhrenzugriff in Nourishing auf Ihrem Smartphone.","Der Uhrenzugriff hat sich geändert. Erneut verbinden.","Aktualisierung läuft. Versuchen Sie es gleich noch einmal.","Prüfen Sie Nourishing und Tailscale auf Ihrem Smartphone und aktualisieren Sie erneut."))
    @Test fun portuguese()=verify("pt-BR",listOf("Ative o acesso ao relógio no Nourishing no seu celular.","O acesso ao relógio mudou. Conecte novamente.","Atualização em andamento. Tente novamente em instantes.","Verifique Nourishing e Tailscale no seu celular e atualize."))
    private fun verify(language:String,expected:List<String>)=runBlocking {
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val base=instrumentation.targetContext
        val context=base.createConfigurationContext(Configuration(base.resources.configuration).apply{setLocales(LocaleList.forLanguageTags(language))})
        val notices=listOf(WearReplyNotice.DISABLED,WearReplyNotice.CHANGED,WearReplyNotice.BUSY,WearReplyNotice.UNAVAILABLE)
        assertEquals(expected,notices.map(context::wearReplyMessage))
        for(notice in notices){
            val parsed=WatchReply.parse(WatchReply.unavailable(context.wearReplyMessage(notice)).bytes())
            assertEquals("unavailable",parsed.status);assertNull(parsed.summary);assertEquals(context.wearReplyMessage(notice),parsed.message)
        }
        val disabled=readWearReply("kcal",{null},context::wearReplyMessage){_,_->error("Disabled access fetched data")}
        assertEquals(expected[0],disabled.message);assertNull(disabled.summary)
        var config:WearConfig?=WearConfig(WorkspaceOrigin.parse("https://fixture.test.ts.net"),"owner@example.test","revision-1")
        val changed=readWearReply("kcal",{config},context::wearReplyMessage){_,_->
            config=null
            org.json.JSONObject(instrumentation.context.assets.open("wear-summary.json").bufferedReader().use{it.readText()})
        }
        assertEquals(expected[1],changed.message);assertNull(changed.summary)
    }
}
