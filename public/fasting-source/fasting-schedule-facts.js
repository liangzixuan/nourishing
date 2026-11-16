import {fastingScheduleLateMinutes} from './fasting-schedule-contract.mjs';
import {formatMessage} from '../report-source/public/message-format.js';
const message=(language,key,values)=>formatMessage(language,'fastingSchedules.'+key,values);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function scheduleWeekdays(language='en'){const formatter=new Intl.DateTimeFormat(language,{weekday:'long',timeZone:'UTC'});return Array.from({length:7},(_,day)=>formatter.format(new Date(Date.UTC(2026,10,1+day))));}
export function scheduleRule(code,language='en'){return message(language,'rule.'+code,{minutes:fastingScheduleLateMinutes});}
export function scheduleOccurrence(value,language='en'){return value?value.start+' · '+message(language,'outcome.'+value.outcome):message(language,'none');}
export function scheduleRepeatLabel(value,language='en'){
 if(value.recurrence==='once')return message(language,'preset.once');
 if(value.recurrence==='weekly'&&value.days.length===7&&(value.interval??1)===1)return message(language,'preset.daily');
 const base=(value.interval??1)===1?message(language,'preset.'+value.recurrence):message(language,'repeatInterval',{count:value.interval,unit:message(language,'unit.'+value.recurrence)});
 return base+(value.recurrence==='weekly'?' · '+scheduleWeekdays(language).filter((_,index)=>value.days.includes(index)).join(', '):'');
}
export function scheduleFacts(value,language='en',preview=false){
 const goal=value.goalHours===null?message(language,'open'):message(language,'hoursValue',{hours:value.goalHours});
 let recurrence=scheduleRepeatLabel(value,language);
 if(value.untilDate!==null)recurrence=message(language,'through',{recurrence,date:value.untilDate});
 const timing=message(language,'timing',{date:value.startDate,time:value.time,zone:value.timeZone}),status=message(language,(value.enabled?'enabled':'disabled')+(preview?'After':''));
 return '<p>'+esc(timing)+'</p><p>'+esc(recurrence)+' · '+esc(goal)+' · '+esc(status)+'</p>';
}
