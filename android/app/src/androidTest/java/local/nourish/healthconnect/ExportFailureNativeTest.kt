package local.nourish.healthconnect

import android.content.res.Configuration
import android.os.LocaleList
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.IOException
import java.text.NumberFormat
import java.time.Instant
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ExportFailureNativeTest {
    @Test fun english()=verify("en","Select 1 to 30 days.","Save failed. The incomplete file was removed.","Save failed. Delete the incomplete file before trying again.","Export exceeds")
    @Test fun french()=verify("fr","Sélectionnez de 1 à 30 jours.","Échec de l’enregistrement. Le fichier incomplet a été supprimé.","Échec de l’enregistrement. Supprimez le fichier incomplet avant de réessayer.","L’export dépasse")
    @Test fun german()=verify("de","Wählen Sie 1 bis 30 Tage.","Speichern fehlgeschlagen. Die unvollständige Datei wurde entfernt.","Speichern fehlgeschlagen. Löschen Sie die unvollständige Datei, bevor Sie es erneut versuchen.","Der Export überschreitet")
    @Test fun portuguese()=verify("pt-BR","Selecione de 1 a 30 dias.","Falha ao salvar. O arquivo incompleto foi removido.","Falha ao salvar. Exclua o arquivo incompleto antes de tentar novamente.","A exportação excede")
    private fun verify(language:String,range:String,removed:String,remains:String,limitPrefix:String){
        val base=InstrumentationRegistry.getInstrumentation().targetContext
        val context=base.createConfigurationContext(Configuration(base.resources.configuration).apply{setLocales(LocaleList.forLanguageTags(language))})
        assertEquals(range,context.exportProblemText(ExportFailureCode.RANGE_LENGTH))
        assertEquals(removed,context.exportFailureText(ExportSaveFailure(true,IOException())))
        assertEquals(remains,context.exportFailureText(ExportSaveFailure(false,IOException())))
        val limit=context.exportFailureText(ExportByteLimitExceeded())!!
        assertTrue(limit.startsWith(limitPrefix))
        assertTrue(limit.contains(NumberFormat.getIntegerInstance(context.resources.configuration.locales[0]).format(MAX_EXPORT_BYTES)))
        val now=Instant.parse("2026-11-07T12:00:00Z")
        for(code in ExportFailureCode.entries){
            val text=context.exportProblemText(code)
            assertTrue(text.isNotBlank());assertFalse(text.contains("%1\u0024s"))
            val failure=when(code){
                ExportFailureCode.BYTE_LIMIT->ExportByteLimitExceeded()
                ExportFailureCode.SAVE_REMOVED->ExportSaveFailure(true,IOException())
                ExportFailureCode.SAVE_REMAINS->ExportSaveFailure(false,IOException())
                else->ExportRangeFailure(code)
            }
            assertEquals(text,context.workspaceErrorText(failure))
            assertEquals(text,context.syncDiagnosticText(captureSyncDiagnostic(failure)))
            val saved=decodeSyncStatus(encodeSyncStatus(SyncStatus.Failed(now,captureSyncDiagnostic(failure))))
            assertTrue(context.syncStatusText(saved).contains(text))
            val hourly=decodeHourlyExportStatus(encodeHourlyExportStatus(HourlyExportStatus.Failed(now,1,0,captureSyncDiagnostic(failure))))
            assertEquals(text,context.syncDiagnosticText((hourly as HourlyExportStatus.Failed).problem))
            val external=IOException(code.diagnostic)
            assertNull(context.exportFailureText(external))
            assertEquals(code.diagnostic,context.workspaceErrorText(external))
            assertEquals(code.diagnostic,context.syncDiagnosticText(captureSyncDiagnostic(external)))
        }
    }
}
