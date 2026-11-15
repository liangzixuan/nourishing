package local.nourish.healthconnect

import android.app.ActivityManager
import android.app.Notification
import android.app.NotificationManager
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ScrollView
import android.widget.TextView
import android.graphics.Bitmap
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import androidx.test.core.app.ActivityScenario
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Before
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class WearRelayServiceTest{
    private val instrument get()=InstrumentationRegistry.getInstrumentation()
    private val context get()=instrument.targetContext
    private val manager get()=context.getSystemService(NotificationManager::class.java)
    private val origin=WorkspaceOrigin.parse("https://fixture.test.ts.net")
    private fun views(view:View):List<View> = listOf(view)+if(view is ViewGroup)(0 until view.childCount).flatMap{views(view.getChildAt(it))} else emptyList()
    private fun tap(activity:WearSettingsActivity,text:String){views(activity.window.decorView).filterIsInstance<Button>().single{it.text==text}.performClick()}
    private fun until(message:String,condition:()->Boolean){val deadline=System.nanoTime()+5_000_000_000;while(!condition()&&System.nanoTime()<deadline)Thread.sleep(25);assertTrue(message,condition())}
    private fun snapshot(scenario:ActivityScenario<WearSettingsActivity>){
        val frame=CountDownLatch(1)
        scenario.onActivity{activity->
            val all=views(activity.window.decorView);val scroll=all.filterIsInstance<ScrollView>().single();scroll.scrollTo(0,0)
            activity.window.decorView.viewTreeObserver.registerFrameCommitCallback{frame.countDown()};activity.window.decorView.invalidate()
        }
        assertTrue(frame.await(5,TimeUnit.SECONDS));instrument.waitForIdleSync();instrument.uiAutomation.waitForIdle(250,5000)
        scenario.onActivity{activity->
            val title=views(activity.window.decorView).filterIsInstance<TextView>().single{it.text=="Nourishing watch access"}
            val bounds=android.graphics.Rect();assertTrue(title.getGlobalVisibleRect(bounds))
            val top=requireNotNull(ViewCompat.getRootWindowInsets(activity.window.decorView)).getInsets(WindowInsetsCompat.Type.systemBars()).top
            assertTrue("Title overlaps the system status bar",bounds.top>=top)
        }
        requireNotNull(instrument.uiAutomation.takeScreenshot()).let{bitmap->File(context.getExternalFilesDir(null),"wear-relay-controls.png").outputStream().use{bitmap.compress(Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle()}
    }
    @Suppress("DEPRECATION") private fun foreground()=context.getSystemService(ActivityManager::class.java).getRunningServices(100).any{it.service.className==WearRelayService::class.java.name&&it.foreground}
    @Before fun setup(){
        WearRelayService.stop(context);until("Old relay still running"){!foreground()}
        for(permission in WearRelayService.permissions())instrument.uiAutomation.grantRuntimePermission(context.packageName,permission)
        WearSettings(context).clear();context.getSharedPreferences("wear-relay",0).edit().clear().commit()
        manager.cancelAll()
    }
    @After fun cleanup(){WearRelayService.stop(context);WearSettings(context).clear();until("Relay did not stop"){!foreground()}}
    @Test fun explicitStartCreatesLocalForegroundNoticeAndItsStopActionStopsService(){
        WearSettings(context).enable(origin,WorkspaceIdentity("owner@example.test"))
        ActivityScenario.launch(WearSettingsActivity::class.java).use{scenario->
            assertNull(WearRelayControl.run);assertFalse(foreground())
            scenario.onActivity{tap(it,"Start watch relay")}
            until("Relay did not enter foreground"){foreground()&&manager.activeNotifications.any{it.id==4201}}
            val notification=manager.activeNotifications.single{it.id==4201}.notification
            assertEquals("Nourishing watch relay",notification.extras.getString(Notification.EXTRA_TITLE))
            assertTrue(notification.flags and Notification.FLAG_LOCAL_ONLY != 0)
            snapshot(scenario)
            notification.actions.single{it.title=="Stop"}.actionIntent.send()
            until("Stop action did not revoke relay"){WearRelayControl.run==null&&!foreground()&&manager.activeNotifications.none{it.id==4201}}
        }
    }
    @Test fun stoppingFromSettingsAndTurningOffAccessRevokeTheRunningSession(){
        WearSettings(context).enable(origin,WorkspaceIdentity("owner@example.test"))
        ActivityScenario.launch(WearSettingsActivity::class.java).use{scenario->
            scenario.onActivity{tap(it,"Start watch relay")};until("Not running"){foreground()}
            scenario.onActivity{tap(it,"Stop watch relay")};until("Still running"){!foreground()};assertNull(WearRelayControl.run)
            scenario.onActivity{tap(it,"Start watch relay")};until("Not restarted"){foreground()}
            scenario.onActivity{tap(it,"Turn off watch access")};until("Still running after revoke"){!foreground()};assertNull(WearSettings(context).config());assertNull(WearRelayControl.run)
        }
    }
    @Test fun noConfiguredAccountCannotStartRelay(){
        ActivityScenario.launch(WearSettingsActivity::class.java).use{scenario->scenario.onActivity{tap(it,"Start watch relay")};assertNull(WearRelayControl.run);assertFalse(foreground());assertEquals(WearRelayStatus.Notice(WearRelayNotice.ENABLE_FIRST),WearRelayControl.status)}
    }
    @Test fun registrationHistorySurvivesRestartAndExplicitReconnectKeepsStableClientId(){
        WearSettings(context).enable(origin,WorkspaceIdentity("owner@example.test"));val config=requireNotNull(WearSettings(context).config())
        val store=WearRelayStore(context);val id=store.clientId(config,"watch");val registration=WearRegistration("b".repeat(64),"00000000-0000-4000-8000-000000000001",setOf("food"))
        store.save(config,"watch",registration);assertEquals(registration,WearRelayStore(context).load(config,"watch"));assertEquals(id,WearRelayStore(context).clientId(config,"watch"))
        store.reconnect();assertNull(store.load(config,"watch"));assertEquals(id,store.clientId(config,"watch"))
        assertNotEquals(id,store.clientId(config.copy(login="other@example.test"),"watch"))
    }
}
