import {reminderPayload} from './reminder-payload.mjs';
import {pruneReminderReceipts,stageReminderReceiptCapacity} from './reminder-receipt-retention.mjs';
import {digest,rowId} from './data-codec.mjs';
import {readReminderWorkspace} from './reminder-schedules-workspace.mjs';
import {parsePushSubscription,parseVapid,createWebPushTransport,pushFields,pushFail} from './web-push.mjs';
import {parseReminderSchedule,reminderPreferences,eligibleReminderEvent,weightReminderMetricOptions,MAX_REMINDER_SCHEDULES} from './reminder-schedules.mjs';
import {stageReminderDispatch} from './reminder-schedules-dispatch.mjs';
import {Query} from 'node-appwrite';
const args=(tableId,id)=>({databaseId:'nourishing',tableId,rowId:id});
const optional=async work=>{try{return await work();}catch(error){if(error.code===404)return null;throw error;}};
const conflict=()=>pushFail('Reminder settings changed. Refresh and try again.',409);


/** Caller owns the account lifecycle operation; no workspace records are logged here. */
export function createReminderScheduleStore({db,ownerId:owner,origin,vapid,now=()=>Date.now(),send=createWebPushTransport(),monotonic=()=>performance.now()}){
 if(typeof owner!=='string'||!owner||owner.length>36)pushFail('Please sign in.',401);
 const clock=()=>{const date=new Date(now());if(!Number.isFinite(+date))pushFail('Reminder time unavailable.',503);return date;},accountArgs=args('push_accounts',owner);
 async function account(create=false){
  let row=await optional(()=>db.getRow(accountArgs));
  if(!row&&create){try{await db.createRow({...accountArgs,data:{ownerId:owner,version:0,payload:JSON.stringify({devices:[],schedules:[],paused:true,resumedAt:null})},permissions:[]});}catch(error){if(error.code!==409)throw error;}row=await db.getRow(accountArgs);}
  if(!row)return {row:null,preferences:{devices:[],schedules:[],paused:true,resumedAt:null}};
  if(row.ownerId!==owner||row.$id!==owner||row.$permissions?.length!==0||!Number.isSafeInteger(row.version))pushFail('Reminder settings unavailable.',503);
  const value=JSON.parse(row.payload);if(!Array.isArray(value.devices))pushFail('Reminder settings unavailable.',503);
  return {row,preferences:{...value,...reminderPreferences(value)}};
 }
 async function status(){
  const saved=await account(),workspace=await readReminderWorkspace(db,owner),history=await db.listRows({databaseId:'nourishing',tableId:'push_deliveries',queries:[Query.equal('ownerId',owner),Query.orderDesc('createdAt'),Query.limit(30)],total:false});
  const recent=history.rows.map(row=>{if(row.ownerId!==owner)pushFail('Reminder history ownership differs.',503);return {outcome:row.outcome==='sending'?'unknown':row.outcome,statusCode:row.statusCode||null,createdAt:row.createdAt};});
  return {...reminderPreferences(saved.preferences),revision:saved.row?.version??0,groups:workspace.state.settings?.groups??[],weightMetrics:weightReminderMetricOptions(workspace.state),scheduleLimit:MAX_REMINDER_SCHEDULES,recent};
 }
 async function persist(saved,workspace,{extra,after=false}={}){
  const tx=await db.createTransaction({ttl:60});
  try{
   if(workspace.head){
    await db.updateRow({...args('workspace_heads',owner),data:{digest:workspace.head.digest},transactionId:tx.$id});
    const guard=await db.getRow(args('workspace_heads',owner));if(guard.generation!==workspace.head.generation||guard.digest!==workspace.head.digest||guard.$updatedAt!==workspace.head.$updatedAt)conflict();
   }
   await db.updateRow({...accountArgs,data:{version:saved.row.version+1,payload:JSON.stringify(saved.preferences)},transactionId:tx.$id});
   const guard=await db.getRow(accountArgs);if(guard.ownerId!==owner||guard.version!==saved.row.version||guard.$updatedAt!==saved.row.$updatedAt)conflict();
   if(extra)await extra(tx.$id);
   if(workspace.head)await stageReminderDispatch({db,owner,state:workspace.state,generation:workspace.head.generation,transactionId:tx.$id,now:clock(),preferences:saved.preferences,after});
   await db.updateTransaction({transactionId:tx.$id,commit:true});
  }catch(error){await db.updateTransaction({transactionId:tx.$id,rollback:true}).catch(()=>{});throw error;}
 }
 function revision(input,saved){if(!Number.isSafeInteger(input.revision)||input.revision!==(saved.row?.version??0))conflict();}
 async function save(input){
  pushFields(input,['revision','schedule']);const saved=await account(true);revision(input,saved);const value=input.schedule;pushFields(value,['id','creationId','label','kind','time','days','timeZone','enabled','foodCondition','weightMetric']);
  if(value.id&&value.creationId)pushFail('Choose creation or editing, not both.');
  const previous=saved.preferences.schedules.find(row=>row.id===(value.id??value.creationId));if(value.id&&!previous)pushFail('Reminder not found.',404);
  const schedule=parseReminderSchedule(value,{previous,now:clock()});
  if(!previous&&saved.preferences.schedules.length>=MAX_REMINDER_SCHEDULES)pushFail('Remove an old reminder before adding another.');
  if(previous)saved.preferences.schedules=saved.preferences.schedules.map(row=>row.id===previous.id?schedule:row);else saved.preferences.schedules.push(schedule);
  await persist(saved,await readReminderWorkspace(db,owner));return status();
 }
 async function remove(input){
  pushFields(input,['revision','id']);if(typeof input.id!=='string')pushFail('Choose a reminder.');const saved=await account(true);revision(input,saved);
  saved.preferences.schedules=saved.preferences.schedules.filter(row=>row.id!==input.id);await persist(saved,await readReminderWorkspace(db,owner));return status();
 }
 async function settings(input){
  pushFields(input,['revision','paused']);if(typeof input.paused!=='boolean')pushFail('Choose whether reminders are paused.');
  const saved=await account(true);revision(input,saved);
  if(!input.paused){parseVapid(vapid,origin);if(!saved.preferences.devices.some(device=>device.origin===origin))pushFail('Connect this browser before resuming reminders.');}
  if(saved.preferences.paused&&!input.paused)saved.preferences.resumedAt=clock().toISOString();saved.preferences.paused=input.paused;
  await persist(saved,await readReminderWorkspace(db,owner));return status();
 }
 async function reconcile({after=false}={}){await pruneReminderReceipts({db,owner,now:clock()});const saved=await account();if(!saved.row)return;await persist(saved,await readReminderWorkspace(db,owner),{after});}
 async function tick(){
  await pruneReminderReceipts({db,owner,now:clock()});
  const initial=await account();if(!initial.row||initial.preferences.paused)return {attempted:0};
  const workspace=await readReminderWorkspace(db,owner),jobs=[];
  for(const schedule of initial.preferences.schedules){const event=eligibleReminderEvent(schedule,workspace.state,initial.preferences,clock());if(event)for(const device of initial.preferences.devices)if(device.origin===origin&&event.due>=Date.parse(device.createdAt))jobs.push({scheduleId:schedule.id,deviceId:device.id,event});}
  const known=new Set();
  for(let offset=0;offset<jobs.length;offset+=100){const ids=jobs.slice(offset,offset+100).map(job=>rowId(owner,job.scheduleId,job.deviceId,job.event.key)),page=await db.listRows({databaseId:'nourishing',tableId:'push_deliveries',queries:[Query.equal('$id',ids),Query.limit(100)],total:false});for(const row of page.rows){if(row.ownerId!==owner)pushFail('Reminder receipt ownership differs.',503);known.add(row.$id);}}
  const pending=jobs.filter(job=>!known.has(rowId(owner,job.scheduleId,job.deviceId,job.event.key))),started=monotonic();let attempted=0,examined=0;
  for(const job of pending.slice(0,32)){
   // Keep the existing 45-second worker budget, reserving one 10-second send deadline.
   if(monotonic()-started>=35000)break;examined++;
   const receiptArgs=args('push_deliveries',rowId(owner,job.scheduleId,job.deviceId,job.event.key));
   if(await optional(()=>db.getRow(receiptArgs)))continue;
   const saved=await account(),current=await readReminderWorkspace(db,owner),schedule=saved.preferences.schedules.find(row=>row.id===job.scheduleId),device=saved.preferences.devices.find(row=>row.id===job.deviceId&&row.origin===origin);
   if(!schedule||!device)continue;
   const event=eligibleReminderEvent(schedule,current.state,saved.preferences,clock());if(!event||event.key!==job.event.key||event.due!==job.event.due||event.due<Date.parse(device.createdAt))continue;
   const subscription=parsePushSubscription(device.subscription),config=parseVapid(vapid,origin),stamp=clock().toISOString(),claim={ownerId:owner,fingerprint:digest({kind:'scheduled',scheduleId:job.scheduleId,deviceId:job.deviceId,event:job.event.key}),outcome:'sending',statusCode:0,createdAt:stamp,completedAt:''};
   try{await persist(saved,current,{extra:async transactionId=>{await stageReminderReceiptCapacity({db,owner,transactionId});await db.createRow({...receiptArgs,data:claim,permissions:[],transactionId});}});}
   catch(error){if(await optional(()=>db.getRow(receiptArgs)))continue;throw error;}
   attempted++;let outcome='unknown',statusCode=0;
   if(subscription.expirationTime!==null&&subscription.expirationTime<=+clock())outcome='expired';
   else try{const response=await send(subscription,reminderPayload('nourishing-'+receiptArgs.rowId,current.state.settings.appLanguage),{TTL:300,urgency:'normal',contentEncoding:'aes128gcm',vapidDetails:config,signal:AbortSignal.timeout(10000)});statusCode=Number.isInteger(response?.statusCode)&&response.statusCode>=100&&response.statusCode<=599?response.statusCode:0;outcome=statusCode>=200&&statusCode<300?'accepted':[404,410].includes(statusCode)?'expired':statusCode?'rejected':'unknown';}catch{}
   await db.updateRow({...receiptArgs,data:{outcome,statusCode,completedAt:clock().toISOString()}});
   if(outcome==='expired'){const latest=await account();latest.preferences.devices=latest.preferences.devices.filter(row=>row.id!==device.id||digest(row.subscription)!==digest(subscription));await persist(latest,await readReminderWorkspace(db,owner));}
  }
  const more=examined<pending.length;await reconcile({after:!more});return {attempted,more};
 }
 return {status,save,remove,settings,reconcile,tick};
}
