import {readWriteCopy,persistBackgroundWrite,changeBackgroundWrite,currentPrivateResponseTicket,saveOfflineSnapshot,acknowledgeBackgroundWrite} from './offline-store.js';
import {readDeviceCache} from './device-cache.js';
import {request} from './diary-api.js';
import {acceptOfflineReceipt,offlineEffectiveState} from './offline-model.js';
import {applyWriteToState} from './write-projection.js';
import {projectLocalDiary} from './local-diary-projection.js';
import {offlineFailure} from './offline-errors.js';

const listeners=new Set();
let running=null,started=false,timer,retryDelay=1000;
const emit=value=>{for(const listener of listeners)listener(value);};
const changed=()=>window.dispatchEvent(new Event('nourishing-local-changed'));
const restored=()=>Object.assign(offlineFailure('restored'),{status:409});
async function verifiedSnapshot(owner,ticket){
 const snapshot=await request('/api/offline');
 if(snapshot?.version!==1||snapshot.identity?.ownerId!==owner||typeof snapshot.identity.generation!=='string'||!snapshot.identity.generation||!snapshot.state||typeof snapshot.state!=='object'||Array.isArray(snapshot.state))throw Error('The saved diary version could not be verified. Retry to sync this change.');
 const saved=await saveOfflineSnapshot(snapshot,ticket);return {...snapshot,snapshotRefreshed:saved.snapshotRefreshed};
}
export function onBackgroundWriteStatus(listener){listeners.add(listener);return()=>listeners.delete(listener);}
export async function queueBackgroundWrite(path,body,projection={}){
 const {ticket}=await readDeviceCache('/api/diary');
 if(!ticket)throw Error('Device storage is unavailable. Reopen Nourishing and try again.');
 const row=await persistBackgroundWrite(ticket,{path,body,projection});
 changed();schedule();return {ok:true,queued:true,requestId:row.command.operationId,revision:body.revision};
}
function schedule(delay=50){clearTimeout(timer);timer=setTimeout(()=>void flushBackgroundWrites().catch(()=>{}),typeof delay==='number'?delay:50);}
function retryLater(){if(started&&navigator.onLine!==false){schedule(retryDelay);retryDelay=Math.min(retryDelay*2,30000);}}
export function startBackgroundWrites(){
 if(started)return;started=true;
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
export async function flushBackgroundWrites(){
 if(running)return running;
 const drain=async()=>{
  let copy=await readWriteCopy();if(!copy||copy.locked)return;
  const owner=copy.ownerId,epoch=copy.ticket.epoch;
  if(!copy.pending.length)return;
  const account=await request('/api/account');if(account.id!==owner)return;
  // Compare restore generations before replay. This is background work; no editor
  // waits for the snapshot download. Refresh preserves every pending command.
  let {snapshotRefreshed}=await verifiedSnapshot(owner,copy.ticket);
  while(true){
   copy=await readWriteCopy();
   if(!copy||copy.locked||copy.ownerId!==owner||copy.ticket.epoch!==epoch||!await currentPrivateResponseTicket(copy.ticket))return;
   const row=copy.pending[0];if(!row)return;
   const id=row.command.operationId;
   if(row.status==='conflict'){emit({error:Error(row.error??'Review this change.'),retry:()=>retry(id)});return;}
   try{
    if(row.command.generation!==copy.snapshot?.identity.generation)throw restored();
    let result;
    if(row.transport){
     // Retries first use the exact request. Receipts are checked server-side before
     // revision guards, so a lost acknowledgement cannot turn into a duplicate.
     try{result=await request(row.transport.path,row.transport.body,AbortSignal.timeout(30000),{preserveCache:true});}
     catch(error){
      if(error.status!==409)throw error;
      const snapshot=await verifiedSnapshot(owner,copy.ticket);
      snapshotRefreshed=snapshot.snapshotRefreshed;
      if(row.command.generation!==snapshot.identity.generation)throw restored();
      const day=row.command.payload.date??new Date().toLocaleDateString('en-CA');
      const latest=await request('/api/diary?date='+encodeURIComponent(day),undefined,undefined,{fresh:true,canonical:true});
      if(!latest?.revision)throw error;
      // Preserve identity and payload when rebasing an unsaved command.
      await changeBackgroundWrite(copy.ticket,id,current=>{current.transport.body.revision=latest.revision;});
      result=await request(row.transport.path,{...row.transport.body,revision:latest.revision},AbortSignal.timeout(30000),{preserveCache:true});
     }
     await acknowledgeBackgroundWrite(copy.ticket,id,result);
    }else{
     result=await request('/api/offline/commands',row.command,AbortSignal.timeout(30000),{preserveCache:true});
     await changeBackgroundWrite(copy.ticket,id,(_current,next)=>Object.assign(next,acceptOfflineReceipt(next,row,result,{snapshotRefreshed})));
    }
    retryDelay=1000;emit({saved:true,result,requestId:id});changed();
    window.dispatchEvent(new Event('nourishing-data-changed'));
   }catch(error){
    const permanent=error.status>=400&&error.status<500&&![401,408,429].includes(error.status);
    await changeBackgroundWrite(copy.ticket,id,current=>{current.status=permanent?'conflict':'unknown';current.error=permanent?error.message:'Sync interrupted. Retry to check this change.';if(error.messageKey)current.messageKey=error.messageKey;else if(!permanent)current.messageKey='accountCloud.offlineError.syncInterrupted';}).catch(()=>{});
    emit({error,retry:()=>retry(id)});changed();if(!permanent)retryLater();return;
   }
  }
 };
 if(navigator.onLine===false)return;
 running=(navigator.locks?navigator.locks.request('nourishing-offline-sync',drain):drain()).catch(error=>{emit({error,retry:flushBackgroundWrites});retryLater();throw error;}).finally(()=>{running=null;});
 return running;
}

export async function overlayPendingResponse(path,value){
 const copy=await readWriteCopy().catch(()=>null);if(!copy||copy.locked)return value;
 let result=value;
 for(const row of copy.pending){
  if(!row.transport)continue;
  if(row.projection?.responses?.[path])result=structuredClone(row.projection.responses[path]);
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
  const groups=(result.groups??['Uncategorized']).map(name=>({name,records:[]}));
  for(const collection of ['entries','notes','biometrics'])for(const row of result[collection]){
   const group=groups.find(group=>group.name===row.group)??groups[0];group?.records.push({collection,id:row.id});
  }
  result.recordDisplay={...result.recordDisplay,groups};
 }
 return result;
}
