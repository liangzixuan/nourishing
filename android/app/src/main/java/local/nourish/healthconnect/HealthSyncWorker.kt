package local.nourish.healthconnect

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.permission.HealthPermission
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.io.File
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext

const val HEALTH_SYNC_WORK = "nourish-private-health-sync"
val BACKGROUND_READ_PERMISSION: String get() = HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND

fun backgroundReadAvailable(client: HealthConnectClient): Boolean = client.features.getFeatureStatus(
    HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND) == HealthConnectFeatures.FEATURE_STATUS_AVAILABLE

fun scheduleHealthSync(context: Context) {
    val work = PeriodicWorkRequestBuilder<HealthSyncWorker>(1, TimeUnit.HOURS)
        .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
    WorkManager.getInstance(context).enqueueUniquePeriodicWork(HEALTH_SYNC_WORK, ExistingPeriodicWorkPolicy.UPDATE, work)
}
fun stopHealthSync(context: Context) { WorkManager.getInstance(context).cancelUniqueWork(HEALTH_SYNC_WORK) }

class HealthSyncWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val settings = SyncSettings(applicationContext)
        val config = settings.background() ?: return@withContext Result.success()
        val cache = File(applicationContext.cacheDir, "background-sync")
        var staged: File? = null
        try {
            if (HealthConnectClient.getSdkStatus(applicationContext) != HealthConnectClient.SDK_AVAILABLE) {
                settings.status(config, SyncStatus.Notice(SyncNotice.HEALTH_UNAVAILABLE));return@withContext Result.success()
            }
            val health = HealthConnectClient.getOrCreate(applicationContext)
            if (!backgroundReadAvailable(health) || BACKGROUND_READ_PERMISSION !in health.permissionController.getGrantedPermissions()) {
                settings.status(config, SyncStatus.Notice(SyncNotice.PERMISSION_UNAVAILABLE));return@withContext Result.success()
            }
            if(config.mode==BackgroundSyncMode.RECONCILIATION){
                val directory=File(applicationContext.filesDir,"health-reconciliation")
                suspend fun access(types:Set<ExportType>){
                    checkSync(settings.current(config), SyncError.RECONCILIATION_STOPPED)
                    checkSync(backgroundReadAvailable(health), SyncError.BACKGROUND_UNAVAILABLE)
                    val permissions=health.permissionController.getGrantedPermissions()
                    checkSync(BACKGROUND_READ_PERMISSION in permissions&&readPermissions(types).all(permissions::contains), SyncError.RECONCILIATION_PERMISSION)
                    checkSync(settings.current(config), SyncError.RECONCILIATION_CHANGED)
                }
                val client=WorkspaceClient(beforeHealthUpload={
                    val pending=ReconciliationStore.open(directory,config.origin,WorkspaceIdentity(config.login)).pending()?:throw SyncStateFailure(SyncError.NO_PENDING)
                    checkSync(pending.authority==PendingAuthority.Background(config.revision)&&config.types.containsAll(pending.types), SyncError.PENDING_AUTHORITY)
                    access(pending.types)
                })
                val coordinator=BackgroundReconciliationCoordinator(current=settings::current,access={_,types->access(types)},
                    openStore={ReconciliationStore.open(directory,it.origin,WorkspaceIdentity(it.login))},
                    capture={saved,store->
                        access(saved.types);val clock=Instant.now();val zone=ZoneId.systemDefault();val today=clock.atZone(zone).toLocalDate()
                        val range=ExportRange.create(today.minusDays(saved.days.toLong()-1).toString(),today.toString(),zone,clock)
                        captureReconciliation(health,range,saved.types,store,PendingAuthority.Background(saved.revision))
                    },transport=ReconciliationTransfer(client),directory=directory)
                val outcome=coordinator.run(config)
                settings.status(config,outcome.syncStatus())
                return@withContext Result.success()
            }
            checkSync(cache.isDirectory || cache.mkdirs(), SyncError.CACHE_UNAVAILABLE)
            cache.listFiles().orEmpty().filter { Regex("nourish-export-[0-9a-f-]{36}\\.json").matches(it.name) }.forEach {
                checkSync(!it.exists() || it.delete(), SyncError.CACHE_OLD)
            }
            val clock = Instant.now()
            val zone = ZoneId.systemDefault()
            val today = clock.atZone(zone).toLocalDate()
            val range = ExportRange.create(today.minusDays(config.days.toLong() - 1).toString(), today.toString(), zone, clock)
            val snapshot = HealthConnectReader(health).read(range, config.types)
            staged = stageExport(cache, snapshot)
            if (!settings.current(config)) return@withContext Result.success()
            val client = WorkspaceClient(beforeHealthUpload = {
                checkSync(settings.current(config), SyncError.CONFIG_CHANGED)
                checkSync(backgroundReadAvailable(health), SyncError.ACCESS_CHANGED)
                val permissions = health.permissionController.getGrantedPermissions()
                checkSync(BACKGROUND_READ_PERMISSION in permissions && readPermissions(snapshot.granted).all(permissions::contains), SyncError.ACCESS_REVOKED)
                checkSync(settings.current(config), SyncError.CONFIG_CHANGED)
            })
            val review = client.preview(config.origin, staged!!, WorkspaceIdentity(config.login))
            if (!settings.current(config)) return@withContext Result.success()
            val counts = client.import(review)
            settings.status(config, SyncStatus.Snapshot(Instant.now(),counts,snapshot.denied.toSet()))
            Result.success()
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            // A lost import response is unknown, not a reason for immediate replay.
            // The next scheduled read uses stable source IDs and a new preview.
            settings.status(config, SyncStatus.Failed(Instant.now(),captureSyncDiagnostic(error)))
            Result.success()
        } finally {
            withContext(NonCancellable + Dispatchers.IO) {
                staged?.let { if (it.exists() && !it.delete()) settings.status(config, SyncStatus.Notice(SyncNotice.CACHE_CLEANUP)) }
            }
        }
    }
}
