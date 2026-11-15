package local.nourish.healthconnect

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.installations.FirebaseInstallations
import com.google.firebase.messaging.FirebaseMessaging
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeout

/** Public Android resource configuration only. Server credentials never enter the APK. */
class AndroidPhoneReminderFirebase(context:Context):PhoneReminderFirebase {
    private val context=context.applicationContext
    private val options=FirebaseOptions.fromResource(this.context)
    override val projectId:String? get()=options?.projectId
    private fun messaging():FirebaseMessaging {
        if(projectId==null)throw PhoneReminderFailure(PhoneReminderIssue.NOT_CONFIGURED)
        val app=FirebaseApp.getApps(context).firstOrNull{it.name==FirebaseApp.DEFAULT_APP_NAME}
            ?:FirebaseApp.initializeApp(context)?:throw PhoneReminderFailure(PhoneReminderIssue.NOT_CONFIGURED)
        if(app.options.projectId!=projectId)throw PhoneReminderFailure(PhoneReminderIssue.PROJECT)
        return FirebaseMessaging.getInstance()
    }
    override fun autoInitialize(enabled:Boolean){
        if(!enabled&&(projectId==null||FirebaseApp.getApps(context).none{it.name==FirebaseApp.DEFAULT_APP_NAME}))return
        messaging().isAutoInitEnabled=enabled
    }
    override suspend fun register():String=task {
        messaging().register().await()
        FirebaseInstallations.getInstance().id.await()
    }
    override suspend fun unregister(){if(projectId!=null)task{messaging().unregister().await()}}
    private suspend fun <T> task(operation:suspend()->T):T=try{withTimeout(60_000){operation()}}
    catch(_:TimeoutCancellationException){throw IOException("Firebase reminder request timed out")}
    catch(error:CancellationException){throw error}
    catch(error:PhoneReminderFailure){throw error}
    catch(_:Exception){throw IOException("Firebase reminder request failed")}
}
