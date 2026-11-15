import {withinAccountOperation} from './account-operation-context.mjs';
import {createReminderScheduleStore} from './reminder-schedules-store.mjs';
import {createReminderDispatcher,parseReminderSchedulerRequest} from './reminder-schedules-dispatch.mjs';
import {repairReminderDispatch} from './reminder-schedules-repair.mjs';

/** Private executor. Account deletion must acquire the same lifecycle gate as a send. */
export function createReminderWorker({db,queueDb=db,functions,lifecycle,functionId='nourishing-reminders',origin,vapid,clock=()=>new Date(),send}){
 const dispatcher=createReminderDispatcher({db:queueDb,functions,functionId,clock});
 async function run(body){
  const request=parseReminderSchedulerRequest(body);
  if(request.kind==='wake')return dispatcher.wake(request,(owner)=>lifecycle.run(owner,'reminders.deliver',operation=>withinAccountOperation(operation,()=>createReminderScheduleStore({db,ownerId:owner,origin,vapid,now:()=>+clock(),...(send?{send}:{})}).tick())));
  const result=await repairReminderDispatch({db:queueDb,enabled:true,clock,dispatch:dispatcher.dispatch,defer:dispatcher.defer});
  if(result.more&&result.blocked===0)await functions.createExecution({functionId,async:true,body:JSON.stringify({repair:true})});
  return result;
 }
 return {run,dispatch:dispatcher.dispatch};
}
