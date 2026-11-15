import {Client,TablesDB,Functions} from 'node-appwrite';
import {AccountOperationClient,withinAccountOperation} from './account-operation-context.mjs';
import {createAccountLifecycle} from './account-lifecycle.mjs';
import {captureCalendar} from './domain/calendar.mjs';
import {runCloudScheduler} from './cloud-scheduler.mjs';
import {createFastingDispatcher,parseSchedulerRequest} from './scheduler-dispatch.mjs';
import {createWorkspaceStore} from './workspace-store.mjs';

/** Private one-shot wakeups plus hourly repair. Public execute permissions stay empty. */
export default async function schedulerEntry({req,res,log=()=>{},error=()=>{}}){
 if(process.env.SCHEDULER_ENABLED!=='true')return res.json({ok:true,enabled:false},200);
 let request;try{request=parseSchedulerRequest(req?.bodyText??req?.body);}catch{return res.json({ok:false,error:'Invalid scheduler request.'},400);}
 try{
  const endpoint=process.env.APPWRITE_FUNCTION_API_ENDPOINT,project=process.env.APPWRITE_FUNCTION_PROJECT_ID,key=req?.headers?.['x-appwrite-key'];
  if(!endpoint||!project||typeof key!=='string'||!key)throw Error('Scheduler credentials unavailable.');
  const operationClient=new AccountOperationClient().setEndpoint(endpoint).setProject(project).setKey(key),db=new TablesDB(operationClient),lifecycle=createAccountLifecycle({db});
  // Queue writes can safely replay. They are not an unresolved health-data mutation.
  const plainClient=new Client().setEndpoint(endpoint).setProject(project).setKey(key),queueDb=new TablesDB(plainClient),functions=new Functions(plainClient),functionId=process.env.APPWRITE_FUNCTION_ID||'nourishing-scheduler';
  const dispatcher=createFastingDispatcher({db:queueDb,functions,functionId});let result;
  if(request.kind==='wake'){
   result=await dispatcher.wake(request,(owner,now)=>lifecycle.run(owner,'scheduler.fasting',operation=>withinAccountOperation(operation,async()=>{
    let profile;try{profile=await db.getRow({databaseId:'nourishing',tableId:'profiles',rowId:owner});}catch(e){if(e.code!==404)throw e;}
    return createWorkspaceStore(db,owner).tickFasting(captureCalendar(now,profile?.timeZone??'UTC'));
   })));
  }else{
   result=await runCloudScheduler({db:queueDb,enabled:true,dispatch:dispatcher.dispatch,defer:dispatcher.defer});
   // Do not create a busy continuation loop when an unresolved provider failure remains.
   if(result.more&&result.blocked===0)await functions.createExecution({functionId,async:true,body:JSON.stringify({repair:true})});
  }
  const safe={enabled:true,examined:result.examined??1,queued:result.queued??false,changed:result.changed??false,stale:result.stale??false,failed:result.failed??0,more:result.more??false};
  log(JSON.stringify(safe));return res.json({ok:safe.failed===0,...safe},safe.failed?500:200);
 }catch{error('Scheduled fasting could not complete.');return res.json({ok:false,error:'Scheduled fasting could not complete.'},500);}
}
