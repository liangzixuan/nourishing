package local.nourish.healthconnect

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.work.*
import java.time.Instant
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

const val HEALTH_EXPORT_WORK="nourish-hourly-health-export"
fun scheduleHealthExport(context:Context){
    val work=PeriodicWorkRequestBuilder<HealthExportWorker>(1,TimeUnit.HOURS)
        .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
    WorkManager.getInstance(context).enqueueUniquePeriodicWork(HEALTH_EXPORT_WORK,ExistingPeriodicWorkPolicy.UPDATE,work)
}
fun stopHealthExport(context:Context){WorkManager.getInstance(context).cancelUniqueWork(HEALTH_EXPORT_WORK)}
fun healthExportEndpoint(type:HealthWriteType,action:String)="/api/health-connect/export/"+(if(type.isIntake)"intake" else "biometric")+"/"+action

class HealthExportWorkspace(private val client:WorkspaceClient=WorkspaceClient()):HourlyExportTransport {
    private suspend fun identity(config:HourlyExportConfig){require(client.identity(config.origin)==WorkspaceIdentity(config.login)){"Private workspace account changed. Stop exports and check the connection before enabling again."}}
    override suspend fun preview(config:HourlyExportConfig,selection:JSONObject):HealthWritePlan {
        identity(config)
        return parseHealthWritePlan(client.exchange(config.origin,healthExportEndpoint(config.type,"preview"),json=selection),Instant.now())
    }
    override suspend fun verify(config:HourlyExportConfig,plan:HealthWritePlan){
        identity(config)
        val result=client.exchange(config.origin,healthExportEndpoint(config.type,"verify"),json=JSONObject().put("selection",JSONObject(plan.selection)).put("reviewToken",plan.reviewToken))
        require(result.getBoolean("valid")&&result.getString("reviewToken")==plan.reviewToken){"The workspace review changed. No new batch was sent."}
    }
}

class HealthExportWorker(context:Context,parameters:WorkerParameters):CoroutineWorker(context,parameters){
    override suspend fun doWork():Result=withContext(Dispatchers.IO){
        val settings=HourlyExportSettings(applicationContext)
        for(config in settings.configs()){
            val progress=HealthWriteProgress()
            try{
                checkSync(HealthConnectClient.getSdkStatus(applicationContext)==HealthConnectClient.SDK_AVAILABLE,SyncError.EXPORT_UNAVAILABLE)
                val health=HealthConnectClient.getOrCreate(applicationContext)
                val coordinator=HourlyExportCoordinator(settings,HealthExportWorkspace(),AndroidHealthWriteSink(health),NativeHealthWrites.sequence(applicationContext),access={saved->
                    checkSync(backgroundReadAvailable(health),SyncError.BACKGROUND_UNAVAILABLE)
                    val granted=health.permissionController.getGrantedPermissions()
                    checkSync(BACKGROUND_READ_PERMISSION in granted&&granted.containsAll(saved.type.permissions),SyncError.EXPORT_PERMISSION)
                })
                val result=coordinator.run(config,Instant.now(),progress)
                settings.status(config,HourlyExportStatus.Completed(Instant.now(),result.written,result.unchanged,result.skipped))
            }catch(error:CancellationException){
                settings.status(config,HourlyExportStatus.Interrupted(Instant.now(),progress.attempted,progress.confirmed))
                throw error
            }catch(error:Exception){
                settings.status(config,HourlyExportStatus.Failed(Instant.now(),progress.attempted,progress.confirmed,captureSyncDiagnostic(error)))
            }
        }
        Result.success()
    }
}
