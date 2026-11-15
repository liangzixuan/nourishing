package local.nourish.healthconnect

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.provider.OpenableColumns
import android.webkit.WebView
import androidx.core.content.FileProvider
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.*
import org.junit.Test

class WebImageShareNativeTest {
    private val instrumentation=InstrumentationRegistry.getInstrumentation()
    private val context=instrumentation.targetContext
    private fun png():ByteArray=ByteArrayOutputStream().also{out->Bitmap.createBitmap(12,10,Bitmap.Config.ARGB_8888).apply{eraseColor(android.graphics.Color.GREEN);compress(Bitmap.CompressFormat.PNG,100,out);recycle()}}.toByteArray()
    @Suppress("DEPRECATION")
    @Test fun chooserContainsExactImageAndOnlyReadPermission(){
        val bytes=png();val chooser=WebImageShare(context).createChooser("streak.png","image/png",bytes)
        assertEquals(Intent.ACTION_CHOOSER,chooser.action)
        val send=chooser.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)!!
        assertEquals(Intent.ACTION_SEND,send.action);assertEquals("image/png",send.type)
        assertTrue(send.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION!=0)
        assertEquals(0,send.flags and Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        val uri=send.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)!!
        assertEquals("content",uri.scheme);assertEquals(context.packageName+".shared-images",uri.authority)
        assertEquals(uri,send.clipData!!.getItemAt(0).uri);assertEquals("image/png",context.contentResolver.getType(uri))
        context.contentResolver.openInputStream(uri)!!.use{assertArrayEquals(bytes,it.readBytes())}
        context.contentResolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)!!.use{assertTrue(it.moveToFirst());assertEquals("streak.png",it.getString(0))}
        val provider=context.packageManager.resolveContentProvider(uri.authority!!,0)!!
        assertFalse(provider.exported);assertTrue(provider.grantUriPermissions)
        assertThrows(IllegalArgumentException::class.java){FileProvider.getUriForFile(context,uri.authority!!,File(context.filesDir,"workspace-secret.json"))}
    }
    @Test fun invalidImagesAreRejectedBeforeAChooserCanOpen(){
        val share=WebImageShare(context)
        assertThrows(IllegalArgumentException::class.java){share.createChooser("fake.png","image/png","not an image".toByteArray())}
        assertThrows(IllegalArgumentException::class.java){share.createChooser("fake.txt","text/plain",png())}
    }
    private fun evaluate(web:WebView,script:String):String {
        val done=CountDownLatch(1);val result=AtomicReference<String>()
        instrumentation.runOnMainSync{web.evaluateJavascript(script){result.set(it);done.countDown()}}
        assertTrue(done.await(5,TimeUnit.SECONDS));return result.get()
    }
    @Test fun trustedWebImageOpensAndroidChooserAndCancelReturnsToTheDiary(){
        ActivityScenario.launch<Activity>(context.packageManager.getLaunchIntentForPackage(context.packageName)!!).use{scenario ->
            lateinit var web:WebView
            scenario.onActivity{activity->
                web=activity.window.decorView.findViewWithTag("nourishing-webview");web.stopLoading()
                web.loadDataWithBaseURL("https://fixture.example.ts.net:8443/share-fixture","<html><body>Streak sharing fixture</body></html>","text/html","UTF-8","https://fixture.example.ts.net:8443/share-fixture")
            }
            var ready=false
            repeat(100){if(!ready){ready=evaluate(web,"typeof window.NourishingNative?.shareImage==='function'")=="true";if(!ready)Thread.sleep(100)}}
            assertTrue("Native image share was not installed",ready)
            evaluate(web,"(()=>{const c=document.createElement('canvas');c.width=900;c.height=890;const x=c.getContext('2d');x.fillStyle='#252839';x.fillRect(0,0,900,890);x.fillStyle='white';x.font='40px sans-serif';x.fillText('Nourishing test image',40,80);c.toBlob(blob=>window.NourishingNative.shareImage(new File([blob],'test-streak.png',{type:'image/png'})).then(()=>window.shareDone=true).catch(e=>window.shareError=e.message),'image/png');return true})()")
            var chooser=false;var foreground=""
            repeat(100){if(!chooser){foreground=instrumentation.uiAutomation.rootInActiveWindow?.packageName?.toString().orEmpty();chooser=foreground.contains("intentresolver");if(!chooser)Thread.sleep(100)}}
            assertTrue("Expected Android chooser, got $foreground; error="+evaluate(web,"window.shareError||null"),chooser)
            instrumentation.uiAutomation.waitForIdle(500,5000)
            assertTrue(instrumentation.uiAutomation.rootInActiveWindow?.packageName?.toString().orEmpty().contains("intentresolver"))
            fun textTree(node:android.view.accessibility.AccessibilityNodeInfo?):String {
                if(node==null)return ""
                return listOfNotNull(node.text?.toString(),node.contentDescription?.toString()).joinToString(" ")+"\n"+(0 until node.childCount).joinToString("\n"){textTree(node.getChild(it))}
            }
            File(context.getExternalFilesDir(null),"native-share-tree.txt").writeText(textTree(instrumentation.uiAutomation.rootInActiveWindow))
            instrumentation.uiAutomation.takeScreenshot()?.let{bitmap->File(context.getExternalFilesDir(null),"native-share-sheet.png").outputStream().use{bitmap.compress(Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle()}
            assertTrue(instrumentation.uiAutomation.performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK))
            var returned=false
            repeat(50){if(!returned){returned=instrumentation.uiAutomation.rootInActiveWindow?.packageName?.toString()==context.packageName;if(!returned)Thread.sleep(100)}}
            assertTrue("Cancel did not return to Nourishing",returned)
            assertEquals("true",evaluate(web,"window.shareDone===true"))
            assertEquals("\"Streak sharing fixture\"",evaluate(web,"document.body.textContent"))
        }
    }
}
