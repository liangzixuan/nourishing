import {Client,TablesDB,Functions} from 'node-appwrite';
import {AccountOperationClient} from './account-operation-context.mjs';
import {createAccountLifecycle} from './account-lifecycle.mjs';
import {createReminderWorker} from './reminder-schedules-worker.mjs';
import {captureServerError} from './sentry.mjs';

export default async function reminderEntry({req,res,log=()=>{},error=()=>{}}){
 if(process.env.REMINDERS_ENABLED!=='true')return res.json({ok:true,enabled:false},200);
 try{
  const endpoint=process.env.APPWRITE_FUNCTION_API_ENDPOINT,project=process.env.APPWRITE_FUNCTION_PROJECT_ID,key=req?.headers?.['x-appwrite-key'];
  if(!endpoint||!project||typeof key!=='string'||!key)throw Error('Credentials unavailable');
  const client=new AccountOperationClient().setEndpoint(endpoint).setProject(project).setKey(key),plain=new Client().setEndpoint(endpoint).setProject(project).setKey(key),db=new TablesDB(client);
  const worker=createReminderWorker({db,queueDb:new TablesDB(plain),functions:new Functions(plain),lifecycle:createAccountLifecycle({db}),functionId:process.env.APPWRITE_FUNCTION_ID||'nourishing-reminders',origin:process.env.PUBLIC_ORIGIN,vapid:{publicKey:process.env.WEB_PUSH_PUBLIC_KEY,privateKey:process.env.WEB_PUSH_PRIVATE_KEY}});
  const result=await worker.run(req?.bodyText??req?.body),safe={enabled:true,examined:result.examined??1,attempted:result.attempted??0,queued:result.queued??false,stale:result.stale??false,failed:result.failed??0,more:result.more??false};
  log(JSON.stringify(safe));return res.json({ok:safe.failed===0,...safe},safe.failed?500:200);
 }catch(caught){const status=caught.code===400?400:500;error('Scheduled notifications could not complete.');if(status>=500)await captureServerError(caught,{service:'nourishing-reminders',status});return res.json({ok:false,error:'Scheduled notifications could not complete.'},status);}
}
