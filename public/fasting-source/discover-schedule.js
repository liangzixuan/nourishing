import {validFastingRecurrence} from './fasting-schedule-contract.mjs';
import {repeatFields,readRepeatFields,refreshRepeatLabel} from './fasting-recurrence-fields.js';
import {dateTimeField,refreshDateTimeFields} from './mobile-datetime-picker.js';
import {escape as e,row,button as b} from './ui.js';
import {scheduleGoalEnd,scheduleGoalHours,nextScheduleDraft} from './fasting-time.mjs';
import {formatMessage} from '../report-source/public/message-format.js';
const message=(language,key)=>formatMessage(language,'discover.'+key);
export function scheduleForm(existing,language='en'){
 const t=key=>message(language,key);
 const timeZone=existing?.timeZone??Intl.DateTimeFormat().resolvedOptions().timeZone;
 const hours=existing?.goalHours??16,start=existing?existing.startDate+'T'+existing.time:nextScheduleDraft(timeZone),end=scheduleGoalEnd(start,hours,timeZone)??'';
 return `<form id="dc-schedule-form" data-time-zone="${e(timeZone)}" data-language="${e(language)}" data-custom-repeat="${Boolean(existing?.custom)}"><div class="dc-group">${row(t('schedule.duration'),`<span class="dc-duration"><span class="dc-duration-unit"><input name="days" aria-label="${e(t('schedule.daysAria'))}" type="number" min="0" max="7" value="${Math.floor(hours/24)}"> ${e(t('schedule.days'))}</span><span class="dc-duration-unit"><input name="hours" aria-label="${e(t('schedule.hoursAria'))}" type="number" min="0" max="24" step="any" value="${hours%24}"> ${e(t('schedule.hours'))}</span></span>`)}<label class="dc-row"><span>${e(t('fasting.open'))}</span><input name="open" type="checkbox" role="switch" class="dc-switch" aria-label="${e(t('schedule.openAria'))}" ${existing?.goalHours===null?'checked':''}></label></div><div class="dc-group">${row(t('schedule.start'),dateTimeField('start',start,t('schedule.startAria'),language))}${row(t('schedule.end'),dateTimeField('end',end,t('schedule.endAria'),language))}${row(t('schedule.repeat'),repeatFields(existing,start,language))}</div><div class="dc-group">${row(e(t('schedule.name'))+' <span class="fasting-required">*</span>',`<input name="label" value="${e(existing?.label??formatMessage(language,'discover.fasting.hours',{count:16}))}" maxlength="200" required aria-label="${e(t('schedule.nameAria'))}">`)}${existing?row(t('schedule.enabled'),`<input name="enabled" type="checkbox" role="switch" class="dc-switch" aria-label="${e(t('schedule.enabled'))}" ${existing.enabled?'checked':''}>`):''}</div>${b(t('schedule.save'),'save-schedule','dc-pill')}<p class="dc-help dc-description">${e(timeZone)} · ${e(t('schedule.goalHelp'))}</p></form>`;
}
export function syncScheduleForm(form,target){
 try{
 const t=key=>message(form.dataset.language??'en',key),fields=form.elements,open=fields.open.checked;
 fields.days.disabled=open;fields.hours.disabled=open;fields.end.disabled=open;
 refreshRepeatLabel(form,form.dataset.language??'en');
 if(target&&!['start','end','days','hours','open'].includes(target.name))return;
 fields.start.setCustomValidity('');fields.end.setCustomValidity('');
 if(open)return;
 try{
  if(target?.name==='end'){
   if(!fields.end.value)return;
   const total=scheduleGoalHours(fields.start.value,fields.end.value,form.dataset.timeZone);
   if(total<1||total>168)throw Error(t('schedule.endRange'));
   fields.days.value=Math.floor(total/24);fields.hours.value=total%24;
  }else if(fields.start.value){
   const hours=Number(fields.days.value)*24+Number(fields.hours.value);
   fields.end.value=Number.isFinite(hours)?scheduleGoalEnd(fields.start.value,hours,form.dataset.timeZone)??'':'';
  }
 }catch(error){(target?.name==='end'?fields.end:fields.start).setCustomValidity(error.code==='clock-gap'?t('schedule.clockGap'):error.message);}
 }finally{refreshDateTimeFields(form,form.dataset.language??'en');}
}
export function readSchedule(form,existing,id){
 const t=key=>message(form.dataset.language??'en',key),v=form.elements,start=v.start.value,goalHours=v.open.checked?null:Number(v.days.value)*24+Number(v.hours.value);
 if(goalHours!==null&&(!Number.isFinite(goalHours)||goalHours<1||goalHours>168))throw Error(t('schedule.durationRange'));
 const repeat=readRepeatFields(form);if(!validFastingRecurrence(repeat))throw Error(formatMessage(form.dataset.language??'en','fastingSchedules.invalidSchedule'));
 return {id:existing?.id??id,revision:existing?.revision??0,label:v.label.value.trim(),timeZone:existing?.timeZone??form.dataset.timeZone,startDate:start.slice(0,10),time:start.slice(11,16),...repeat,goalHours,enabled:v.enabled?.checked??existing?.enabled??true,...(v.note?{note:v.note.value}:{})};
}
