import {Temporal} from './fasting-source/vendor/temporal.js';
import {accountMessage as m} from './account-cloud-messages.js';
import {escape as e} from './html.js';
import {flushBackgroundWrites} from './background-writes.js';
import {invalidateDeviceCache,readDeviceCache} from './device-cache.js';
import {currentPrivateResponseTicket,expireOfflineSnapshot,readWriteCopy,saveOfflineSnapshot} from './offline-store.js';

const label=key=>m('accountCloud.bulk.'+key);
const types=['food','exercise','biometrics','notes','fasts'];
const api='/api/account/diary-data/';
const changed=()=>Error(label('changed'));
const timeout=()=>AbortSignal.timeout(45000);

export function mountBulkDiaryDeletion({root,ownerId,timeZone,request}){
 const retryKey='nourishing.bulk-diary-retry:'+ownerId;
 const remembered=()=>{try{return JSON.parse(sessionStorage.getItem(retryKey));}catch{return null;}};
 const forget=id=>{if(remembered()?.requestId===id)sessionStorage.removeItem(retryKey);};
 const today=Temporal.Now.plainDateISO(timeZone),week=today.subtract({days:6});
 const previous=remembered();
 let pending=previous?.ownerId===ownerId?previous:null;
 let busy=false,disposed=false,complete=false;
 const checkboxes=types.map(type=>`<label class="bulk-check"><input type="checkbox" name="type" value="${type}"><span>${e(label(type))}</span></label>`).join('');
 root.innerHTML=`<form class="bulk-diary-form">
   <div class="bulk-range"><label for="bulk-range">${e(label('range'))}</label><select id="bulk-range" name="range"><option value="week">${e(label('week'))}</option><option value="custom">${e(label('custom'))}</option></select></div>
   <p class="bulk-dates"></p><div class="bulk-custom" hidden><label>${e(label('from'))}<input type="date" name="start" required></label><label>${e(label('to'))}<input type="date" name="end" required></label></div>
   <section class="bulk-types"><fieldset><legend>${e(label('choose'))}</legend><div class="bulk-options">${checkboxes}</div></fieldset><p class="bulk-info">${e(label('scope'))}</p></section>
   <div class="bulk-confirm"><p class="bulk-warning"><strong>${e(label('warning'))}</strong><span>${e(label('irreversible'))}</span></p>
   <label class="bulk-check"><input type="checkbox" name="ack" required><span>${e(label('ack'))}</span></label>
   <input type="password" name="password" autocomplete="current-password" minlength="8" maxlength="256" aria-label="${e(m('accountCloud.currentPassword'))}" placeholder="${e(label('passwordHint'))}" required>
   <p class="notice" role="status"></p><div class="bulk-actions"><button type="button" class="secondary" data-more-back>${e(m('mobileWeightGoal.cancel'))}</button><button type="submit">${e(label('submit'))}</button></div></div>
  </form>`;
 const form=root.querySelector('form'),fields=form.elements,checks=[...form.querySelectorAll('[name=type]')];
 const dates=form.querySelector('.bulk-dates'),custom=form.querySelector('.bulk-custom'),status=form.querySelector('[role=status]'),save=form.querySelector('[type=submit]');
 fields.range.value=pending?.range??'week';
 fields.start.value=pending?.start??week.toString();fields.end.value=pending?.end??today.toString();
 for(const box of checks)box.checked=!!pending?.types.includes(box.value);
 fields.ack.checked=!!pending;
 if(pending)status.textContent=label('retry');
 const readable=date=>Temporal.PlainDate.from(date).toLocaleString(document.documentElement.lang,{year:'numeric',month:'short',day:'numeric'});
 const selected=()=>checks.filter(box=>box.checked).map(box=>box.value);
 function render(){
  if(disposed)return;
  const editable=!busy&&!pending&&!complete;
  fields.range.disabled=!editable;
  custom.hidden=fields.range.value!=='custom';dates.hidden=!custom.hidden;
  dates.textContent=fields.start.value&&fields.end.value?readable(fields.start.value)+' – '+readable(fields.end.value):'';
  fields.start.disabled=fields.end.disabled=!editable||custom.hidden;
  fields.start.max=fields.end.value;fields.end.min=fields.start.value;
  for(const box of checks)box.disabled=!editable;
  fields.ack.disabled=!editable;fields.password.disabled=busy||complete;
  save.disabled=busy||complete||!selected().length||!fields.ack.checked||!fields.password.value||!fields.start.value||!fields.end.value||fields.start.value>fields.end.value;
  save.textContent=busy?m('accountCloud.pleaseWait'):pending?m('mobileSuggest.retry'):label('submit');
 }
 form.addEventListener('input',event=>{
  if(event.target===fields.range&&fields.range.value==='week'){
   fields.start.value=week.toString();fields.end.value=today.toString();
  }
  render();
 });
 async function currentTicket(){
  if(!globalThis.indexedDB)return null;
  const {ticket}=await readDeviceCache('/api/diary');
  if(!ticket||ticket.ownerId!==ownerId||!await currentPrivateResponseTicket(ticket))throw changed();
  return ticket;
 }
 async function requireSynced(ticket){
  if(!ticket)return;
  if(!await currentPrivateResponseTicket(ticket))throw changed();
  const copy=await readWriteCopy();
  if(copy&&(copy.locked||copy.ownerId!==ownerId||copy.ticket.epoch!==ticket.epoch))throw changed();
  if(copy?.pending.length)throw Error(label('sync'));
 }
 async function refresh(ticket){
  if(!ticket)return;
  if(!await currentPrivateResponseTicket(ticket))throw changed();
  const fresh=await invalidateDeviceCache(ticket);
  if(!fresh)throw changed();
  await expireOfflineSnapshot(fresh);
  const copy=await readWriteCopy();
  const snapshot=await request('/api/offline',null,'GET',timeout());
  const saved=await saveOfflineSnapshot(snapshot,{ownerId:ticket.ownerId,epoch:ticket.epoch,revision:copy?.revision??0});
  if(!saved.snapshotRefreshed)throw Error(label('syncLater'));
 }
 form.onsubmit=async event=>{
  event.preventDefault();
  if(save.disabled||disposed)return;
  busy=true;status.textContent='';status.classList.remove('error');render();
  const retrying=!!pending;
  let submitted=false;
  try{
   const ticket=await currentTicket();
   if(ticket)await flushBackgroundWrites();
   await requireSynced(ticket);
   if(disposed)return;
   if(!pending){
    const selection={start:fields.start.value,end:fields.end.value,timeZone,types:selected()};
    const review=await request(api+'preview',selection,'POST');
    if(disposed)return;
    if(review.ownerId!==ownerId)throw changed();
    pending={...selection,range:fields.range.value,ownerId,epoch:ticket?.epoch,revision:review.revision,requestId:crypto.randomUUID()};
   }
   if(pending.epoch!==ticket?.epoch){forget(pending.requestId);pending=null;throw changed();}
   await requireSynced(ticket);
   if(disposed)return;
   // A tab reload can recover the exact request after a lost response. Never save the password.
   sessionStorage.setItem(retryKey,JSON.stringify(pending));
   const {range,epoch,...command}=pending;
   submitted=true;
   await request(api+'delete',{...command,password:fields.password.value,confirmation:'delete'},'POST',timeout());
   forget(command.requestId);pending=null;complete=true;
   fields.password.value='';
   try{await refresh(ticket);status.textContent=label('done');}
   catch{status.textContent=label('syncLater');}
   window.dispatchEvent(new Event('nourishing-data-changed'));
  }catch(error){
   const uncertain=submitted&&(!error.status||error.status>=500||error.status===408);
   // A rejected password on a retry cannot establish the outcome of the earlier request.
   const checkPrior=retrying&&[401,403,429].includes(error.status);
   if(!uncertain&&!checkPrior&&pending&&submitted){forget(pending.requestId);pending=null;fields.ack.checked=false;}
   if(error.status===401||error.status===403)fields.password.value='';
   if(!disposed){status.textContent=uncertain?label('retry'):error.message;status.classList.add('error');}
  }finally{busy=false;render();}
 };
 render();
 return {dispose(){disposed=true;fields.password.value='';}};
}
