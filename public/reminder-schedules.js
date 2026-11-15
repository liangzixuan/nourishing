import {request} from './diary-api.js';
import {escape as e} from './html.js';
const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const kinds={daily:'Food / daily',weight:'Weight',fasting:'Fasting goal','fasting-start':'Scheduled fast start'};
const timeZone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';

/** Minimal schedule editor shared by the notification panel. */
export function createReminderSchedulePanel({getData,refresh,notify}){
 let draft=null;
 function html(){
  const data=getData();if(!Array.isArray(data?.schedules))return '<p class="push-paused">Scheduled reminders paused</p>';
  const rows=data.schedules.map(row=>`<li><div><strong>${e(row.label)}</strong><small>${e(kinds[row.kind])}${row.time?' · '+e(row.time):''}${row.enabled?'':' · Off'}</small></div><div class="push-actions"><button type="button" data-reminder-action="edit" data-id="${e(row.id)}">Edit</button><button type="button" data-reminder-action="delete" data-id="${e(row.id)}">Delete</button></div></li>`).join('');
  const control=`<div class="push-actions"><button type="button" data-reminder-action="pause" ${data.paused&&!data.devices?.some(row=>row.currentOrigin)?'disabled':''}>${data.paused?'Resume reminders':'Pause reminders'}</button><button type="button" data-reminder-action="add">Add reminder</button></div>`;
  if(!draft)return `<section class="push-schedules"><h2>Reminders <small>${data.paused?'Paused':'Active'}</small></h2>${control}<ul class="push-devices">${rows}</ul>${data.recent?.length?`<details><summary>Recent deliveries</summary><ul>${data.recent.map(row=>`<li>${e(new Date(row.createdAt).toLocaleString())} · ${e(row.outcome)}</li>`).join('')}</ul></details>`:''}</section>`;
  const foodScope=draft.foodCondition?draft.foodCondition.group===null?'day':'group:'+draft.foodCondition.group:'always';
  return `<section class="push-schedules"><h2>${draft.id?'Edit reminder':'Add reminder'}</h2><form data-reminder-form><label>Name<input name="label" maxlength="80" required value="${e(draft.label)}"></label><label>Type<select name="kind" aria-label="Type">${Object.entries(kinds).map(([key,name])=>`<option value="${key}" ${draft.kind===key?'selected':''}>${e(name)}</option>`).join('')}</select></label><label data-reminder-clock ${!['daily','weight'].includes(draft.kind)?'hidden':''}>Time<input name="time" type="time" value="${e(draft.time||'12:00')}"></label><label>Time zone<input name="timeZone" required value="${e(draft.timeZone)}"></label><div data-reminder-daily ${draft.kind!=='daily'?'hidden':''}><div class="push-days">${days.map((label,index)=>`<label><input name="days" type="checkbox" value="${index}" ${draft.days?.includes(index)?'checked':''}>${label}</label>`).join('')}</div><label>Send when<select name="foodScope" aria-label="Send when"><option value="always" ${foodScope==='always'?'selected':''}>Always</option><option value="day" ${foodScope==='day'?'selected':''}>No food logged today</option>${(data.groups??[]).map(group=>`<option value="${e('group:'+group)}" ${foodScope==='group:'+group?'selected':''}>No food in ${e(group)}</option>`).join('')}</select></label></div><label data-reminder-weight ${draft.kind!=='weight'?'hidden':''}>Weight metric<select name="weightMetric" aria-label="Weight metric"><option value="">Choose metric</option>${(data.weightMetrics??[]).map(row=>`<option value="${e(JSON.stringify(row.metric))}" ${JSON.stringify(row.metric)===JSON.stringify(draft.weightMetric)?'selected':''}>${e(row.name)} · ${e(row.unit)}</option>`).join('')}</select></label><label class="push-enabled"><input type="checkbox" name="enabled" ${draft.enabled?'checked':''}>Enabled</label><div class="push-actions"><button type="submit" class="primary">Save reminder</button><button type="button" data-reminder-action="cancel">Cancel</button></div></form></section>`;
 }
 async function action(button){
  const data=getData(),type=button.dataset.reminderAction;
  if(type==='add'){draft={creationId:crypto.randomUUID(),label:'',kind:'daily',time:'12:00',days:[0,1,2,3,4,5,6],timeZone:timeZone(),enabled:true};return;}
  if(type==='edit'){const existing=data.schedules.find(row=>row.id===button.dataset.id);if(!existing)throw Error('Reminder not found.');draft={...existing};return;}
  if(type==='cancel'){draft=null;return;}
  if(type==='pause'){await request('/api/reminders/settings',{revision:data.revision,paused:!data.paused});await refresh();notify(getData().paused?'Reminders paused.':'Reminders active.');return;}
  if(type==='delete'){await request('/api/reminders/schedule/delete',{revision:data.revision,id:button.dataset.id});await refresh();notify('Reminder deleted.');}
 }
 function changed(form){
  const kind=form.elements.kind.value;form.querySelector('[data-reminder-clock]').hidden=!['daily','weight'].includes(kind);form.querySelector('[data-reminder-daily]').hidden=kind!=='daily';form.querySelector('[data-reminder-weight]').hidden=kind!=='weight';
 }
 async function submit(form){
  if(!draft)return;const values=new FormData(form),kind=values.get('kind'),scope=values.get('foodScope');
  const schedule={...(draft.id?{id:draft.id}:{creationId:draft.creationId}),label:values.get('label'),kind,timeZone:values.get('timeZone'),enabled:values.has('enabled')};
  if(['daily','weight'].includes(kind))schedule.time=values.get('time');
  if(kind==='daily'){schedule.days=values.getAll('days').map(Number);if(scope!=='always')schedule.foodCondition={group:scope==='day'?null:scope.slice(6)};}
  if(kind==='weight'){try{schedule.weightMetric=JSON.parse(values.get('weightMetric'));}catch{throw Error('Choose a weight metric.');}}
  draft={...schedule};await request('/api/reminders/schedule',{revision:getData().revision,schedule});draft=null;await refresh();notify(getData().paused?'Saved. Reminders remain paused.':'Reminder saved.');
 }
 return {html,action,changed,submit};
}
