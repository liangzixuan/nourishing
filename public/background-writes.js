import {projectFastingResponse} from './fasting-source/device.js';
import {prepareQueuedDiaryReview} from './diary-preparation.js';
import {readWriteCopy,persistBackgroundWrite,changeBackgroundWrite,currentPrivateResponseTicket,saveOfflineSnapshot,acknowledgeBackgroundWrite} from './offline-store.js';
import {discardOfflineChange} from './offline-controls.js';
import {readDeviceCache,writeDeviceCache} from './device-cache.js';
import {lockCurrentOffline} from './offline-session.js';
import {requestErrorMessage} from './request-error.js';
import {coreText} from './core-cloud-messages.js';
import {accountDisplayKey} from './account-display.js';
import {projectSnapshotList,snapshotMediaPath} from './snapshot-queue.js';
import {request} from './diary-api.js';
import {acceptOfflineReceipt,offlineEffectiveState} from './offline-model.js';
import {applyWriteToState,projectSavedDefinition} from './write-projection.js';
import {diaryGroups,defaultDiaryGroup,projectLocalDiary,createDisplayView,projectDiaryCalendar,libraryItems,usesNutrientTargets,projectNutrientTargetResponse,coachPreferencesView} from './local-diary-projection.js';
import {offlineFailure} from './offline-errors.js';

