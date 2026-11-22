import {dc} from './discover-cloud-messages.js';
import {coreText} from './core-cloud-messages.js';
import {t} from './app-language.js';
import {request,queueCommand} from './diary-api.js';
import {readDeviceCache} from './device-cache.js';
import {currentPrivateResponseTicket} from './offline-store.js';
import {localWorkspaceView} from './local-engine.js';
import {resolvePauseLife} from './local-diary-projection.js';
import {onBackgroundWriteStatus} from './background-writes.js';
import {escape as e} from './html.js';

const path='/api/pause-life';
export function mountPauseLife({root,onChange=async()=>{}}){
 let active=true,view,ticket,busy=false,error='';
 const abort=new AbortController(),alive=()=>active&&root.isConnected;
 const owner=readDeviceCache(path).then(cached=>cached.ticket);
 root.classList.add('pause-life');
 function render(){
  if(!alive())return;
  root.setAttribute('aria-busy',String(busy));
  const policy=view?.policy;
  root.innerHTML=policy?`<section class="pl-card" data-pause-settings><label class="pl-enable"><strong>${dc('pauseEnable')}</strong><input type="checkbox" role="switch" data-pause-enabled aria-label="${dc('pauseEnable')}" ${policy.enabled?'checked':''} ${busy?'disabled':''}></label><fieldset class="pl-programs" aria-label="${dc('program')}" ${!policy.enabled||busy?'disabled':''}>${[['galveston','Galveston Diet'],['bfb-ps','BFB/PS Challenge']].map(([value,label])=>`<label><input type="radio" name="pause-program" data-pause-program value="${value}" ${policy.program===value?'checked':''}><span>${label}</span></label>`).join('')}</fieldset></section>`:busy?`<p class="pl-status" role="status">${t('mobileNutrientDetail.loading')}</p>`:'';
  if(error)root.insertAdjacentHTML('beforeend',`<div class="pl-status" role="status">${e(error)}${!view?`<button type="button" data-pause-reload>${e(t('mobileSuggest.retry'))}</button>`:''}</div>`);
 }
 async function load(){
  busy=true;error='';render();
  try{
   ticket=await owner;
   const local=ticket?await localWorkspaceView():null;
   const next=local?.revision?{revision:local.revision,policy:resolvePauseLife(local.state.settings.pauseLife)}:await request(path,undefined,abort.signal);
   if(ticket&&!await currentPrivateResponseTicket(ticket))return;
   view=next;
  }catch(cause){error=cause.message;}
  finally{busy=false;render();}
 }
 async function save(policy){
  busy=true;error='';render();
  const next={...view,policy};
  try{
   if(!ticket)throw Error(coreText('note.storageUnavailable'));
   await queueCommand(view.revision,'pauseLife.save',{policy},{ticket,projection:{responses:{[path]:next}}});
   if(!alive())return;
   view=next;void onChange();
  }catch(cause){error=cause.message;}
  finally{busy=false;render();}
 }
 const stopStatus=onBackgroundWriteStatus(event=>{
  if(!alive()||!view)return;
  if(event.saved)view={...view,revision:event.result.revision??view.revision};
  if(event.discarded&&!busy)void load();
 });
 root.addEventListener('change',event=>{
  if(!view||busy)return;
  const input=event.target;
  if(input.matches('[data-pause-enabled]'))void save({...view.policy,enabled:input.checked});
  if(input.matches('[data-pause-program]'))void save({...view.policy,program:input.value});
 },{signal:abort.signal});
 root.addEventListener('click',event=>{if(event.target.closest('[data-pause-reload]'))void load();},{signal:abort.signal});
 void load();
 return {back:()=>false,dispose(){active=false;stopStatus();abort.abort();root.classList.remove('pause-life');}};
}
