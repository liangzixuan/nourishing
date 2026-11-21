import {uiLanguage} from './app-language.js';
import {accountMessage as m} from './account-cloud-messages.js';
import {request} from './diary-api.js';
import {escape as e} from './html.js';
const days=()=>[m("cycleDisplay.sun"),m("cycleDisplay.mon"),m("cycleDisplay.tue"),m("cycleDisplay.wed"),m("cycleDisplay.thu"),m("cycleDisplay.fri"),m("cycleDisplay.sat")];
const kinds=()=>({daily:m("accountCloud.foodDaily"),weight:m("discover.title.weight-log"),fasting:m("reminders.kind.fasting"),'fasting-start':m("accountCloud.scheduledFastStart")});
const timeZone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';

/** Minimal schedule editor shared by the notification panel. */
export function createReminderSchedulePanel({getData,refresh,notify}){
 let draft=null,pending=null,confirmDelete=null;
 function html({showPause=true}={}){
  const data=getData();if(!Array.isArray(data?.schedules))return `<p class="push-paused">${m("accountCloud.scheduledRemindersPaused")}</p>`;
  const rows=data.schedules.map(row=>`<li><div><strong>${e(row.label)}</strong><small>${e(kinds()[row.kind])}${row.time?' · '+e(row.time):''}${row.enabled?'':' · '+m('bodyPanel.off')}</small></div><div class="push-actions"><button type="button" data-reminder-action="edit" data-id="${e(row.id)}">${m("mobileNutrientTargets.edit")}</button><button type="button" data-reminder-action="delete" data-id="${e(row.id)}">${m("mobileRepeat.delete")}</button></div></li>`).join('');
  const control=`<div class="push-actions">${showPause?`<button type="button" data-reminder-action="pause" ${data.paused&&!data.devices?.some(row=>row.currentOrigin)?'disabled':''}>${data.paused?m("accountCloud.resumeReminders"):m("accountCloud.pauseReminders")}</button>`: ''}<button type="button" data-reminder-action="add">${m("accountCloud.addReminder")}</button></div>`;
  if(!draft)return `${confirmDelete?`<section class="push-confirm" role="alertdialog" aria-label="${m("accountCloud.deleteReminder")}"><p>${m("accountCloud.deleteThisReminder")}</p><div class="push-actions"><button type="button" data-reminder-action="confirm-delete">${m("accountCloud.deleteReminder")}</button><button type="button" data-reminder-action="cancel-delete">${m("mobileWeightGoal.cancel")}</button></div></section>`:''}<section class="push-schedules"><h2>${m("reminders.title")} <small>${data.paused?m("discover.fasting.paused"):m("discover.fasting.active")}</small></h2>${control}<ul class="push-devices push-reminder-list">${rows||`<li class="push-muted">${m("accountCloud.noRemindersYet")}</li>`}</ul>${data.recent?.length?`<details><summary>${m("accountCloud.recentDeliveries")}</summary><ul>${data.recent.map(row=>`<li>${e(new Date(row.createdAt).toLocaleString(uiLanguage()))} · ${e(m({accepted:'accountCloud.sentCheckYourNotifications',expired:'accountCloud.connectionExpiredConnectThisBrowserAgain',rejected:'accountCloud.thePushServiceRejectedTheNotification'}[row.outcome]??'accountCloud.deliveryNotConfirmed'))}</li>`).join('')}</ul></details>`:''}</section>`;
  const foodScope=draft.foodCondition?draft.foodCondition.group===null?'day':'group:'+draft.foodCondition.group:'always';
  return `<section class="push-schedules"><h2>${draft.id?m("reminders.editTitle"):m("accountCloud.addReminder")}</h2><form data-reminder-form><fieldset ${pending?'disabled':''}><label>${m("settings.name")}<input name="label" maxlength="80" required value="${e(draft.label)}"></label><label>${m("reminders.type")}<select name="kind" aria-label="${m("reminders.type")}">${Object.entries(kinds()).map(([key,name])=>`<option value="${key}" ${draft.kind===key?'selected':''}>${e(name)}</option>`).join('')}</select></label><label data-reminder-clock ${!['daily','weight'].includes(draft.kind)?'hidden':''}>${m("appActions.time")}<input name="time" type="time" value="${e(draft.time||'12:00')}"></label><label>${m("reminders.zone")}<input name="timeZone" required value="${e(draft.timeZone)}"></label><div data-reminder-daily ${draft.kind!=='daily'?'hidden':''}><div class="push-days">${days().map((label,index)=>`<label><input name="days" type="checkbox" value="${index}" ${draft.days?.includes(index)?'checked':''}>${label}</label>`).join('')}</div><label>${m("reminders.sendWhen")}<select name="foodScope" aria-label="${m("reminders.sendWhen")}"><option value="always" ${foodScope==='always'?'selected':''}>${m("reminders.scope.always")}</option><option value="day" ${foodScope==='day'?'selected':''}>${m("accountCloud.noFoodLoggedToday")}</option>${(data.groups??[]).map(group=>`<option value="${e('group:'+group)}" ${foodScope==='group:'+group?'selected':''}>${e(m('accountCloud.noFoodInGroup',{group}))}</option>`).join('')}</select></label></div><label data-reminder-weight ${draft.kind!=='weight'?'hidden':''}>${m("reminders.weightMetric")}<select name="weightMetric" aria-label="${m("reminders.weightMetric")}"><option value="">${m("accountCloud.chooseMetric")}</option>${(data.weightMetrics??[]).map(row=>`<option value="${e(JSON.stringify(row.metric))}" ${JSON.stringify(row.metric)===JSON.stringify(draft.weightMetric)?'selected':''}>${e(row.name)} · ${e(row.unit)}</option>`).join('')}</select></label><label class="push-enabled"><input type="checkbox" name="enabled" ${draft.enabled?'checked':''}>${m("fastingSchedules.enabled")}</label><div class="push-actions"><button type="submit" class="primary">${m("reminders.save")}</button><button type="button" data-reminder-action="cancel">${m("mobileWeightGoal.cancel")}</button></div></fieldset></form></section>`;
 }
 async function action(button){
  const data=getData(),type=button.dataset.reminderAction;
  if(pending)return;
  if(type==='add'){draft={creationId:crypto.randomUUID(),label:'',kind:'daily',time:'12:00',days:[0,1,2,3,4,5,6],timeZone:timeZone(),enabled:true};return;}
  if(type==='edit'){const existing=data.schedules.find(row=>row.id===button.dataset.id);if(!existing)throw Error(m("accountCloud.reminderNotFound"));draft=structuredClone(existing);return;}
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
 function complete(){const kind=pending?.kind;pending=null;if(kind==='save')draft=null;notify(kind==='save'?(getData().paused?m("accountCloud.savedRemindersRemainPaused"):m("reminders.saved")):kind==='delete'?m("accountCloud.reminderDeleted"):getData().paused?m("accountCloud.remindersPaused"):m("accountCloud.remindersActive"));}
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
  pending=null;notify(draft?m('accountCloud.settingsReloadedReview'):m("accountCloud.settingsReloaded"));
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
  if(kind==='weight'){if(!draft.weightMetric)throw Error(m("accountCloud.chooseAWeightMetric"));schedule.weightMetric=structuredClone(draft.weightMetric);}
  return write('/api/reminders/schedule',{revision:getData().revision,schedule},'save');
 }
 return {html,action,changed,submit,capture,reload,get editing(){return Boolean(draft||confirmDelete);},get locked(){return Boolean(pending);},back(){if(pending)return false;if(confirmDelete){confirmDelete=null;return true;}if(draft){draft=null;return true;}return false;}};
}
