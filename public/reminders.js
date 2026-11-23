import {coreText} from './core-cloud-messages.js';
import {accountMessage as m} from './account-cloud-messages.js';
import {request} from './diary-api.js';
import {escape as e} from './html.js';
import {createReminderSchedulePanel} from './reminder-schedules.js';

const bytes=value=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),character=>character.charCodeAt(0));
const sameKey=(a,b)=>a&&new Uint8Array(a).length===b.length&&new Uint8Array(a).every((value,index)=>value===b[index]);
const pendingTests=new Map();
export async function disconnectCurrentPush(){
 pendingTests.clear();
 if(!('serviceWorker'in navigator))return {disconnected:true,serverDisconnected:true,browserDisconnected:true};
 let subscription;
 try{const registration=await navigator.serviceWorker.getRegistration('/');subscription=await registration?.pushManager?.getSubscription();}
 catch{return {disconnected:false,serverDisconnected:false,browserDisconnected:false};}
 if(!subscription)return {disconnected:true,serverDisconnected:true,browserDisconnected:true};
 let serverDisconnected=false,browserDisconnected=false;
 try{await request('/api/reminders/unsubscribe',{endpoint:subscription.endpoint});serverDisconnected=true;}catch{/* Logout still removes the browser subscription when the server is offline. */}
 try{browserDisconnected=await subscription.unsubscribe()===true;}catch{/* Report this to logout without blocking session removal. */}
 return {disconnected:serverDisconnected||browserDisconnected,serverDisconnected,browserDisconnected};
}
export function mountReminders({root,notifications=false}){
 root.innerHTML=`<section class="push-panel${notifications?' push-notifications':''}"><p role="status">${m("mobileNutrientDetail.loading")}</p><div data-push-controls></div></section>`;
 const panel=root.querySelector('.push-panel'),message=panel.querySelector('[role=status]'),controls=panel.querySelector('[data-push-controls]');
 let data,busy=false,failed=false,disposed=false,readAbort,localEndpoint=null,registeredHere=false,devicesOpen=false;
 const alive=()=>!disposed&&panel.isConnected;
 const supported=()=>window.isSecureContext&&'Notification'in window&&'PushManager'in window&&'serviceWorker'in navigator;
 const notify=text=>{if(alive())message.textContent=text;};
 async function refresh(){
  if(!alive())return;
  readAbort?.abort();const controller=new AbortController();readAbort=controller;
  const result=await request('/api/reminders',undefined,controller.signal,{fresh:notifications});if(!alive())return;data=result;
  localEndpoint=null;registeredHere=false;
  if(supported())try{const registration=await navigator.serviceWorker.getRegistration('/');const subscription=await registration?.pushManager?.getSubscription();if(alive())localEndpoint=subscription?.endpoint??null;
   if(notifications&&localEndpoint){
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(localEndpoint)));
    const fingerprint=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
    registeredHere=data.devices.some(device=>device.currentOrigin&&device.endpointDigest===fingerprint);
   }}catch{/* Permission and connection controls remain available. */}
 }
 const schedules=createReminderSchedulePanel({getData:()=>data,refresh,notify});
 function render(){
  if(!alive())return;
  const reload=`<button type="button" data-push-reload>${m("mobileNutrientDetail.reload")}</button>`;
  if(notifications){
   const allowed=registeredHere&&!data?.paused&&Notification.permission==='granted';
   controls.innerHTML=`<label class="mds-row"><strong>${coreText('more.allowNotifications')}</strong><input type="checkbox" role="switch" class="dc-switch" data-notifications-enabled ${allowed?'checked':''} ${busy?'disabled':''}></label>`;
   return;
  }
  if(!data){controls.innerHTML=reload;return;}
  if(!data.configured){controls.innerHTML=`<p>${m("accountCloud.notificationsAreUnavailable")}</p>`+reload;return;}
  const permission=supported()?Notification.permission:'unsupported',canConnect=supported()&&permission!=='denied';
  const status=permission==='unsupported'?m("accountCloud.useASupportedBrowserOrInstalledApp"):permission==='denied'?m("accountCloud.allowNotificationsInYourBrowserSettings"):localEndpoint?m("accountCloud.browserSubscriptionActive"):permission==='granted'?m("accountCloud.readyToConnect"):m("accountCloud.notConnected");
  const browserControls=`<section class="push-browser"><h2>${m("privacy.browserTitle")}</h2><p class="push-muted">${status}</p><div class="push-actions"><button type="button" class="primary" data-connect ${canConnect?'':'disabled'}>${m("reminders.connect")}</button>${localEndpoint?`<button type="button" data-test-local>${m(pendingTests.has(localEndpoint)?"accountCloud.checkResult":"reminders.test")}</button>`:""}<button type="button" data-disconnect ${localEndpoint?'':'hidden'}>${m("reminders.disconnect")}</button></div></section>`;
  const devices=`<details class="push-connections" ${devicesOpen?'open':''}><summary>${m("accountCloud.connectedDevices")} <span>${data.devices.length}</span></summary><ul class="push-devices">${data.devices.map(device=>`<li><span>${e(device.label||m("accountCloud.browser"))}</span><div class="push-actions"><button type="button" data-test="${e(device.id)}" ${device.currentOrigin?'':'disabled'}>${pendingTests.has(device.id)?m("accountCloud.checkResult"):m("accountCloud.test")}</button><button type="button" data-remove="${e(device.id)}">${m("reminders.remove")}</button></div></li>`).join('')||`<li class="push-muted">${m("accountCloud.noConnectedDevices")}</li>`}</ul>${!schedules.locked&&!failed?reload:''}</details>`;
  controls.innerHTML=`${schedules.editing?'':browserControls}${schedules.html()}${schedules.editing?'':devices}${schedules.locked||failed?`<div class="push-reload">${schedules.locked?`<p>${m("mobileNutrientTargets.unknown")}</p>`:''}${reload}</div>`:''}`;
  if(busy||schedules.locked)controls.querySelectorAll('button,input,select').forEach(control=>{if(!control.hasAttribute('data-push-reload')||busy)control.disabled=true;});
 }
 async function run(action){
  if(busy||!alive())return;busy=true;failed=false;notify('');
  try{const task=action();render();await task;}catch(error){if(error.name!=='AbortError'){failed=true;notify(error.message);}}finally{busy=false;render();}
 }
 async function connect(permission){
  const result=await permission;if(!alive())return;if(result!=='granted')throw Error(m("accountCloud.notificationsWereNotAllowed"));
  const registration=await navigator.serviceWorker.getRegistration('/');if(!alive())return;if(!registration?.active)throw Error(m("accountCloud.refreshNourishingThenConnectAgain"));
  const key=bytes(data.publicKey);let subscription=await registration.pushManager.getSubscription();if(!alive())return;
  if(subscription&&!sameKey(subscription.options.applicationServerKey,key)){await subscription.unsubscribe();if(!alive())return;subscription=null;}
  if(!subscription){subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});if(!alive()){try{await subscription.unsubscribe();}catch{/* The browser retains ownership if cleanup fails. */}return;}}
  if(!alive())return;
  await request('/api/reminders/subscribe',{subscription:subscription.toJSON(),label:m("privacy.browserTitle")});if(!alive())return;await refresh();devicesOpen=true;if(!notifications)notify(m("accountCloud.connectedSendATestNotification"));
 }
 controls.onclick=event=>{
  const button=event.target.closest('button');if(!button||button.disabled||busy||!alive())return;
  if(button.hasAttribute('data-push-reload')){void run(()=>schedules.reload());return;}
  if(schedules.locked)return;
  if(button.dataset.reminderAction)void run(()=>schedules.action(button));
  else if(button.hasAttribute('data-connect')){
   // Ask only in this click; permission, browser connection and account resume are separate.
   const permission=Notification.requestPermission();void run(()=>connect(permission));
  }else if(button.hasAttribute('data-disconnect'))void run(async()=>{
   const registration=await navigator.serviceWorker.getRegistration('/');if(!alive())return;const subscription=await registration?.pushManager.getSubscription();if(!alive())return;
   if(subscription){await request('/api/reminders/unsubscribe',{endpoint:subscription.endpoint});await subscription.unsubscribe();if(!alive())return;await refresh();}notify(m("accountCloud.disconnected"));
  });
  else if(button.dataset.remove)void run(async()=>{await request('/api/reminders/unsubscribe',{id:button.dataset.remove});pendingTests.delete(button.dataset.remove);if(!alive())return;await refresh();notify(m("accountCloud.deviceRemoved"));});
  else if(button.dataset.test||button.hasAttribute('data-test-local'))void run(async()=>{
   const target=button.dataset.test?{deviceId:button.dataset.test}:{endpoint:localEndpoint};
   const id=target.deviceId??target.endpoint;if(!id)return;
   if(!pendingTests.has(id))pendingTests.set(id,crypto.randomUUID());
   try{const result=await request('/api/reminders/test',{...target,requestId:pendingTests.get(id)});pendingTests.delete(id);if(!alive())return;
    notify({accepted:m("accountCloud.sentCheckYourNotifications"),expired:m("accountCloud.connectionExpiredConnectThisBrowserAgain"),rejected:m("accountCloud.thePushServiceRejectedTheNotification"),unknown:m("accountCloud.deliveryNotConfirmed")}[result.outcome]??m("accountCloud.deliveryNotConfirmed"));
    if(result.outcome==='expired')await refresh();
   }catch(error){if(error.status&&error.status<500)pendingTests.delete(id);throw error;}
  });
 };
 controls.addEventListener('change',event=>{
  if(!event.target.hasAttribute('data-notifications-enabled')||busy)return;
  const enable=event.target.checked;
  void run(async()=>{
   try{
    if(!supported())throw Error(m('accountCloud.useASupportedBrowserOrInstalledApp'));
    if(enable&&Notification.permission==='denied')throw Error(m('accountCloud.allowNotificationsInYourBrowserSettings'));
    if(!data?.configured){
     await refresh();
     if(!data?.configured)throw Error(m('accountCloud.notificationsAreUnavailable'));
     // Permissions require a fresh tap after recovering from an unavailable account read.
     if(enable&&Notification.permission==='default')return;
    }
    if(enable){
     if(!registeredHere||Notification.permission!=='granted'){
      await connect(Notification.permission==='granted'?'granted':Notification.requestPermission());
      if(!alive())return;
     }
     if(data.paused)await request('/api/reminders/settings',{revision:data.revision,paused:false});
    }else{
     if(!data.paused)await request('/api/reminders/settings',{revision:data.revision,paused:true});
     const registration=await navigator.serviceWorker.getRegistration('/');
     const subscription=await registration?.pushManager.getSubscription();
     if(subscription&&alive()){
      await request('/api/reminders/unsubscribe',{endpoint:subscription.endpoint});
      await subscription.unsubscribe();
     }
    }
   }finally{if(alive())await refresh();}
  });
 });
 const capture=event=>{const form=event.target.form;if(form?.hasAttribute('data-reminder-form')){schedules.capture(form);if(event.target.name==='kind')schedules.changed(form);}};
 controls.oninput=capture;controls.onchange=capture;
 controls.addEventListener('toggle',event=>{if(event.target.classList.contains('push-connections'))devicesOpen=event.target.open;},true);
 controls.onsubmit=event=>{if(event.target.hasAttribute('data-reminder-form')){event.preventDefault();void run(()=>schedules.submit(event.target));}};
 function dispose(){if(disposed)return;disposed=true;readAbort?.abort();observer.disconnect();controls.onclick=controls.oninput=controls.onchange=controls.onsubmit=null;}
 const observer=new MutationObserver(()=>{if(!panel.isConnected)dispose();});observer.observe(document.body,{childList:true,subtree:true});
 void run(async()=>{await refresh();});
 return {dispose,back(){if(busy||schedules.locked)return false;if(schedules.back()){notify('');render();return true;}return false;}};
}
