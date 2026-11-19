// Schedule validation and due-event semantics adapted from nourishing-local/server/reminders.mjs.
import {createHash,randomUUID} from 'node:crypto';
import {Temporal} from '@js-temporal/polyfill';
import {activeScheduledFastStart,fastingScheduleView} from './domain/fasting-schedules.mjs';
import {parseWeightReminderMetric,weightReminderMetricOptions,weightReminderBasis} from './reminder-schedules-weight.mjs';
export {weightReminderMetricOptions};
export const reminderLateMinutes=15,MAX_REMINDER_SCHEDULES=24;
const LATE_MS=reminderLateMinutes*60000;
const fail=(message,status=400)=>Object.assign(Error(message),{status,code:status,publicMessage:message});
const object=(value,label)=>{if(!value||typeof value!=='object'||Array.isArray(value))throw fail(`${label} must be an object.`);return value;};
const text=(value,label,max=100)=>{if(typeof value!=='string'||value.length>max||!value.trim())throw fail(`Choose a valid ${label}.`);return value.trim();};
const hash=value=>createHash('sha256').update(value).digest('hex');
const iso=value=>{if(typeof value!=='string'||value.length>100||!Number.isFinite(Date.parse(value)))throw fail('Reminder history contains an invalid timestamp.');return value;};
function reminderCreationId(value){if(typeof value!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value))throw fail('Use a UUID for reminder creation.');return value;}
export function parseReminderSchedule(input,{previous=null,now=new Date(),stored=false}={}){
  object(input,'Reminder');const kind=input.kind;
  if(!['daily','fasting','weight','fasting-start'].includes(kind))throw fail('Choose a daily, weight, fasting-goal or scheduled-start reminder.');
  const id=stored?text(input.id,'reminder ID'):previous?.id||(Object.hasOwn(input,'creationId')?reminderCreationId(input.creationId):randomUUID());
  if(input.enabled!==undefined&&typeof input.enabled!=='boolean')throw fail('Reminder enabled state must be true or false.');
  const timeZone=text(input.timeZone,'time zone',100);try{new Intl.DateTimeFormat('en',{timeZone}).format();}catch{throw fail('Choose a valid reminder time zone.');}
  let time=null,days=[];
  if(kind==='daily'||kind==='weight'){
    time=input.time;if(typeof time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw fail('Choose a daily reminder time.');
    if(kind==='daily'&&(!Array.isArray(input.days)||!input.days.length||input.days.length>7||input.days.some(value=>!Number.isInteger(value)||value<0||value>6)||new Set(input.days).size!==input.days.length))throw fail('Choose one or more weekdays.');
    days=kind==='weight'?[0,1,2,3,4,5,6]:[...input.days].sort((a,b)=>a-b);
  }
  let foodCondition=null;
  if(input.foodCondition!==undefined&&input.foodCondition!==null){
    const condition=object(input.foodCondition,'Food reminder condition');
    if(kind!=='daily'||Object.keys(condition).length!==1||!Object.hasOwn(condition,'group'))throw fail('A food condition belongs to a daily reminder and requires a diary group or null for the whole day.');
    const group=condition.group;if(group!==null&&(typeof group!=='string'||!group.trim()||group.length>100))throw fail('Choose a valid diary group.');
    foodCondition={group};
  }
  const weightMetric=kind==='weight'?parseWeightReminderMetric(input.weightMetric):null;
  if(kind!=='weight'&&input.weightMetric!==undefined&&input.weightMetric!==null)throw fail('A weight metric belongs to a weight reminder.');
  return {id,foodCondition,weightMetric,label:text(input.label,'reminder name',80),kind,time,days,timeZone,enabled:input.enabled??true,createdAt:stored?iso(input.createdAt):previous?.createdAt||new Date(now).toISOString()};
}

function clockParts(date,timeZone){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',weekday:'short'}).formatToParts(date).map(part=>[part.type,part.value]));
  return {day:`${parts.year}-${parts.month}-${parts.day}`,minutes:Number(parts.hour)*60+Number(parts.minute),second:Number(parts.second),weekday:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday)};
}
export function dueReminderEvent(schedule,workspace,now){
  if(!schedule.enabled)return null;const time=new Date(now),milliseconds=time.valueOf();
  if(schedule.kind==='fasting-start'){
    const start=activeScheduledFastStart(workspace);if(!start)return null;
    const due=Date.parse(start.start);if(due>milliseconds||milliseconds-due>LATE_MS||Date.parse(start.processedAt)>milliseconds)return null;
    return {key:'fast-start:'+start.fastId,due};
  }
  if(schedule.kind==='fasting'){
    const fast=workspace.fasts?.find(item=>!item.end);if(!fast||fast.goalHours===null)return null;
    if(typeof fast.id!=='string'||fast.id.length>100||!Number.isFinite(Date.parse(fast.start))||!Number.isFinite(fast.goalHours)||fast.goalHours<1||fast.goalHours>168)return null;
    const due=Date.parse(fast.start)+fast.goalHours*3600000;if(due>milliseconds||milliseconds-due>LATE_MS)return null;
    return {key:'fast:'+fast.id,due};
  }
  const local=clockParts(time,schedule.timeZone);
  const [hour,minute]=schedule.time.split(':').map(Number),difference=(local.minutes-hour*60-minute+1440)%1440;
  const elapsed=difference*60000+local.second*1000+time.getUTCMilliseconds();
  if(elapsed>LATE_MS)return null;
  const due=milliseconds-elapsed,candidate=clockParts(new Date(due),schedule.timeZone);
  if(candidate.minutes!==hour*60+minute||!schedule.days.includes(candidate.weekday))return null; // nonexistent DST wall time
  if(schedule.kind==='weight'){
    const basis=weightReminderBasis(workspace,schedule.weightMetric,local.day);
    if(basis.status!=='known'||basis.dueDate!==candidate.day)return null;
    return {key:'weight:'+hash(JSON.stringify(schedule.weightMetric))+':'+basis.lastDate,due};
  }
  if(schedule.foodCondition){
    const group=schedule.foodCondition.group;
    // The current saved diary is authoritative; missing history cannot establish an empty day.
    if(!Array.isArray(workspace.entries)||group!==null&&!workspace.settings?.groups?.includes(group))return null;
    if(workspace.entries.some(row=>row.kind==='food'&&row.date===candidate.day&&(group===null||row.group===group)))return null;
  }
  return {key:'daily:'+candidate.day,due};
}

