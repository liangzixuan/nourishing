import {escape as e,button as b,card} from './discover-ui.js';
import {formatMessage} from './message-format.js';
import {sleepSourceLabel,sleepReasonLabel} from './sleep.js';
import {SLEEP_STAGES} from './sleep-contract.mjs';
// Durations and source eligibility come from the validated sleep capture.
// Presentation does not add sessions, merge devices, or infer missing stages.
function presentation(language){
 const t=(key,values)=>formatMessage(language,'discover.sleep.'+key,values),shared=key=>formatMessage(language,'sleep.'+key),number=value=>value.toLocaleString(language,{maximumFractionDigits:2});
 const duration=value=>{if(value===null)return t('unavailable');const minutes=Math.round(value*60);return value>0&&minutes===0?t('lessMinute'):t('durationValue',{hours:number(Math.floor(minutes/60)),minutes:number(minutes%60)});};
 const fact=(label,value,attribute)=>'<div><dt>'+e(label)+'</dt><dd '+attribute+'="'+(value??'')+'" title="'+e(value===null?t('unavailable'):value+' h')+'">'+e(duration(value))+'</dd></div>';
 const sourceFacts=source=>'<section class="dc-sleep-source"><h3>'+e(sleepSourceLabel(source,language))+'</h3><dl class="dc-sleep-facts">'+fact(t('session'),source.sessionHours,'data-dc-session-hours')+(source.measuredAsleepHours===null?'':fact(t('asleep'),source.measuredAsleepHours,'data-dc-asleep-hours'))+'</dl></section>';
 const reasons=items=>items.length?'<details class="dc-sleep-notes"><summary>'+e(t('notes'))+'</summary><ul>'+items.map(code=>'<li>'+e(sleepReasonLabel(code,language))+'</li>').join('')+'</ul></details>':'';
 function session(row){const stages=row.stages;
  return '<article class="dc-sleep-record" data-dc-sleep-record><h3>'+e(row.date)+(row.time?' · '+e(row.time):'')+'</h3><small>'+e(sleepSourceLabel(row,language))+(row.copied?' · '+e(shared('copied')):'')+'</small><dl class="dc-sleep-facts">'+fact(t('recorded'),row.value,'data-dc-record-hours')+(stages&&stages.measuredAsleepHours!==null?fact(t(stages.measuredAsleepComplete?'asleep':'asleepPartial'),stages.measuredAsleepHours,'data-dc-record-asleep'):'')+'</dl>'+(stages?'<details data-dc-sleep-stages><summary>'+e(t('stages'))+(stages.complete?'':' · '+e(t('partial')))+'</summary><dl class="dc-sleep-facts">'+SLEEP_STAGES.map(key=>fact(t('stage.'+key),stages.durations[key],'data-dc-stage-'+key)).join('')+'</dl></details>':'')+reasons(row.reasons)+(row.source||row.copiedFrom?'<details><summary>'+e(t('sourceDetails'))+'</summary><pre>'+e(JSON.stringify({source:row.source,copiedFrom:row.copiedFrom},null,2))+'</pre></details>':'')+'</article>';
 }
 return {t,shared,number,sourceFacts,reasons,session};
}
const durationSources=(view,day)=>day.sources.filter(source=>source.sessionIds.length||view.excluded.some(row=>row.date===day.date&&row.sourceKey===source.sourceKey&&['sleep','Sleep'].includes(row.type)));
export function discoverSleepSummary(view,language='en'){
 const {t,sourceFacts}=presentation(language),latest=view.days.findLast(day=>durationSources(view,day).length);
 return (latest?'<p class="dc-sleep-date">'+e(latest.date)+'</p>'+durationSources(view,latest).map(sourceFacts).join(''):'<p>'+e(t('empty'))+'</p>')+(view.status==='empty'?'':b(e(t('view')),'sleep-data','dc-link'));
}
export function discoverSleepDetails(view,language='en'){
 const {t,shared,number,sourceFacts,reasons,session}=presentation(language);
 if(view.status==='empty')return card('',e(t('empty')));
 const daily=view.days.toReversed().map(day=>card(e(day.date),day.sources.map(source=>(source.sessionIds.length?sourceFacts(source):'')+reasons(source.reasons)).join(''))).join('');
 const scores=view.scores.length?card(e(t('scores')),view.scores.map(row=>'<div class="dc-sleep-record"><h3>'+e(row.date)+' · '+e(sleepSourceLabel(row,language))+'</h3><strong>'+e(number(row.value))+' '+e(row.unit)+'</strong>'+(row.copied?'<small>'+e(shared('copied'))+'</small>':'')+'</div>').join('')):'';
 const excluded=view.excluded.length?'<details class="dc-card"><summary>'+e(t('excluded',{count:view.excluded.length}))+'</summary>'+view.excluded.map(row=>'<article class="dc-sleep-record"><h3>'+e(row.date)+' · '+e(sleepSourceLabel(row,language))+'</h3><p>'+e(row.recordedValue)+' '+e(row.unit)+'</p>'+reasons(row.reasons)+'</article>').join('')+'</details>':'';
 return '<div class="dc-sleep-details"><p class="dc-sleep-range">'+e(view.range.from)+' – '+e(view.range.to)+'</p>'+daily+'<details class="dc-card" data-dc-sleep-records><summary>'+e(t('sessions',{count:view.sessions.length}))+'</summary>'+view.sessions.map(session).join('')+'</details>'+scores+excluded+'</div>';
}