const runtime=(globalThis[Symbol.for('nourishing.backgroundWrites')]??={listeners:new Set(),running:null,started:false,timer:null,retryDelay:1000});
const listeners=runtime.listeners;
const emit=value=>{for(const listener of listeners)listener(value);};
const changed=()=>window.dispatchEvent(new Event('nourishing-local-changed'));
const restored=()=>Object.assign(offlineFailure('restored'),{status:409});
export const isBackgroundWritesRunning=()=>runtime.started;
async function verifiedSnapshot(owner,ticket){
 const snapshot=await request('/api/offline');
 if(snapshot?.version!==1||snapshot.identity?.ownerId!==owner||typeof snapshot.identity.generation!=='string'||!snapshot.identity.generation||!snapshot.state||typeof snapshot.state!=='object'||Array.isArray(snapshot.state))throw Error('The saved diary version could not be verified. Retry to sync this change.');
 const saved=await saveOfflineSnapshot(snapshot,ticket);return {...snapshot,snapshotRefreshed:saved.snapshotRefreshed};
}
async function sendAccountWrite(transport,ticket){
 let response;
 try{
  response=await fetch(transport.path,{method:transport.method??'POST',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json'},body:JSON.stringify(transport.body)});
 }catch(error){
  if(error.name==='AbortError')throw error;
  throw Error(coreText('request.unavailable'),{cause:error});
 }
 if(response.status===401){
  const current=(await readDeviceCache('/api/diary').catch(()=>({}))).ticket;
  if(ticket&&(!current||ticket.ownerId!==current.ownerId||ticket.epoch!==current.epoch))throw new DOMException('Account changed.','AbortError');
  await lockCurrentOffline(ticket);document.querySelector('#page')?.replaceChildren();document.querySelector('#sheet-content')?.replaceChildren();location.replace('/login');throw Error(coreText('auth.required'));
 }
 const result=await response.json().catch(()=>{throw Error(coreText('request.unavailable'));});
 if(!response.ok)throw Object.assign(Error(requestErrorMessage(result,response.status)),{status:response.status,errorCode:result.errorCode});
 return result;
}
export function onBackgroundWriteStatus(listener){listeners.add(listener);return()=>listeners.delete(listener);}
export async function queueBackgroundWrite(path,body,projection={},ownerTicket,options={}){
 const ticket=ownerTicket??(await readDeviceCache('/api/diary')).ticket;
 if(!ticket)throw Error('Device storage is unavailable. Reopen Nourishing and try again.');
 const row=await persistBackgroundWrite(ticket,{path,method:options.method,body,projection,operationId:options.operationId});
 changed();schedule();return {ok:true,queued:true,requestId:row.command.operationId,revision:body.revision};
}
function schedule(delay=50){clearTimeout(runtime.timer);runtime.timer=setTimeout(()=>void flushBackgroundWrites().catch(()=>{}),typeof delay==='number'?delay:50);}
function retryLater(){if(runtime.started&&navigator.onLine!==false){schedule(runtime.retryDelay);runtime.retryDelay=Math.min(runtime.retryDelay*2,30000);}}
export function startBackgroundWrites(){
 if(runtime.started)return;runtime.started=true;
 window.addEventListener('online',schedule);
 window.addEventListener('nourishing-local-changed',schedule);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
 schedule();
}
async function retry(id){
 const copy=await readWriteCopy();if(!copy||copy.locked)return;
 await changeBackgroundWrite(copy.ticket,id,row=>{row.status='pending';row.error=null;});
 changed();return flushBackgroundWrites();
}
async function prepareQueuedPhoto(row,ticket){
 const note=row.command.type==='note.photo.save';
 const file=row.projection.snapshotSource;
 const dataUrl=note?row.projection.noteSource:await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});
 if(!await currentPrivateResponseTicket(ticket))throw new DOMException('Account changed.','AbortError');
 const {requestId,revision,...metadata}=row.transport.body;
 const prepared=note?await request('/api/note-photos/prepare',{dataUrl},AbortSignal.timeout(30000)):await request('/api/snapshots/prepare',{...metadata,dataUrl},AbortSignal.timeout(30000));
 const updated=await changeBackgroundWrite(ticket,requestId,current=>{
  if(note){
   current.transport.body.photo={mode:'replace',...prepared.photo};
   delete current.projection.noteSource;
  }else{
   current.transport.body={requestId,revision,photo:prepared.photo,...prepared.metadata};
   current.projection.snapshots[0].imageId=prepared.photo.id;
   delete current.projection.snapshotSource;
  }
  return structuredClone(current);
 });
 const cacheTicket=updated&&await currentPrivateResponseTicket(ticket);
 if(cacheTicket){
  const bytes=Uint8Array.from(atob(prepared.photo.dataUrl.split(',')[1]),c=>c.charCodeAt(0));
  const path=note?'/api/media?'+new URLSearchParams({namespace:'note_photos',id:prepared.photo.id}):snapshotMediaPath(prepared.photo.id);
  await writeDeviceCache(path,new Blob([bytes],{type:'image/jpeg'}),cacheTicket).catch(()=>false);
 }
 return updated;
}
export async function flushBackgroundWrites(){
 if(runtime.running)return runtime.running;
 const drain=async()=>{
  let copy=await readWriteCopy();if(!copy||copy.locked)return;
  const owner=copy.ownerId,epoch=copy.ticket.epoch;
  if(!copy.pending.length)return;
  const account=await request('/api/account');if(account.id!==owner)return;
  // Compare restore generations before replay. This is background work; no editor
  // waits for the snapshot download. Refresh preserves every pending command.
  let snapshotChecked=false,snapshotRefreshed=false,revision=null;
  while(true){
   copy=await readWriteCopy();
   if(!copy||copy.locked||copy.ownerId!==owner||copy.ticket.epoch!==epoch||!await currentPrivateResponseTicket(copy.ticket))return;
   let row=copy.pending[0];if(!row)return;
   const id=row.command.operationId;
   try{
    if(row.transport?.accountWrite){
     const result=await sendAccountWrite(row.transport,copy.ticket);
     await acknowledgeBackgroundWrite(copy.ticket,id,result);
     runtime.retryDelay=1000;emit({saved:true,result,requestId:id});changed();
     window.dispatchEvent(new Event('nourishing-data-changed'));
     continue;
    }
    if(!snapshotChecked){
     ({snapshotRefreshed,revision}=await verifiedSnapshot(owner,copy.ticket));
     snapshotChecked=true;
     copy=await readWriteCopy();
     if(!copy||copy.locked||copy.ownerId!==owner||copy.ticket.epoch!==epoch||!await currentPrivateResponseTicket(copy.ticket))return;
     row=copy.pending.find(item=>item.command.operationId===id);if(!row)continue;
    }
    if(row.command.generation!==copy.snapshot?.identity.generation)throw restored();
    let result;
    if(row.transport){
     if(row.projection?.snapshotSource||row.projection?.noteSource)row=await prepareQueuedPhoto(row,copy.ticket);
     if(!row)continue;
     if(row.projection?.diaryReview&&!row.projection.diaryReview.prepared)row=await changeBackgroundWrite(copy.ticket,id,(current,next)=>{prepareQueuedDiaryReview(next.snapshot.state,current);return structuredClone(current);});
     if(!row.attempted&&(row.status!=='unknown'||['snapshot.add','note.photo.save'].includes(row.command.type))){
      if(!revision){
       const day=row.command.payload.date??new Date().toLocaleDateString('en-CA');
       revision=(await request('/api/diary?date='+encodeURIComponent(day),undefined,undefined,{fresh:true,canonical:true})).revision;
      }
      // Editors retain their local revision while saves run in the background.
      // Bind a new request to the latest acknowledged revision just before send.
      // Persist that binding first so restart/lost replies retry the exact body.
      row=await changeBackgroundWrite(copy.ticket,id,current=>{current.transport.body.revision=revision;current.attempted=true;return structuredClone(current);});
     }
     if(!row)continue;
     // Retries first use the exact request. Receipts are checked server-side before
     // revision guards, so a lost acknowledgement cannot turn into a duplicate.
     const delivery={preserveCache:true};
     // 1.0.31 already retained this time before the first send. Transport metadata
     // leaves pending request bodies and any receipt fingerprint unchanged.
     if(row.transport.path==='/api/photos/save'||row.transport.path==='/api/barcode/save')delivery.reviewSavedAt=row.createdAt;
     try{result=await request(row.transport.path,row.transport.body,AbortSignal.timeout(30000),delivery);}
     catch(error){
      if(error.status!==409)throw error;
      const snapshot=await verifiedSnapshot(owner,copy.ticket);
      snapshotRefreshed=snapshot.snapshotRefreshed;
      if(row.command.generation!==snapshot.identity.generation)throw restored();
      const day=row.command.payload.date??new Date().toLocaleDateString('en-CA');
      const latest=await request('/api/diary?date='+encodeURIComponent(day),undefined,undefined,{fresh:true,canonical:true});
      if(!latest?.revision)throw error;
      revision=latest.revision;
      // Preserve identity and payload when rebasing an unsaved command.
      await changeBackgroundWrite(copy.ticket,id,current=>{current.transport.body.revision=latest.revision;});
      result=await request(row.transport.path,{...row.transport.body,revision:latest.revision},AbortSignal.timeout(30000),delivery);
     }
     await acknowledgeBackgroundWrite(copy.ticket,id,result);
    }else{
     result=await request('/api/offline/commands',row.command,AbortSignal.timeout(30000),{preserveCache:true});
     await changeBackgroundWrite(copy.ticket,id,(_current,next)=>Object.assign(next,acceptOfflineReceipt(next,row,result,{snapshotRefreshed})));
    }
    revision=result.revision??null;
    runtime.retryDelay=1000;emit({saved:true,result,requestId:id});changed();
    window.dispatchEvent(new Event('nourishing-data-changed'));
   }catch(error){
    const permanent=error.status>=400&&error.status<500&&![401,408,429].includes(error.status);
    if(permanent){
     // A rejected edit must not block unrelated changes. A 409 has already been
     // retried against the current revision; keep the server version if it still
     // cannot apply. Never treat a timeout or lost acknowledgement as rejection.
     await discardOfflineChange(copy,id);
     const latest=await readWriteCopy();
     if(latest&&!latest.pending.length)await verifiedSnapshot(owner,latest.ticket);
     emit({discarded:true,rejection:error,requestId:id});changed();
     window.dispatchEvent(new Event('nourishing-data-changed'));
     continue;
    }
    await changeBackgroundWrite(copy.ticket,id,current=>{current.status='unknown';current.error=null;delete current.messageKey;}).catch(()=>{});
    emit({error,requestId:id,retry:()=>retry(id)});changed();retryLater();return;
   }
  }
 };
 if(navigator.onLine===false)return;
 runtime.running=(navigator.locks?navigator.locks.request('nourishing-offline-sync',drain):drain()).catch(error=>{emit({error,retry:flushBackgroundWrites});retryLater();throw error;}).finally(()=>{runtime.running=null;});
 return runtime.running;
}

