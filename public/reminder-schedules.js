import {request} from './diary-api.js';
import {escape as e} from './html.js';
const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const kinds={daily:'Food / daily',weight:'Weight',fasting:'Fasting goal','fasting-start':'Scheduled fast start'};
const timeZone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';

/** Minimal schedule editor shared by the notification panel. */
export function createReminderSchedulePanel({getData,refresh,notify}){
 let draft=null,pending=null,confirmDelete=null;
 function html(){
  const data=getData();if(!Array.isArray(data?.schedules))return '<p class="push-paused">Scheduled reminders paused</p>';
  const rows=data.schedules.map(row=>`<li><div><strong>${e(row.label)}</strong><small>${e(kinds[row.kind])}${row.time?' · '+e(row.time):''}${row.enabled?'':' · Off'}</small></div><div class="push-actions"><button type="button" data-reminder-action="edit" data-id="${e(row.id)}">Edit</button><button type="button" data-reminder-action="delete" data-id="${e(row.id)}">Delete</button></div></li>`).join('');
  const control=`<div class="push-actions"><button type="button" data-reminder-action="pause" ${data.paused&&!data.devices?.some(row=>row.currentOrigin)?'disabled':''}>${data.paused?'Resume reminders':'Pause reminders'}</button><button type="button" data-reminder-action="add">Add reminder</button></div>`;
  if(!draft)return `${confirmDelete?`<section class="push-confirm" role="alertdialog" aria-label="Delete reminder"><p>Delete this reminder?</p><div class="push-actions"><button type="button" data-reminder-action="confirm-delete">Delete reminder</button><button type="button" data-reminder-action="cancel-delete">Cancel</button></div></section>`:''}<section class="push-schedules"><h2>Reminders <small>${data.paused?'Paused':'Active'}</small></h2>${control}<ul class="push-devices push-reminder-list">${rows||'<li class="push-muted">No reminders yet</li>'}</ul>${data.recent?.length?`<details><summary>Recent deliveries</summary><ul>${data.recent.map(row=>`<li>${e(new Date(row.createdAt).toLocaleString())} · ${e(row.outcome)}</li>`).join('')}</ul></details>`:''}</section>`;
  const foodScope=draft.foodCondition?draft.foodCondition.group===null?'day':'group:'+draft.foodCondition.group:'always';
  return `<section class="push-schedules"><h2>${draft.id?'Edit reminder':'Add reminder'}</h2><form data-reminder-form><fieldset ${pending?'disabled':''}><label>Name<input name="label" maxlength="80" required value="${e(draft.label)}"></label><label>Type<select name="kind" aria-label="Type">${Object.entries(kinds).map(([key,name])=>`<option value="${key}" ${draft.kind===key?'selected':''}>${e(name)}</option>`).join('')}</select></label><label data-reminder-clock ${!['daily','weight'].includes(draft.kind)?'hidden':''}>Time<input name="time" type="time" value="${e(draft.time||'12:00')}"></label><label>Time zone<input name="timeZone" required value="${e(draft.timeZone)}"></label><div data-reminder-daily ${draft.kind!=='daily'?'hidden':''}><div class="push-days">${days.map((label,index)=>`<label><input name="days" type="checkbox" value="${index}" ${draft.days?.includes(index)?'checked':''}>${label}</label>`).join('')}</div><label>Send when<select name="foodScope" aria-label="Send when"><option value="always" ${foodScope==='always'?'selected':''}>Always</option><option value="day" ${foodScope==='day'?'selected':''}>No food logged today</option>${(data.groups??[]).map(group=>`<option value="${e('group:'+group)}" ${foodScope==='group:'+group?'selected':''}>No food in ${e(group)}</option>`).join('')}</select></label></div><label data-reminder-weight ${draft.kind!=='weight'?'hidden':''}>Weight metric<select name="weightMetric" aria-label="Weight metric"><option value="">Choose metric</option>${(data.weightMetrics??[]).map(row=>`<option value="${e(JSON.stringify(row.metric))}" ${JSON.stringify(row.metric)===JSON.stringify(draft.weightMetric)?'selected':''}>${e(row.name)} · ${e(row.unit)}</option>`).join('')}</select></label><label class="push-enabled"><input type="checkbox" name="enabled" ${draft.enabled?'checked':''}>Enabled</label><div class="push-actions"><button type="submit" class="primary">Save reminder</button><button type="button" data-reminder-action="cancel">Cancel</button></div></fieldset></form></section>`;
 }
 async function action(button){
  const data=getData(),type=button.dataset.reminderAction;
  if(pending)return;
  if(type==='add'){draft={creationId:crypto.randomUUID(),label:'',kind:'daily',time:'12:00',days:[0,1,2,3,4,5,6],timeZone:timeZone(),enabled:true};return;}
  if(type==='edit'){const existing=data.schedules.find(row=>row.id===button.dataset.id);if(!existing)throw Error('Reminder not found.');draft=structuredClone(existing);return;}
  if(type==='cancel'){draft=null;return;}
  if(type==='cancel-delete'){confirmDelete=null;return;}
  if(type==='delete'){confirmDelete=button.dataset.id;return;}
  if(type==='pause')return write('/api/reminders/settings',{revision:data.revision,paused:!data.paused},'pause');
  if(type==='confirm-delete'){const id=confirmDelete;confirmDelete=null;return write('/api/reminders/schedule/delete',{revision:data.revision,id},'delete');}
 }
 async function write(path,body,kind){
  pending={path,body:structuredClone(body),kind};
  try{await request(path,body);await refresh();complete();}
  catch(error){if(error.status>=400&&error.status<500&&error.status!==408&&error.status!==409)pending=null;throw error;}
 }
 function complete(){const kind=pending?.kind;pending=null;if(kind==='save')draft=null;notify(kind==='save'?(getData().paused?'Saved. Reminders remain paused.':'Reminder saved.'):kind==='delete'?'Reminder deleted.':getData().paused?'Reminders paused.':'Reminders active.');}
 function matches(saved,wanted){
  if(!saved)return false;
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  return saved.label===wanted.label.trim()&&saved.kind===wanted.kind&&saved.timeZone===wanted.timeZone.trim()&&saved.enabled===wanted.enabled&&saved.time===(wanted.time??null)&&same(saved.foodCondition??null,wanted.foodCondition??null)&&same(saved.weightMetric??null,wanted.weightMetric??null)&&(wanted.kind!=='daily'||same(saved.days,[...wanted.days].sort((a,b)=>a-b)));
 }
 async function reload(){
  await refresh();if(!pending)return;
  const data=getData(),{body,kind}=pending;
  const saved=kind==='save'?data.schedules.find(row=>row.id===(body.schedule.id??body.schedule.creationId)):null;
  const committed=kind==='save'?matches(saved,body.schedule):kind==='delete'?!data.schedules.some(row=>row.id===body.id):data.paused===body.paused;
  if(committed){complete();return;}
  // Keep the same creation identity and user's fields. Reload never resubmits an edit.
  pending=null;notify(draft?'Settings reloaded. Review your reminder, then save.':'Settings reloaded.');
 }
 function capture(form){
  if(!draft||pending)return;const values=new FormData(form),scope=values.get('foodScope');
  Object.assign(draft,{label:values.get('label'),kind:values.get('kind'),time:values.get('time'),timeZone:values.get('timeZone'),enabled:values.has('enabled'),days:values.getAll('days').map(Number),foodCondition:scope==='always'?null:{group:scope==='day'?null:scope.slice(6)}});
  try{draft.weightMetric=JSON.parse(values.get('weightMetric'));}catch{draft.weightMetric=null;}
 }
 function changed(form){
  const kind=form.elements.kind.value;form.querySelector('[data-reminder-clock]').hidden=!['daily','weight'].includes(kind);form.querySelector('[data-reminder-daily]').hidden=kind!=='daily';form.querySelector('[data-reminder-weight]').hidden=kind!=='weight';
 }
 async function submit(form){
  if(!draft||pending)return;capture(form);
  const {kind}=draft,schedule={...(draft.id?{id:draft.id}:{creationId:draft.creationId}),label:draft.label,kind,timeZone:draft.timeZone,enabled:draft.enabled};
  if(['daily','weight'].includes(kind))schedule.time=draft.time;
  if(kind==='daily'){schedule.days=[...draft.days];if(draft.foodCondition)schedule.foodCondition=structuredClone(draft.foodCondition);}
  if(kind==='weight'){if(!draft.weightMetric)throw Error('Choose a weight metric.');schedule.weightMetric=structuredClone(draft.weightMetric);}
  return write('/api/reminders/schedule',{revision:getData().revision,schedule},'save');
 }
 return {html,action,changed,submit,capture,reload,get editing(){return Boolean(draft||confirmDelete);},get locked(){return Boolean(pending);},back(){if(pending)return false;if(confirmDelete){confirmDelete=null;return true;}if(draft){draft=null;return true;}return false;}};
}
