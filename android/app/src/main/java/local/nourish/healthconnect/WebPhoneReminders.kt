package local.nourish.healthconnect

import android.content.Intent
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultRegistry
import androidx.lifecycle.lifecycleScope
import org.json.JSONObject

class WebPhoneReminders(activity:ComponentActivity,runtime:PhoneReminderRuntime=PhoneReminderRuntime.get(activity),registry:ActivityResultRegistry=activity.activityResultRegistry) {
    private val permission=PhoneReminderPermission(activity,registry)
    private val session=PhoneReminderUiSession(activity.lifecycleScope,runtime::status,permission::request,
        {runtime.connect(it);Unit},runtime::requestDisconnect,{runtime.finishDisconnect();Unit},
        {activity.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,activity.packageName))})
    fun request(id:String,action:String,label:String?,reply:(Result<JSONObject>)->Unit)=session.request(id,action,label,reply)
    fun cancel(id:String?)=session.cancel(id)
}
