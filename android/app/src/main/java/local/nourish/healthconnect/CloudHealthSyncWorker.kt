package local.nourish.healthconnect

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.work.*
import java.io.File
import java.time.Instant
import java.time.ZoneId
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.runBlocking

const val CLOUD_HEALTH_SYNC_WORK="nourishing-cloud-health-sync"
fun scheduleCloudHealthSync(context:Context){
    val work=PeriodicWorkRequestBuilder<CloudHealthSyncWorker>(1,TimeUnit.HOURS).setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
    WorkManager.getInstance(context).enqueueUniquePeriodicWork(CLOUD_HEALTH_SYNC_WORK,ExistingPeriodicWorkPolicy.UPDATE,work)
}
fun stopCloudHealthSync(context:Context){WorkManager.getInstance(context).cancelUniqueWork(CLOUD_HEALTH_SYNC_WORK)}

class CloudHealthSyncWorker(context:Context,parameters:WorkerParameters):CoroutineWorker(context,parameters){
    override suspend fun doWork():Result=withContext(Dispatchers.IO){
        CloudWebSessions.initialize(applicationContext)
        val settings=CloudBackgroundSettings(applicationContext);val config=settings.config()?:return@withContext Result.success()
        if(config.binding.origin!=NourishingWorkspace.cloudOrigin)return@withContext Result.success()
        val session=CloudWebSessions.get(config.binding.origin)
        var staged:File?=null
        try{
            val lease=session.acquire();val transfer=CloudBackgroundTransfer(session,settings::current)
            transfer.check(config,lease)
            check(HealthConnectClient.getSdkStatus(applicationContext)==HealthConnectClient.SDK_AVAILABLE){"Health Connect unavailable"}
            val health=HealthConnectClient.getOrCreate(applicationContext)
            suspend fun access(){
                check(!isStopped){"Import stopped"}
                transfer.check(config,lease)
                check(backgroundReadAvailable(health)){"Background reads unavailable"}
                val permissions=health.permissionController.getGrantedPermissions()
                check(BACKGROUND_READ_PERMISSION in permissions&&readPermissions(config.types).all(permissions::contains)){"Check Health Connect permissions"}
                transfer.check(config,lease)
            }
            access()
            val clock=Instant.now();val zone=ZoneId.systemDefault();val today=clock.atZone(zone).toLocalDate()
            val range=ExportRange.create(today.minusDays(config.days.toLong()-1).toString(),today.toString(),zone,clock)
            val snapshot=HealthConnectReader(health).read(range,config.types)
            access()
            val directory=File(applicationContext.cacheDir,"cloud-background-sync");check(directory.isDirectory||directory.mkdirs())
            staged=stageExport(directory,snapshot)
            // Permission and consent are checked before both network uploads.
            val counts=transfer.transfer(config,lease,staged!!){runBlocking{access()}}
            session.publish(lease){settings.status(config,"Imported ${counts.added}; updated ${counts.updated} · ${Instant.now()}")}
        }catch(error:CancellationException){throw error}
        catch(error:CloudSessionChanged){
            if(!session.matchesCookie(config.binding)){
                if(settings.disableIfCurrent(config,"Sign in and enable hourly import again"))stopCloudHealthSync(applicationContext)
            }else settings.status(config,"Import interrupted; waiting for the next hourly read")
        }
        catch(error:CloudApiFailure){if(error.status in setOf(401,403)){if(settings.disableIfCurrent(config,"Sign in and enable hourly import again"))stopCloudHealthSync(applicationContext)}else settings.status(config,"Import unavailable (${error.status})")}
        catch(error:CloudHealthImportUncertain){settings.status(config,"Import result unknown; the next hourly read will check source records")}
        catch(_:Exception){settings.status(config,"Import paused; check connection and Health Connect permissions")}
        finally{staged?.let{if(it.exists()&&!it.delete())settings.status(config,"Could not remove temporary export")}}
        Result.success()
    }
}
