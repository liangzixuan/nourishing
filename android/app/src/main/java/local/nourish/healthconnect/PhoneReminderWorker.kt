package local.nourish.healthconnect

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException

const val PHONE_REMINDER_WORK="nourishing-phone-reminder-connection"
fun enqueuePhoneReminderWork(context:Context){
    val request=OneTimeWorkRequestBuilder<PhoneReminderWorker>()
        .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
        .setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,TimeUnit.SECONDS).build()
    // A callback arriving while work finishes must get a subsequent run.
    WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(PHONE_REMINDER_WORK,ExistingWorkPolicy.APPEND_OR_REPLACE,request)
}
class PhoneReminderWorker internal constructor(context:Context,parameters:WorkerParameters,private val runtime:PhoneReminderRuntime):CoroutineWorker(context,parameters) {
    constructor(context:Context,parameters:WorkerParameters):this(context,parameters,PhoneReminderRuntime.get(context))
    override suspend fun doWork():Result=try {
        if(NourishingWorkspace.cloudOrigin!=null)Result.success()else when(runtime.sync()){
            PhoneReminderSync.RETRY->Result.retry()
            PhoneReminderSync.COMPLETE,PhoneReminderSync.ATTENTION->Result.success()
        }
    }catch(error:CancellationException){throw error}
    catch(_:IOException){Result.retry()}
    catch(_:Exception){Result.failure(workDataOf("issue" to "protocol"))}
}
