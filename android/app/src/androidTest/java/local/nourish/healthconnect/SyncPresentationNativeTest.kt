package local.nourish.healthconnect
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.ContextThemeWrapper
import android.view.View
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.TextView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.time.Instant
import java.util.Locale
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
@RunWith(AndroidJUnit4::class)
class SyncPresentationNativeTest {
 @Test fun englishSync()=verify("en","Hourly sync is off.","Weight")
 @Test fun frenchSync()=verify("fr","Synchronisation horaire désactivée.","Poids")
 @Test fun germanSync()=verify("de","Stündliche Synchronisierung ist ausgeschaltet.","Gewicht")
 @Test fun portugueseSync()=verify("pt-BR","Sincronização por hora desativada.","Peso")
 private fun verify(language:String,initial:String,weight:String) {
  val instrumentation=InstrumentationRegistry.getInstrumentation();val base=instrumentation.targetContext
  val prefs=base.getSharedPreferences("private-workspace-sync",0);prefs.edit().clear().commit()
  val config=Configuration(base.resources.configuration).apply{setLocale(Locale.forLanguageTag(language));fontScale=1.5f}
  val context=ContextThemeWrapper(base.createConfigurationContext(config),android.R.style.Theme_Material_Light_NoActionBar)
  val settings=SyncSettings(base)
  assertEquals(initial,context.syncStatusText(settings.status))
  prefs.edit().putString("status","Hourly sync is off.").commit()
  assertEquals(SyncStatus.Literal("Hourly sync is off."),settings.status)
  assertEquals("Hourly sync is off.",context.syncStatusText(settings.status))
  prefs.edit().clear().commit()
  val origin=WorkspaceOrigin.parse("https://fixture.test.ts.net");val identity=WorkspaceIdentity("owner@example.test")
  assertThrows(SyncStateFailure::class.java){settings.enable(origin,identity,setOf(ExportType.WEIGHT),7)}
  assertNull(settings.background())
  settings.confirm(origin,identity)
  var saved=settings.enable(origin,identity,setOf(ExportType.WEIGHT),7,BackgroundSyncMode.RECONCILIATION,false)
  assertFalse(prefs.contains("status"));assertEquals(SyncStatus.Notice(SyncNotice.ENABLED),settings.status)
  val at=Instant.parse("2026-11-07T12:00:00Z")
  val snapshot=SyncStatus.Snapshot(at,ImportCounts(1,2,3),setOf(ExportType.WEIGHT))
  settings.status(saved,snapshot)
  val before=prefs.all.toMap()
  assertTrue(context.syncStatusText(SyncSettings(context).status).contains(weight))
  assertTrue(context.syncConfigurationText(settings.status,saved).contains(identity.login))
  assertTrue(context.syncConfigurationText(settings.status,saved).contains(origin.value))
  assertEquals(before,prefs.all);assertEquals(saved,SyncSettings(context).background());assertFalse(saved.allowRemovals)
  for(notice in SyncNotice.entries)assertTrue(context.syncStatusText(SyncStatus.Notice(notice)).isNotBlank())
  for(code in SyncError.entries){
   val translated=context.syncDiagnosticText(captureSyncDiagnostic(SyncStateFailure(code)))
   assertEquals(context.getString(code.displayResource),translated)
   if(language!="en")assertNotEquals(code.diagnostic,translated)
   assertEquals(code.diagnostic,context.syncDiagnosticText(captureSyncDiagnostic(IllegalStateException(code.diagnostic))))
  }
  val failed=SyncStatus.Failed(at,captureSyncDiagnostic(WorkspaceTransferFailure("SERVER-LITERAL",true,503)))
  settings.status(saved,failed)
  assertEquals(failed,SyncSettings(context).status)
  val failedText=context.syncStatusText(settings.status)
  assertTrue(failedText.contains("SERVER-LITERAL"));assertTrue(failedText.contains(context.getString(R.string.transfer_error_unknown_outcome)))
  val held=SyncStatus.HeldRemovals(ReconciliationCounts(1,2,3,4,5,6));settings.status(saved,held)
  assertEquals(held,SyncSettings(context).status)
  assertTrue(context.syncStatusText(held).contains(context.reconciliationCountsText(held.counts)))
  val previous=saved;saved=settings.enable(origin,identity,setOf(ExportType.WEIGHT),7,BackgroundSyncMode.RECONCILIATION,false)
  settings.status(previous,failed);assertEquals(SyncStatus.Notice(SyncNotice.ENABLED),settings.status)
  instrumentation.runOnMainSync {
   val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main.immediate)
   val panel=WorkspaceTransferPanel(context,scope,{null},{error("No selection expected")},{null},{fail("No permission expected")},{})
   try {
    val stop=panel.getChildAt(panel.childCount-1) as Button
    panel.setExternalBusy(true);assertTrue(stop.isEnabled);assertFalse((panel.getChildAt(9) as CheckBox).isEnabled)
    assertTrue(stop.performClick());assertNull(settings.background());assertEquals(SyncStatus.Notice(SyncNotice.STOPPED),settings.status)
    settings.status(saved,failed);assertEquals(SyncStatus.Notice(SyncNotice.STOPPED),settings.status)
    panel.setExternalBusy(false)
    saved=settings.enable(origin,identity,setOf(ExportType.WEIGHT),7,BackgroundSyncMode.RECONCILIATION,false);panel.refresh()
    (panel.getChildAt(9) as CheckBox).performClick();assertTrue((panel.getChildAt(9) as CheckBox).isChecked);assertFalse((panel.getChildAt(10) as CheckBox).isChecked)
    assertEquals(SyncStatus.Notice(SyncNotice.SELECTION_EDITED),settings.status);assertNull(settings.background())
    saved=settings.enable(origin,identity,setOf(ExportType.WEIGHT),7,BackgroundSyncMode.RECONCILIATION,false);panel.refresh()
    (panel.getChildAt(2) as EditText).setText("https://changed.test.ts.net")
    assertNull(settings.background());assertEquals(SyncStatus.Notice(SyncNotice.DESTINATION_EDITED),settings.status)
    assertFalse((panel.getChildAt(5) as Button).isEnabled);assertFalse((panel.getChildAt(6) as Button).isEnabled)
    assertEquals(context.syncStatusText(settings.status),(panel.getChildAt(11) as TextView).text.toString())
    val width=(320*context.resources.displayMetrics.density).toInt();panel.setPadding(16,16,16,16);panel.setBackgroundColor(android.graphics.Color.WHITE)
    panel.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(0,View.MeasureSpec.UNSPECIFIED));panel.layout(0,0,width,panel.measuredHeight)
    for(i in 7 until panel.childCount){val view=panel.getChildAt(i) as? TextView ?: continue;val layout=requireNotNull(view.layout);for(line in 0 until layout.lineCount)assertEquals(view.text.toString(),0,layout.getEllipsisCount(line));assertTrue(view.text.toString(),layout.height<=view.height-view.compoundPaddingTop-view.compoundPaddingBottom)}
    for(i in 0 until panel.childCount)panel.getChildAt(i).jumpDrawablesToCurrentState()
    val top=panel.getChildAt(9).top;val bitmap=Bitmap.createBitmap(width,panel.height-top,Bitmap.Config.ARGB_8888);val canvas=Canvas(bitmap);canvas.translate(0f,-top.toFloat());panel.draw(canvas);File(base.getExternalFilesDir(null),"sync-presentation-"+language+".png").outputStream().use{bitmap.compress(Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle()
   } finally {panel.dispose();scope.cancel();prefs.edit().clear().commit()}
  }
 }
}
