import {offlineCopy,activateOfflineAccount,saveOfflineSnapshot,changeOfflineCopy,lockOfflineAccount} from './offline-store.js';
import {acceptOfflineReceipt} from './offline-model.js';
export async function offlineRequest(path,body){const response=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000),headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error??'Could not sync. Try again.'),{status:response.status});return result;}
export async function prepareOfflineShell(){
 if(!navigator.serviceWorker)throw Error('This browser cannot keep an offline diary.');
 let timer,port;try{await Promise.race([(async()=>{
  await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});
  const registration=await navigator.serviceWorker.ready,worker=registration.active;if(!worker)throw Error('Reload the app before saving an offline copy.');
  await new Promise((resolve,reject)=>{const channel=new MessageChannel();port=channel.port1;port.onmessage=event=>event.data?.ok?resolve():reject(Error(event.data?.error??'Offline setup failed.'));worker.postMessage({type:'PREPARE_OFFLINE'},[channel.port2]);});
 })(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Offline setup timed out. Try again.')),20000);})]);}finally{clearTimeout(timer);port?.close();}
}
export async function keepOfflineDiary({request=offlineRequest,prepareShell=prepareOfflineShell}={}){const account=await request('/api/account'),ticket=await activateOfflineAccount(account.id);await prepareShell();const snapshot=await request('/api/offline');return saveOfflineSnapshot(snapshot,ticket);}
export async function checkOfflineAccount(request=offlineRequest){const copy=await offlineCopy();if(!copy)return null;try{const account=await request('/api/account');if(account.id!==copy.ownerId){await activateOfflineAccount(account.id);return offlineCopy();}return copy;}catch(error){if([401,403].includes(error.status))await lockOfflineAccount(copy.ticket);throw error;}}
export async function syncOfflineDiary({request=offlineRequest}={}){
 const run=async()=>{
  let copy=await offlineCopy();if(!copy)throw Error('Keep a diary copy first.');
  try{const account=await request('/api/account');if(account.id!==copy.ownerId){await activateOfflineAccount(account.id);throw Error('Sign in to the account that owns these changes.');}const ticket=await activateOfflineAccount(account.id),snapshot=await request('/api/offline');copy=await saveOfflineSnapshot(snapshot,ticket);
   for(const id of copy.pending.filter(row=>row.status!=='conflict').map(row=>row.command.operationId)){
    copy=await offlineCopy();if(!copy||copy.locked)break;const pending=copy.pending.find(row=>row.command.operationId===id);if(!pending||pending.status==='conflict')continue;
    try{const receipt=await request('/api/offline/commands',pending.command);copy=await changeOfflineCopy(copy.ticket,current=>acceptOfflineReceipt(current,pending,receipt));}
    catch(error){if([401,403].includes(error.status))throw error;const conflict=[400,404,409,507].includes(error.status);copy=await changeOfflineCopy(copy.ticket,current=>{const row=current.pending.find(row=>row.command.operationId===id);if(row){row.status=conflict?'conflict':'unknown';row.error=conflict?error.message:'Sync interrupted. Retry to check this change.';}return current;});if(!conflict)break;}
   }
   if(copy&&!copy.locked){const snapshot=await request('/api/offline');copy=await saveOfflineSnapshot(snapshot,copy.ticket);}
   return copy;
  }catch(error){if([401,403].includes(error.status)&&copy)await lockOfflineAccount(copy.ticket);throw error;}
 };
 return navigator.locks?navigator.locks.request('nourishing-offline-sync',run):run();
}
