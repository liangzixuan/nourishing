// Delayed execution and repair protocol adapted from server/scheduler-dispatch.mjs.
import {createHash} from 'node:crypto';
import {Query} from 'node-appwrite';
import {nextReminderDue,reminderPreferences} from './reminder-schedules.mjs';

const databaseId='nourishing',tableId='reminder_dispatch',minute=60000;
const args=owner=>({databaseId,tableId,rowId:owner});
const fail=()=>{throw Object.assign(Error('Reminder dispatch identity is invalid.'),{code:503});};
const id=value=>typeof value==='string'&&/^[a-zA-Z0-9][\w.-]{0,35}$/.test(value);
const instant=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const at=value=>{if(!(value instanceof Date)||!Number.isFinite(+value))fail();return value;};
async function optional(work){try{return await work();}catch(error){if(error.code===404)return null;throw error;}}
export function validateReminderDispatch(row,owner){
 if(!row||row.$id!==owner||row.ownerId!==owner||!id(owner)||!id(row.generation)||!/^[a-f0-9]{64}$/.test(row.token)||!instant(row.dueAt)||!instant(row.repairAt)||typeof row.executionId!=='string'||row.executionId!==''&&!id(row.executionId))fail();return row;
}
/** The workspace transaction owns this intent; enqueue only after commit. */
export async function stageReminderDispatch({db,owner,state,generation,transactionId,now,preferences,after=false}){
 if(!id(owner)||!id(transactionId)||!id(generation))fail();at(now);
 const [current,account]=await Promise.all([optional(()=>db.getRow(args(owner))),preferences?null:optional(()=>db.getRow({databaseId,tableId:'push_accounts',rowId:owner}))]);
 if(current)validateReminderDispatch(current,owner);
 if(!preferences&&account){if(account.ownerId!==owner)fail();preferences=JSON.parse(account.payload);}
 const parsed=reminderPreferences(preferences),dueAt=preferences?.devices?.length?nextReminderDue(state,parsed,now,{after}):null;
 if(!dueAt){if(current)await db.deleteRow({...args(owner),transactionId});return null;}
 const token=createHash('sha256').update(JSON.stringify({generation,preferences:parsed,devices:preferences.devices.map(row=>row.id).sort(),dueAt})).digest('hex');
 const next={generation,token,dueAt};
 if(current?.token===token&&current.dueAt===dueAt)return next;
 const data={ownerId:owner,...next,repairAt:now.toISOString(),executionId:''};
 await db[current?'updateRow':'createRow']({...args(owner),data,...(current?{}:{permissions:[]}),transactionId});return next;
}
export function parseReminderSchedulerRequest(body){
 if(body===undefined||body==='')return {kind:'repair'};
 let value;try{value=typeof body==='string'?JSON.parse(body):body;}catch{throw {code:400};}
 if(!value||typeof value!=='object'||Array.isArray(value))throw {code:400};
 if(Object.keys(value).length===1&&value.repair===true)return {kind:'repair'};
 if(Object.keys(value).sort().join(',')!=='generation,owner,token'||!id(value.owner)||!id(value.generation)||typeof value.token!=='string'||!/^[a-f0-9]{64}$/.test(value.token))throw {code:400};
 return {kind:'wake',...value};
}
export function createReminderDispatcher({db,functions,functionId='nourishing-reminders',clock=()=>new Date()}){
 if(!db||!functions||!id(functionId)||typeof clock!=='function')fail();
 async function mark(row,data){
  const tx=await db.createTransaction({ttl:60});
  try{
   await db.updateRow({...args(row.ownerId),data,transactionId:tx.$id});
   const current=await db.getRow(args(row.ownerId));
   if(current.token!==row.token||current.$updatedAt!==row.$updatedAt)throw {code:409};
   await db.updateTransaction({transactionId:tx.$id,commit:true});return true;
  }catch(error){await db.updateTransaction({transactionId:tx.$id,rollback:true}).catch(()=>{});if([404,409].includes(error.code))return false;throw error;}
 }
 function ownedExecution(execution,row){
  if(execution.resourceId!==functionId||execution.requestPath!=='/reminders/'+row.token||!id(execution.$id))fail();return execution;
 }
 async function dispatch(owner,{afterWake=false}={}){
  if(!id(owner))fail();const row=await optional(()=>db.getRow(args(owner)));if(!row)return {queued:false,absent:true};validateReminderDispatch(row,owner);
  const statuses=afterWake?['scheduled']:['scheduled','waiting','processing'];
  const currentTime=at(clock());let execution=row.executionId?await optional(()=>functions.getExecution({functionId,executionId:row.executionId})):null;
  if(execution){ownedExecution(execution,row);if(!statuses.includes(execution.status))execution=null;}
  if(!execution){
   const matches=await functions.listExecutions({functionId,queries:[Query.equal('requestPath','/reminders/'+row.token),Query.equal('status',statuses),Query.limit(1)],total:false});
   if(matches.executions.length)execution=ownedExecution(matches.executions[0],row);
  }
  let queued=false;
  if(!execution){
   const scheduledAt=new Date(Math.max(Date.parse(row.dueAt)+minute,Math.ceil((+currentTime+minute)/minute)*minute)).toISOString();
   execution=ownedExecution(await functions.createExecution({functionId,async:true,xpath:'/reminders/'+row.token,body:JSON.stringify({owner,generation:row.generation,token:row.token}),scheduledAt}),row);queued=true;
   if(!['scheduled','waiting','processing'].includes(execution.status)||!instant(execution.scheduledAt))fail();
  }
  const repairAt=new Date(Math.max(+currentTime+minute,Date.parse(execution.scheduledAt||row.dueAt)+2*minute)).toISOString();
  const marked=await mark(row,{executionId:execution.$id,repairAt});return {queued,stale:!marked};
 }
 async function defer(owner,token){
  const row=await optional(()=>db.getRow(args(owner)));if(!row)return;validateReminderDispatch(row,owner);
  if(row.token!==token)return;
  await mark(row,{repairAt:new Date(+at(clock())+60*minute).toISOString()});
 }
 async function wake(request,tickWorkspace){
  const row=await optional(()=>db.getRow(args(request.owner)));if(!row)return {changed:false,stale:true};validateReminderDispatch(row,request.owner);
  if(row.token!==request.token||row.generation!==request.generation)return {changed:false,stale:true};
  const head=await optional(()=>db.getRow({databaseId,tableId:'workspace_heads',rowId:request.owner}));
  if(!head||head.ownerId!==request.owner||head.generation!==request.generation)return {changed:false,stale:true};
  const result=await tickWorkspace(request.owner,at(clock()));
  // A provider wakeup before its due time must not reuse its own running execution.
  const queued=await dispatch(request.owner,{afterWake:true});return {...result,queued:queued.queued};
 }
 return {dispatch,defer,wake};
}
