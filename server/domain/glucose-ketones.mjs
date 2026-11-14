import {PAIRING_CAPTURE_VERSION,capturePairingGuidance,pairingRuleCodes} from './pairing-guidance.mjs';
import {createCycleOverlay,eligibleCycleOverlay} from './cycle-overlay-capture.mjs';
import {resolveCycleChartOverlays} from './cycle-overlay-settings.mjs';
import {captureCalendar,date,eligibleCalendarDates} from './calendar.mjs';
import {pairBiometricReadings} from './biometric-pairing.mjs';
import {serializeCsv} from './csv-export.mjs';
import Big from 'big.js';

export const glucoseConcentrationUnits=Object.freeze(['mmol/L','mg/dL']);
const roles=['glucose','ketones'],units=glucoseConcentrationUnits;
export const glucoseConversion=Object.freeze({mgDlPerMmolL:18.016,sourceUrl:'https://link.springer.com/article/10.1186/s12986-015-0009-2'});
const factors=Object.freeze({glucose:glucoseConversion.mgDlPerMmolL,ketones:10.41});
const sourceUrl=glucoseConversion.sourceUrl;
const GlucoseDecimal=Big();GlucoseDecimal.DP=340;
/** Convert source decimals once, before comparisons or display projection. */
export function convertGlucoseUnit(value,from,to){
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||!units.includes(from)||!units.includes(to))invalid('Choose a finite nonnegative glucose value and supported units.');
  const converted=from===to?value:Number((from==='mg/dL'?new GlucoseDecimal(value.toString()).div(glucoseConversion.mgDlPerMmolL.toString()):new GlucoseDecimal(value.toString()).times(glucoseConversion.mgDlPerMmolL.toString())).toString());
  if(!Number.isFinite(converted))invalid('The converted glucose value is outside the finite range.');return converted;
}
const invalid=(message,status=400)=>{throw Object.assign(Error(message),{status});};
function fields(value,required,optional=[],label='Glucose and ketone input'){
  if(!value||typeof value!=='object'||Array.isArray(value)||required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>![...required,...optional].includes(key)))invalid(`${label} contains missing or unsupported fields.`);
}
function typeName(value){if(typeof value!=='string'||!value||value!==value.trim()||value.length>100)invalid('Choose an exact biometric type without surrounding spaces.');return value;}
export function parseGlucoseKetoneMapping(value){
  if(value===null||value===undefined)return null;
  fields(value,['version','glucose','ketones','displayUnit']);
  if(value.version!==1||!units.includes(value.displayUnit))invalid('Choose version 1 mapping and mmol/L or mg/dL display units.');
  for(const role of roles)fields(value[role],['type'],[],`${role} source`);
  const glucose={type:typeName(value.glucose.type)},ketones={type:typeName(value.ketones.type)};
  if(glucose.type===ketones.type)invalid('Choose different source types for glucose and blood beta-hydroxybutyrate.');
  return {version:1,glucose,ketones,displayUnit:value.displayUnit};
}
export function parseGlucoseKetoneRange(value){
  fields(value,['from','to']);const from=date(value.from),to=date(value.to),days=(Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000+1;
  if(days<1||days>3660)invalid('Choose a glucose and ketone range from 1 to 3660 days.');return {from,to};
}
const validTime=value=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
function logTime(value){if(value===undefined||value==='')return '';if(!validTime(value))invalid('Use a valid HH:MM reading time.');return value;}
const validId=value=>typeof value==='string'&&Boolean(value.trim())&&value.length<=1000;
const scalar=value=>['string','boolean'].includes(typeof value)||typeof value==='number'&&Number.isFinite(value)?value:null;
const rawReading=(row,sourceOrder)=>({id:scalar(row.id),date:scalar(row.date),time:row.time===undefined?'':scalar(row.time),type:scalar(row.type),unit:scalar(row.unit),value:scalar(row.value),sourceOrder});

function mappingOptions(state,mapping){
  const result=new Map();const add=(type,unit)=>{try{typeName(type);}catch{return;}if(!result.has(type))result.set(type,new Set());if(typeof unit==='string'&&unit.trim()&&unit.length<=30)result.get(type).add(unit);};
  for(const row of state.biometrics??[])if(row&&typeof row==='object')add(row.type,row.unit);
  for(const item of state.settings?.customBiometrics??[])if(item&&typeof item==='object')add(item.name,item.unit);
  if(mapping)for(const role of roles)add(mapping[role].type);
  return [...result].map(([type,values])=>({type,units:[...values]}));
}
/** Captured source facts, exclusions and pairing are owned here for every consumer. */
export function createGlucoseKetoneView(state,input,{now,timeZone,eligibleDates,displayUnit:unitOverride}={}){
  if(unitOverride!==undefined&&!units.includes(unitOverride))invalid('Choose mmol/L or mg/dL for the chart display.');
  const range=parseGlucoseKetoneRange(input),calendar=captureCalendar(now,timeZone),eligibleDatesSet=eligibleCalendarDates(range,eligibleDates),mapping=parseGlucoseKetoneMapping(state.settings?.glucoseKetones),displayUnit=unitOverride??mapping?.displayUnit??'mmol/L';
  const view={version:PAIRING_CAPTURE_VERSION,range,calendar,mapping,status:mapping?'empty':'unconfigured',options:mappingOptions(state,mapping),readings:[],pairs:[],unmatched:[],excluded:[],counts:{selected:0,eligible:0,pairs:0,ratioAvailable:0,ratioUnavailable:0,unmatched:0,excluded:0},rules:pairingRuleCodes.glucose.map(capturePairingGuidance),conversion:{glucoseMgDlPerMmolL:factors.glucose,ketoneMgDlPerMmolL:factors.ketones,sourceUrl},series:{glucose:{unit:displayUnit,points:[]},ketones:{unit:displayUnit,points:[]},gki:{unit:null,points:[]}}};
  view.cycleOverlayEnabled=resolveCycleChartOverlays(state.settings?.cycleChartOverlays).charts.glucoseKetones;if(view.cycleOverlayEnabled)view.cycleOverlay=eligibleCycleOverlay(createCycleOverlay(state,range,{now:new Date(calendar.asOf),timeZone:calendar.timeZone}),eligibleDatesSet);
  if(!mapping)return view;
  const selected=[],idCounts=new Map(),days=new Map();
  for(const [sourceOrder,row] of (state.biometrics??[]).entries()){
    const role=roles.find(role=>row?.type===mapping[role].type);if(!role)continue;
    let validDate=true;try{date(row.date);}catch{validDate=false;}
    if(validDate&&(row.date<range.from||row.date>range.to||eligibleDatesSet&&!eligibleDatesSet.has(row.date)))continue;
    selected.push({row,role,sourceOrder,validDate});if(validId(row.id))idCounts.set(row.id,(idCounts.get(row.id)??0)+1);
  }
  view.counts.selected=selected.length;
  for(const {row,role,sourceOrder,validDate} of selected){
    const raw=rawReading(row,sourceOrder);let reason=null;
    if(!validDate)reason='invalid-date';else if(!validId(row.id))reason='invalid-id';else if(idCounts.get(row.id)>1)reason='duplicate-id';else if(!units.includes(row.unit))reason='unsupported-unit';else if(typeof row.value!=='number'||!Number.isFinite(row.value))reason='invalid-value';else if(row.value<0)reason='negative-value';else if(row.value>1000000)reason='out-of-range-value';else if(row.time!==undefined&&row.time!==''&&!validTime(row.time))reason='invalid-time';
    if(reason){view.excluded.push({role,reading:raw,reason});continue;}
    const mmolL=role==='glucose'?convertGlucoseUnit(row.value,row.unit,'mmol/L'):row.unit==='mmol/L'?row.value:row.value/factors[role],displayValue=role==='glucose'?convertGlucoseUnit(row.value,row.unit,displayUnit):displayUnit===row.unit?row.value:displayUnit==='mmol/L'?mmolL:mmolL*factors[role],reading={...raw,role,mmolL,displayValue};
    view.readings.push(reading);if(!days.has(row.date))days.set(row.date,{glucose:[],ketones:[]});days.get(row.date)[role].push(reading);
  }
  view.readings.sort((a,b)=>a.date.localeCompare(b.date)||a.sourceOrder-b.sourceOrder);
  for(const day of [...days.keys()].sort()){
    const result=pairBiometricReadings(days.get(day).glucose,days.get(day).ketones);
    for(const matched of result.pairs){
      const glucose=matched.primary,ketones=matched.secondary,ratio=ketones.mmolL===0?null:glucose.mmolL/ketones.mmolL,gki=Number.isFinite(ratio)?ratio:null,reason=ketones.mmolL===0?'zero-ketones':gki===null?'nonfinite-ratio':null;
      view.pairs.push({id:JSON.stringify([glucose.id,ketones.id]),date:day,time:glucose.time||ketones.time,glucose,ketones,match:matched.match,minutes:matched.minutes,gki,reason});
    }
    for(const [role,rows] of [['glucose',result.unmatchedPrimary],['ketones',result.unmatchedSecondary]])for(const reading of rows)view.unmatched.push({role,reading,reason:'no-match'});
  }
  view.unmatched.sort((a,b)=>a.reading.date.localeCompare(b.reading.date)||a.reading.sourceOrder-b.reading.sourceOrder);
  for(const reading of view.readings)view.series[reading.role].points.push({recordId:reading.id,date:reading.date,time:reading.time,sourceOrder:reading.sourceOrder,value:reading.displayValue});
  for(const pair of view.pairs)view.series.gki.points.push({pairId:pair.id,date:pair.date,time:pair.time,sourceOrder:pair.glucose.sourceOrder,value:pair.gki});
  Object.assign(view.counts,{eligible:view.readings.length,pairs:view.pairs.length,ratioAvailable:view.pairs.filter(pair=>pair.gki!==null).length,ratioUnavailable:view.pairs.filter(pair=>pair.gki===null).length,unmatched:view.unmatched.length,excluded:view.excluded.length});
  if(view.counts.selected)view.status='ready';return view;
}
function sameRecord(actual,expected){return Object.keys(actual).length===Object.keys(expected).length&&Object.keys(expected).every(key=>Object.hasOwn(actual,key)&&actual[key]===expected[key]);}
export function prepareGlucoseKetoneLog(state,input){
  fields(input,['operationId','mapping','reading']);if(typeof input.operationId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input.operationId))invalid('Use a lowercase version 4 UUID for this reading operation.');
  const mapping=parseGlucoseKetoneMapping(input.mapping);if(!mapping)invalid('Choose the glucose and blood beta-hydroxybutyrate source mapping.');
  fields(input.reading,['date','glucose','ketones'],['time']);const day=date(input.reading.date),time=logTime(input.reading.time),prefix=`gki:${input.operationId}:`;
  const records=roles.map(role=>{const value=input.reading[role];fields(value,['value','unit']);if(typeof value.value!=='number'||!Number.isFinite(value.value)||value.value<0||value.value>1000000||!units.includes(value.unit))invalid('Enter each reading from 0 to 1000000 with mmol/L or mg/dL units.');return {id:prefix+role,date:day,time,type:mapping[role].type,unit:value.unit,value:value.value};});
  const owned=new Set(records.map(row=>row.id)),existing=(state.biometrics??[]).filter(row=>owned.has(row.id));
  if(existing.length){const byId=new Map(existing.map(row=>[row.id,row]));if(existing.length!==records.length||byId.size!==existing.length||records.some(row=>!byId.has(row.id)||!sameRecord(byId.get(row.id),row)))invalid('This glucose and ketone operation already has different or incomplete readings. Review the saved records before retrying.',409);return {records,replayed:true};}
  const current=parseGlucoseKetoneMapping(state.settings?.glucoseKetones);if(!current||roles.some(role=>current[role].type!==mapping[role].type))invalid('The glucose and ketone source mapping changed. Reload and review the selected types.',409);
  return {records,replayed:false};
}
export function serializeGlucoseKetoneCsv(view){
  const range=parseGlucoseKetoneRange(view.range),fields=['kind','date','glucose_type','glucose_value','glucose_unit','glucose_time','glucose_mmol_L','glucose_display_value','ketones_type','ketones_value','ketones_unit','ketones_time','ketones_mmol_L','ketones_display_value','display_unit','gki','pairing','minutes','reason'];
  const values=reading=>reading?[reading.type,reading.value,reading.unit,reading.time,reading.mmolL??null,reading.displayValue??null]:[null,null,null,null,null,null];
  const rows=view.pairs.map(pair=>['pair',pair.date,...values(pair.glucose),...values(pair.ketones),view.mapping.displayUnit,pair.gki,pair.match,pair.minutes,pair.reason]);
  for(const [kind,items] of [['unmatched',view.unmatched],['excluded',view.excluded]])for(const item of items)rows.push([kind,item.reading.date,...values(item.role==='glucose'?item.reading:null),...values(item.role==='ketones'?item.reading:null),view.mapping?.displayUnit??null,null,null,null,item.reason]);
  return {filename:`nourish-glucose-ketones-${range.from}-to-${range.to}.csv`,text:serializeCsv(fields,rows)};
}
