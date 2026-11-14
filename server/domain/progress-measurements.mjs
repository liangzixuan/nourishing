import {isDeepStrictEqual} from 'node:util';
import Big from 'big.js';
import {date as calendarDate} from './calendar.mjs';
import {calendarAge} from './calendar-age.mjs';
import {parseBodyCompositionPolicy,projectBodyComposition} from './body-composition.mjs';
import {parseEnergyPolicy,projectRestingAge} from './energy-policy.mjs';
import {parseBiometricMetric} from './biometric-metrics.mjs';
const roles=['age','weight','height','bodyFat'];
const fail=()=>{throw Object.assign(Error('Snapshot measurement sources do not match the saved values.'),{status:400})};
const exact=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))fail()};
const basePolicy={version:2,weightMetric:null,heightMetric:null,bodyFatMetric:null,useForResting:false,useHeightForResting:false,useForKeto:false};
function sourceValue(role,source,date){
 if(role==='age'){
  exact(source,['kind','mode','value']);if(source.kind!=='age'||!['manual','birth-date'].includes(source.mode))fail();
  const age=source.mode==='manual'?source.value:calendarAge(source.value,date)?.years;
  if(!Number.isInteger(age)||age<0||age>150)fail();return age;
 }
 exact(source,['kind','metric','reading']);if(source.kind!=='biometric')fail();
 const metric=parseBiometricMetric(source.metric),reading=source.reading;
 exact(reading,['date','value','unit',...(Object.hasOwn(reading??{},'time')?['time']:[])]);
 calendarDate(reading.date);if(reading.date>date||reading.unit!==metric.unit)fail();
 if(Object.hasOwn(reading,'time')&&(typeof reading.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(reading.time)))fail();
 const body=projectBodyComposition([{...reading,type:metric.type}],{...basePolicy,[role+'Metric']:metric},date);
 if(body[role]?.status!=='known')fail();
 if(role==='bodyFat')return body.bodyFatPercent;
 if(role==='weight'){
  if(body.weightKg>1000)fail();
  return metric.unit==='kg'?{value:reading.value,unit:'kg'}:{value:metric.unit==='st'?Number(new Big(reading.value).times(14)):reading.value,unit:'lb'};
 }
 if(body.heightCm>300)fail();
 return ['in','ft'].includes(metric.unit)?{value:metric.unit==='ft'?Number(new Big(reading.value).times(12)):reading.value,unit:'in'}:{value:body.heightCm,unit:'cm'};
}
/** Sources are frozen facts, not live references to mutable profile records. */
export function parseMeasurementCapture(value,vitals){
 exact(value,['version','date','sources']);if(value.version!==1)fail();calendarDate(value.date);
 const sources=value.sources;if(!sources||typeof sources!=='object'||Array.isArray(sources)||Object.keys(sources).some(role=>!roles.includes(role)))fail();
 for(const [role,source]of Object.entries(sources))if(!isDeepStrictEqual(sourceValue(role,source,value.date),vitals[role]))fail();
 return structuredClone(value);
}
export function captureSnapshotMeasurements(state,date){
 calendarDate(date);
 const body=projectBodyComposition(state.biometrics??[],parseBodyCompositionPolicy(state.settings?.bodyComposition),date);
 const energy=parseEnergyPolicy(state.settings?.energyPolicy),age=projectRestingAge(energy?.resting,date),sources={},vitals={};
 if(Number.isInteger(age?.years)&&age.years>=0&&age.years<=150){
  sources.age={kind:'age',mode:age.source,value:age.source==='birth-date'?energy.resting.birthDate:age.years};
  vitals.age=sourceValue('age',sources.age,date);
 }
 for(const role of ['weight','height','bodyFat']){
  const selected=body[role];if(selected.status!=='known'||role==='weight'&&body.weightKg>1000||role==='height'&&body.heightCm>300)continue;
  sources[role]={kind:'biometric',metric:selected.metric,reading:selected.reading};vitals[role]=sourceValue(role,sources[role],date);
 }
 return {vitals,measurementCapture:parseMeasurementCapture({version:1,date,sources},vitals)};
}
/** Editing a value removes its old attribution; other captured facts survive. */
export function retainMeasurementCapture(existing,vitals){
 if(!existing.measurementCapture)return undefined;
 const capture=parseMeasurementCapture(existing.measurementCapture,existing.vitals);
 capture.sources=Object.fromEntries(Object.entries(capture.sources).filter(([role])=>isDeepStrictEqual(existing.vitals[role],vitals[role])));
 return parseMeasurementCapture(capture,vitals);
}
