package local.nourish.watch

import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import local.nourish.wearcontract.*

class WatchMessageService:WearableListenerService(){
    override fun onRequest(nodeId:String,path:String,request:ByteArray):Task<ByteArray>?{
        if(path !in setOf(WATCH_ALERT_STATE_PATH,WATCH_ALERT_DELIVERY_PATH))return null
        return try{val notifications=WatchNotifications(this);Tasks.forResult(if(path==WATCH_ALERT_STATE_PATH)notifications.state(nodeId,parseAlertStateRequest(request)).bytes() else notifications.receive(nodeId,request).bytes())}catch(error:Exception){Tasks.forException(error)}
    }
    override fun onMessageReceived(event:MessageEvent){if(event.path==WATCH_CLEAR_PATH&&event.sourceNodeId==WatchSettings(this).read().phone)WatchNotifications(this).disconnect()}
}
