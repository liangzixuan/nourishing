import {requestErrorMessage} from './request-error.js';
import {offlineFailure} from './offline-errors.js';
import {offlineCopy,activateOfflineAccount,saveOfflineSnapshot,changeOfflineCopy,lockOfflineAccount} from './offline-store.js';
import {acceptOfflineReceipt} from './offline-model.js';
export async function offlineRequest(path,body){const response=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000),headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})}).catch(error=>{if(error.name==='AbortError')throw error;throw Object.assign(Error(requestErrorMessage(null,503)),{status:503,errorCode:'request.unavailable'});});const result=await response.json().catch(()=>{throw Object.assign(Error(requestErrorMessage(null,503)),{status:503,errorCode:'request.unavailable'});});if(!response.ok)throw Object.assign(Error(requestErrorMessage(result,response.status)),{status:response.status,errorCode:result.errorCode});return result;}
export async function prepareOfflineShell(){
 if(!navigator.serviceWorker)throw offlineFailure('unsupported');
 let timer,port;try{await Promise.race([(async()=>{
  await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});
  const registration=await navigator.serviceWorker.ready,worker=registration.active;if(!worker)throw offlineFailure('reloadShell');
  await new Promise((resolve,reject)=>{const channel=new MessageChannel();port=channel.port1;port.onmessage=event=>event.data?.ok?resolve():reject(offlineFailure('setupFailed'));worker.postMessage({type:'PREPARE_OFFLINE'},[channel.port2]);});
 })(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(offlineFailure('setupTimedOut')),20000);})]);}finally{clearTimeout(timer);port?.close();}
}
export async function keepOfflineDiary({request=offlineRequest,prepareShell=prepareOfflineShell}={}){const account=await request('/api/account'),ticket=await activateOfflineAccount(account.id);await prepareShell();const snapshot=await request('/api/offline');return saveOfflineSnapshot(snapshot,ticket);}
export async function checkOfflineAccount(request=offlineRequest){const copy=await offlineCopy();if(!copy)return null;try{const account=await request('/api/account');if(account.id!==copy.ownerId){await activateOfflineAccount(account.id);return offlineCopy();}return copy;}catch(error){if([401,403].includes(error.status))await lockOfflineAccount(copy.ticket);throw error;}}
export async function syncOfflineDiary({request=offlineRequest}={}){
 const run=async()=>{
  let copy=await offlineCopy();if(!copy)throw offlineFailure('keepDiaryFirst');
  try{const account=await request('/api/account');if(account.id!==copy.ownerId){await activateOfflineAccount(account.id);throw offlineFailure('signInOwner');}const ticket=await activateOfflineAccount(account.id),snapshot=await request('/api/offline');copy=await saveOfflineSnapshot(snapshot,ticket);
   for(const id of copy.pending.filter(row=>row.status!=='conflict').map(row=>row.command.operationId)){
    copy=await offlineCopy();if(!copy||copy.locked)break;const pending=copy.pending.find(row=>row.command.operationId===id);if(!pending||pending.status==='conflict')continue;
    try{const receipt=await request('/api/offline/commands',pending.command);copy=await changeOfflineCopy(copy.ticket,current=>acceptOfflineReceipt(current,pending,receipt));}
    catch(error){if([401,403].includes(error.status))throw error;const conflict=[400,404,409,507].includes(error.status);copy=await changeOfflineCopy(copy.ticket,current=>{const row=current.pending.find(row=>row.command.operationId===id);if(row){row.status=conflict?'conflict':'unknown';row.error=conflict?error.message:'Sync interrupted. Retry to check this change.';row.messageKey=conflict?error.messageKey:'accountCloud.offlineError.syncInterrupted';row.errorCode=error.errorCode;row.errorStatus=error.status;}return current;});if(!conflict)break;}
   }
   if(copy&&!copy.locked){const snapshot=await request('/api/offline');copy=await saveOfflineSnapshot(snapshot,copy.ticket);}
   return copy;
  }catch(error){if([401,403].includes(error.status)&&copy)await lockOfflineAccount(copy.ticket);throw error;}
 };
 return navigator.locks?navigator.locks.request('nourishing-offline-sync',run):run();
}
