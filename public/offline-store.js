import {reviewTimeAtSave} from './review-clock.js';
import {projectFastingResponse} from './fasting-source/device.js';
import {remapWriteReferences,writeReceiptIdentities,remapDiaryReviewIdentities} from './write-identities.js';
import {applyWriteToState,projectSavedDefinition} from './write-projection.js';
import {offlineEffectiveState} from './offline-model.js';
import {prepareDiaryDisplayCommand,checkLocalReviewSave,projectLocalDiary,usesNutrientTargets} from './local-diary-projection.js';
import {offlineFailure} from './offline-errors.js';
import {acknowledgedSnapshotList} from './snapshot-queue.js';
const DB='nourishing-private-offline',channel=typeof BroadcastChannel==='function'?new BroadcastChannel('nourishing-offline'):null;
let opening;

function open(){return opening??=new Promise((resolve,reject)=>{const request=indexedDB.open(DB,2);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('accounts'))db.createObjectStore('accounts',{keyPath:'ownerId'});if(!db.objectStoreNames.contains('meta'))db.createObjectStore('meta');if(!db.objectStoreNames.contains('responses'))db.createObjectStore('responses',{keyPath:'path'});};request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();opening=null;};resolve(db);};request.onerror=()=>{opening=null;reject(request.error);};});}
async function transact(work,notify=true,all=false){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(['accounts','meta','responses'],'readwrite'),accounts=tx.objectStore('accounts'),meta=tx.objectStore('meta'),responses=tx.objectStore('responses');let result,cause;const read=meta.get('active');read.onsuccess=()=>{const active=read.result??{ownerId:null,epoch:crypto.randomUUID()},get=active.ownerId?accounts.get(active.ownerId):null;const run=copy=>{const invoke=copies=>{try{result=work({active,copy,accounts,meta,copies,responses});}catch(e){cause=e;tx.abort();}};if(all){const rows=accounts.getAll();rows.onsuccess=()=>invoke(rows.result);}else invoke();};if(get)get.onsuccess=()=>run(get.result??null);else run(null);};tx.oncomplete=()=>{if(notify)channel?.postMessage('changed');resolve(result);};tx.onabort=()=>reject(cause??tx.error);tx.onerror=()=>{};});}
const ticket=(active,copy)=>({ownerId:active.ownerId,epoch:active.epoch,revision:copy?.revision??0});
const cacheTicket=active=>({ownerId:active.ownerId,epoch:active.epoch,cacheRevision:active.cacheRevision??0});
function resetResponses(active,meta,responses){responses.clear();meta.delete('response-lru');active.cacheRevision=(active.cacheRevision??0)+1;}
function sameSession(active,expected){return !!expected&&!!active.ownerId&&!active.cacheLocked&&active.ownerId===expected.ownerId&&active.epoch===expected.epoch;}
function assertTicket(active,copy,expected,{revision=false,unlocked=true}={}){if(!expected||active.ownerId!==expected.ownerId||active.epoch!==expected.epoch||revision&&copy?.revision!==expected.revision||unlocked&&copy?.locked)throw offlineFailure('copyChanged');}
export async function readWriteCopy(){return transact(({active,copy})=>copy?{...copy,ticket:ticket(active,copy)}:null,false);}
export async function offlineCopy(){const copy=await readWriteCopy();return copy?.snapshot?copy:null;}
export async function activateOfflineAccount(ownerId,{sessionContext=null}={}){if(typeof ownerId!=='string'||!ownerId)throw offlineFailure('signInFirst');return transact(({active,meta,responses})=>{if(active.ownerId!==ownerId){active={ownerId,epoch:crypto.randomUUID()};resetResponses(active,meta,responses);}active.cacheLocked=false;active.sessionContext=/^[a-f0-9]{64}$/.test(sessionContext??'')?sessionContext:null;meta.put(active,'active');return {...ticket(active,null),...cacheTicket(active)};});}
// Keep the account and any edits queued by another open tab.
export async function expireOfflineSnapshot(expected){
 return transact(({active,copy,accounts})=>{
  assertTicket(active,copy,expected);
  if(copy?.pending.length)return;
  const current=copy??{ownerId:active.ownerId,revision:0,pending:[],recordIds:{},locked:false};
  accounts.put({...current,snapshot:null,revision:current.revision+1});
 });
}
export async function saveOfflineSnapshot(snapshot,expected){
 return transact(({active,copy,accounts,meta,responses})=>{
  assertTicket(active,copy,expected,{unlocked:false});
  const generation=snapshot?.identity?.generation;
  if(snapshot?.version!==1||snapshot.identity?.ownerId!==active.ownerId||typeof generation!=='string'||!generation)throw offlineFailure('otherSnapshot');
  const sameGeneration=copy?.snapshot?.identity.generation===generation;
  // A late read must never put a discarded generation back on this device.
  const staleResponse=expected.cacheRevision!==undefined&&expected.cacheRevision!==(active.cacheRevision??0);
  const staleCopy=copy&&expected.revision!==undefined&&copy.revision!==expected.revision;
  if(copy&&(staleResponse||staleCopy||(sameGeneration&&copy.pending.some(row=>row.transport)))){
   return {...copy,ticket:ticket(active,copy),snapshotRefreshed:false};
  }
  if(copy?.snapshot&&!sameGeneration){resetResponses(active,meta,responses);meta.put(active,'active');}
  const pending=copy?.pending??[];
  for(const row of pending){
   if(row.command.generation==null)row.command.generation=generation;
   else if(row.command.generation!==generation){
    row.status='conflict';row.error='The diary was restored. Review this change.';row.messageKey='accountCloud.offlineError.restored';
   }
  }
  const next={
   ...(copy?.hideMealAdjustmentNotice?{hideMealAdjustmentNotice:true}:{}),
   ...(copy?.fastingContext&&sameGeneration?{fastingContext:copy.fastingContext}:{}),
   ownerId:active.ownerId,snapshot:structuredClone(snapshot),pending,recordIds:copy?.recordIds??{},locked:false,revision:(copy?.revision??0)+1
  };
  accounts.put(next);
  return {...next,ticket:ticket(active,next),snapshotRefreshed:true};
 });
}
export async function changeOfflineCopy(expected,change,{strict=false}={}){return transact(({active,copy,accounts})=>{assertTicket(active,copy,expected,{revision:strict});if(!copy)throw offlineFailure('keepFirst');const next=change(structuredClone(copy));if(!next)return;next.revision=copy.revision+1;accounts.put(next);return {...next,ticket:ticket(active,next)};});}
export async function lockOfflineAccount(expected){return transact(({active,copy,accounts,meta,responses})=>{if(expected)assertTicket(active,copy,expected,{unlocked:false});active.epoch=crypto.randomUUID();active.cacheLocked=true;resetResponses(active,meta,responses);meta.put(active,'active');if(copy)accounts.put({...copy,locked:true,revision:copy.revision+1});});}
export async function clearOfflineAccount({discardPending=false}={}){return transact(({active,copy,accounts,meta,copies,responses})=>{const pendingCount=copies.reduce((sum,row)=>sum+row.pending.length,0);if(pendingCount&&!discardPending)throw Object.assign(offlineFailure('syncBeforeSignout'),{pendingCount});accounts.clear();responses.clear();meta.delete('response-lru');meta.put({ownerId:null,epoch:crypto.randomUUID(),cacheRevision:0,cacheLocked:true},'active');},true,true);}
export function onOfflineChange(callback){const listener=()=>callback();channel?.addEventListener('message',listener);return ()=>channel?.removeEventListener('message',listener);}
export async function queueOffline(copy,type,payload,preview,foodVersion,operationId=crypto.randomUUID()){
 const command={...copy.snapshot.identity,operationId,type,payload:structuredClone(payload),...(foodVersion?{foodVersion}:{})};
 return changeOfflineCopy(copy.ticket,current=>{if(current.pending.length>=1000)throw offlineFailure('syncBeforeMore');current.pending.push({command,preview:structuredClone(preview),status:'pending',error:null,createdAt:new Date().toISOString()});return current;},{strict:true});
}

