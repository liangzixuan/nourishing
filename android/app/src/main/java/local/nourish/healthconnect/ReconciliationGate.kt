package local.nourish.healthconnect

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.ConcurrentHashMap

/** The manifest uses the default process for activity and worker. Each private
 * workspace/account has one coroutine owner across every outbox operation. */
class ReconciliationGate {
    private val gates=ConcurrentHashMap<String,Mutex>()
    suspend fun <T> withWorkspace(origin:WorkspaceOrigin,identity:WorkspaceIdentity,work:suspend()->T):T =
        gates.getOrPut(origin.value+"\n"+identity.login){Mutex()}.withLock{work()}
    suspend fun <T> withCloud(owner:CloudExportOwner,work:suspend()->T):T =
        gates.getOrPut("cloud\n${owner.origin.value}\n${owner.accountId}\n${owner.namespace}"){Mutex()}.withLock{work()}
    companion object { val shared=ReconciliationGate() }
}
