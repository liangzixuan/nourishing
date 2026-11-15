package local.nourish.healthconnect

import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import java.io.File
import android.view.ContextThemeWrapper
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.util.Locale
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TransferPresentationNativeTest {
    @Test fun englishTransfer() = verify("en", "Use only your private https://…ts.net address, without a path, credentials, query or fragment.", "Check private connection")
    @Test fun frenchTransfer() = verify("fr", "Utilisez uniquement votre adresse privée https://…ts.net, sans chemin, identifiants, requête ni fragment.", "Vérifier la connexion privée")
    @Test fun germanTransfer() = verify("de", "Verwenden Sie nur Ihre private https://…ts.net-Adresse ohne Pfad, Zugangsdaten, Abfrage oder Fragment.", "Private Verbindung prüfen")
    @Test fun portugueseTransfer() = verify("pt-BR", "Use apenas seu endereço privado https://…ts.net, sem caminho, credenciais, consulta ou fragmento.", "Verificar conexão privada")
    private fun verify(language: String, invalidAddress: String, checkLabel: String) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val base = instrumentation.targetContext
        base.getSharedPreferences("private-workspace-sync", 0).edit().clear().commit()
        val config = Configuration(base.resources.configuration).apply { setLocale(Locale.forLanguageTag(language)); fontScale = 1.5f }
        val context = ContextThemeWrapper(base.createConfigurationContext(config), android.R.style.Theme_Material_Light_NoActionBar)
        instrumentation.runOnMainSync {
            val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
            val busy = mutableListOf<Boolean>()
            val panel = WorkspaceTransferPanel(context, scope, {null}, {error("No read expected")}, {null}, {fail("No permission expected")}, busy::add)
            try {
                val address = (0 until panel.childCount).map(panel::getChildAt).filterIsInstance<EditText>().single()
                val buttons = (0 until panel.childCount).map(panel::getChildAt).filterIsInstance<Button>()
                address.setText("http://wrong.example")
                assertTrue(buttons.first().performClick())
                assertEquals(listOf(true, false), busy)
                val output = panel.getChildAt(3) as TextView
                assertEquals(invalidAddress, output.text.toString())
                assertEquals(checkLabel, buttons.first().text.toString())
                assertFalse(buttons[1].isEnabled);assertFalse(buttons[2].isEnabled)
                for(code in WorkspaceError.entries){
                    val translated=context.workspaceErrorText(WorkspaceValidationFailure(code))
                    assertEquals(context.getString(code.displayResource),translated)
                    if(language!="en")assertNotEquals(code.diagnostic,translated)
                    assertEquals(code.diagnostic,context.workspaceErrorText(IllegalArgumentException(code.diagnostic)))
                    assertEquals(code.diagnostic,context.workspaceErrorText(WorkspaceTransferFailure(code.diagnostic)))
                }
                val source="Server detail: %1\$s <source>\nLITERAL"
                val unknown=WorkspaceTransferFailure(source,true,503)
                assertEquals(source+" "+context.getString(R.string.transfer_error_unknown_outcome),context.workspaceErrorText(unknown))
                assertEquals(503,unknown.httpStatus);assertTrue(unknown.outcomeUnknown)
                assertEquals(context.getString(R.string.transfer_counts,1,2,3),context.importCountsText(ImportCounts(1,2,3)))
                val review=context.getString(R.string.transfer_review,"https://fixture.test.ts.net","owner@example.test","2026-11-01","2026-11-02","America/Chicago",context.importCountsText(ImportCounts(1,2,3)),source)
                assertTrue(review.contains(source));assertTrue(review.contains("owner@example.test"));assertTrue(review.contains("America/Chicago"))
                val width=(320*context.resources.displayMetrics.density).toInt()
                panel.setPadding(16,16,16,16);panel.setBackgroundColor(android.graphics.Color.WHITE)
                panel.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(0,View.MeasureSpec.UNSPECIFIED));panel.layout(0,0,width,panel.measuredHeight)
                for(i in 0..6){val view=panel.getChildAt(i) as? TextView ?: continue;if(view is EditText)continue;val layout=requireNotNull(view.layout);for(line in 0 until layout.lineCount)assertEquals(view.text.toString(),0,layout.getEllipsisCount(line));assertTrue(view.text.toString(),layout.height<=view.height-view.compoundPaddingTop-view.compoundPaddingBottom)}
                val bitmap=Bitmap.createBitmap(width,panel.getChildAt(7).top,Bitmap.Config.ARGB_8888);panel.draw(Canvas(bitmap));File(base.getExternalFilesDir(null),"transfer-presentation-"+language+".png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG,100,it) };bitmap.recycle()
                assertTrue(buttons.first().isEnabled)
                panel.setExternalBusy(true);assertFalse(buttons.first().isEnabled)
                panel.setExternalBusy(false);assertTrue(buttons.first().isEnabled)
                panel.dispose();assertFalse(buttons.first().isEnabled)
            } finally { panel.dispose();scope.cancel() }
        }
    }
}
