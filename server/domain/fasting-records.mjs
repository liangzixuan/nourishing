import {Temporal} from '@js-temporal/polyfill';
import {parseFastingRepeat} from './fasting-schedule-contract.mjs';
import {parseScheduledFast} from './fasting-schedules.mjs';

const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const has=(value,key)=>Object.hasOwn(value,key);
function fields(value,allowed){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key)))fail('Invalid fasting record fields.');
}
function exactId(value){
  if(typeof value!=='string'||!value.trim()||value.length>100)fail('Fast ID must be a nonempty string of at most 100 characters.');
  return value;
}
function instant(value){
  if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-]\d\d:\d\d)$/.test(value))fail('Fast times need valid timestamps with an explicit offset.');
  try{return Temporal.Instant.from(value);}catch{fail('Fast times need valid timestamps with an explicit offset.');}
}
export function compareFastInstants(left,right){return Temporal.Instant.compare(instant(left),instant(right));}
export function fastDurationNanoseconds(record){
 if(record.end===null)return null;
 const duration=instant(record.end).epochNanoseconds-instant(record.start).epochNanoseconds;
 if(duration<0n)fail('Fast end cannot precede its start.');
 return duration;
}
function goal(value){if(value!==null&&(typeof value!=='number'||!Number.isFinite(value)||value<1||value>168))fail('Goal hours must be null or a number from 1 through 168.');return value;}
function note(value){if(typeof value!=='string'||value.length>10000)fail('A fast note must be text of at most 10000 characters.');return value;}
export function parseFastRecord(input){
  fields(input,['id','start','end','goalHours','note','label','repeat','scheduled']);
  const result={id:exactId(input.id),start:input.start,end:input.end,goalHours:goal(input.goalHours)};
  const start=instant(input.start);
  if(input.end!==null&&Temporal.Instant.compare(instant(input.end),start)<0)fail('Fast end cannot precede its start.');
  if(has(input,'label')){if(typeof input.label!=='string'||input.label.length>200)fail('A fast name must be text of at most 200 characters.');if(input.label!=='')result.label=input.label;}
  if(has(input,'note')){const value=note(input.note);if(value!=='')result.note=value;}
  if(has(input,'repeat')){const repeat=parseFastingRepeat(input.repeat);if(repeat)result.repeat=repeat;}
  if(has(input,'scheduled')){
    if(input.scheduled===undefined)fail('Invalid scheduled fast metadata.');
    result.scheduled=parseScheduledFast(input.scheduled,result);
  }
  return result;
}
const actionFields={
  'fast.start':['start','goalHours','note','label'],
  'fast.record':['start','end','goalHours','note','label'],
  'fast.end':['id','end'],
  'fast.update':['id','start','end','goalHours','note','label','repeat'],
  'fast.delete':['id']
};
export function applyFastAction(state,type,payload,now,createId=()=>crypto.randomUUID()){
  if(!has(actionFields,type))fail('Unknown fasting action.');
  fields(payload,actionFields[type]);
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))fail('Fasting actions need a valid caller clock.');
  if(!Array.isArray(state.fasts))fail('Invalid fasting collection.');
  const current=instant(now.toISOString());
  const records=state.fasts.map(parseFastRecord);
  if(new Set(records.map(row=>row.id)).size!==records.length)fail('Duplicate fast record IDs.');
  if(records.filter(row=>row.end===null).length>1)fail('Only one fast may be active.');
  let index=-1,record;
  if(type==='fast.start'||type==='fast.record'){
    if(records.length>=100000)fail('The fasting collection is full.');
    const start=has(payload,'start')?payload.start:type==='fast.start'?now.toISOString():undefined;
    record=parseFastRecord({id:createId(),start,end:type==='fast.start'?null:payload.end,goalHours:has(payload,'goalHours')?payload.goalHours:16,...(has(payload,'note')?{note:payload.note}:{}),...(has(payload,'label')?{label:payload.label}:{})});
    if(records.some(row=>row.id===record.id))fail('This fast ID already exists.',409);
    if(type==='fast.record'&&record.end===null)fail('A past fast needs an end timestamp.');
  }else{
    if(type==='fast.end'&&!has(payload,'id'))index=records.findIndex(row=>row.end===null);
    else{const id=exactId(payload.id);index=records.findIndex(row=>row.id===id);}
    if(index<0)fail(type==='fast.end'?'No active fast was found.':'Fast not found.',type==='fast.end'?400:404);
    record=records[index];
    if(type==='fast.delete'){state.fasts.splice(index,1);return record;}
    if(type==='fast.end'){
      if(record.end!==null)fail('Only an active fast can be ended.');
      record=parseFastRecord({...record,end:has(payload,'end')?payload.end:now.toISOString()});
      if(record.end===null)fail('Ending a fast needs an end timestamp.');
    }else{
      const changes=Object.fromEntries(['start','end','goalHours','note','label','repeat'].filter(key=>has(payload,key)).map(key=>[key,payload[key]]));
      record=parseFastRecord({...record,...changes});
    }
  }
  if(Temporal.Instant.compare(instant(record.start),current)>0||(record.end!==null&&Temporal.Instant.compare(instant(record.end),current)>0))fail('Fast times cannot be in the future.');
  if(record.end===null&&records.some((row,i)=>i!==index&&row.end===null))fail('Another fast is already active.');
  if(index<0)state.fasts.push(record);else state.fasts[index]=record;
  return structuredClone(record);
}
