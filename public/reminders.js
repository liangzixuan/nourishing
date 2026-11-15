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
export async function openReminders({show,header,content}){
 show(`${header('Notifications')}<section class="push-panel"><p role="status">Loading…</p><div data-push-controls></div></section>`);
 const root=content.querySelector('.push-panel'),message=root.querySelector('[role=status]'),controls=root.querySelector('[data-push-controls]');
 let data,busy=false;
 const refresh=async()=>{data=await request('/api/reminders');};
 const schedules=createReminderSchedulePanel({getData:()=>data,refresh,notify:text=>{message.textContent=text;}});
 const supported=()=>window.isSecureContext&&'Notification'in window&&'PushManager'in window&&'serviceWorker'in navigator;
 function render(){
  if(!root.isConnected)return;
  if(!data?.configured){controls.replaceChildren();return;}
  const canConnect=supported()&&Notification.permission!=='denied';
  controls.innerHTML=`<div class="push-actions"><button type="button" class="primary" data-connect ${canConnect?'':'disabled'}>Connect this browser</button><button type="button" data-disconnect ${supported()?'':'disabled'}>Disconnect this browser</button></div>${!supported()?'<p>Use a supported browser or installed app.</p>':Notification.permission==='denied'?'<p>Allow notifications in your browser settings.</p>':''}<ul class="push-devices">${data.devices.map(device=>`<li><span>${e(device.label)}</span><div class="push-actions"><button type="button" data-test="${e(device.id)}" ${device.currentOrigin?'':'disabled'}>${pendingTests.has(device.id)?'Check result':'Test'}</button><button type="button" data-remove="${e(device.id)}">Remove</button></div></li>`).join('')}</ul>${schedules.html()}`;
  if(busy)controls.querySelectorAll('button').forEach(button=>button.disabled=true);
 }
 async function run(action){if(busy)return;busy=true;message.textContent='';render();try{await action();}catch(error){if(root.isConnected)message.textContent=error.message;}finally{busy=false;render();}}
 controls.onclick=event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  if(button.dataset.reminderAction){void run(()=>schedules.action(button));}
  else if(button.hasAttribute('data-connect')){
   // Permission stays in the explicit click handler; connection does not resume schedules.
   const permission=Notification.requestPermission();
   void run(async()=>{
    if(await permission!=='granted')throw Error('Notifications were not allowed.');
    const registration=await navigator.serviceWorker.getRegistration('/');if(!registration?.active)throw Error('Refresh Nourishing, then connect again.');
    const key=bytes(data.publicKey);let subscription=await registration.pushManager.getSubscription();
    if(subscription&&!sameKey(subscription.options.applicationServerKey,key)){await subscription.unsubscribe();subscription=null;}
    subscription??=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
    await request('/api/reminders/subscribe',{subscription:subscription.toJSON(),label:'This browser'});await refresh();
    message.textContent='Connected. Send a test notification.';
   });
  }else if(button.hasAttribute('data-disconnect'))void run(async()=>{
   const registration=await navigator.serviceWorker.getRegistration('/'),subscription=await registration?.pushManager.getSubscription();
   if(subscription){await request('/api/reminders/unsubscribe',{endpoint:subscription.endpoint});await subscription.unsubscribe();await refresh();}
   message.textContent='Disconnected.';
  });
  else if(button.dataset.remove)void run(async()=>{await request('/api/reminders/unsubscribe',{id:button.dataset.remove});await refresh();pendingTests.delete(button.dataset.remove);message.textContent='Device removed.';});
  else if(button.dataset.test)void run(async()=>{
   const id=button.dataset.test;if(!pendingTests.has(id))pendingTests.set(id,crypto.randomUUID());
   try{
    const result=await request('/api/reminders/test',{deviceId:id,requestId:pendingTests.get(id)});pendingTests.delete(id);
    message.textContent={accepted:'Sent. Check your notifications.',expired:'Connection expired. Connect this browser again.',rejected:'The push service rejected the notification.',unknown:'Delivery not confirmed.'}[result.outcome]??'Delivery not confirmed.';
    if(result.outcome==='expired')data=await request('/api/reminders');
   }catch(error){if(error.status&&error.status<500)pendingTests.delete(id);throw error;}
  });
 };
 controls.onchange=event=>{if(event.target.name==='kind'&&event.target.form?.hasAttribute('data-reminder-form'))schedules.changed(event.target.form);};
 controls.onsubmit=event=>{if(event.target.hasAttribute('data-reminder-form')){event.preventDefault();void run(()=>schedules.submit(event.target));}};
 try{data=await request('/api/reminders');if(root.isConnected)message.textContent=data.configured?'':'Notifications are unavailable.';render();}catch(error){if(root.isConnected)message.textContent=error.message;}
}
