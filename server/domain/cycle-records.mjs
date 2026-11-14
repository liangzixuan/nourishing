import {CYCLE_CAPTURE_VERSION,captureCycleGuidance} from './cycle-guidance.mjs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {Temporal} from '@js-temporal/polyfill';
import {date} from './calendar.mjs';
import {cycleMetrics,validCycleValue} from './cycle-values.mjs';
export {cyclePhases,cycleMetrics} from './cycle-values.mjs';

const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const object=(value,keys,label)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||Object.keys(value).some(key=>!keys.includes(key)))fail(`${label} must contain exactly ${keys.join(', ')}.`);};
const text=(value,label)=>{if(typeof value!=='string'||!value.trim()||value.length>1000)fail(`${label} must be nonempty text of at most 1000 characters.`);return value;};
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function instant(value,label){if(typeof value!=='string')fail(`${label} must include a date, time and UTC offset.`);try{Temporal.Instant.from(value);}catch{fail(`${label} must include a valid date, time and UTC offset.`);}return value;}
const compare=(a,b)=>Temporal.Instant.compare(a,b);
const localId=(sourceId,metric,recordId)=>'cycle-'+digest([sourceId,metric,recordId]);
const observationKey=row=>JSON.stringify([row.source.id,row.metric,row.date]);
function compareObservation(before,item){
 if(!before)return 'added';
 const age=compare(item.source.exportedAt,before.source.exportedAt);
 if(age<0)return 'older';
 const facts=row=>{const {exportedAt,...origin}=row.source;return {...row,source:origin};};
 if(isDeepStrictEqual(facts(before),facts(item)))return 'unchanged';
 if(age===0)fail('Conflicting facts have the same export timestamp. Use a distinct, correctly dated export before reviewing the change.',409);
 return 'updated';
}

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

export function parseCycleRecords(input){
 if(input===undefined)return [];
 if(!Array.isArray(input)||input.length>100000)fail('Cycle records must be an array of at most 100,000 observations.');
 const ids=new Set(),slots=new Set();
 return input.map(raw=>{
  object(raw,['id','date','metric','value','observedAt','source'],'Stored cycle record');
  const origin=source(raw.source),parsed=observation({id:origin.recordId,date:raw.date,metric:raw.metric,value:raw.value,observedAt:raw.observedAt});
  const id=localId(origin.id,parsed.metric,origin.recordId);
  if(raw.id!==id)fail('Stored cycle identity does not match its source and metric.');
  const row={...parsed,id,source:origin},slot=observationKey(row);
  if(ids.has(id)||slots.has(slot))fail('Cycle records contain duplicate identities or conflicting observations for one source, metric and date.');
  ids.add(id);slots.add(slot);return row;
 });
}

/** Portable workspace merges use the same source-clock rule as file imports. */
export function mergeCycleRecords(existing,incoming){
 const records=new Map(parseCycleRecords(existing).map(row=>[row.id,row]));
 for(const row of parseCycleRecords(incoming))if(compareObservation(records.get(row.id),row)!=='older')records.set(row.id,row);
 return parseCycleRecords([...records.values()]);
}

export function prepareCycleImport(state,input){
 object(input,['format','version','source','exportedAt','records'],'Cycle import');
 if(input.format!=='nourish-cycle-data'||input.version!==1)fail('Choose a version 1 Nourish cycle-data exchange file.');
 object(input.source,['id','name'],'Cycle import source');
 const sourceId=text(input.source.id,'Source ID'),sourceName=text(input.source.name,'Source name'),exportedAt=instant(input.exportedAt,'Export timestamp');
 if(!Array.isArray(input.records)||input.records.length>100000)fail('Import at most 100,000 cycle observations at a time.');
 const current=parseCycleRecords(state.cycleRecords),byId=new Map(current.map(row=>[row.id,row])),seen=new Set(),counts={added:0,updated:0,unchanged:0,older:0},records=[],writes=[];
 for(const raw of input.records){
  const parsed=observation(raw),id=localId(sourceId,parsed.metric,parsed.id);
  if(seen.has(id))fail('The file contains a duplicate source record and metric.');seen.add(id);
  const item={...parsed,id,source:{id:sourceId,name:sourceName,recordId:parsed.id,exportedAt}},before=byId.get(id)??null;
  const status=compareObservation(before,item);
  counts[status]++;records.push({status,before,after:item});
  if(status==='added'||status==='updated'||status==='unchanged'&&compare(exportedAt,before.source.exportedAt)>0)writes.push(item);
 }
 const updated=new Map(current.map(row=>[row.id,row]));for(const item of writes)updated.set(item.id,item);
 // Validate the final collection so record moves are checked together. Absence
 // from a file never deletes a previously imported observation.
 parseCycleRecords([...updated.values()]);
 return {version:CYCLE_CAPTURE_VERSION,reviewToken:digest({current,records,writes}),source:{id:sourceId,name:sourceName},exportedAt,counts,records,writes,warnings:["warning.exchange", "warning.temperature", "warning.missing", "warning.clinical"].map(captureCycleGuidance)};
}

export function importCycleData(state,input,reviewToken){
 const prepared=prepareCycleImport(state,input);
 if(typeof reviewToken!=='string'||reviewToken!==prepared.reviewToken)fail('The cycle import changed. Preview it again before confirming.',409);
 if(prepared.writes.length){const records=new Map(parseCycleRecords(state.cycleRecords).map(row=>[row.id,row]));for(const row of prepared.writes)records.set(row.id,row);state.cycleRecords=[...records.values()];}
 return prepared.counts;
}

export function prepareCycleRemoval(state,input){
 object(input,['ids'],'Cycle removal');
 if(!Array.isArray(input.ids)||input.ids.length===0||input.ids.length>100000)fail('Select one or more cycle observations to remove.');
 const ids=input.ids.map(id=>text(id,'Cycle record ID'));
 if(new Set(ids).size!==ids.length)fail('Select each cycle observation once.');
 const current=parseCycleRecords(state.cycleRecords),byId=new Map(current.map(row=>[row.id,row]));
 const records=ids.map(id=>{const row=byId.get(id);if(!row)fail('A selected cycle observation is no longer present. Review the selection again.',409);return row;});
 return {version:CYCLE_CAPTURE_VERSION,reviewToken:digest({current,ids}),records,count:records.length};
}

export function removeCycleRecords(state,input,reviewToken){
 const review=prepareCycleRemoval(state,input);
 if(typeof reviewToken!=='string'||reviewToken!==review.reviewToken)fail('Cycle records changed. Review removal again before confirming.',409);
 const ids=new Set(review.records.map(row=>row.id));state.cycleRecords=parseCycleRecords(state.cycleRecords).filter(row=>!ids.has(row.id));return {removed:ids.size};
}