// Online and offline edits share this account-owned outbox. A snapshot is optional
// during the first launch; a command must never wait for a full workspace download.
export async function persistBackgroundWrite(expected,{path,body,projection={}}){
 return transact(({active,copy,accounts})=>{
  assertTicket(active,copy,expected);
  if(active.cacheLocked)throw offlineFailure('signInFirst');
  const next=copy??{ownerId:active.ownerId,snapshot:null,pending:[],locked:false,revision:0};
  body=remapWriteReferences(structuredClone(body),next.recordIds??{});projection=remapWriteReferences(structuredClone(projection),next.recordIds??{});
  remapDiaryReviewIdentities(projection.diaryReview,next.recordIds??{});
  const prior=next.pending.find(row=>row.command.operationId===body.requestId);
  if(prior){if(JSON.stringify(prior.transport)!==JSON.stringify({path,body}))throw Error('This save has changed.');return prior;}
  if(body.type==='scoreDisplay.change'||body.type==='diaryDisplay.save'){
   if(!next.snapshot?.state)throw offlineFailure('copyChanged');
   projection.diarySettings=prepareDiaryDisplayCommand(offlineEffectiveState(next),body).payload;
  }
 const signedReview=path==='/api/photos/save'||path==='/api/barcode/save';
 const createdAt=new Date(signedReview?reviewTimeAtSave():Date.now());
  if(path==='/api/photos/save')checkLocalReviewSave('photo.log',body,active.ownerId,createdAt.getTime());
  if(path==='/api/barcode/save')checkLocalReviewSave('barcode.log',body.payload,active.ownerId,createdAt.getTime());
  const row={command:{ownerId:active.ownerId,generation:next.snapshot?.identity.generation??null,operationId:body.requestId,type:body.type??(path==='/api/snapshots/save'?'snapshot.add':path==='/api/note-photos/save'?'note.photo.save':'photo.log'),payload:body.payload??body},transport:{path,body:structuredClone(body)},preview:{},projection:structuredClone(projection),status:'pending',error:null,createdAt:createdAt.toISOString()};
  // A photo deleted before its first send has no server record to remove.
  // Once attempted, keep both writes so an uncertain receipt resolves first.
  const draft=body.type==='snapshot.delete'&&next.pending.find(item=>item.command.type==='snapshot.add'&&item.command.operationId===body.payload.id&&!item.attempted);
  if(draft)next.pending=next.pending.filter(item=>item!==draft&&!(item.command.type==='snapshot.update'&&item.command.payload.id===body.payload.id));
  else next.pending.push(row);
  if(body.type==='entry.ingredients.adjust'&&projection.hideMealAdjustmentNotice)next.hideMealAdjustmentNotice=true;
  if(projection.fastingContext)next.fastingContext=projection.fastingContext;
  next.revision++;accounts.put(next);return row;
 });
}

