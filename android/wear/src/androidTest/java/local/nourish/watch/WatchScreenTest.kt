package local.nourish.watch

import android.graphics.Bitmap
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ScrollView
import android.widget.TextView
import androidx.lifecycle.Lifecycle
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import local.nourish.wearcontract.WatchSummary
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.Before
import org.junit.runner.RunWith

/** Synthetic producer data exercises the actual screen; it does not establish phone pairing. */
@RunWith(AndroidJUnit4::class)
class WatchScreenTest {
    private val instrument get()=InstrumentationRegistry.getInstrumentation()
    @Before fun reset(){
        WatchNotifications(instrument.targetContext).disconnect()
        if(android.os.Build.VERSION.SDK_INT>=33)instrument.uiAutomation.grantRuntimePermission(instrument.targetContext.packageName,android.Manifest.permission.POST_NOTIFICATIONS)
    }
    private fun views(view:View):List<View> = listOf(view)+if(view is ViewGroup)(0 until view.childCount).flatMap{views(view.getChildAt(it))} else emptyList()
    private fun render(activity:WatchActivity,summary:WatchSummary){
        WatchActivity::class.java.getDeclaredMethod("render",WatchSummary::class.java).apply{isAccessible=true}.invoke(activity,summary)
    }
    private fun frames(scenario:ActivityScenario<WatchActivity>){
        val ready=CountDownLatch(1)
        scenario.onActivity{activity->
            val view=activity.window.decorView
            view.viewTreeObserver.registerFrameCommitCallback{ready.countDown()}
            view.invalidate()
        }
        assertTrue("Screen did not draw",ready.await(5,TimeUnit.SECONDS))
    }
    private fun snapshot(name:String){
        instrument.waitForIdleSync()
        instrument.uiAutomation.waitForIdle(250,5000)
        requireNotNull(instrument.uiAutomation.takeScreenshot()).let{bitmap->
            File(instrument.targetContext.getExternalFilesDir(null),"$name.png").outputStream().use{bitmap.compress(Bitmap.CompressFormat.PNG,100,it)}
            bitmap.recycle()
        }
    }
    @Test fun producerSummaryRendersAndDisconnectClearsIt(){
        val summary=WatchSummary.parse(JSONObject(instrument.context.assets.open("wear-summary.json").bufferedReader().use{it.readText()}))
        ActivityScenario.launch(WatchActivity::class.java).use{scenario->
            scenario.onActivity{activity->render(activity,summary)}
            frames(scenario)
            scenario.onActivity{activity->
                val all=views(activity.window.decorView)
                val texts=all.filterIsInstance<TextView>().map{it.text.toString()}
                for(row in summary.energy.rows+summary.scores.rows+summary.targets.rows){assertTrue("Missing ${row.title}",texts.contains(row.title));assertTrue(texts.contains(row.value))}
                assertTrue(texts.contains("Unknown"));assertTrue(texts.contains("Not measured"))
                val consumed=all.filterIsInstance<TextView>().first{it.text.toString()=="100 kcal"}
                val scroll=all.filterIsInstance<ScrollView>().single()
                val rectangle=android.graphics.Rect(0,0,consumed.width,consumed.height)
                scroll.offsetDescendantRectToMyCoords(consumed,rectangle)
                scroll.scrollTo(0,rectangle.top-scroll.height/2)
            }
            frames(scenario)
            scenario.onActivity{activity->
                val value=views(activity.window.decorView).filterIsInstance<TextView>().first{it.text=="100 kcal"}
                val bounds=android.graphics.Rect()
                assertTrue("Energy value must be visible",value.getGlobalVisibleRect(bounds))
                assertTrue("Energy value must fit vertically",bounds.height()>=value.height)
            }
            snapshot("wear-energy")
            scenario.onActivity{activity->
                val all=views(activity.window.decorView)
                all.filterIsInstance<ScrollView>().single().fullScroll(View.FOCUS_DOWN)
            }
            frames(scenario)
            snapshot("wear-controls")
            scenario.onActivity{activity->
                val all=views(activity.window.decorView)
                val disconnect=all.filterIsInstance<Button>().single{it.text=="Disconnect"}
                assertTrue(disconnect.isEnabled);disconnect.performClick()
                assertFalse(views(activity.window.decorView).filterIsInstance<TextView>().any{it.text=="100 kcal"})
            }
            snapshot("wear-disconnected")
        }
    }
    @Test fun backgroundClearsHealthValues(){
        val summary=WatchSummary.parse(JSONObject(instrument.context.assets.open("wear-summary.json").bufferedReader().use{it.readText()}))
        ActivityScenario.launch(WatchActivity::class.java).use{scenario->
            scenario.onActivity{render(it,summary)}
            scenario.moveToState(Lifecycle.State.CREATED)
            scenario.moveToState(Lifecycle.State.RESUMED)
            scenario.onActivity{activity->assertFalse(views(activity.window.decorView).filterIsInstance<TextView>().any{it.text=="100 kcal"})}
        }
    }
    @Test fun alertControlsStartOffPersistAndDisconnectRevokesThem(){
        val settings=WatchSettings(instrument.targetContext)
        settings.selectPhone("phone");assertTrue(settings.confirmRevision("phone","00000000-0000-4000-8000-000000000001"))
        ActivityScenario.launch(WatchActivity::class.java).use{scenario->
            scenario.onActivity{activity->
                fun tap(text:String)=views(activity.window.decorView).filterIsInstance<Button>().single{it.text==text}.performClick()
                assertTrue(settings.read().kinds.isEmpty())
                tap("Food alerts: off");assertEquals(setOf("food"),settings.read().kinds)
                tap("Fasting alerts: off");assertEquals(setOf("food","fasting"),settings.read().kinds)
                tap("Food alerts: on");assertEquals(setOf("fasting"),settings.read().kinds)
            }
            scenario.recreate()
            scenario.onActivity{activity->
                assertTrue(views(activity.window.decorView).filterIsInstance<Button>().any{it.text=="Fasting alerts: on"})
                views(activity.window.decorView).filterIsInstance<Button>().single{it.text=="Disconnect"}.performClick()
                assertNull(settings.read().policy());assertTrue(settings.read().kinds.isEmpty())
            }
        }
    }
    @Test fun clearMessageRemovesVisibleDataEvenIfServiceClearedSettingsFirst(){
        val settings=WatchSettings(instrument.targetContext);settings.selectPhone("phone")
        val summary=WatchSummary.parse(JSONObject(instrument.context.assets.open("wear-summary.json").bufferedReader().use{it.readText()}))
        ActivityScenario.launch(WatchActivity::class.java).use{scenario->
            scenario.onActivity{activity->
                render(activity,summary)
                WatchNotifications(instrument.targetContext).disconnect()
                activity.onMessageReceived(object:com.google.android.gms.wearable.MessageEvent{
                    override fun getPath()=local.nourish.wearcontract.WATCH_CLEAR_PATH
                    override fun getSourceNodeId()="phone"
                    override fun getRequestId()=1
                    override fun getData()=byteArrayOf()
                })
                assertFalse(views(activity.window.decorView).filterIsInstance<TextView>().any{it.text=="100 kcal"})
            }
        }
    }
    @Test fun sourceCreditsRenderInFullAndClearWithTheHealthDisplay(){
        val summary=WatchSummary.parse(JSONObject(instrument.context.assets.open("wear-summary.json").bufferedReader().use{it.readText()}))
        assertTrue(summary.attributions.isNotEmpty())
        ActivityScenario.launch(WatchActivity::class.java).use{scenario->
            scenario.onActivity{render(it,summary)};frames(scenario)
            for(credit in summary.attributions){
                scenario.onActivity{activity->
                    val all=views(activity.window.decorView);val text=all.filterIsInstance<TextView>().single{it.text.toString()==credit}
                    assertEquals(credit.length,text.layout.getLineEnd(text.layout.lineCount-1))
                    assertTrue(text.layout.height<=text.height-text.compoundPaddingTop-text.compoundPaddingBottom)
                    for(line in 0 until text.layout.lineCount){assertEquals(0,text.layout.getEllipsisCount(line));assertTrue(text.layout.getLineWidth(line)<=text.width-text.compoundPaddingLeft-text.compoundPaddingRight)}
                    val scroll=all.filterIsInstance<ScrollView>().single();val rect=android.graphics.Rect(0,0,text.width,text.height)
                    scroll.offsetDescendantRectToMyCoords(text,rect);scroll.scrollTo(0,rect.centerY()-scroll.height/2)
                };frames(scenario)
                scenario.onActivity{activity->
                    val text=views(activity.window.decorView).filterIsInstance<TextView>().single{it.text.toString()==credit}
                    val bounds=android.graphics.Rect();assertTrue(text.getGlobalVisibleRect(bounds));assertEquals("Source credit must fit fully in the scroll viewport",text.height,bounds.height())
                }
            }
            snapshot("wear-source-credits")
            scenario.onActivity{activity->
                views(activity.window.decorView).filterIsInstance<Button>().single{it.text=="Disconnect"}.performClick()
                assertFalse(views(activity.window.decorView).filterIsInstance<TextView>().any{it.text.toString() in summary.attributions})
            }
        }
    }

}
