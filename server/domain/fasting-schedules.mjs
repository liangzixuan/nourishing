import {scheduledWallInstant} from './fasting-time.mjs';
import {fastingRecurrenceDates} from './fasting-recurrence.mjs';
import {validFastingRecurrence} from './fasting-schedule-contract.mjs';
import {fastingScheduleViewVersion,fastingScheduleLateMinutes,fastingScheduleRuleCodes,fastingScheduleOutcomes} from './fasting-schedule-contract.mjs';
import {Temporal} from '@js-temporal/polyfill';
import {sha256Hex} from './content-digest.mjs';
import {date,parseReportTimeZone} from './calendar.mjs';

const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const editable=['id','revision','label','timeZone','startDate','time','recurrence','interval','custom','days','untilDate','goalHours','enabled','note'];
const stored=[...editable,'armedAt','lastOccurrence'];
function fields(value,keys,name){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))fail(`Invalid ${name} fields.`);}
function text(value,name,max){if(typeof value!=='string'||!value.trim()||value!==value.trim()||value.length>max)fail(`Invalid ${name}.`);return value;}
function id(value){text(value,'schedule ID',36);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))fail('Use a UUID schedule ID.');return value;}
function revision(value,min=1){if(!Number.isSafeInteger(value)||value<min)fail('Invalid schedule revision.');return value;}
function instant(value,name='instant'){try{if(typeof value!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(value))throw Error();return Temporal.Instant.from(value);}catch{fail(`Invalid ${name}.`);}}
function clock(now){if(now instanceof Date){if(!Number.isFinite(now.getTime()))fail('Invalid schedule clock.');return Temporal.Instant.from(now.toISOString());}return instant(now,'schedule clock');}
const cmp=Temporal.Instant.compare;
function day(value){date(value);if(value<'0001-01-01')fail('Use a date from year 0001 through 9999.');return value;}
function parseEditable(value,{preview=false}={}){
  const result={id:preview&&value.id===undefined?null:id(value.id),revision:preview&&value.revision===undefined?0:revision(value.revision,0),label:text(value.label,'schedule label',200),timeZone:parseReportTimeZone(value.timeZone),startDate:day(value.startDate),time:value.time,recurrence:value.recurrence,days:value.days,untilDate:value.untilDate,goalHours:value.goalHours,enabled:value.enabled};
  if(value.note!==undefined){if(typeof value.note!=='string'||value.note.length>10000)fail('A fast note must be text of at most 10000 characters.');if(value.note)result.note=value.note;}
  if(typeof result.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(result.time))fail('Use a local HH:mm start time.');
  if(value.custom!==undefined){if(value.custom!==true)fail('Custom recurrence must be true when present.');result.custom=true;}
  result.interval=value.interval===undefined?1:value.interval;
  if(!validFastingRecurrence(result)||result.interval===null)fail('Use a valid recurrence, positive whole interval and matching weekdays.');
  result.days=[...result.days].sort((a,b)=>a-b);
  if(result.untilDate!==null){day(result.untilDate);if(result.untilDate<result.startDate)fail('Schedule end date precedes its start date.');}
  if(result.goalHours!==null&&(typeof result.goalHours!=='number'||!Number.isFinite(result.goalHours)||result.goalHours<1||result.goalHours>168))fail('Goal hours must be null or from 1 through 168.');
  if(typeof result.enabled!=='boolean')fail('Schedule enabled must be boolean.');
  return result;
}
// Compare the round-tripped wall time: Temporal's earlier disambiguation moves
// a gap backwards, while it chooses the first real occurrence of a fold.
function occurrence(schedule,localDate){
  if(localDate<schedule.startDate||localDate>(schedule.untilDate??'9999-12-31'))return null;
  if(fastingRecurrenceDates(schedule,localDate,1).next().value!==localDate)return null;
  return scheduledWallInstant(localDate+'T'+schedule.time,schedule.timeZone);
}
function candidates(schedule,bound,direction,count=1){
  const arm=instant(schedule.armedAt),cursor=schedule.lastOccurrence?instant(schedule.lastOccurrence.start):arm;
  const floor=cmp(cursor,arm)>0?cursor:arm;
  const local=bound.toZonedDateTimeISO(schedule.timeZone).toPlainDate().toString();
  let firstDate=schedule.recurrence==='once'?schedule.startDate:direction>0?(local<schedule.startDate?schedule.startDate:local):(local>(schedule.untilDate??'9999-12-31')?(schedule.untilDate??'9999-12-31'):local);
  const lower=floor.toZonedDateTimeISO(schedule.timeZone).toPlainDate().toString();
  if(direction>0&&schedule.recurrence!=='once'&&firstDate<lower)firstDate=lower;
  const results=[];
  for(const key of fastingRecurrenceDates(schedule, firstDate, direction)){
    if(direction<0&&key<lower)break;
    const value=scheduledWallInstant(key+'T'+schedule.time,schedule.timeZone);
    if(value&&cmp(value,floor)>0&&(direction>0?cmp(value,bound)>0:cmp(value,bound)<=0)){results.push(value.toString());if(results.length===count)break;}
  }
  return results;
}
function parseStored(value){
  fields(value,stored,'stored schedule');const result=parseEditable(value);revision(result.revision);
  result.armedAt=value.armedAt;const armed=instant(result.armedAt,'schedule armed time');
  result.lastOccurrence=null;
  if(value.lastOccurrence!==null){
    const row=value.lastOccurrence;fields(row,['start','outcome','processedAt','fastId'],'schedule occurrence');
    const start=instant(row.start,'occurrence start'),processed=instant(row.processedAt,'occurrence processed time');
    if(cmp(start,armed)<=0||(row.outcome==='started-early'?cmp(processed,armed)<0||cmp(processed,start)>=0:cmp(processed,start)<0))fail('Invalid occurrence chronology.');
    if(!fastingScheduleOutcomes.includes(row.outcome))fail('Invalid occurrence outcome.');
    if(['started','started-early'].includes(row.outcome))text(row.fastId,'occurrence fast ID',100);else if(row.fastId!==null)fail('Only a started occurrence has a fast ID.');
    const actual=occurrence(result,start.toZonedDateTimeISO(result.timeZone).toPlainDate().toString());
    if(!actual||cmp(actual,start)!==0)fail('Occurrence does not match its schedule.');
    result.lastOccurrence={start:row.start,outcome:row.outcome,processedAt:row.processedAt,fastId:row.fastId};
  }
  return result;
}
export function parseFastingPlan(input){
  if(input===undefined)return undefined;
  fields(input,['version','schedules'],'fasting plan');
  if(input.version!==1||!Array.isArray(input.schedules)||input.schedules.length>100000)fail('Invalid fasting plan version or schedule collection.');
  const schedules=input.schedules.map(parseStored);if(new Set(schedules.map(x=>x.id)).size!==schedules.length)fail('Duplicate fasting schedule ID.');
  return {version:1,schedules};
}
export function parseScheduledFast(input,fast){
  if(input===undefined)return undefined;
  fields(input,['scheduleId','revision','label','timeZone','start'],'scheduled fast source');
  const result={scheduleId:id(input.scheduleId),revision:revision(input.revision),label:text(input.label,'source schedule label',200),timeZone:parseReportTimeZone(input.timeZone),start:input.start};
  instant(result.start,'scheduled source start');
  if(fast!==undefined){if(!fast||typeof fast!=='object')fail('Invalid scheduled fast.');instant(fast.start,'fast start');}
  return result;
}
function draft(state,input,now,save=false){
  fields(input,save?[...editable,'confirmed']:editable,'schedule input');
  if(save&&input.confirmed!==true)fail('Confirm the reviewed fasting schedule.');
  const current=clock(now),parsed=parseEditable(input,{preview:!save});
  const plan=parseFastingPlan(state.fastingPlan),existing=plan?.schedules.find(x=>x.id===parsed.id);
  if(existing){
    const same=editable.filter(k=>k!=='revision').every(k=>JSON.stringify(parsed[k])===JSON.stringify(existing[k]));
    if(save&&parsed.revision===existing.revision-1&&same)return {schedule:existing,replayed:true};
    if(parsed.revision!==existing.revision)fail('The schedule changed. Reload before editing.',409);
  }else if(parsed.revision!==0)fail('The schedule no longer exists. Reload before editing.',409);
  const schedule={...parsed,revision:(existing?.revision??0)+1,armedAt:current.toString(),lastOccurrence:null};
  if(schedule.revision>Number.MAX_SAFE_INTEGER)fail('Schedule revision limit reached.');
  return {schedule,replayed:false};
}
export function previewFastingSchedule(state,input,now){
  const {schedule}=draft(state,input,now);return {version:fastingScheduleViewVersion,schedule,nextStarts:candidates(schedule,clock(now),1,5),rules:[...fastingScheduleRuleCodes]};
}
export function saveFastingSchedule(state,input,now){
  const {schedule,replayed}=draft(state,input,now,true);
  if(!replayed){
    if(schedule.enabled&&!candidates(schedule,clock(now),1).length)fail('The enabled schedule has no future start.');
    const plan=parseFastingPlan(state.fastingPlan)??{version:1,schedules:[]},index=plan.schedules.findIndex(x=>x.id===schedule.id);
    if(index<0){if(plan.schedules.length>=100000)fail('The schedule collection is full.');plan.schedules.push(schedule);}else plan.schedules[index]=schedule;
    state.fastingPlan=plan;
  }
  return fastingScheduleView(state,now,schedule.timeZone);
}
export function deleteFastingSchedule(state,input){
  fields(input,['id','revision'],'schedule deletion');id(input.id);revision(input.revision);
  const plan=parseFastingPlan(state.fastingPlan),existing=plan?.schedules.find(x=>x.id===input.id);
  if(!existing)return {changed:false};
  if(existing.revision!==input.revision)fail('The schedule changed. Reload before deleting.',409);
  state.fastingPlan={version:1,schedules:plan.schedules.filter(x=>x.id!==input.id)};return {changed:true};
}
export function disableFastingSchedules(state){
  const plan=parseFastingPlan(state.fastingPlan);if(!plan)return {changed:false};
  const changed=plan.schedules.some(x=>x.enabled);if(changed)state.fastingPlan={version:1,schedules:plan.schedules.map(x=>({...x,enabled:false}))};
  return {changed};
}
export function tickFastingSchedules(state,now){
  const current=clock(now),plan=parseFastingPlan(state.fastingPlan),started=[],outcomes=[];
  if(!plan)return {changed:false,started,outcomes};
  const due=plan.schedules.filter(x=>x.enabled).map(schedule=>({schedule,start:candidates(schedule,current,-1)[0]})).filter(x=>x.start).sort((a,b)=>cmp(instant(a.start),instant(b.start))||(a.schedule.id<b.schedule.id?-1:a.schedule.id>b.schedule.id?1:0));
  const fasts=[...(state.fasts??[])];
  for(const {schedule,start} of due){
    let outcome='started',fastId=null;
    if(current.epochNanoseconds-instant(start).epochNanoseconds>BigInt(fastingScheduleLateMinutes)*60_000_000_000n)outcome='missed';
    else if(fasts.some(x=>!x.end))outcome='conflict';
    else{
      if(fasts.length>=100000)fail('The fast collection is full.');
      fastId='scheduled-'+sha256Hex(JSON.stringify([schedule.id,schedule.revision,start]));
      if(fasts.some(x=>x.id===fastId))fail('The scheduled fast already exists without its consumption cursor.');
      const fast={id:fastId,start,end:null,goalHours:schedule.goalHours,...(schedule.note?{note:schedule.note}:{}),scheduled:{scheduleId:schedule.id,revision:schedule.revision,label:schedule.label,timeZone:schedule.timeZone,start}};
      fasts.push(fast);started.push(structuredClone(fast));
    }
    schedule.lastOccurrence={start,outcome,processedAt:current.toString(),fastId};outcomes.push({scheduleId:schedule.id,...schedule.lastOccurrence});
  }
  if(outcomes.length){state.fastingPlan=plan;state.fasts=fasts;}
  return {changed:outcomes.length>0,started,outcomes};
}
export function fastingScheduleView(state,now,defaultZone){
  const current=clock(now),timeZone=parseReportTimeZone(defaultZone),plan=parseFastingPlan(state.fastingPlan);
  return {version:fastingScheduleViewVersion,now:current.toString(),timeZone,schedules:(plan?.schedules??[]).map(schedule=>({...schedule,nextStart:schedule.enabled?(candidates(schedule,current,1)[0]??null):null})),activeFast:structuredClone((state.fasts??[]).find(x=>!x.end)??null),rules:[...fastingScheduleRuleCodes]};
}

