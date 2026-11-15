package local.nourish.healthconnect

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import org.json.JSONObject

class PhoneReminderUiFailure(val code:String):Exception(code)

/** Main-thread UI recipient ownership is separate from durable connection work. */
class PhoneReminderUiSession(private val scope:CoroutineScope,private val status:()->JSONObject,private val permission:suspend()->Boolean,private val connect:suspend(String)->Unit,private val disconnect:()->Unit,private val finishDisconnect:suspend()->Unit,private val settings:()->Unit) {
    private class Run(val id:String,val reply:(Result<JSONObject>)->Unit){var job:Job?=null}
    private var current:Run?=null
    fun cancel(id:String?){val run=current?:return;if(id==null||run.id==id){current=null;run.job?.cancel()}}
    fun request(id:String,action:String,label:String?,reply:(Result<JSONObject>)->Unit){
        if(action=="status"){reply(runCatching(status));return}
        if(action=="disconnect"){
            try{disconnect()}catch(error:Exception){reply(Result.failure(error));return}
            cancel(null)
        }else if(current!=null){reply(Result.failure(PhoneReminderUiFailure("busy")));return}
        val run=Run(id,reply);current=run
        run.job=scope.launch(start=CoroutineStart.UNDISPATCHED){
            try{
                when(action){
                    "connect"->{
                        val name=requireNotNull(label).trim();require(name.isNotEmpty()&&name.length<=80)
                        val state=status();if(!state.getBoolean("configured"))throw PhoneReminderFailure(PhoneReminderIssue.NOT_CONFIGURED)
                        if(!state.getBoolean("allowed")&&!permission())throw PhoneReminderFailure(PhoneReminderIssue.PERMISSION)
                        connect(name)
                    }
                    "disconnect"->finishDisconnect()
                    "settings"->settings()
                    else->throw PhoneReminderUiFailure("protocol")
                }
                if(current===run)reply(Result.success(status()))
            }catch(error:CancellationException){throw error}
            catch(error:Exception){if(current===run)reply(Result.failure(error))}
            finally{if(current===run)current=null}
        }
    }
}
