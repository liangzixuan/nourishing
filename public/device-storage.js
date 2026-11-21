import {readWriteCopy,clearOfflineAccount,saveOfflineSnapshot,onOfflineChange} from './offline-store.js';
import {readDeviceCache} from './device-cache.js';
import {discardOfflineChange,exportOfflinePending} from './offline-controls.js';
import {flushBackgroundWrites} from './background-writes.js';
import {prepareOfflineShell} from './offline-sync.js';
import {request} from './diary-api.js';
import {escape as e} from './html.js';
import {accountMessage as m} from './account-cloud-messages.js';

/** Storage and recovery controls for the same diary and command outbox. */
export function mountDeviceStorage({root}){
 let disposed=false,busy=false,error='';const events=new AbortController();
 async function render(){
  const copy=await readWriteCopy();if(disposed)return;
  const unlocked=copy&&!copy.locked,rows=unlocked?copy.pending:[];
  root.innerHTML=`<section class="device-storage"><p role="status">${e(error)}</p><p>${e(unlocked?m('accountCloud.offlineSavedonthisdevice'):m('accountCloud.offlineSignintounlockthisdiary'))}</p><button type="button" data-storage-refresh ${busy?'disabled':''}>${e(m('accountCloud.offlineRefreshcopy'))}</button><button type="button" data-storage-sync ${busy||!rows.length?'disabled':''}>${e(m('accountCloud.syncChanges'))}</button>${rows.length?`<ul>${rows.map(row=>`<li><strong>${e(row.projection?.entries?.[0]?.name??row.command.payload?.name??row.command.payload?.text??m('accountCloud.diaryEdit'))}</strong><p>${e(m('accountCloud.offlineWaitingtosync'))}</p><button type="button" data-storage-discard="${e(row.command.operationId)}">${e(m('accountCloud.discard'))}</button></li>`).join('')}</ul><button type="button" data-storage-export>${e(m('accountCloud.offlineExportpendingchanges'))}</button>`:''}<button type="button" data-storage-remove ${busy||!unlocked||rows.length?'disabled':''}>${e(m('accountCloud.offlineRemovedevicecopy'))}</button></section>`;
 }
 async function run(work){if(busy)return;busy=true;error='';try{await work();}catch(reason){error=reason.message;}finally{busy=false;if(!disposed)await render();}}
 root.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  void run(async()=>{
   const copy=await readWriteCopy();
   if(button.hasAttribute('data-storage-refresh')){const {ticket}=await readDeviceCache('/api/diary');await prepareOfflineShell();await saveOfflineSnapshot(await request('/api/offline'),ticket);}
   else if(button.hasAttribute('data-storage-sync'))await flushBackgroundWrites();
   else if(button.hasAttribute('data-storage-export'))await exportOfflinePending();
   else if(button.hasAttribute('data-storage-remove')){await clearOfflineAccount();location.replace('/login');}
   else if(button.dataset.storageDiscard){await discardOfflineChange(copy,button.dataset.storageDiscard);window.dispatchEvent(new Event('nourishing-local-changed'));}
  });
 },{signal:events.signal});
 window.addEventListener('nourishing-local-changed',()=>{if(!busy)void render();},{signal:events.signal});
 const unlisten=onOfflineChange(()=>{if(!busy)void render();});void render();
 return {dispose(){disposed=true;events.abort();unlisten();root.replaceChildren();}};
}
