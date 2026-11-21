import {dc} from '../discover-cloud-messages.js';
import {uiLanguage,t} from '../app-language.js';
import {request,queueCommand} from '../diary-api.js';
import {prepareFastingWrite} from './device.js';
import {readDeviceCache} from '../device-cache.js';

// The dialog owns one immutable command while its outcome is uncertain.
export function fastingMutation({revision,host,onSaved,onReload,context}){
 const owner=context?readDeviceCache('/api/diary').then(value=>value.ticket):null;
 let body,busy=false,conflict=false,disposed=false;const disabled=new Map();
 const status=document.createElement('p');status.className='dc-error';status.setAttribute('role','status');host.append(status);
 const reload=document.createElement('button');reload.type='button';reload.className='dc-button dc-link';reload.textContent=dc('reloadLatest');reload.hidden=true;host.append(reload);
 const retry=document.createElement('button');retry.type='button';retry.className='dc-button dc-link';retry.textContent=t('mobileSuggest.retry');retry.hidden=true;host.append(retry);
 function unlock(){for(const [node,wasDisabled] of disabled)node.disabled=wasDisabled;disabled.clear();}
 const fields=()=>host.querySelectorAll('input,select,textarea,button');
 function controls(){const locked=busy||Boolean(body)||conflict;if(locked){for(const node of fields()){if(!disabled.has(node))disabled.set(node,node.disabled);node.disabled=true;}}else unlock();for(const node of host.querySelectorAll('[data-close-fast],[data-fast-delete=cancel]'))node.disabled=busy;reload.disabled=busy;reload.hidden=!conflict;retry.disabled=busy;retry.hidden=!body||busy;for(const node of host.querySelectorAll('[type=submit],[data-fast-delete=confirm],[data-confirm-fast]'))node.disabled=busy||conflict;}
 reload.onclick=async()=>{if(busy)return;busy=true;controls();try{await onReload();}catch(error){if(!disposed)status.textContent=error.message;}finally{busy=false;if(!disposed)controls();}};
 const operation={get blocked(){return busy||Boolean(body)||conflict;},get busy(){return busy;},async run(type,payload){
  if(disposed||busy||conflict)return false;body??={revision:revision(),type,payload:structuredClone(payload),requestId:crypto.randomUUID()};busy=true;status.textContent='';controls();
  try{
   const ticket=await owner;
   if(ticket){const view=context(),fastingChange=prepareFastingWrite(view,body);await queueCommand(body.revision,type,body.payload,{ticket,requestId:body.requestId,projection:{fastingChange,fastingContext:{timeZone:view.timeZone,schedulerReady:view.schedulerReady}}});}
   else await request('/api/workspace/command',body);
   body=null;busy=false;if(!disposed)await onSaved();return true;}
  catch(error){if(disposed)return false;status.textContent=error.message;if(error.status===409){body=null;conflict=true;}else if(error.status>=400&&error.status<500&&error.status!==408)body=null;return false;}
  finally{busy=false;if(!disposed)controls();}
 },dispose(){disposed=true;unlock();status.remove();reload.remove();retry.remove();}};retry.onclick=()=>operation.run(body.type,body.payload);return operation;
}