/** A consumed schedule occurrence and its active fast jointly establish a real start. */
export function activeScheduledFastStart(state){
  const fast=(state.fasts??[]).find(row=>!row.end);
  if(!fast?.scheduled)return null;
  const source=parseScheduledFast(fast.scheduled,fast),plan=parseFastingPlan(state.fastingPlan),schedule=plan?.schedules.find(row=>row.id===source.scheduleId),occurrence=schedule?.lastOccurrence;
  if(!schedule?.enabled||schedule.revision!==source.revision||!['started','started-early'].includes(occurrence?.outcome)||occurrence.fastId!==fast.id)return null;
  if(cmp(instant(occurrence.start),instant(source.start))!==0||cmp(instant(fast.start),instant(occurrence.outcome==='started-early'?occurrence.processedAt:source.start))!==0)return null;
  return {fastId:fast.id,start:fast.start,processedAt:occurrence.processedAt};
}

/** Consume the next occurrence atomically when the user starts it early. */
export function startScheduledFastNow(state,input,now){
 fields(input,['id','revision','start'],'start scheduled fast');id(input.id);revision(input.revision);instant(input.start);
 const at=clock(now),plan=parseFastingPlan(state.fastingPlan),schedule=plan?.schedules.find(row=>row.id===input.id);
 if(!schedule||schedule.revision!==input.revision||!schedule.enabled)fail('The schedule changed. Reopen it before starting.',409);
 if(schedule.lastOccurrence?.outcome==='started-early'&&schedule.lastOccurrence.start===input.start&&state.fasts?.some(f=>f.id===schedule.lastOccurrence.fastId))return {replayed:true};
 const next=candidates(schedule,at,1)[0];if(next!==input.start)fail('The next start changed. Reopen it before starting.',409);
 if(state.fasts?.some(f=>!f.end))fail('End the active fast before starting another.',409);
 if((state.fasts?.length??0)>=100000)fail('The fast collection is full.');
 const fastId='scheduled-'+sha256Hex(JSON.stringify([schedule.id,schedule.revision,input.start]));
 const start=at.toString();const fast={id:fastId,start,end:null,goalHours:schedule.goalHours,...(schedule.note?{note:schedule.note}:{}),scheduled:{scheduleId:schedule.id,revision:schedule.revision,label:schedule.label,timeZone:schedule.timeZone,start:input.start}};
 schedule.lastOccurrence={start:input.start,outcome:'started-early',processedAt:start,fastId};
 state.fastingPlan=plan;state.fasts=[...(state.fasts??[]),fast];return {replayed:false,fast};
}
