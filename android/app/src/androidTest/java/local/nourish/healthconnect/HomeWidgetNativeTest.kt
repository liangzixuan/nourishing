package local.nourish.healthconnect

import android.appwidget.AppWidgetHost
import android.appwidget.AppWidgetHostView
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Rect
import android.os.Bundle
import android.view.View
import android.widget.ListView
import android.widget.FrameLayout
import android.widget.TextView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Actual Android widget service and RemoteViews, in a controlled host rather than a launcher. */
@RunWith(AndroidJUnit4::class)
class HomeWidgetNativeTest {
    @Test fun widgetActionsOpenNativeDiaryFoodAndFasting() {
        for(kind in WidgetKind.entries)Hosted(kind,300).use { widget ->
            val origin=WorkspaceOrigin.parse("https://fixture.example.ts.net:8443")
            val snapshot=fixture().apply { getJSONObject("access").put("origin",origin.value) }
            widget.save(snapshot,config(kind).copy(origin=origin))
            val actions=mutableListOf(R.id.widget_open to if(kind==WidgetKind.FASTING)"fasting" else "diary")
            if(kind==WidgetKind.REMAINING)actions.add(R.id.widget_food to "food")
            for((id,destination) in actions) {
                val monitor=instrument.addMonitor(NourishingActivity::class.java.name,null,false)
                var opened:android.app.Activity?=null
                try {
                    widget.inspect { assertTrue(it.widgetView<View>(id).performClick()) }
                    opened=instrument.waitForMonitorWithTimeout(monitor,5000)
                    assertNotNull("$kind $destination must open Nourishing",opened)
                    var url:String?=null
                    until("Widget did not load $destination") {
                        instrument.runOnMainSync { url=opened!!.findViewById<View>(android.R.id.content).findViewWithTag<android.webkit.WebView>("nourishing-webview").url }
                        url=="https://fixture.example.ts.net:8443/?widget=$destination"
                    }
                } finally {
                    opened?.let { activity -> instrument.runOnMainSync { activity.finish() } }
                    instrument.removeMonitor(monitor)
                    instrument.waitForIdleSync()
                }
            }
        }
    }
    private val instrument get()=InstrumentationRegistry.getInstrumentation()
    private val context get()=instrument.targetContext
    private fun fixture()=JSONObject(instrument.context.assets.open("home-widget.json").bufferedReader().use{it.readText()})
    private fun config(kind:WidgetKind)=HomeWidgetConfig(WorkspaceOrigin.parse("https://fixture.test.ts.net"),"owner@example.test","kcal",kind,"native-fixture")
    // Collection item host views are root namespaces; findViewById intentionally stops at them.
    private fun descendants(view:View):List<View> = listOf(view)+if(view is android.view.ViewGroup)(0 until view.childCount).flatMap{descendants(view.getChildAt(it))} else emptyList()
    @Suppress("UNCHECKED_CAST")
    private fun <T:View> View.widgetView(id:Int):T = requireNotNull(descendants(this).firstOrNull{it.id==id}) as T
    private fun until(message:String,condition:()->Boolean){val deadline=System.nanoTime()+5_000_000_000;while(!condition()&&System.nanoTime()<deadline)Thread.sleep(25);assertTrue(message,condition())}
    private inner class Hosted(val kind:WidgetKind,val height:Int=180,val scale:Float=1f):AutoCloseable{
        val manager=AppWidgetManager.getInstance(context)
        val host=AppWidgetHost(context,44021)
        val id=host.allocateAppWidgetId()
        val store=HomeWidgetStore(context)
        val scenario=ActivityScenario.launch(WearSettingsActivity::class.java)
        lateinit var view:AppWidgetHostView
        lateinit var renderContext:Context
        init{
            val provider=when(kind){WidgetKind.CONSUMED->ConsumedWidget::class.java;WidgetKind.REMAINING->RemainingWidget::class.java;WidgetKind.FASTING->FastingWidget::class.java}
            instrument.uiAutomation.adoptShellPermissionIdentity("android.permission.BIND_APPWIDGET")
            try{assertTrue("Could not bind the test host",manager.bindAppWidgetIdIfAllowed(id,ComponentName(context,provider),options(height)))}finally{instrument.uiAutomation.dropShellPermissionIdentity()}
            scenario.onActivity{activity->
                renderContext=activity.createConfigurationContext(Configuration(activity.resources.configuration).apply{fontScale=scale})
                host.startListening();view=host.createView(renderContext,id,requireNotNull(manager.getAppWidgetInfo(id)))
                val outer=FrameLayout(activity).apply{setBackgroundColor(android.graphics.Color.WHITE);setPadding(24,140,24,24)}
                outer.addView(view,FrameLayout.LayoutParams(dp(250),dp(height)));activity.setContentView(outer)
            }
            awaitText(renderContext.getString(R.string.widget_unconfigured))
        }
        private fun dp(value:Int)=(value*context.resources.displayMetrics.density).toInt()
        fun options(height:Int)=Bundle().apply{putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,250);putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH,250);putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,height);putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT,height)}
        fun inspect(action:(AppWidgetHostView)->Unit){scenario.onActivity{action(view)}}
        fun text(id:Int):String{var result="";inspect{result=(descendants(it).firstOrNull{view->view.id==id} as? TextView)?.text?.toString().orEmpty()};return result}
        fun awaitText(value:String){
            try {until("Missing widget value: $value"){text(R.id.widget_value)==value}}
            catch(error:AssertionError){
                inspect{root->fun dump(view:View){android.util.Log.e("NourishWidgetTest", "${view.javaClass.simpleName} id=${view.id} visible=${view.visibility} size=${view.width}x${view.height} text=${(view as? TextView)?.text} count=${(view as? ListView)?.adapter?.count}");if(view is android.view.ViewGroup)for(i in 0 until view.childCount)dump(view.getChildAt(i))};dump(root)}
                snapshot("widget-initial-failure");throw error
            }
        }
        fun save(json:JSONObject=fixture(),choice:HomeWidgetConfig=config(kind)){scenario.onActivity{store.save(id,choice,json);renderHomeWidget(renderContext,id)};awaitText(HomeWidgetSnapshot.parse(json,choice).card.value)}
        fun resize(height:Int){scenario.onActivity{view.layoutParams=view.layoutParams.apply{this.height=dp(height)};manager.updateAppWidgetOptions(id,options(height));renderHomeWidget(renderContext,id)};instrument.waitForIdleSync()}
        fun snapshot(name:String){
            val ready=CountDownLatch(1);scenario.onActivity{it.window.decorView.viewTreeObserver.registerFrameCommitCallback{ready.countDown()};it.window.decorView.invalidate()};assertTrue(ready.await(5,TimeUnit.SECONDS))
            instrument.uiAutomation.waitForIdle(250,5000)
            requireNotNull(instrument.uiAutomation.takeScreenshot()).let{bitmap->File(context.getExternalFilesDir(null),"$name.png").outputStream().use{bitmap.compress(Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle()}
        }
        fun visibleText(id:Int){inspect{root->
            val text=root.widgetView<TextView>(id);assertEquals(View.VISIBLE,text.visibility)
            val rect=Rect();assertTrue("Text is not visible: ${text.text}",text.getGlobalVisibleRect(rect))
            assertTrue("Text is clipped: ${text.text} (${rect.height()} of ${text.height})",rect.height()>=text.height)
            assertTrue("Text layout exceeds view: ${text.text} (${text.layout.height} of ${text.height}, size ${text.textSize})",text.layout.height<=text.height-text.compoundPaddingTop-text.compoundPaddingBottom)
            assertEquals("Text was shortened: ${text.text}",text.text.length,text.layout.getLineEnd(text.layout.lineCount-1))
            for(line in 0 until text.layout.lineCount){assertEquals(0,text.layout.getEllipsisCount(line));assertTrue("Source line $line at $height/$scale: width=${text.layout.getLineWidth(line)} max=${text.layout.getLineMax(line)} available=${text.width-text.compoundPaddingLeft-text.compoundPaddingRight}",text.layout.getLineMax(line)<=text.width-text.compoundPaddingLeft-text.compoundPaddingRight)}
        }}
        fun accessibleAction(id:Int){inspect{root->
            val action=root.widgetView<View>(id);val bounds=Rect();assertTrue(action.getGlobalVisibleRect(bounds))
            assertTrue(bounds.height()>=dp(48));assertTrue(bounds.width()>=dp(48));assertFalse(action.contentDescription.isNullOrBlank())
        }}
        override fun close(){host.deleteAppWidgetId(id);until("Removed widget retained configuration"){store.config(id)==null};host.stopListening();host.deleteHost();scenario.close()}
    }
    @Test @androidx.test.filters.SdkSuppress(minSdkVersion=33) fun localizedFallbacksRemainVisibleAtLargeFont(){
        val locales=context.getSystemService(android.app.LocaleManager::class.java);val previous=locales.applicationLocales
        val previousScale=context.resources.configuration.fontScale
        fun systemScale(value:Float){
            android.os.ParcelFileDescriptor.AutoCloseInputStream(instrument.uiAutomation.executeShellCommand("settings put system font_scale $value")).use { it.readBytes() }
            until("Android text scale did not update") { kotlin.math.abs(context.resources.configuration.fontScale-value)<0.01f }
            instrument.waitForIdleSync()
        }
        try {systemScale(2f);for(language in listOf("en","fr","de","pt-BR")){
            locales.applicationLocales=android.os.LocaleList.forLanguageTags(language);instrument.waitForIdleSync()
            Hosted(WidgetKind.CONSUMED,180,2f).use { widget->
                widget.awaitText(widget.renderContext.getString(R.string.widget_unconfigured));widget.visibleText(R.id.widget_value)
                assertEquals("Nourishing",widget.text(R.id.widget_title));widget.snapshot("widget-unconfigured-$language")
                widget.save();assertEquals("100 kcal",widget.text(R.id.widget_value))
                widget.scenario.onActivity { assertTrue(widget.store.publish(widget.id,config(WidgetKind.CONSUMED),null));renderHomeWidget(widget.renderContext,widget.id) }
                widget.awaitText(widget.renderContext.getString(R.string.widget_refresh_needed));widget.visibleText(R.id.widget_value)
                widget.snapshot("widget-refresh-$language")
            }
        }}finally{locales.applicationLocales=previous;systemScale(previousScale);instrument.waitForIdleSync()}
    }
    @Test fun actualProvidersRenderAllThreeDatedCardsAtMinimumSize(){
        for(kind in WidgetKind.entries)Hosted(kind).use{widget->
            widget.save();assertTrue(widget.text(R.id.widget_stamp).contains("2026-10-29"));assertTrue(widget.text(R.id.widget_stamp).contains("America/Chicago"))
            widget.snapshot("widget-${kind.key}-minimum")
            for(id in listOf(R.id.widget_title,R.id.widget_value,R.id.widget_stamp,R.id.widget_refresh,R.id.widget_configure))widget.visibleText(id)
            widget.inspect{assertEquals(View.GONE,it.widgetView<View>(R.id.widget_detail).visibility)}
        }
    }
    @Test fun resizedWidgetShowsCompleteMacroAndHighlightText(){
        Hosted(WidgetKind.REMAINING).use{widget->
            widget.save();widget.resize(250);until("Macro details did not appear"){var visible=false;widget.inspect{visible=it.widgetView<View>(R.id.widget_detail).visibility==View.VISIBLE};visible};widget.visibleText(R.id.widget_detail);widget.visibleText(R.id.widget_food)
            widget.resize(440);until("Highlights did not appear"){var visible=false;widget.inspect{visible=it.widgetView<View>(R.id.widget_expanded).visibility==View.VISIBLE};visible};widget.snapshot("widget-expanded");widget.visibleText(R.id.widget_expanded)
        }
    }
    @Test fun largeFontDoesNotClipMinimumWidgetValueOrActions(){
        for(kind in WidgetKind.entries)Hosted(kind,180,2f).use{widget->
            widget.save();widget.snapshot("widget-large-font-${kind.key}")
            for(id in listOf(R.id.widget_title,R.id.widget_value,R.id.widget_stamp))widget.visibleText(id)
            for(id in listOf(R.id.widget_open,R.id.widget_refresh,R.id.widget_configure))widget.accessibleAction(id)
            widget.inspect{assertTrue(it.widgetView<View>(R.id.widget_stamp).contentDescription.contains("America/Chicago"))}
            if(kind==WidgetKind.FASTING){val future=fixture();future.getJSONObject("cards").getJSONObject("fasting").put("value","Recorded start is in the future");widget.save(future);widget.snapshot("widget-large-font-future");widget.visibleText(R.id.widget_value)}
            widget.scenario.onActivity{assertTrue(widget.store.publish(widget.id,config(kind),null));renderHomeWidget(widget.renderContext,widget.id)};widget.awaitText("Refresh needed");widget.visibleText(R.id.widget_value)
        }
    }
    @Test fun failedRefreshClearsOldSnapshotAndChangedConfigurationRejectsLateResult(){
        Hosted(WidgetKind.CONSUMED).use{widget->
            widget.save();val original=config(WidgetKind.CONSUMED)
            widget.scenario.onActivity{assertTrue(widget.store.publish(widget.id,original,null));renderHomeWidget(widget.renderContext,widget.id)};widget.awaitText("Refresh needed")
            val next=original.copy(revision="replacement");widget.save(choice=next)
            assertFalse(widget.store.publish(widget.id,original,null));assertEquals("100 kcal",widget.text(R.id.widget_value))
            widget.host.deleteAppWidgetId(widget.id);until("Deletion did not revoke snapshot"){widget.store.config(widget.id)==null};assertFalse(widget.store.publish(widget.id,next,fixture()))
        }
    }
    @Test fun restoredIdsRequireNewConfiguration(){
        Hosted(WidgetKind.FASTING).use{widget->widget.save();widget.scenario.onActivity{FastingWidget().onRestored(context,intArrayOf(widget.id),intArrayOf(widget.id))};widget.awaitText("Set up widget");assertNull(widget.store.config(widget.id))}
    }
    @Test fun sourceCreditsSurviveCachedCaptureAndEveryLineCanBeReadAtSmallAndLargeSizes(){
        for((height,scale) in listOf(180 to 1f,180 to 2f,440 to 1f))Hosted(WidgetKind.CONSUMED,height,scale).use{widget->
            widget.save();val credit=fixture().getJSONObject("cards").getJSONObject("consumed").getJSONArray("attributions").getString(0)
            assertEquals(listOf(credit),HomeWidgetStore(context).snapshot(widget.id,config(WidgetKind.CONSUMED))!!.card.attributions)
            until("Sources collection missing"){var count=0;widget.inspect{count=it.widgetView<ListView>(R.id.widget_list).adapter?.count ?: 0};count==2}
            widget.inspect{it.widgetView<ListView>(R.id.widget_list).setSelectionFromTop(1,0)};instrument.waitForIdleSync()
            until("Exact source reference missing"){widget.text(R.id.widget_sources)=="Sources\n"+credit}
            widget.snapshot("widget-sources-$height-$scale-top")
            var lines=0
            widget.inspect{root->
                val text=root.widgetView<TextView>(R.id.widget_sources);lines=text.layout.lineCount
                assertEquals(text.text.length,text.layout.getLineEnd(lines-1))
                // Visible horizontal extent excludes trailing wrap-space; the full original text is checked above.
                for(line in 0 until lines){assertEquals(0,text.layout.getEllipsisCount(line));assertTrue("Source line $line at $height/$scale: width=${text.layout.getLineWidth(line)} max=${text.layout.getLineMax(line)} available=${text.width-text.compoundPaddingLeft-text.compoundPaddingRight}",text.layout.getLineMax(line)<=text.width-text.compoundPaddingLeft-text.compoundPaddingRight)}
            }
            for(line in 0 until lines){
                widget.inspect{root->val text=root.widgetView<TextView>(R.id.widget_sources);root.widgetView<ListView>(R.id.widget_list).setSelectionFromTop(1,-text.compoundPaddingTop-text.layout.getLineTop(line))}
                instrument.waitForIdleSync()
                widget.inspect{root->
                    val text=root.widgetView<TextView>(R.id.widget_sources);val bounds=Rect();assertTrue(text.getGlobalVisibleRect(bounds));val location=IntArray(2);text.getLocationOnScreen(location)
                    val top=location[1]+text.compoundPaddingTop+text.layout.getLineTop(line);val bottom=location[1]+text.compoundPaddingTop+text.layout.getLineBottom(line)
                    assertTrue("Source line $line is clipped at font $scale: $top..$bottom in $bounds",top>=bounds.top&&bottom<=bounds.bottom)
                }
            }
            widget.snapshot("widget-sources-$height-$scale")
            widget.scenario.onActivity{assertTrue(widget.store.publish(widget.id,config(WidgetKind.CONSUMED),null));renderHomeWidget(widget.renderContext,widget.id)}
            widget.awaitText("Refresh needed")
            widget.inspect{assertEquals(1,it.widgetView<ListView>(R.id.widget_list).adapter.count)}
            assertNull(HomeWidgetStore(context).snapshot(widget.id,config(WidgetKind.CONSUMED)))
        }
    }

}
