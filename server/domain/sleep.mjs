import {sleepRuleCodes} from './sleep-contract.mjs';
import {date as calendarDate} from './calendar.mjs';
import {parseNutritionReportOptions} from './nutrition-report.mjs';
import {healthSource,healthMeasurementSource,healthInstant,SLEEP_STAGES} from './health-records.mjs';

const hours=nanoseconds=>Number(nanoseconds)/3600000000000;
const nonnegative=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
const sumKnown=values=>{const sum=values.length&&values.every(nonnegative)?values.reduce((sum,value)=>sum+value,0):null;return nonnegative(sum)?sum:null;};
const asleepStages=['sleeping','light','deep','rem'];
const copy=value=>value===undefined?null:structuredClone(value);
const sourceObject=value=>value===undefined||value===null?null:typeof value==='object'&&!Array.isArray(value)?copy(value):{invalidValue:copy(value)};
const text=value=>typeof value==='string'?value:'';

function stageFacts(source){
  if(source?.sleepStages===undefined)return null;
  const spans=source.sleepStages,durations=Object.fromEntries(SLEEP_STAGES.map(stage=>[stage,null])),sums=new Map();let covered=0n;
  for(const span of spans){const duration=healthInstant(span.end)-healthInstant(span.start);covered+=duration;sums.set(span.stage,(sums.get(span.stage)??0n)+duration);}
  const total=healthInstant(source.end)-healthInstant(source.start),complete=covered===total;
  for(const stage of SLEEP_STAGES)durations[stage]=sums.has(stage)?hours(sums.get(stage)):complete?0:null;
  const measuredAsleepComplete=complete&&!sums.has('unknown'),knownAsleep=asleepStages.some(stage=>sums.has(stage));
  const measuredAsleepHours=knownAsleep?hours(asleepStages.reduce((sum,stage)=>sum+(sums.get(stage)??0n),0n)):measuredAsleepComplete?0:null;
  return {present:true,spans:copy(spans),durations,measuredAsleepHours,coveredHours:hours(covered),uncoveredHours:hours(total-covered),complete,measuredAsleepComplete};
}
function overlaps(rows){
  const timed=rows.filter(row=>row.interval).sort((a,b)=>{const x=healthInstant(a.interval.start),y=healthInstant(b.interval.start);return x<y?-1:x>y?1:a.sourceOrder-b.sourceOrder;});
  const affected=new Set();let furthest=null;
  for(const row of timed){if(furthest&&healthInstant(row.interval.start)<healthInstant(furthest.interval.end)){affected.add(row);affected.add(furthest);}if(!furthest||healthInstant(row.interval.end)>healthInstant(furthest.interval.end))furthest=row;}
  return affected;
}
function sourceDay(sourceKey,sourceApp,sourceKind,sessions,scores,excluded){
  const active=sessions.filter(row=>!row.copied),reasons=[];
  if(excluded.some(row=>!row.copied&&['sleep','Sleep'].includes(row.type)))reasons.push('excluded-session');
  if(active.some(row=>!row.eligible))reasons.push('invalid-session');
  if(active.length>1&&active.some(row=>!row.interval))reasons.push('uncheckable-overlap');
  const valid=active.length>0&&!reasons.length;
  return {sourceKey,sourceApp,sourceKind,sessionIds:sessions.map(row=>row.id),scoreIds:scores.map(row=>row.id),sessionHours:valid?sumKnown(active.map(row=>row.value)):null,measuredAsleepHours:valid&&active.every(row=>row.stages?.measuredAsleepComplete)?sumKnown(active.map(row=>row.stages.measuredAsleepHours)):null,reasons};
}

/** Sleep sessions retain diary dates and source apps; no clinical interpretation
 * or device-priority rule is inferred from duration or stage labels. */
