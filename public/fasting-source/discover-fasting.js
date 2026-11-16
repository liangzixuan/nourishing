import {repeatPreset,recurrenceMessage} from './fasting-recurrence-fields.js';
import {localTime} from './time.js';
import {scheduleRepeatLabel} from './fasting-schedule-facts.js';
import {escape as e,symbol as icon,button as b,row,toggle} from './ui.js';
import {widgetToggle} from './ui.js';
import {formatMessage} from '../report-source/public/message-format.js';
const message=(language,key,values)=>formatMessage(language,'discover.fasting.'+key,values);
const number=(value,language)=>value.toLocaleString(language,{maximumFractionDigits:1});
export const fastingTimeLabel=(value,language='en',timeZone)=>new Date(value).toLocaleString(language,{timeZone,month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
export const upcomingSchedules=rows=>rows.filter(s=>s.enabled&&s.nextStart).sort((a,b)=>Date.parse(a.nextStart)-Date.parse(b.nextStart));
export function scheduledFastMarkup(schedules,language='en',timeZone){
 const t=(key,values)=>message(language,key,values),upcoming=upcomingSchedules(schedules),summary=t(upcoming.length?'upcoming':schedules.length?'noUpcoming':'none');
 const rows=[...upcoming,...schedules.filter(s=>!s.enabled||!s.nextStart)];
 return '<summary><span>'+e(t('scheduled'))+'<small>'+e(summary)+'</small></span>'+icon('expand_more')+'</summary><div>'+rows.map(item=>{
  const duration=item.goalHours===null?t('openEnded'):t('hours',{count:number(item.goalHours,language)}),repeat=scheduleRepeatLabel(item,language);
  const end=item.nextStart&&item.goalHours!==null?new Date(Date.parse(item.nextStart)+item.goalHours*3600000).toISOString():null;
  const timestamp=(value,kind)=>b('<time data-schedule-time="'+kind+'" datetime="'+e(value)+'">'+e(fastingTimeLabel(value,language,timeZone))+'</time>','edit-schedule','dc-scheduled-time','data-id="'+e(item.id)+'" data-schedule-field="'+kind+'" aria-label="'+e(t(kind+'Time')+' '+fastingTimeLabel(value,language,timeZone))+'"');
  return '<section class="dc-scheduled-item"><p><strong>'+e(item.label)+'</strong> '+b(e(t('edit')),'edit-schedule','dc-link','data-id="'+e(item.id)+'"')+'</p><p>'+e(duration)+' - '+e(repeat)+(!item.enabled?' · '+e(t('paused')):'')+'</p><div class="dc-scheduled-times"><div>'+e(t('startTime'))+'<strong>'+(item.nextStart?timestamp(item.nextStart,'start'):e(t('noStart')))+'</strong></div><div>'+e(t('endTime'))+'<strong>'+(item.goalHours===null?e(t('openEnded')):end?timestamp(end,'end'):e(t('noEnd')))+'</strong></div></div></section>';
 }).join('')+(rows.length?'':b(e(t('schedule')),'schedule-fast','dc-link'))+'</div>';
}
export function fastingHelpLink(language='en'){
 return '<a class="dc-button dc-icon dc-fasting-help" href="https://support.cronometer.com/hc/en-us/articles/360036016612-Mobile-Fasting" target="_blank" rel="noopener noreferrer" aria-label="'+e(message(language,'help'))+'">'+icon('help')+'</a>';
}
export function fastingScreenMarkup({preferences:p,widgets,askToStopFast,history,schedules,language='en',timeZone}){
 const t=(key,values)=>message(language,key,values);
 return '<div class="dc-group">'+toggle(t('enable'),'fastingEnabled',p.fastingEnabled)+widgetToggle(t('dashboard'),'fasting',widgets.fasting)+toggle(t('diary'),'fastingDiary',p.fastingDiary)+toggle(t('askStop'),'askToStopFast',askToStopFast)+row('<strong>'+e(t('direction'))+'</strong><small>'+e(t(p.timerDirection==='down'?'countDown':'countUp'))+'</small>','<div class="dc-segment" role="group" aria-label="'+e(t('direction'))+'">'+['up','down'].map(v=>b(e(t(v)),'timer-'+v,p.timerDirection===v?'active':'','aria-pressed="'+(p.timerDirection===v)+'"')).join('')+'</div>')+'</div><details class="dc-group" data-fast-section="stats"><summary><span>'+e(t('stats'))+'</span>'+icon('expand_more')+'</summary><div>'+fastingStatsMarkup(history,language)+'</div></details><details class="dc-group" data-fast-section="scheduled">'+scheduledFastMarkup(schedules,language,timeZone)+'</details><details class="dc-group" data-fast-section="history"><summary><span>'+e(t('history'))+'</span>'+icon('expand_more')+'</summary><div>'+fastingHistoryMarkup(history,language,{timeZone})+'</div></details><p class="dc-status" data-fast-history-status role="status">'+(history?'':e(t('loadingHistory')))+'</p><footer class="dc-fast-footer">'+b(e(t('new')),'schedule-fast','dc-pill')+'</footer>';
}
const duration=(seconds,language)=>{
 if(seconds===null)return '—';const minutes=Math.floor(seconds/60),t=(key,value)=>message(language,key,{count:number(value,language)});
 return minutes>=60?t('hours',Math.floor(minutes/60))+(minutes%60?' '+t('minutes',minutes%60):''):t('minutes',minutes);
};
export function fastingStatsMarkup(history,language='en'){
 const t=(key,values)=>message(language,key,values);if(!history)return e(t('loading'));const s=history.summary;
 const hours=value=>t(value===3600?'statHour':'statHours',{count:(value===null?0:value/3600).toLocaleString(language,{maximumFractionDigits:2})});
 const cells=[['completed',number(s.completedCount,language)],['longest',hours(s.longestSeconds)],['total',hours(s.totalSeconds)],['average',hours(s.lastSevenAverageSeconds)]];
 return '<dl class="dc-fast-stats">'+cells.map(([label,value])=>'<div data-fast-stat="'+label+'"><dt>'+e(t(label))+'</dt><dd>'+e(value)+'</dd></div>').join('')+'</dl>';
}
export function fastingHistoryMarkup(history,language='en',{selected=new Set(),disabled=false,loading=false,timeZone}={}){
 const t=(key,values)=>message(language,key,values),h=(key,values)=>formatMessage(language,'fastingHistory.'+key,values);if(!history)return e(t('loading'));if(!history.total)return e(t('none'));
 const stop=disabled?'disabled':'',all=history.rows.length&&history.rows.every(record=>selected.has(record.id));
 const controls=`<div class="dc-fast-history-selection"><label><input type="checkbox" data-fh-list-all aria-label="${e(h('selectLoaded'))}" ${all?'checked':''} ${stop}><span>${e(h('selectAll'))}</span></label>${selected.size?`<button type="button" class="dc-button dc-fast-selected-delete" data-fh-list-delete-selected ${stop}>${e(h('deleteSelectedCount',{count:selected.size}))}</button>`:''}</div>`;
 const markup=history.rows.map(record=>{
  const name=record.label??(record.end===null?t('active'):duration(record.durationSeconds,language)),repeat=record.repeat?recurrenceMessage(language,'preset.'+repeatPreset(record.repeat,localTime(record.start,timeZone))):recurrenceMessage(language,'preset.once');
  const elapsed=record.end===null?t('active'):duration(record.durationSeconds,language),id=e(record.id);
  const time=(value,field)=>`<div><span>${e(t(field+'Time'))}</span>${b(value?'<time datetime="'+e(value)+'" title="'+e(value)+'">'+e(fastingTimeLabel(value,language,timeZone))+'</time>':e(t('active')),'history-'+field,'dc-fast-history-timestamp',`data-id="${id}" data-history-field="${field}" aria-label="${e(t(field+'Time')+' '+(value?fastingTimeLabel(value,language,timeZone):t('active')))}" ${stop}`)}</div>`;
  return `<article class="dc-fast-history-row" data-fast-history-row="${id}"><div class="dc-fast-history-heading"><label class="dc-fast-history-check"><input type="checkbox" data-fh-list-select="${id}" aria-label="${e(h('select',{start:name}))}" ${selected.has(record.id)?'checked':''} ${stop}></label><strong>${e(name)}</strong>${b(e(t('edit')),'history-edit','dc-fast-history-edit',`data-id="${id}" aria-label="${e(t('edit')+' '+name)}" ${stop}`)}<button type="button" class="dc-button dc-fast-row-delete" data-fh-list-delete="${id}" aria-label="${e(h('delete')+' '+name)}" ${stop}><span aria-hidden="true"></span></button></div><div class="dc-fast-history-detail"><div>${e(elapsed)} - <span class="dc-fast-history-repeat">${e(repeat)}</span></div><div class="dc-fast-history-times">${time(record.start,'start')}${time(record.end,'end')}</div></div></article>`;
 }).join('');
 return controls+markup+(history.rows.length<history.total?`<div class="dc-fast-more"><button type="button" class="dc-button dc-link" data-fh-list-more ${disabled||loading?'disabled':''} ${loading?'aria-busy="true"':''}>${e(h(loading?'loadingMore':'showMore'))}</button></div>`:'');
}
