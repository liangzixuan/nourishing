import {PAIRING_CAPTURE_VERSION,capturePairingGuidance,pairingRuleCodes} from './pairing-guidance.mjs';
import {createCycleOverlay,eligibleCycleOverlay} from './cycle-overlay-capture.mjs';
import {resolveCycleChartOverlays} from './cycle-overlay-settings.mjs';
import {healthMeasurementSource} from './health-records.mjs';
import {healthPressurePairKey,parseHealthPressureContext} from './health-pressure.mjs';
import {readingMinute,createBiometricReadingPool,pairBiometricReadings} from './biometric-pairing.mjs';
import {captureCalendar,date,eligibleCalendarDates} from './calendar.mjs';

const roles=['systolic','diastolic','pulse'],dayMilliseconds=86400000;
const invalid=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
function fields(value,allowed,required,label){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key))||required.some(key=>!Object.hasOwn(value,key)))invalid(`${label} contains invalid or missing fields.`);
}
function metric(value,unit){
  fields(value,['type','unit'],['type','unit'],'Blood pressure metric');
  if(typeof value.type!=='string'||!value.type||value.type!==value.type.trim()||value.type.length>100||value.unit!==unit)invalid(`Choose an exact biometric name without surrounding spaces, with unit ${unit}.`);
  return {type:value.type,unit};
}
export function parseBloodPressureMapping(input){
  fields(input,roles,roles,'Blood pressure mapping');
  const mapping={systolic:metric(input.systolic,'mmHg'),diastolic:metric(input.diastolic,'mmHg'),pulse:input.pulse===null?null:metric(input.pulse,'bpm')};
  if(mapping.systolic.type===mapping.diastolic.type)invalid('Choose different systolic and diastolic metrics.');
  return mapping;
}
export function parseBloodPressureRange(input){
  fields(input,['from','to'],['from','to'],'Blood pressure range');
  const from=date(input.from),to=date(input.to),days=(Date.parse(`${to}T00:00:00Z`)-Date.parse(`${from}T00:00:00Z`))/dayMilliseconds+1;
  if(days<1||days>3660)invalid('Choose a blood pressure range from 1 to 3660 days.');
  return {from,to};
}
function readingTime(value){
  if(value===undefined||value==='')return '';
  if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))invalid('Use a valid HH:MM reading time.');
  return value;
}
function readingValue(value){
  if(typeof value!=='number'||!Number.isFinite(value)||value< -1000000||value>1000000)invalid('Reading values must be finite numbers from -1000000 to 1000000.');
  return value;
}
const identity=({type,unit})=>JSON.stringify([type,unit]);


