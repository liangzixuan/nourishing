package local.nourish.healthconnect

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class PhoneReminderMessagingService:FirebaseMessagingService() {
    override fun onMessageReceived(message:RemoteMessage){
        runCatching{PhoneReminderNotifications(this).receive(message.data,message.sentTime,message.ttl)}
    }
    override fun onRegistered(installationId:String){
        // The connection owner consumes this persisted installation ID. Never create a
        // connection from a registration callback, including after local disconnect.
        runCatching{PhoneReminderRuntime.get(this).registered(installationId)}
    }
}
