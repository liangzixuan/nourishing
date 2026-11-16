import {offlineFailure} from './offline-errors.js';
const DB='nourishing-private-offline',channel=typeof BroadcastChannel==='function'?new BroadcastChannel('nourishing-offline'):null;
let opening;

function open(){return opening??=new Promise((resolve,reject)=>{const request=indexedDB.open(DB,2);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('accounts'))db.createObjectStore('accounts',{keyPath:'ownerId'});if(!db.objectStoreNames.contains('meta'))db.createObjectStore('meta');if(!db.objectStoreNames.contains('responses'))db.createObjectStore('responses',{keyPath:'path'});};request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();opening=null;};resolve(db);};request.onerror=()=>{opening=null;reject(request.error);};});}
async function transact(work,notify=true,all=false){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(['accounts','meta','responses'],'readwrite'),accounts=tx.objectStore('accounts'),meta=tx.objectStore('meta'),responses=tx.objectStore('responses');let result,cause;const read=meta.get('active');read.onsuccess=()=>{const active=read.result??{ownerId:null,epoch:crypto.randomUUID()},get=active.ownerId?accounts.get(active.ownerId):null;const run=copy=>{const invoke=copies=>{try{result=work({active,copy,accounts,meta,copies,responses});}catch(e){cause=e;tx.abort();}};if(all){const rows=accounts.getAll();rows.onsuccess=()=>invoke(rows.result);}else invoke();};if(get)get.onsuccess=()=>run(get.result??null);else run(null);};tx.oncomplete=()=>{if(notify)channel?.postMessage('changed');resolve(result);};tx.onabort=()=>reject(cause??tx.error);tx.onerror=()=>{};});}
const ticket=(active,copy)=>({ownerId:active.ownerId,epoch:active.epoch,revision:copy?.revision??0});
const cacheTicket=active=>({ownerId:active.ownerId,epoch:active.epoch,cacheRevision:active.cacheRevision??0});
function resetResponses(active,meta,responses){responses.clear();meta.delete('response-lru');active.cacheRevision=(active.cacheRevision??0)+1;}
function sameSession(active,expected){return !!expected&&!!active.ownerId&&!active.cacheLocked&&active.ownerId===expected.ownerId&&active.epoch===expected.epoch;}
function assertTicket(active,copy,expected,{revision=false,unlocked=true}={}){if(!expected||active.ownerId!==expected.ownerId||active.epoch!==expected.epoch||revision&&copy?.revision!==expected.revision||unlocked&&copy?.locked)throw offlineFailure('copyChanged');}
export async function offlineCopy(){return transact(({active,copy})=>copy?{...copy,ticket:ticket(active,copy)}:null,false);}
export async function activateOfflineAccount(ownerId){if(typeof ownerId!=='string'||!ownerId)throw offlineFailure('signInFirst');return transact(({active,meta,responses})=>{if(active.ownerId!==ownerId){active={ownerId,epoch:crypto.randomUUID()};resetResponses(active,meta,responses);}active.cacheLocked=false;meta.put(active,'active');return {...ticket(active,null),...cacheTicket(active)};});}
export async function saveOfflineSnapshot(snapshot,expected){return transact(({active,copy,accounts,meta,responses})=>{assertTicket(active,copy,expected,{unlocked:false});if(snapshot.version!==1||snapshot.identity.ownerId!==active.ownerId)throw offlineFailure('otherSnapshot');if(copy&&copy.snapshot.identity.generation!==snapshot.identity.generation){resetResponses(active,meta,responses);meta.put(active,'active');}const pending=copy?.pending??[];for(const row of pending)if(row.command.generation!==snapshot.identity.generation){row.status='conflict';row.error='The diary was restored. Review this change.';row.messageKey='accountCloud.offlineError.restored';}const next={ownerId:active.ownerId,snapshot:structuredClone(snapshot),pending,locked:false,revision:(copy?.revision??0)+1};accounts.put(next);return {...next,ticket:ticket(active,next)};});}
export async function changeOfflineCopy(expected,change,{strict=false}={}){return transact(({active,copy,accounts})=>{assertTicket(active,copy,expected,{revision:strict});if(!copy)throw offlineFailure('keepFirst');const next=change(structuredClone(copy));if(!next)return;next.revision=copy.revision+1;accounts.put(next);return {...next,ticket:ticket(active,next)};});}
export async function lockOfflineAccount(expected){return transact(({active,copy,accounts,meta,responses})=>{if(expected)assertTicket(active,copy,expected,{unlocked:false});active.epoch=crypto.randomUUID();active.cacheLocked=true;resetResponses(active,meta,responses);meta.put(active,'active');if(copy)accounts.put({...copy,locked:true,revision:copy.revision+1});});}
export async function clearOfflineAccount({discardPending=false}={}){return transact(({active,copy,accounts,meta,copies,responses})=>{const pendingCount=copies.reduce((sum,row)=>sum+row.pending.length,0);if(pendingCount&&!discardPending)throw Object.assign(offlineFailure('syncBeforeSignout'),{pendingCount});accounts.clear();responses.clear();meta.delete('response-lru');meta.put({ownerId:null,epoch:crypto.randomUUID(),cacheRevision:0,cacheLocked:true},'active');},true,true);}
export function onOfflineChange(callback){const listener=()=>callback();channel?.addEventListener('message',listener);return ()=>channel?.removeEventListener('message',listener);}
export async function queueOffline(copy,type,payload,preview,foodVersion,operationId=crypto.randomUUID()){
 const command={...copy.snapshot.identity,operationId,type,payload:structuredClone(payload),...(foodVersion?{foodVersion}:{})};
 return changeOfflineCopy(copy.ticket,current=>{if(current.pending.length>=1000)throw offlineFailure('syncBeforeMore');current.pending.push({command,preview:structuredClone(preview),status:'pending',error:null,createdAt:new Date().toISOString()});return current;},{strict:true});
}


