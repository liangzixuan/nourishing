package local.nourish.healthconnect

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultRegistry
import androidx.activity.result.contract.ActivityResultContracts
import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** A cancelled page cannot receive a later permission approval. */
class PhoneReminderPermission(private val activity:ComponentActivity,registry:ActivityResultRegistry=activity.activityResultRegistry,private val requiresRuntimePermission:()->Boolean={Build.VERSION.SDK_INT>=33&&activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED}) {
    private var launched=false
    private var receiver:CancellableContinuation<Boolean>?=null
    private val launcher=registry.register("nourishing-phone-reminder-permission",activity,ActivityResultContracts.RequestPermission()){granted->
        launched=false;val continuation=receiver;receiver=null
        if(continuation?.isActive==true)continuation.resume(granted)
    }
    suspend fun request():Boolean {
        if(launched)throw PhoneReminderUiFailure("busy")
        if(!requiresRuntimePermission())return PhoneReminderNotifications(activity).allowed()
        return suspendCancellableCoroutine { continuation ->
            launched=true;receiver=continuation
            continuation.invokeOnCancellation{if(receiver===continuation)receiver=null}
            try{launcher.launch(Manifest.permission.POST_NOTIFICATIONS)}catch(error:Exception){launched=false;receiver=null;if(continuation.isActive)continuation.resumeWithException(error)}
        }
    }
}
