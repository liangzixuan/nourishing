import {rowId,digest} from './data-codec.mjs';
import {parsePushSubscription,parseVapid,createWebPushTransport,pushFields,pushFail,PUSH_DEVICE_LIMIT} from './web-push.mjs';
import {readReminderWorkspace} from './reminder-schedules-workspace.mjs';
import {stageReminderDispatch} from './reminder-schedules-dispatch.mjs';

const args=(tableId,id)=>({databaseId:'nourishing',tableId,rowId:id});
const optional=async work=>{try{return await work();}catch(error){if(error.code===404)return null;throw error;}};
const conflict=()=>pushFail('Notification settings changed. Refresh and try again.',409);
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const publicReceipt=row=>({outcome:row.outcome==='sending'?'unknown':row.outcome,statusCode:row.statusCode||null});

/** Server-only storage. Caller authenticates owner and applies account lifecycle checks. */
export function createWebPushStore({db,ownerId:owner,origin,vapid,now=()=>Date.now(),send=createWebPushTransport()}){
 if(typeof owner!=='string'||!owner||owner.length>36)pushFail('Please sign in.',401);
 const stamp=()=>{const value=Number(now());if(!Number.isFinite(value))pushFail('Notifications are unavailable.',503);return new Date(value).toISOString();};
 const accountArgs=args('push_accounts',owner);
 async function load({create=false}={}){
  let row=await optional(()=>db.getRow(accountArgs));
  if(!row&&create){try{await db.createRow({...accountArgs,data:{ownerId:owner,version:0,payload:JSON.stringify({devices:[]})},permissions:[]});}catch(error){if(error.code!==409)throw error;}row=await db.getRow(accountArgs);}
  if(!row)return null;
  if(row.ownerId!==owner||row.$id!==owner||!Number.isSafeInteger(row.version)||row.version<0||row.$permissions?.length!==0)pushFail('Notification settings are unavailable.',503);
  let state;try{state=JSON.parse(row.payload);}catch{pushFail('Notification settings are unavailable.',503);}
  if(!Array.isArray(state.devices)||state.devices.length>PUSH_DEVICE_LIMIT)pushFail('Notification settings are unavailable.',503);
  const ids=new Set();
  for(const device of state.devices){
   const subscription=parsePushSubscription(device.subscription);
   if(device.id!==rowId(owner,device.origin,subscription.endpoint)||ids.has(device.id)||typeof device.label!=='string'||device.label.length>80||!Number.isFinite(Date.parse(device.createdAt))||(device.lastTestAt&&!Number.isFinite(Date.parse(device.lastTestAt))))pushFail('Notification settings are unavailable.',503);ids.add(device.id);
  }
  return {row,state};
 }
 async function status(){
  let config;try{config=parseVapid(vapid,origin);}catch(error){if(error.code!==503)throw error;return {configured:false,paused:true,devices:[],limit:PUSH_DEVICE_LIMIT};}
  const account=await load();return {configured:true,paused:true,publicKey:config.publicKey,devices:(account?.state.devices??[]).map(device=>({id:device.id,label:device.label,createdAt:device.createdAt,currentOrigin:device.origin===origin})),limit:PUSH_DEVICE_LIMIT};
 }
 async function update(account,change){
  const workspace=await readReminderWorkspace(db,owner);
  const tx=await db.createTransaction({ttl:60});
  try{
   const result=await change(account.state,tx.$id);
   if(workspace.head){
    await db.updateRow({...args('workspace_heads',owner),data:{digest:workspace.head.digest},transactionId:tx.$id});
    const head=await db.getRow(args('workspace_heads',owner));if(head.digest!==workspace.head.digest||head.generation!==workspace.head.generation||head.$updatedAt!==workspace.head.$updatedAt)conflict();
   }
   await db.updateRow({...accountArgs,data:{version:account.row.version+1,payload:JSON.stringify(account.state)},transactionId:tx.$id});
   const guard=await db.getRow(accountArgs);if(guard.ownerId!==owner||guard.version!==account.row.version||guard.$updatedAt!==account.row.$updatedAt)conflict();
   if(workspace.head)await stageReminderDispatch({db,owner,state:workspace.state,generation:workspace.head.generation,transactionId:tx.$id,now:new Date(stamp()),preferences:account.state});
   await db.updateTransaction({transactionId:tx.$id,commit:true});return result;
  }catch(error){await db.updateTransaction({transactionId:tx.$id,rollback:true}).catch(()=>{});throw error;}
 }
 async function subscribe(input){
  pushFields(input,['subscription','label']);parseVapid(vapid,origin);const subscription=parsePushSubscription(input.subscription),at=stamp();
  if(subscription.expirationTime!==null&&subscription.expirationTime<=Date.parse(at))pushFail('This browser subscription expired. Connect again.');
  const label=input.label??'This browser';if(typeof label!=='string'||!label.trim()||label.length>80)pushFail('Enter a device name of up to 80 characters.');
  const id=rowId(owner,origin,subscription.endpoint),account=await load({create:true});
  await update(account,state=>{
   const existing=state.devices.find(device=>device.id===id);if(!existing&&state.devices.length>=PUSH_DEVICE_LIMIT)pushFail('Remove an old device before connecting another.');
   const device={id,subscription,label:label.trim(),origin,createdAt:existing?.createdAt??at,lastTestAt:existing?.lastTestAt??''};
   if(existing)Object.assign(existing,device);else state.devices.push(device);
  });return {deviceId:id,...await status()};
 }
 async function unsubscribe(input){
  pushFields(input,['id','endpoint']);if((typeof input.id==='string')===(typeof input.endpoint==='string'))pushFail('Choose a connected device.');
  const id=input.id??rowId(owner,origin,input.endpoint);if(!/^[a-f0-9]{36}$/.test(id))pushFail('Choose a connected device.');
  const account=await load();if(account)await update(account,state=>{state.devices=state.devices.filter(device=>device.id!==id);});return status();
 }
 async function test(input){
  pushFields(input,['deviceId','requestId']);if(typeof input.deviceId!=='string'||!/^[a-f0-9]{36}$/.test(input.deviceId)||!uuid(input.requestId))pushFail('Choose a connected device.');
  const receiptArgs=args('push_deliveries',rowId(owner,input.requestId)),fingerprint=digest({type:'web-push.test',...input});
  const readReceipt=async()=>{const row=await optional(()=>db.getRow(receiptArgs));if(row&&(row.ownerId!==owner||row.fingerprint!==fingerprint))conflict();return row;};
  const previous=await readReceipt();if(previous)return publicReceipt(previous);
  const config=parseVapid(vapid,origin),account=await load(),device=account?.state.devices.find(device=>device.id===input.deviceId&&device.origin===origin);
  if(!device)pushFail('Connect this browser first.',404);const at=stamp();
  if(device.lastTestAt&&Date.parse(at)-Date.parse(device.lastTestAt)<60000)pushFail('Wait one minute before another test.',429);
  const claim={ownerId:owner,fingerprint,outcome:'sending',statusCode:0,createdAt:at,completedAt:''};
  try{
   await update(account,async(state,transactionId)=>{
    state.devices.find(row=>row.id===device.id).lastTestAt=at;
    await db.createRow({...receiptArgs,data:claim,permissions:[],transactionId});
   });
  }catch(error){const saved=await readReceipt();if(saved)return publicReceipt(saved);throw error;}
  let outcome='unknown',statusCode=0;
  if(device.subscription.expirationTime!==null&&device.subscription.expirationTime<=Date.parse(at))outcome='expired';
  else try{
   const response=await send(device.subscription,JSON.stringify({version:1,tag:'nourishing-'+rowId(owner,input.requestId)}),{TTL:300,urgency:'normal',contentEncoding:'aes128gcm',vapidDetails:config,signal:AbortSignal.timeout(10000)});
   statusCode=Number.isInteger(response?.statusCode)&&response.statusCode>=100&&response.statusCode<=599?response.statusCode:0;
   outcome=statusCode>=200&&statusCode<300?'accepted':[404,410].includes(statusCode)?'expired':statusCode?'rejected':'unknown';
  }catch{/* An uncertain send is not retried: its durable claim remains authoritative. */}
  await db.updateRow({...receiptArgs,data:{outcome,statusCode,completedAt:stamp()}});
  if(outcome==='expired'){
   const current=await load();
   if(current?.state.devices.some(row=>row.id===device.id&&digest(row.subscription)===digest(device.subscription)))await update(current,state=>{state.devices=state.devices.filter(row=>row.id!==device.id||digest(row.subscription)!==digest(device.subscription));});
  }
  return {outcome,statusCode:statusCode||null};
 }
 return {status,subscribe,unsubscribe,test};
}
