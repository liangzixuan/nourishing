import {offlineErrorMessage} from './offline-errors.js';
import {accountMessage as m} from './account-cloud-messages.js';
import {activateOfflineAccount,lockOfflineAccount,clearOfflineAccount} from './offline-store.js';
import {initializeDeviceCache} from './device-cache.js';
export async function rememberOfflineAccount(account){if(globalThis.indexedDB)await initializeDeviceCache(account.id).catch(()=>activateOfflineAccount(account.id));}
export async function lockCurrentOffline(ticket){if(globalThis.indexedDB)await lockOfflineAccount(ticket);}
export async function leaveOfflineAccount(root){
 if(!globalThis.indexedDB)return true;
 try{await clearOfflineAccount();return true;}catch(error){if(!error.pendingCount)throw error;}
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.className='account-delete-dialog';
  dialog.innerHTML=`<header><h2>${m("accountCloud.pendingDiaryChanges")}</h2></header><section><p>${m("accountCloud.syncYourChangesOrDiscardThemBeforeLeavingThisAccount")}</p><p role="status"></p><button type="button" data-sync>${m("accountCloud.syncChanges")}</button><button type="button" data-discard>${m("accountCloud.discardChanges")}</button><button type="button" data-cancel>${m("mobileWeightGoal.cancel")}</button></section>`;
  root.append(dialog);const finish=value=>{dialog.close();dialog.remove();resolve(value);};
  const work=async task=>{dialog.querySelectorAll('button').forEach(button=>button.disabled=true);try{await task();finish(true);}catch(error){dialog.querySelector('[role=status]').textContent=offlineErrorMessage(error);dialog.querySelectorAll('button').forEach(button=>button.disabled=false);}};
  dialog.querySelector('[data-sync]').onclick=()=>work(async()=>{const {syncOfflineDiary}=await import('./offline-sync.js');await syncOfflineDiary();await clearOfflineAccount();});
  dialog.querySelector('[data-discard]').onclick=()=>work(()=>clearOfflineAccount({discardPending:true}));
  dialog.querySelector('[data-cancel]').onclick=()=>finish(false);dialog.oncancel=event=>{event.preventDefault();finish(false);};
  dialog.onclick=event=>{if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)finish(false);};dialog.showModal();
 });
}
