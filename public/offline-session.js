import {offlineCopy,activateOfflineAccount,lockOfflineAccount,clearOfflineAccount} from './offline-store.js';
export async function rememberOfflineAccount(account){if(globalThis.indexedDB)await activateOfflineAccount(account.id);}
export async function lockCurrentOffline(){if(!globalThis.indexedDB)return;const copy=await offlineCopy();if(copy)await lockOfflineAccount(copy.ticket);}
export async function leaveOfflineAccount(root){
 if(!globalThis.indexedDB)return true;
 try{await clearOfflineAccount();return true;}catch(error){if(!error.pendingCount)throw error;}
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.className='account-delete-dialog';
  dialog.innerHTML='<header><h2>Pending diary changes</h2></header><section><p>Sync your changes or discard them before leaving this account.</p><p role="status"></p><button type="button" data-sync>Sync changes</button><button type="button" data-discard>Discard changes</button><button type="button" data-cancel>Cancel</button></section>';
  root.append(dialog);const finish=value=>{dialog.close();dialog.remove();resolve(value);};
  const work=async task=>{dialog.querySelectorAll('button').forEach(button=>button.disabled=true);try{await task();finish(true);}catch(error){dialog.querySelector('[role=status]').textContent=error.message;dialog.querySelectorAll('button').forEach(button=>button.disabled=false);}};
  dialog.querySelector('[data-sync]').onclick=()=>work(async()=>{const {syncOfflineDiary}=await import('./offline-sync.js');await syncOfflineDiary();await clearOfflineAccount();});
  dialog.querySelector('[data-discard]').onclick=()=>work(()=>clearOfflineAccount({discardPending:true}));
  dialog.querySelector('[data-cancel]').onclick=()=>finish(false);dialog.oncancel=event=>{event.preventDefault();finish(false);};
  dialog.onclick=event=>{if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)finish(false);};dialog.showModal();
 });
}