// Response caching shares the authenticated owner epoch, but never reads or mutates
// offline snapshots or queued commands. A separate LRU stores metadata only.
async function responseTransaction(work,{notify=false}={}){
 const db=await open();return new Promise((resolve,reject)=>{
  const tx=db.transaction(['meta','responses'],'readwrite'),meta=tx.objectStore('meta'),responses=tx.objectStore('responses');let result,cause;
  const read=meta.get('active');read.onsuccess=()=>{const active=read.result??{ownerId:null,epoch:null,cacheLocked:true};const list=meta.get('response-lru');list.onsuccess=()=>{try{work({active,meta,responses,lru:list.result??[],done:value=>{result=value;}});}catch(error){cause=error;tx.abort();}};};
  tx.oncomplete=()=>{if(notify)channel?.postMessage('changed');resolve(result);};tx.onabort=()=>reject(cause??tx.error);tx.onerror=()=>{};
 });
}
export async function readPrivateResponse(path,expected){
 return responseTransaction(({active,meta,responses,lru,done})=>{
  if(!sameSession(active,expected)){done({value:undefined,savedAt:null,ticket:null});return;}
  const captured=cacheTicket(active),read=responses.get(path);read.onsuccess=()=>{
   const row=read.result;if(row){const entry=lru.find(item=>item.path===path);if(entry)meta.put([...lru.filter(item=>item.path!==path),entry],'response-lru');}
   done({value:row?.value,savedAt:row?.savedAt??null,ticket:captured});
  };
 });
}
export async function writePrivateResponse(path,value,size,expected){
 return responseTransaction(({active,meta,responses,lru,done})=>{
  if(!sameSession(active,expected)||(active.cacheRevision??0)!==expected.cacheRevision){done(false);return;}
  const now=Date.now(),next=lru.filter(row=>row.path!==path);next.push({path,size});let total=next.reduce((sum,row)=>sum+row.size,0);
  while(next.length>128||total>20*1024*1024){const removed=next.shift();total-=removed.size;responses.delete(removed.path);}
  if(!next.some(row=>row.path===path)){done(false);return;}
  responses.put({path,value,savedAt:now});meta.put(next,'response-lru');done(true);
 });
}
export async function invalidatePrivateResponses(expected){
 return responseTransaction(({active,meta,responses,done})=>{if(!sameSession(active,expected)){done(null);return;}resetResponses(active,meta,responses);meta.put(active,'active');done(cacheTicket(active));},{notify:true});
}
export async function currentPrivateResponseTicket(expected){
 return responseTransaction(({active,done})=>done(sameSession(active,expected)?cacheTicket(active):null));
}
