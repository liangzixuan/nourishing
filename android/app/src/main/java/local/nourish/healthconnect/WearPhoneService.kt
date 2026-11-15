package local.nourish.healthconnect

import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.TaskCompletionSource
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.WearableListenerService
import java.util.concurrent.Semaphore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import local.nourish.wearcontract.*

class WearPhoneService:WearableListenerService() {
    private val scope=CoroutineScope(SupervisorJob()+Dispatchers.IO)
    private val requestSlot=Semaphore(1)
    override fun onRequest(nodeId:String,path:String,request:ByteArray):Task<ByteArray>? {
        if(path!=WATCH_SUMMARY_PATH)return null
        if(!requestSlot.tryAcquire())return Tasks.forResult(WatchReply.unavailable(wearReplyMessage(WearReplyNotice.BUSY)).bytes())
        val completion=TaskCompletionSource<ByteArray>()
        scope.launch {
            try {
                val unit=parseWatchRequest(request);val settings=WearSettings(this@WearPhoneService)
                val reply=readWearReply(unit,settings::config,this@WearPhoneService::wearReplyMessage){config,requestedUnit->WorkspaceClient().exchange(config.origin,"/api/wear-summary?unit=$requestedUnit")}
                completion.setResult(reply.bytes())
            } catch(_:Exception){completion.setResult(WatchReply.unavailable(wearReplyMessage(WearReplyNotice.UNAVAILABLE)).bytes())}
            finally{requestSlot.release()}
        }
        return completion.task
    }
    override fun onDestroy(){scope.cancel();super.onDestroy()}
}