export async function changeBackgroundWrite(expected,id,change){
 return transact(({active,copy,accounts})=>{
  assertTicket(active,copy,expected);if(!copy)return null;
  const row=copy.pending.find(row=>row.command.operationId===id);if(!row)return null;
  const result=change(row,copy);copy.revision++;accounts.put(copy);return result;
 });
}


// Acknowledgement and reference changes commit with queue removal. Restart cannot
// observe half of a receipt or send a dependent edit to a temporary record ID.
export async function acknowledgeBackgroundWrite(expected,id,result){
 return transact(({active,copy,accounts,responses})=>{
  assertTicket(active,copy,expected);if(!copy)return;
  const row=copy.pending.find(item=>item.command.operationId===id);if(!row)return;
  const identities=writeReceiptIdentities(row,result);
  if(copy.snapshot?.state)applyWriteToState(copy.snapshot.state,row,result);
  copy.recordIds={...copy.recordIds,...identities};
  copy.pending=copy.pending.filter(item=>item.command.operationId!==id);
  for(const item of copy.pending){remapWriteReferences(item,identities);remapDiaryReviewIdentities(item.projection?.diaryReview,identities);}
  for(const [path,value]of Object.entries(row.projection?.responses??{})){
   responses.put({path,value:remapWriteReferences(structuredClone(value),identities),savedAt:0});
  }
  if(row.command.type.startsWith('snapshot.')){
   const path='/api/snapshots',cached=responses.get(path);
   cached.onsuccess=()=>{
    const base=cached.result?.value??{items:copy.snapshot?.state?.progressSnapshots??[]};
    responses.put({path,value:acknowledgedSnapshotList(base,row,result),savedAt:0});
   };
  }
  // Keep already-open diary screens current while the canonical refresh runs.
  const definition=['chart.save','chart.delete','fasting.schedule.save','favorite.set'].includes(row.command.type);
  if(copy.snapshot?.state||definition||result.fastingChange){
   const read=responses.getAll();read.onsuccess=()=>{
    for(const cached of read.result){
      if(copy.snapshot?.state&&row.command.type.startsWith('nutrientTarget.')&&usesNutrientTargets(cached.path)){
       responses.put({...cached,nutrientTargetRevision:result.revision,savedAt:0});
      }
     if(result.fastingChange){
      const value=projectFastingResponse(cached.path,cached.value,copy.snapshot?.state,[result.fastingChange],result.revision);
      if(value!==cached.value)responses.put({...cached,value:{...value,revision:result.revision},savedAt:0});
     }
     if(definition){
      const value=projectSavedDefinition(cached.path,cached.value,row,result);
      if(value!==cached.value)responses.put({...cached,value:{...value,revision:result.revision},savedAt:0});
     }
     if(copy.snapshot?.state&&/^\/api\/diary(?:\?|$)/.test(cached.path)&&cached.value?.date){
     try{responses.put({...cached,value:projectLocalDiary(copy.snapshot.state,cached.value.date,{...cached.value,revision:result.revision}),savedAt:0});}catch{/* A missing local resource is refreshed from the server. */}
     }
    }
   };
  }
  copy.revision++;accounts.put(copy);
 });
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
    done({value:row?.value,savedAt:row?.savedAt??null,ticket:captured,...(row?.nutrientTargetRevision?{nutrientTargetRevision:row.nutrientTargetRevision}:{})});
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
export async function invalidatePrivateResponsePaths(expected,shouldDrop,{staleOnly=false}={}){
 return responseTransaction(({active,meta,responses,lru,done})=>{
  if(!sameSession(active,expected)){done(null);return;}
  if(staleOnly){
   active.cacheRevision=(active.cacheRevision??0)+1;meta.put(active,'active');
   const targets=lru.filter(row=>shouldDrop(row.path));
   if(!targets.length){done(cacheTicket(active));return;}
   let remaining=targets.length;
   for(const row of targets){
    const read=responses.get(row.path);
    read.onsuccess=()=>{
     if(read.result)responses.put({...read.result,savedAt:0});
     if(--remaining===0)done(cacheTicket(active));
    };
   }
   return;
  }
  const kept=[];
  for(const row of lru){
   if(shouldDrop(row.path))responses.delete(row.path);
   else kept.push(row);
  }
  meta.put(kept,'response-lru');
  done(cacheTicket(active));
 },{notify:true});
}
export async function currentPrivateResponseTicket(expected){
 return responseTransaction(({active,done})=>done(sameSession(active,expected)?cacheTicket(active):null));
}

// Resume only the last verified session named by the current server document.
export async function resumePrivateResponses(context){
 if(!/^[a-f0-9]{64}$/.test(context??''))return null;
 return responseTransaction(({active,done})=>done(active.ownerId&&!active.cacheLocked&&active.sessionContext===context?cacheTicket(active):null));
}

// The public offline shell contains no account identity. Only a previously
// verified, unlocked session on this device can supply its private cache.
export async function resumeOfflinePrivateResponses(){
 return transact(({active,copy})=>active.ownerId&&!active.cacheLocked&&!copy?.locked&&/^[a-f0-9]{64}$/.test(active.sessionContext??'')?cacheTicket(active):null,false);
}

// Rebind a verified account without unlocking, replacing, or invalidating its cache.
export async function bindPrivateResponseSession(expected,context){
 if(!/^[a-f0-9]{64}$/.test(context??''))return null;
 return transact(({active,meta})=>{if(!sameSession(active,expected))return null;active.sessionContext=context;meta.put(active,'active');return cacheTicket(active);},false);
}
