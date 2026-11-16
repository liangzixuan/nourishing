import {dc} from './discover-cloud-messages.js';
import {uiLanguage,t} from './app-language.js';
import {request} from './diary-api.js';
import {escape as e} from './html.js';

/** Source Pause Life controls; the canonical policy changes Diary presentation only. */
export function mountPauseLife({root,onChange=async()=>{}}){
 let disposed=false,view,pending=null,busy=false,error='',conflict=false;
 const abort=new AbortController(),alive=()=>!disposed&&root.isConnected;
 root.classList.add('pause-life');
 function render(){
  if(!alive())return;
  root.setAttribute('aria-busy',String(busy));
  const policy=view?.policy;
  root.innerHTML=policy?`<section class="pl-card" data-pause-settings><label class="pl-enable"><strong>${dc('pauseEnable')}</strong><input type="checkbox" role="switch" data-pause-enabled aria-label="${dc('pauseEnable')}" ${policy.enabled?'checked':''} ${busy||pending||conflict?'disabled':''}></label><fieldset class="pl-programs" aria-label="${dc('program')}" ${!policy.enabled||busy||pending||conflict?'disabled':''}>${[['galveston','Galveston Diet'],['bfb-ps','BFB/PS Challenge']].map(([value,label])=>`<label><input type="radio" name="pause-program" data-pause-program value="${value}" ${policy.program===value?'checked':''}><span>${label}</span></label>`).join('')}</fieldset></section>`:`<p class="pl-status" role="status">${t('mobileNutrientDetail.loading')}</p>`;
  if(error)root.insertAdjacentHTML('beforeend',`<div class="pl-status" role="status">${e(error)}${!busy&&(pending||conflict||!view)?`<button type="button" data-pause-retry>${conflict?dc('reloadSettings'):t('mobileSuggest.retry')}</button>`:''}</div>`);
 }
 async function load(){busy=true;error='';render();try{const next=await request('/api/pause-life',undefined,abort.signal);if(!alive())return;view=next;pending=null;conflict=false;}catch(cause){if(alive())error=cause.message;}finally{busy=false;render();}}
 async function save(policy){
  if(busy||conflict)return;
  pending??={body:{requestId:crypto.randomUUID(),revision:view.revision,type:'pauseLife.save',payload:{policy:structuredClone(policy)}},result:null};
  busy=true;error='';render();
  try{pending.result??=await request('/api/workspace/command',pending.body);const next=await request('/api/pause-life',undefined,abort.signal);if(!alive())return;view=next;await onChange();pending=null;}
  catch(cause){if(!alive())return;error=cause.message;if(cause.status>=400&&cause.status<500&&cause.status!==408){pending=null;conflict=cause.status===409;}}
  finally{busy=false;render();}
 }
 root.addEventListener('change',event=>{if(!view||busy||pending||conflict)return;const input=event.target;if(input.matches('[data-pause-enabled]'))void save({...view.policy,enabled:input.checked});else if(input.matches('[data-pause-program]'))void save({...view.policy,program:input.value});},{signal:abort.signal});
 root.addEventListener('click',event=>{if(event.target.closest('[data-pause-retry]'))void(pending?save(pending.body.payload.policy):load());},{signal:abort.signal});
 void load();
 return {back:()=>false,dispose(){disposed=true;abort.abort();root.classList.remove('pause-life');}};
}