export function reminderPreferences(value={}){
 const schedules=value.schedules??[],paused=value.paused??true,resumedAt=value.resumedAt??null;
 if(!Array.isArray(schedules)||schedules.length>MAX_REMINDER_SCHEDULES||typeof paused!=='boolean'||resumedAt!==null&&!Number.isFinite(Date.parse(resumedAt))||!paused&&resumedAt===null)throw fail('Reminder preferences are invalid.');
 const ids=new Set(),parsed=schedules.map(row=>{const schedule=parseReminderSchedule(row,{stored:true});if(ids.has(schedule.id))throw fail('Reminder identities are duplicated.');ids.add(schedule.id);return schedule;});
 return {schedules:parsed,paused,resumedAt};
}

export function eligibleReminderEvent(schedule,state,preferences,now){
 if(preferences.paused)return null;const event=dueReminderEvent(schedule,state,now);
 return event&&event.due>=Date.parse(schedule.createdAt)&&event.due>=Date.parse(preferences.resumedAt)?event:null;
}

function wallInstants(day,time,timeZone){
 const [hour,minute]=time.split(':').map(Number),values=[];
 for(const disambiguation of ['earlier','later']){
  const candidate=Temporal.ZonedDateTime.from({timeZone,year:day.year,month:day.month,day:day.day,hour,minute},{disambiguation});
  // A skipped spring-forward time does not become a different reminder time.
  if(candidate.hour===hour&&candidate.minute===minute&&candidate.toPlainDate().equals(day))values.push(Number(candidate.epochMilliseconds));
 }
 return [...new Set(values)];
}

/** Queue selection only. The saved diary and schedule are checked again before delivery. */
export function nextReminderDue(state,input,now,{after=false}={}){
 const preferences=reminderPreferences(input);if(preferences.paused)return null;
 const current=new Date(now).valueOf();if(!Number.isFinite(current))throw fail('Reminder time is unavailable.',503);
 const lower=after?current+1:current-LATE_MS,candidates=[];
 const add=(value,schedule)=>{if(Number.isFinite(value)&&value>=lower&&value>=Date.parse(preferences.resumedAt)&&value>=Date.parse(schedule.createdAt))candidates.push(value);};
 for(const schedule of preferences.schedules){
  if(!schedule.enabled)continue;
  if(schedule.kind==='fasting'){
   const fast=state.fasts?.find(row=>!row.end);if(fast&&Number.isFinite(fast.goalHours)&&fast.goalHours>=1&&fast.goalHours<=168)add(Date.parse(fast.start)+fast.goalHours*3600000,schedule);
  }else if(schedule.kind==='fasting-start'){
   const active=activeScheduledFastStart(state);if(active)add(Date.parse(active.start),schedule);
   for(const row of fastingScheduleView(state,new Date(current),schedule.timeZone).schedules)if(row.nextStart)add(Date.parse(row.nextStart),schedule);
  }else{
   const today=Temporal.Instant.fromEpochMilliseconds(current).toZonedDateTimeISO(schedule.timeZone).toPlainDate();
   if(schedule.kind==='weight'){
    const basis=weightReminderBasis(state,schedule.weightMetric,today.toString());
    if(basis.status==='known')for(const value of wallInstants(Temporal.PlainDate.from(basis.dueDate),schedule.time,schedule.timeZone))add(value,schedule);
   }else{
    // One full weekday cycle plus yesterday covers a midnight late window.
    for(let offset=-1;offset<=7;offset++){
     const day=today.add({days:offset});if(!schedule.days.includes(day.dayOfWeek%7))continue;
     for(const value of wallInstants(day,schedule.time,schedule.timeZone))add(value,schedule);
    }
   }
  }
 }
 return candidates.length?new Date(Math.min(...candidates)).toISOString():null;
}
