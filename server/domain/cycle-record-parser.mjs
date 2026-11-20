import {Temporal} from '@js-temporal/polyfill';
import {date} from './calendar.mjs';
import {cycleMetrics,validCycleValue} from './cycle-values.mjs';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const object=(value,keys,label)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||Object.keys(value).some(key=>!keys.includes(key)))fail(`${label} must contain exactly ${keys.join(', ')}.`);};
const text=(value,label)=>{if(typeof value!=='string'||!value.trim()||value.length>1000)fail(`${label} must be nonempty text of at most 1000 characters.`);return value;};
function instant(value,label){if(typeof value!=='string')fail(`${label} must include a date, time and UTC offset.`);try{Temporal.Instant.from(value);}catch{fail(`${label} must include a valid date, time and UTC offset.`);}return value;}
const observationKey=row=>JSON.stringify([row.source.id,row.metric,row.date]);
/** This is a Nourish exchange contract, not an Oura export schema. Values are
 * supplied observations. No phase or day is derived from temperature or dates. */
function observation(input){
 object(input,['id','date','metric','value','observedAt'],'Cycle observation');
 const id=text(input.id,'Source record ID'),day=date(input.date),{metric,value}=input;
 if(!cycleMetrics.includes(metric))fail('Choose cycleDay, phase or temperatureVariation.');
 if(!validCycleValue(metric,value))fail(metric==='cycleDay'?'Cycle day must be a positive integer or null.':metric==='phase'?'Choose a supported cycle phase, unknown or null.':'Temperature variation must be a finite Celsius difference or null.');
 const observedAt=input.observedAt===null?null:instant(input.observedAt,'Observation timestamp');
 return {id,date:day,metric,value,observedAt};
}
function source(input){object(input,['id','name','recordId','exportedAt'],'Cycle source');return {id:text(input.id,'Source ID'),name:text(input.name,'Source name'),recordId:text(input.recordId,'Source record ID'),exportedAt:instant(input.exportedAt,'Export timestamp')};}

export function parseCycleRecordValues(input,identify){
 if(input===undefined)return [];
 if(!Array.isArray(input)||input.length>100000)fail('Cycle records must be an array of at most 100,000 observations.');
 const ids=new Set(),slots=new Set();
 return input.map(raw=>{
  object(raw,['id','date','metric','value','observedAt','source'],'Stored cycle record');
  const origin=source(raw.source),parsed=observation({id:origin.recordId,date:raw.date,metric:raw.metric,value:raw.value,observedAt:raw.observedAt});
  const id=identify(origin.id,parsed.metric,origin.recordId);
  if(raw.id!==id)fail('Stored cycle identity does not match its source and metric.');
  const row={...parsed,id,source:origin},slot=observationKey(row);
  if(ids.has(id)||slots.has(slot))fail('Cycle records contain duplicate identities or conflicting observations for one source, metric and date.');
  ids.add(id);slots.add(slot);return row;
 });
}

export {fail,object,text,instant,observation};
