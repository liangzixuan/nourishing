package local.nourish.healthconnect

import java.io.File
import org.json.JSONObject

sealed class BackgroundReconciliationOutcome {
    data object Inactive:BackgroundReconciliationOutcome()
    data object HeldForOwner:BackgroundReconciliationOutcome()
    data class HeldForRemovals(val counts:ReconciliationCounts):BackgroundReconciliationOutcome()
    data class Acknowledged(val counts:ReconciliationCounts):BackgroundReconciliationOutcome()
}

/** Production worker coordinator. All side-effect boundaries are injected so
 * lifecycle tests execute this owner, including its shared outbox gate. */
class BackgroundReconciliationCoordinator(
    private val current:(BackgroundSyncConfig)->Boolean,
    private val access:suspend(BackgroundSyncConfig,Set<ExportType>)->Unit,
    private val openStore:(BackgroundSyncConfig)->ReconciliationStore,
    private val capture:suspend(BackgroundSyncConfig,ReconciliationStore)->Unit,
    private val transport:ReconciliationTransport,
    private val directory:File,
    private val gate:ReconciliationGate=ReconciliationGate.shared
) {
    private suspend fun guard(config:BackgroundSyncConfig,types:Set<ExportType>){checkSync(current(config), SyncError.GUARD_STOPPED);access(config,types);checkSync(current(config), SyncError.GUARD_CHANGED)}
    suspend fun run(config:BackgroundSyncConfig):BackgroundReconciliationOutcome {
        if(config.mode!=BackgroundSyncMode.RECONCILIATION||!current(config))return BackgroundReconciliationOutcome.Inactive
        guard(config,config.types)
        return gate.withWorkspace(config.origin,WorkspaceIdentity(config.login)){
            guard(config,config.types);val store=openStore(config);var pending=store.pending()
            if(pending?.digest!=null){
                // Receipt-only recovery can acknowledge committed evidence even
                // for a foreground/old-revision batch; it never resends health.
                val receipt=transport.receipt(config.origin,WorkspaceIdentity(config.login),pending)
                if(receipt!=null)return@withWorkspace acknowledge(store,pending,receipt)
            }
            if(pending!=null&&pending.authority!=PendingAuthority.Background(config.revision))return@withWorkspace BackgroundReconciliationOutcome.HeldForOwner
            if(pending==null){guard(config,config.types);capture(config,store);pending=(store.pending() ?: throw SyncStateFailure(SyncError.CAPTURE_INCOMPLETE))}
            val captured=pending
            checkSync(captured.authority==PendingAuthority.Background(config.revision), SyncError.CAPTURE_AUTHORITY)
            checkSync(config.types.containsAll(captured.types), SyncError.PENDING_TYPES)
            guard(config,captured.types)
            val review=transport.preview(config.origin,WorkspaceIdentity(config.login),captured,store.file(directory))
            store.bindDigest(review.digest);val bound=requireNotNull(store.pending())
            if(review.receipt!=null)return@withWorkspace acknowledge(store,bound,review.receipt)
            if(review.counts.removals&&!config.allowRemovals)return@withWorkspace BackgroundReconciliationOutcome.HeldForRemovals(review.counts)
            guard(config,bound.types)
            val receipt=transport.apply(config.origin,WorkspaceIdentity(config.login),bound,review,config.allowRemovals)
            acknowledge(store,bound,receipt)
        }
    }
    private fun acknowledge(store:ReconciliationStore,pending:ReconciliationPending,receipt:JSONObject):BackgroundReconciliationOutcome {
        validateReconciliationReceipt(receipt,pending.batch,requireNotNull(pending.digest));store.acknowledge(receipt)
        return BackgroundReconciliationOutcome.Acknowledged(reconciliationCounts(receipt.getJSONObject("counts")))
    }
}
