import {formatMessage} from '../report-source/public/message-format.js';
import {escape as e,symbol} from './ui.js';
import {scheduleWeekday} from './fasting-time.mjs';
export const recurrenceMessage=(language,key,values)=>formatMessage(language,'fastingSchedules.'+key,values);
export const repeatPresets=['once','daily','weekly','biweekly','threeWeeks','fourWeeks','monthly','yearly','custom'];
export function repeatPreset(value,start){
 if(value.custom)return 'custom';
 const interval=value.interval??1;
 if(value.recurrence==='weekly'){
  if(interval===1&&value.days.length===7)return 'daily';
  if(value.days.length!==1||value.days[0]!==scheduleWeekday(start))return 'custom';
  return ({1:'weekly',2:'biweekly',3:'threeWeeks',4:'fourWeeks'})[interval]??'custom';
 }
 return interval===1?value.recurrence:'custom';
}
export function presetRule(id,start){
 if(['weekly','biweekly','threeWeeks','fourWeeks'].includes(id))return {recurrence:'weekly',interval:({weekly:1,biweekly:2,threeWeeks:3,fourWeeks:4})[id],days:[scheduleWeekday(start)]};
 return {recurrence:id,interval:1,days:[]};
}
export function readRepeatFields(form){const f=form.elements;return {recurrence:f.repeat.value,interval:Number(f.interval.value),days:f.repeat.value==='weekly'?[...f.weekday].filter(x=>x.checked).map(x=>Number(x.value)):[],untilDate:f.repeat.value==='once'?null:f.untilDate.value||null,...(form.dataset.customRepeat==='true'?{custom:true}:{})};}
export function refreshRepeatLabel(form,language){const rule=readRepeatFields(form),button=form.querySelector('[data-repeat-picker]');button.querySelector('span').textContent=recurrenceMessage(language,'preset.'+repeatPreset(rule,form.elements.start.value));}
export function writeRepeatFields(form,value,language){const f=form.elements;form.dataset.customRepeat=String(Boolean(value.custom));f.repeat.value=value.recurrence;f.interval.value=value.interval??1;f.untilDate.value=value.untilDate??'';for(const field of f.weekday)field.checked=value.days.includes(Number(field.value));refreshRepeatLabel(form,language);}
export function repeatFields(existing,start,language){
 const rule=existing??{recurrence:'once',interval:1,days:[],untilDate:null};
 return `<input type="hidden" name="repeat" value="${e(rule.recurrence)}"><input type="hidden" name="interval" value="${rule.interval??1}"><input type="hidden" name="untilDate" value="${e(rule.untilDate??'')}"><span hidden>${Array.from({length:7},(_,day)=>`<input type="checkbox" name="weekday" value="${day}" ${rule.days.includes(day)?'checked':''}>`).join('')}</span><button type="button" class="dc-repeat-value" data-repeat-picker aria-label="${e(formatMessage(language,'discover.schedule.repeat'))}" aria-haspopup="menu"><span>${e(recurrenceMessage(language,'preset.'+repeatPreset(rule,start)))}</span>${symbol('arrow_drop_down')}</button>`;
}
