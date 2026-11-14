import {streakCategories,streakRuleCodes} from './logging-streak-contract.mjs';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {date,captureCalendar} from './calendar.mjs';

const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const categories=streakCategories;
const actions=new Set(['entry.add','exercise.add','exercise.catalog.add','water.add','biometric.add','records.copy','repeat.apply','photo.save','text.save','fast.start','fast.record','fast.end']);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const maximum=100000,dayMilliseconds=86400000;
const object=(value,keys,label)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))fail(`${label} must be an object with supported fields only.`);};
function identifier(value,label){if(typeof value!=='string'||!uuid.test(value))fail(`${label} must be a lowercase UUID v4.`);return value;}
function recordId(value){if(typeof value!=='string'||!value.trim()||value.length>1000)fail('Logging record ID must be nonempty text up to 1000 characters.');return value;}
function instant(value,label){const parsed=new Date(value);if(typeof value!=='string'||!Number.isFinite(parsed.valueOf())||parsed.toISOString()!==value)fail(`${label} must be a canonical ISO UTC instant.`);return value;}
function calendarFacts(value,label){
  const at=instant(value.at,`${label} time`),day=date(value.day),calendar=captureCalendar(new Date(at),value.timeZone);
  if(calendar.today!==day)fail(`${label} day does not match its captured time and time zone.`);
  return {day,at,timeZone:calendar.timeZone};
}
function parseEvent(value){
  object(value,['id','recordId','category','day','at','timeZone','source'],'Logging event');
  if(!categories.includes(value.category))fail('Choose a food, exercise, metric or fast logging category.');
  if(!['online','offline-sync'].includes(value.source))fail('Logging source must be online or offline-sync.');
  return {id:identifier(value.id,'Logging event ID'),recordId:recordId(value.recordId),category:value.category,...calendarFacts(value,'Logging event'),source:value.source};
}
function parseBaseline(value){
  object(value,['id','at','day','timeZone','count'],'Streak baseline');
  if(!Number.isSafeInteger(value.count)||value.count<0||value.count>maximum)fail('Streak count must be a whole number from 0 to 100000.');
  return {id:identifier(value.id,'Streak baseline ID'),...calendarFacts(value,'Streak baseline'),count:value.count};
}
const tuple=event=>JSON.stringify([event.day,event.category,event.recordId]);
export function parseLoggingStreaks(value){
  if(value===undefined)return undefined;
  object(value,['version','startedAt','events','baseline'],'Logging streaks');
  if(value.version!==1)fail('Logging streaks must use version 1.');
  const startedAt=instant(value.startedAt,'Observation start');
  if(!Array.isArray(value.events)||value.events.length>maximum)fail('Logging streaks must contain at most 100000 events.');
  const ids=new Set(),tuples=new Set(),events=value.events.map(input=>{
    const event=parseEvent(input),key=tuple(event);
    if(Date.parse(event.at)<Date.parse(startedAt))fail('Logging event precedes the observation start.');
    if(ids.has(event.id)||tuples.has(key))fail('Logging streaks contain duplicate event identities or record-day contributions.');
    ids.add(event.id);tuples.add(key);return event;
  });
  const result={version:1,startedAt,events};
  if(Object.hasOwn(value,'baseline')){
    result.baseline=parseBaseline(value.baseline);
    if(Date.parse(result.baseline.at)<Date.parse(startedAt))fail('Streak baseline precedes the observation start.');
  }
  return result;
}
export function mergeLoggingStreaks(current,incoming){
  const existing=parseLoggingStreaks(current),addition=parseLoggingStreaks(incoming);
  if(addition===undefined)return existing;
  if(existing===undefined)return addition;
  const result={version:1,startedAt:Date.parse(existing.startedAt)<Date.parse(addition.startedAt)?existing.startedAt:addition.startedAt,events:[...existing.events]};
  const byId=new Map(result.events.map(event=>[event.id,event])),byTuple=new Map(result.events.map(event=>[tuple(event),event]));
  for(const event of addition.events){
    const match=byId.get(event.id)??byTuple.get(tuple(event));
    if(match){if(!isDeepStrictEqual(match,event))fail('Imported logging history conflicts with a saved event. Choose a full SQLite restore to replace the workspace.',409);}
    else{result.events.push(event);byId.set(event.id,event);byTuple.set(tuple(event),event);}
  }
  if(result.events.length>maximum)fail('Merged logging history exceeds 100000 events.');
  if(existing.baseline&&addition.baseline&&!isDeepStrictEqual(existing.baseline,addition.baseline))fail('Imported streak baselines conflict. Choose a full SQLite restore to replace the workspace.',409);
  if(existing.baseline||addition.baseline)result.baseline=existing.baseline??addition.baseline;
  return result;
}
function collection(state,key){const rows=state[key]??[];if(!Array.isArray(rows)||rows.length>maximum)fail(`The ${key} collection exceeds the supported logging observation limit.`);return rows;}
export const isStreakAction=action=>actions.has(action);
export function captureLoggingRecords(state){
  return {entries:new Set(collection(state,'entries').map(row=>row.id)),biometrics:new Set(collection(state,'biometrics').map(row=>row.id)),fasts:new Map(collection(state,'fasts').map(row=>[row.id,row.end??null]))};
}
function fastDay(value,timeZone){const parsed=new Date(value);if(typeof value!=='string'||!Number.isFinite(parsed.valueOf()))fail('A logged fast needs a valid instant.');return captureCalendar(parsed,timeZone).today;}
export function recordLoggingActivity(state,before,{action,source='online',now,timeZone}){
  if(!isStreakAction(action))return;
  if(!['online','offline-sync'].includes(source))fail('Logging source must be online or offline-sync.');
  const calendar=captureCalendar(now,timeZone),candidates=[];
  for(const row of collection(state,'entries'))if(!before.entries.has(row.id)&&row.date===calendar.today&&!row.source)candidates.push({recordId:row.id,category:row.kind==='exercise'?'exercise':'food'});
  for(const row of collection(state,'biometrics'))if(!before.biometrics.has(row.id)&&row.date===calendar.today&&!row.source)candidates.push({recordId:row.id,category:'metric'});
  for(const row of collection(state,'fasts')){
    const fresh=!before.fasts.has(row.id),ended=action==='fast.end'&&!fresh&&before.fasts.get(row.id)===null&&row.end;
    if(fresh&&(fastDay(row.start,timeZone)===calendar.today||(row.end&&fastDay(row.end,timeZone)===calendar.today))||ended&&fastDay(row.end,timeZone)===calendar.today)candidates.push({recordId:row.id,category:'fast'});
  }
  if(!candidates.length)return;
  const ledger=parseLoggingStreaks(state.loggingStreaks)??{version:1,startedAt:calendar.asOf,events:[]},seen=new Set(ledger.events.map(tuple));
  if(Date.parse(calendar.asOf)<Date.parse(ledger.startedAt))fail('The logging clock precedes the observation start. Check the server clock before retrying.');
  for(const candidate of candidates){
    const key=tuple({...candidate,day:calendar.today});if(seen.has(key))continue;
    ledger.events.push({id:randomUUID(),recordId:recordId(candidate.recordId),category:candidate.category,day:calendar.today,at:calendar.asOf,timeZone:calendar.timeZone,source});seen.add(key);
  }
  if(ledger.events.length>maximum)fail('Logging history reached its 100000-event limit. Export a full backup before continuing.');
  state.loggingStreaks=ledger;
}
export function resetLoggingStreaks(state,input,{now,timeZone}){
  object(input,['count'],'Streak reset');
  if(!Number.isSafeInteger(input.count)||input.count<0||input.count>maximum)fail('Streak count must be a whole number from 0 to 100000.');
  const calendar=captureCalendar(now,timeZone),ledger=parseLoggingStreaks(state.loggingStreaks)??{version:1,startedAt:calendar.asOf,events:[]};
  if(Date.parse(calendar.asOf)<Date.parse(ledger.startedAt))fail('The reset clock precedes the observation start. Check the server clock before retrying.');
  ledger.baseline={id:randomUUID(),at:calendar.asOf,day:calendar.today,timeZone:calendar.timeZone,count:input.count};state.loggingStreaks=ledger;
}
const counts=()=>Object.fromEntries(categories.map(category=>[category,0]));
const dayNumber=day=>Date.parse(day+'T00:00:00Z')/dayMilliseconds;
function runs(days,{seedDay,seedCount=0}={}){
  const lengths=new Map();let previous=null,length=0,longest=0;
  if(seedCount>0){previous=seedDay;length=seedCount;longest=seedCount;lengths.set(seedDay,seedCount);}
  for(const day of [...days].sort((a,b)=>a-b)){
    if(seedDay!==undefined&&day<seedDay)continue;
    if(day===previous)continue;
    length=previous!==null&&day===previous+1?length+1:1;previous=day;lengths.set(day,length);longest=Math.max(longest,length);
  }
  return {lengths,longest};
}
export function createLoggingStreakView(state,{now,timeZone}){
  const calendar=captureCalendar(now,timeZone),today=dayNumber(calendar.today),ledger=parseLoggingStreaks(state.loggingStreaks),events=(ledger?.events??[]).filter(event=>Date.parse(event.at)<=now.valueOf()&&event.day<=calendar.today);
  const observedCounts=counts(),todayCounts=counts(),savedCounts=counts();
  for(const event of events){observedCounts[event.category]++;if(event.day===calendar.today)todayCounts[event.category]++;}
  for(const entry of collection(state,'entries'))savedCounts[entry.kind==='exercise'?'exercise':'food']++;
  savedCounts.metric=collection(state,'biometrics').length;savedCounts.fast=collection(state,'fasts').length;
  const observed=runs(new Set(events.map(event=>dayNumber(event.day)))),baseline=ledger?.baseline;
  const usableBaseline=baseline&&Date.parse(baseline.at)<=now.valueOf()&&baseline.day<=calendar.today;
  const adjusted=usableBaseline?runs(new Set(events.filter(event=>Date.parse(event.at)>Date.parse(baseline.at)).map(event=>dayNumber(event.day))),{seedDay:dayNumber(baseline.day),seedCount:baseline.count}):observed;
  return {version:2,calendar,observationStartedAt:ledger?.startedAt??null,current:adjusted.lengths.get(today)??0,longest:Math.max(observed.longest,adjusted.longest),observedCurrent:observed.lengths.get(today)??0,observedLongest:observed.longest,previousDayRun:adjusted.lengths.get(today-1)??0,todayLogged:Object.values(todayCounts).some(count=>count>0),baseline:baseline?{count:baseline.count,day:baseline.day,at:baseline.at,timeZone:baseline.timeZone}:null,todayCounts,observedCounts,savedCounts,rules:[...streakRuleCodes]};
}