function matchDay(readings){
  const native={systolic:readings.systolic.filter(r=>r.nativePressure),diastolic:readings.diastolic.filter(r=>r.nativePressure)};
  const matched=pairBiometricReadings(readings.systolic.filter(r=>!r.nativePressure),readings.diastolic.filter(r=>!r.nativePressure));
  const nativeGroups=new Map();
  for(const role of ['systolic','diastolic'])for(const row of native[role]){const key=row.nativePressure.key;if(!nativeGroups.has(key))nativeGroups.set(key,{systolic:[],diastolic:[]});nativeGroups.get(key)[role].push(row);}
  for(const group of nativeGroups.values()){
    if(group.systolic.length===1&&group.diastolic.length===1&&group.systolic[0].nativePressure.context.component==='systolic'&&group.diastolic[0].nativePressure.context.component==='diastolic')matched.pairs.push({primary:group.systolic[0],secondary:group.diastolic[0],match:'source',minutes:null});
    else {matched.unmatchedPrimary.push(...group.systolic);matched.unmatchedSecondary.push(...group.diastolic);}
  }
  matched.pairs.sort((a,b)=>a.primary.sourceOrder-b.primary.sourceOrder);
  const pairs=matched.pairs.map(pair=>({systolic:pair.primary,diastolic:pair.secondary,pulse:null,pressureMatch:pair.match,pressureMinutes:pair.minutes,pulseMatch:null,pulseMinutes:null}));
  const pulses=createBiometricReadingPool(readings.pulse),anchor=pair=>readingMinute(pair.systolic.time||pair.diastolic.time);
  for(const pair of pairs){const at=anchor(pair);if(at!==null){const pulse=pulses.nearest(at);if(pulse){pair.pulse=pulse;pair.pulseMatch='time';pair.pulseMinutes=Math.abs(at-readingMinute(pulse.time));}}}
  for(const pair of pairs)if(!pair.pulse){const pulse=pulses.fallback(anchor(pair));if(pulse){pair.pulse=pulse;pair.pulseMatch='order';}}
  const unmatched=[];
  for(const [role,rows] of [['systolic',matched.unmatchedPrimary],['diastolic',matched.unmatchedSecondary],['pulse',pulses.remaining()]]){
    for(const reading of rows)unmatched.push({role,reading,reason:capturePairingGuidance(reading.nativePressure?'pressure.reason.native':'pressure.reason.unmatched')});
  }
  unmatched.sort((a,b)=>a.reading.sourceOrder-b.reading.sourceOrder);
  return {pairs,unmatched};
}
function mappingOptions(state,mapping){
  const result=[],seen=new Set();
  const add=(type,unit)=>{
    if(!['mmHg','bpm'].includes(unit))return;
    let parsed;try{parsed=metric({type,unit},unit);}catch(error){if(error.status===400)return;throw error;}
    const key=identity(parsed);if(!seen.has(key)){seen.add(key);result.push(parsed);}
  };
  for(const row of state.biometrics??[])add(row.type,row.unit);
  for(const item of state.settings?.customBiometrics??[])if(item&&typeof item==='object')add(item.name,item.unit);
  if(mapping)for(const role of roles)if(mapping[role])add(mapping[role].type,mapping[role].unit);
  return result;
}
export function createBloodPressureView(state,input,{now,timeZone,eligibleDates}={}){
  const range=parseBloodPressureRange(input),calendar=captureCalendar(now,timeZone);
  const eligible=eligibleCalendarDates(range,eligibleDates);
  const mapping=Object.hasOwn(state.settings??{},'bloodPressure')?parseBloodPressureMapping(state.settings.bloodPressure):null;
  const view={version:PAIRING_CAPTURE_VERSION,range,calendar,mapping,status:mapping?'empty':'unconfigured',options:mappingOptions(state,mapping),pairs:[],unmatched:[],counts:{readings:0,pairs:0,pulseMatched:0,unmatched:0},rules:pairingRuleCodes.pressure.map(capturePairingGuidance)};
  view.cycleOverlayEnabled=resolveCycleChartOverlays(state.settings?.cycleChartOverlays).charts.bloodPressure;if(view.cycleOverlayEnabled)view.cycleOverlay=eligibleCycleOverlay(createCycleOverlay(state,range,{now:new Date(calendar.asOf),timeZone:calendar.timeZone}),eligible);
  if(!mapping)return view;
  const mapped=new Map(roles.filter(role=>mapping[role]).map(role=>[identity(mapping[role]),role])),days=new Map(),ids=new Set();
  for(const [sourceOrder,row] of (state.biometrics??[]).entries()){
    const role=mapped.get(identity(row));if(!role)continue;
    const day=date(row.date);if(day<range.from||day>range.to||(eligible&&!eligible.has(day)))continue;
    if(typeof row.id!=='string'||!row.id.trim()||row.id.length>1000||ids.has(row.id))invalid('Blood pressure readings need unique nonempty record IDs.');
    ids.add(row.id);
    const reading={id:row.id,date:day,time:readingTime(row.time),type:row.type,unit:row.unit,value:readingValue(row.value),sourceOrder};
    if(row.source?.kind==='health-connect'&&row.source.pressureContext!==undefined){const source=healthMeasurementSource(row.source,row);reading.nativePressure={key:healthPressurePairKey({...row,source}),context:parseHealthPressureContext(source.pressureContext)};}
    if(!days.has(day))days.set(day,{systolic:[],diastolic:[],pulse:[]});days.get(day)[role].push(reading);view.counts.readings++;
  }
  for(const day of [...days.keys()].sort()){
    const result=matchDay(days.get(day));
    for(const pair of result.pairs)view.pairs.push(pair);
    for(const unmatched of result.unmatched)view.unmatched.push(unmatched);
  }
  view.counts.pairs=view.pairs.length;view.counts.pulseMatched=view.pairs.filter(pair=>pair.pulse).length;view.counts.unmatched=view.unmatched.length;
  if(view.counts.readings)view.status='ready';
  return view;
}
function sameRecord(actual,expected){return Object.keys(actual).length===Object.keys(expected).length&&Object.keys(expected).every(key=>Object.hasOwn(actual,key)&&actual[key]===expected[key]);}
export function prepareBloodPressureLog(state,input){
  fields(input,['operationId','mapping','reading'],['operationId','mapping','reading'],'Blood pressure log');
  if(typeof input.operationId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input.operationId))invalid('Use a lowercase version 4 UUID for this reading operation.');
  const mapping=parseBloodPressureMapping(input.mapping),reading=input.reading;
  fields(reading,['date','time',...roles],['date','systolic','diastolic'],'Blood pressure reading');
  const day=date(reading.date),time=readingTime(reading.time),selected=Object.hasOwn(reading,'pulse')?roles:roles.slice(0,2);
  if(selected.includes('pulse')&&!mapping.pulse)invalid('Choose a pulse metric before logging a pulse value.');
  const prefix=`bp:${input.operationId}:`,records=selected.map(role=>({id:prefix+role,date:day,time,type:mapping[role].type,unit:mapping[role].unit,value:readingValue(reading[role])}));
  // Check all three role IDs, including an unexpected existing optional pulse.
  // Otherwise a retry that dropped pulse could falsely match a three-row commit.
  const owned=new Set(roles.map(role=>prefix+role)),existing=(state.biometrics??[]).filter(row=>owned.has(row.id));
  if(existing.length){
    const byId=new Map(existing.map(row=>[row.id,row]));
    if(existing.length!==records.length||byId.size!==existing.length||records.some(record=>!byId.has(record.id)||!sameRecord(byId.get(record.id),record)))invalid('This blood pressure operation already has different or incomplete readings. Review the saved records before retrying.',409);
    return {records,replayed:true};
  }
  const current=Object.hasOwn(state.settings??{},'bloodPressure')?parseBloodPressureMapping(state.settings.bloodPressure):null;
  if(JSON.stringify(current)!==JSON.stringify(mapping))invalid('The blood pressure mapping changed. Reload and review the selected metrics before logging.',409);
  return {records,replayed:false};
}
