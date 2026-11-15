package local.nourish.healthconnect

import android.Manifest
import android.content.Intent
import androidx.activity.result.ActivityResultRegistry
import androidx.activity.result.contract.ActivityResultContract
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.ActivityOptionsCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.launch
import org.junit.Assert.*
import org.junit.Test

class PhoneReminderPermissionNativeTest {
    private val instrument=InstrumentationRegistry.getInstrumentation()
    private class Registry:ActivityResultRegistry(){
        lateinit var intent:Intent;var code=0;var launches=0
        override fun <I,O> onLaunch(requestCode:Int,contract:ActivityResultContract<I,O>,input:I,options:ActivityOptionsCompat?){code=requestCode;launches++;intent=contract.createIntent(InstrumentationRegistry.getInstrumentation().targetContext,input)}
        fun respond(value:Boolean){dispatchResult(code,value)}
    }
    private fun fixture(block:(NourishingActivity,PhoneReminderPermission,Registry)->Unit){
        ActivityScenario.launch<NourishingActivity>(Intent(instrument.targetContext,NourishingActivity::class.java)).use{scenario->
            scenario.moveToState(Lifecycle.State.CREATED);val registry=Registry();lateinit var permission:PhoneReminderPermission;lateinit var activity:NourishingActivity
            scenario.onActivity{activity=it;permission=PhoneReminderPermission(it,registry){true}}
            scenario.moveToState(Lifecycle.State.RESUMED);instrument.runOnMainSync{block(activity,permission,registry)}
        }
    }
    @Test fun standardNotificationPermissionReturnsGrantAndDenial(){fixture{activity,permission,registry->
        var result:Boolean?=null;activity.lifecycleScope.launch(start=CoroutineStart.UNDISPATCHED){result=permission.request()}
        assertArrayEquals(arrayOf(Manifest.permission.POST_NOTIFICATIONS),registry.intent.getStringArrayExtra(ActivityResultContracts.RequestMultiplePermissions.EXTRA_PERMISSIONS))
        assertNull(result);registry.respond(true);assertEquals(true,result)
        activity.lifecycleScope.launch(start=CoroutineStart.UNDISPATCHED){result=permission.request()};registry.respond(false);assertEquals(false,result)
    }}
    @Test fun latePermissionResultCannotBeAssignedToANewerPage(){fixture{activity,permission,registry->
        var calls=0;val old=activity.lifecycleScope.launch(start=CoroutineStart.UNDISPATCHED){permission.request();calls++};old.cancel()
        var error:Throwable?=null;activity.lifecycleScope.launch(start=CoroutineStart.UNDISPATCHED){try{permission.request()}catch(value:Exception){error=value}}
        assertEquals("busy",(error as PhoneReminderUiFailure).code);assertEquals(1,registry.launches);registry.respond(true);assertEquals(0,calls)
        var result:Boolean?=null;activity.lifecycleScope.launch(start=CoroutineStart.UNDISPATCHED){result=permission.request()};registry.respond(false);assertEquals(false,result)
    }}
    @Test fun unconfiguredControllerDoesNotOpenTheAndroidPrompt(){
        ActivityScenario.launch<NourishingActivity>(Intent(instrument.targetContext,NourishingActivity::class.java)).use{scenario->
            scenario.moveToState(Lifecycle.State.CREATED);val registry=Registry();lateinit var controls:WebPhoneReminders
            scenario.onActivity{controls=WebPhoneReminders(it,registry=registry)};scenario.moveToState(Lifecycle.State.RESUMED)
            instrument.runOnMainSync{
                var error:Throwable?=null;controls.request("1","connect","Phone"){error=it.exceptionOrNull()}
                assertEquals(PhoneReminderIssue.NOT_CONFIGURED,(error as PhoneReminderFailure).issue);assertEquals(0,registry.launches);controls.cancel(null)
            }
        }
    }
}