export async function overlayPendingResponse(path,value,nutrientTargetRevision){
 const copy=await readWriteCopy().catch(()=>null);if(!copy||copy.locked)return value;
 if(path===accountDisplayKey&&value){
  let result=value;
  for(const row of copy.pending){
   if(row.command.type==='account.name'&&typeof row.command.payload?.name==='string')result={...result,name:row.command.payload.name};
   if(row.command.type==='account.profile'&&row.command.payload)result={...result,profile:{...result.profile,...row.command.payload}};
  }
  return result;
 }
 if(path==='/api/snapshots')return projectSnapshotList(value,copy);
 let result=value;
 if(copy.snapshot?.state&&usesNutrientTargets(path)&&(nutrientTargetRevision||copy.pending.some(row=>row.command.type.startsWith('nutrientTarget.')))){
  result=projectNutrientTargetResponse(path,result,offlineEffectiveState(copy),nutrientTargetRevision??value.revision);
 }
 if(/^\/api\/(?:fasting|dashboard)(?:\?|$)/.test(path)){
  const changes=copy.pending.filter(row=>!row.command.generation||row.command.generation===copy.snapshot?.identity.generation).map(row=>row.projection?.fastingChange).filter(Boolean);
  if(changes.length)result=projectFastingResponse(path,result,copy.snapshot?.state?offlineEffectiveState(copy):null,changes,result.revision);
 }
 for(const row of copy.pending){
  if(!row.transport)continue;
  if(row.projection?.responses?.[path])result=structuredClone(row.projection.responses[path]);
  else result=projectSavedDefinition(path,result,row);
 }
 if(path==='/api/coach/preferences'&&copy.snapshot?.state&&result){
  const effective=offlineEffectiveState(copy),coach=coachPreferencesView(effective);
  return {...result,setupComplete:effective.settings.coachStarted===true||Boolean(effective.settings.coachPreferences),preferences:coach.preferences,preferencesRevision:coach.revision};
 }
 if(path==='/api/display'&&copy.snapshot?.state)return {...result,...createDisplayView(offlineEffectiveState(copy))};
 if(path==='/api/library'&&copy.snapshot?.state){
  return {...result,items:libraryItems(offlineEffectiveState(copy))};
 }
 if(path.startsWith('/api/diary/calendar?')&&result?.calendar&&copy.snapshot?.state){
  return {...result,...projectDiaryCalendar(offlineEffectiveState(copy),result.month,result.calendar)};
 }
 if(/^\/api\/diary(?:\?|$)/.test(path)&&result?.entries&&copy.pending.length){
  if(copy.snapshot?.state){
   const state=offlineEffectiveState(copy);
   // Keep the pre-save baseline until receipts settle. A lost reply may already
   // appear in a remote read; overlaying it again would count the food twice.
   try{return projectLocalDiary(state,result.date,result);}catch{/* First launch can lack a complete local library. */}
  }
  result=structuredClone(result);
  const state={entries:result.entries,biometrics:result.biometrics??[],notes:result.notes??[],settings:{completedDays:result.completed?[result.date]:[]}};
  for(const row of copy.pending)if(row.transport){
   applyWriteToState(state,row);
   const local=state.entries.find(entry=>entry.id===row.command.operationId);
   if(local&&row.projection?.entries?.[0])Object.assign(local,{facts:row.projection.entries[0].facts,name:row.projection.entries[0].name});
  }
  for(const collection of ['entries','notes','biometrics'])result[collection]=state[collection].filter(row=>row.date===result.date);
  result.completed=state.settings.completedDays.includes(result.date);
  result.presentation={...result.presentation,settings:{...result.presentation?.settings,...state.settings}};
  if(state.settings.theme)result.theme=state.settings.theme;
  if(state.settings.energyUnit)result.energyUnit=state.settings.energyUnit;
  const groups=diaryGroups(result.groups).map(name=>({name,records:[]}));
  for(const collection of ['entries','notes','biometrics'])for(const row of result[collection]){
   const group=groups.find(group=>group.name===(row.group||defaultDiaryGroup));group?.records.push({collection,id:row.id});
  }
  result.recordDisplay={...result.recordDisplay,groups};
 }
 return result;
}