export function createSleepView(state,input){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='from,to')fail('Choose sleep from and to dates only.');
  const {from,to}=parseNutritionReportOptions({...input,dayFilter:'all',includeToday:true,includeSupplements:true}),range={from,to};
  const sessions=[],scores=[],excluded=[],ids=new Set(),outsideSessions=new Map();
  for(const [sourceOrder,raw] of (state.biometrics??[]).entries()){
    const duration=['sleep','Sleep'].includes(raw.type),score=['sleep score','Sleep score'].includes(raw.type);if(!duration&&!score)continue;
    let day;try{day=calendarDate(raw.date);}catch{continue;}const inRange=day>=from&&day<=to;
    const reasons=[],copied=raw.copiedFrom!==undefined;let source=null;
    try{source=raw.source!==undefined?healthMeasurementSource(raw.source,raw):raw.copiedFrom?.source!==undefined?healthSource(raw.copiedFrom.source):null;}catch{reasons.push('invalid-source');source=copy(raw.source??raw.copiedFrom?.source);}
    const app=typeof source?.app==='string'?source.app:null,invalidCopy=copied&&(!raw.copiedFrom||typeof raw.copiedFrom!=='object'||Array.isArray(raw.copiedFrom)),sourceKind=app!==null?'app':raw.source!==undefined||raw.copiedFrom?.source!==undefined||invalidCopy?'unknown':'manual',sourceKey=JSON.stringify(sourceKind==='app'?['health-connect',app]:[sourceKind]),sourceApp=app;
    const row={id:text(raw.id),date:day,time:text(raw.time),type:raw.type,unit:text(raw.unit),value:nonnegative(raw.value)?raw.value:null,sourceOrder,source:sourceObject(source),copiedFrom:sourceObject(raw.copiedFrom),copied,sourceKey,sourceApp,sourceKind};
    if(invalidCopy)reasons.push('invalid-copy');
    if(!row.id||ids.has(row.id))reasons.push('invalid-identity');ids.add(row.id);
    if(row.time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.time))reasons.push('invalid-time');
    if(duration?raw.unit!=='h':!['score','%'].includes(raw.unit))reasons.push('unsupported-unit');
    if(!nonnegative(raw.value)||score&&raw.value>100)reasons.push(score?'invalid-score':'invalid-duration');
    if(reasons.length){if(inRange)excluded.push({...row,recordedValue:raw.value===undefined||raw.value===null?null:String(raw.value),reasons});continue;}
    if(copied)reasons.push('copied');
    if(score){if(inRange)scores.push({...row,reasons,eligible:!copied});continue;}
    const interval=source?.start&&source?.end?{start:source.start,end:source.end,hours:hours(healthInstant(source.end)-healthInstant(source.start))}:null,stages=stageFacts(source);
    let eligible=!copied;
    // Duration is stored as a Number of hours. A nanosecond plus floating-point
    // representation error is the comparison tolerance, not an inferred edit.
    if(interval&&Math.abs(row.value-interval.hours)>1/3600000000000+Number.EPSILON*Math.max(1,row.value,interval.hours)*4){reasons.push('duration-mismatch');eligible=false;}
    if(!stages)reasons.push('no-stages');
    else{if(!stages.complete)reasons.push('partial-stages');if(!stages.measuredAsleepComplete)reasons.push('incomplete-asleep');}
    const session={...row,interval,stages,reasons,eligible};
    if(inRange)sessions.push(session);else if(!copied&&interval){if(!outsideSessions.has(sourceKey))outsideSessions.set(sourceKey,[]);outsideSessions.get(sourceKey).push(session);}
  }
  // Check overlaps across stored dates as well as within each date. A session
  // spanning midnight must not be counted again on the following diary date.
  const sourceGroups=new Map(),dayGroups=new Map();
  for(const [kind,rows] of [['sessions',sessions],['scores',scores],['excluded',excluded]])for(const row of rows){
    if(!sourceGroups.has(row.sourceKey))sourceGroups.set(row.sourceKey,{sourceApp:row.sourceApp,sourceKind:row.sourceKind,sessions:[],scores:[],excluded:[],days:[]});sourceGroups.get(row.sourceKey)[kind].push(row);
    if(!dayGroups.has(row.date))dayGroups.set(row.date,new Map());const groups=dayGroups.get(row.date);
    if(!groups.has(row.sourceKey))groups.set(row.sourceKey,{sourceApp:row.sourceApp,sourceKind:row.sourceKind,sessions:[],scores:[],excluded:[]});groups.get(row.sourceKey)[kind].push(row);
  }
  for(const [key,group] of sourceGroups)for(const row of overlaps([...group.sessions.filter(row=>!row.copied),...(outsideSessions.get(key)??[])])){row.reasons.push('overlap');row.eligible=false;}
  const days=[];
  for(const day of [...dayGroups.keys()].sort()){
    const sources=[],contributing=[];
    for(const [key,group] of dayGroups.get(day)){
      const projection=sourceDay(key,group.sourceApp,group.sourceKind,group.sessions,group.scores,group.excluded),hasSession=[...group.sessions,...group.excluded.filter(row=>['sleep','Sleep'].includes(row.type))].some(row=>!row.copied);
      sources.push(projection);if(hasSession)contributing.push(projection);sourceGroups.get(key).days.push({date:day,hasSession,...projection});
    }
    const reasons=contributing.length>1?['separate-sources']:[];
    if(contributing.length===1)reasons.push(...contributing[0].reasons);
    days.push({date:day,sources,sessionHours:contributing.length===1?contributing[0].sessionHours:null,measuredAsleepHours:contributing.length===1?contributing[0].measuredAsleepHours:null,reasons});
  }
  const sources=[],series=[];
  for(const [key,group] of sourceGroups){
    const sourceApp=group.sourceApp,observations=group.days,sessionDays=observations.filter(day=>day.hasSession),sourceScores=group.scores.filter(row=>row.eligible);
    sources.push({sourceKey:key,sourceApp,sourceKind:group.sourceKind,sessionHours:sumKnown(sessionDays.map(day=>day.sessionHours)),measuredAsleepHours:sumKnown(sessionDays.map(day=>day.measuredAsleepHours)),sessionDays:sessionDays.length,knownSessionDays:sessionDays.filter(day=>day.sessionHours!==null).length,knownAsleepDays:sessionDays.filter(day=>day.measuredAsleepHours!==null).length,scores:['score','%'].map(unit=>{const values=sourceScores.filter(row=>row.unit===unit).map(row=>row.value);return {unit,count:values.length,mean:values.length?values.reduce((a,b)=>a+b,0)/values.length:null};})});
    series.push({sourceKey:key,sourceApp,sourceKind:group.sourceKind,session:observations.map(day=>({date:day.date,value:day.sessionHours})),asleep:observations.map(day=>({date:day.date,value:day.measuredAsleepHours})),scores:sourceScores.map(({id,date,time,value,unit})=>({id,date,time,value,unit}))});
  }
  return {version:2,range,status:sessions.length||scores.length||excluded.length?'ready':'empty',sessions,scores,days,excluded,sources,series,rules:[...sleepRuleCodes]};
}
