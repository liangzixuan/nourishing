package local.nourish.healthconnect

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import com.google.android.gms.tasks.Task
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.Wearable
import java.io.IOException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.*
import local.nourish.wearcontract.WATCH_CAPABILITY

private suspend fun <T> Task<T>.awaitWear():T=try{
    withTimeout(65000){suspendCancellableCoroutine{continuation->
        addOnSuccessListener{if(continuation.isActive)continuation.resume(it)}
        addOnFailureListener{if(continuation.isActive)continuation.resumeWithException(it)}
        addOnCanceledListener{if(continuation.isActive)continuation.resumeWithException(IOException("Watch request cancelled."))}
    }}
}catch(_:TimeoutCancellationException){throw IOException("Watch request timed out.")}

class WearRelayService:Service(){
    private val scope=CoroutineScope(SupervisorJob()+Dispatchers.IO)
    private var job:Job?=null
    private var owned:WearRelayRun?=null
    override fun onBind(intent:Intent?):IBinder?=null
    private fun notification(run:WearRelayRun,message:WearRelayStatus):Notification{
        val open=PendingIntent.getActivity(this,0,Intent(this,WearSettingsActivity::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val stop=PendingIntent.getService(this,1,Intent(this,WearRelayService::class.java).setAction(STOP).putExtra("token",run.token),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(this,CHANNEL).setSmallIcon(R.mipmap.ic_launcher).setContentTitle(getString(R.string.relay_title)).setContentText(wearRelayStatusText(message)).setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true).setLocalOnly(true).setVisibility(Notification.VISIBILITY_PRIVATE).addAction(Notification.Action.Builder(null,getString(R.string.relay_stop_action),stop).build()).build()
    }
    override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int{
        if(intent?.action==STOP){val run=WearRelayControl.run;if(run==null)stopSelfResult(startId) else if(intent.getStringExtra("token")==run.token)stop(this);return START_NOT_STICKY}
        val run=WearRelayControl.run
        if(run==null||intent?.getStringExtra("token")!=run.token){if(owned==null)stopSelfResult(startId);return START_NOT_STICKY}
        job?.cancel();owned=run
        try{
            if(WearSettings(this).config()!=run.config)throw WearRelayFailure(WearRelayNotice.ACCESS_CHANGED)
            if(!ready(this))throw WearRelayFailure(WearRelayNotice.PERMISSIONS)
            val notice=notification(run,WearRelayStatus.Notice(WearRelayNotice.CONNECTING))
            if(Build.VERSION.SDK_INT>=29)startForeground(NOTICE,notice,ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE) else startForeground(NOTICE,notice)
        }catch(error:Exception){WearRelayControl.stop(run,wearRelayError(error));stopSelfResult(startId);return START_NOT_STICKY}
        val settings=WearSettings(this)
        fun current()=WearRelayControl.run?.takeIf{settings.config()==it.config}
        val messages=Wearable.getMessageClient(this)
        val cycle=WearRelayCycle(::current,PrivateWearRelayWorkspace(),WearRelayStore(this)){node,path,bytes->messages.sendRequest(node,path,bytes).awaitWear()}
        job=scope.launch{
            try{
                while(isActive&&current()==run){
                    try{
                        if(!ready(this@WearRelayService))throw WearRelayFailure(WearRelayNotice.PERMISSIONS_CHANGED)
                        val nodes=Wearable.getCapabilityClient(this@WearRelayService).getCapability(WATCH_CAPABILITY,CapabilityClient.FILTER_REACHABLE).awaitWear().nodes
                        var message:WearRelayStatus=WearRelayStatus.Notice(WearRelayNotice.WAITING)
                        for(node in nodes.sortedBy{it.id}){
                            val result=cycle.deliver(run,node.id)
                            message=when{!result.consent->WearRelayStatus.Notice(WearRelayNotice.CONSENT);result.paused->WearRelayStatus.Notice(WearRelayNotice.PAUSED);result.unknown>0->WearRelayStatus.Notice(WearRelayNotice.UNKNOWN);else->WearRelayStatus.Notice(WearRelayNotice.CONNECTED)}
                        }
                        if(current()==run){WearRelayControl.update(run,message);getSystemService(NotificationManager::class.java).notify(NOTICE,notification(run,message))}
                    }catch(error:CancellationException){throw error}
                    catch(error:Exception){
                        val fatal=error is IllegalArgumentException||error is WorkspaceTransferFailure&&error.httpStatus in setOf(400,401,403,404,409)
                        val message=if(fatal)wearRelayError(error) else WearRelayStatus.Notice(WearRelayNotice.RETRY)
                        if(fatal){WearRelayControl.stop(run,message);stopSelfResult(startId);return@launch}
                        if(current()==run){WearRelayControl.update(run,message);getSystemService(NotificationManager::class.java).notify(NOTICE,notification(run,message))}
                    }
                    delay(60000)
                }
            }finally{if(WearRelayControl.run==run){WearRelayControl.stop(run);stopSelfResult(startId)}}
        }
        return START_NOT_STICKY
    }
    override fun onDestroy(){job?.cancel();scope.cancel();owned?.let{WearRelayControl.stop(it)};stopForeground(STOP_FOREGROUND_REMOVE);super.onDestroy()}
    companion object{
        private const val CHANNEL="nourish-watch-relay"
        private const val NOTICE=4201
        private const val STOP="local.nourish.STOP_WATCH_RELAY"
        fun permissions():Array<String> = buildList{
            if(Build.VERSION.SDK_INT>=31)add(Manifest.permission.BLUETOOTH_CONNECT)
            if(Build.VERSION.SDK_INT>=33)add(Manifest.permission.POST_NOTIFICATIONS)
        }.toTypedArray()
        fun ready(context:Context):Boolean{
            val manager=context.getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(NotificationChannel(CHANNEL,context.getString(R.string.relay_channel),NotificationManager.IMPORTANCE_LOW))
            return permissions().all{context.checkSelfPermission(it)==PackageManager.PERMISSION_GRANTED}&&manager.areNotificationsEnabled()&&manager.getNotificationChannel(CHANNEL).importance!=NotificationManager.IMPORTANCE_NONE
        }
        fun start(context:Context,config:WearConfig){
            if(WearSettings(context).config()!=config)throw WearRelayFailure(WearRelayNotice.ACCESS_CHANGED)
            if(!ready(context))throw WearRelayFailure(WearRelayNotice.PERMISSIONS)
            val run=WearRelayControl.begin(config)
            try{context.startForegroundService(Intent(context,WearRelayService::class.java).putExtra("token",run.token))}
            catch(error:Exception){WearRelayControl.stop(run);throw error}
        }
        fun stop(context:Context){WearRelayControl.stop();context.stopService(Intent(context,WearRelayService::class.java))}
    }
}
