import {weightUnits,weightKilogramsPerUnit} from './weight-units.mjs';
import {createHash} from 'node:crypto';
import {readHealthExportIdentity,initializeHealthExportIdentity,validateHealthExportNamespace} from './health-export-identity.mjs';
import Big from 'big.js';
import {date,parseReportTimeZone} from './calendar.mjs';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fields=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))fail('Supply the complete biometric export selection.');};
const local=row=>!Object.hasOwn(row,'source')&&!Object.hasOwn(row,'copiedFrom');
const definitions=[
 ['weight','Weight',[...weightUnits]],['body-water','Body water mass',['kg','lb']],['body-fat','Body fat',['%']],
 ['height','Height',['cm','m','in','ft']],['glucose','Blood glucose',['mmol/L','mg/dL']],
 ['pressure','Blood pressure',['mmHg']],['temperature','Body temperature',['°C','°F']],
 ['heart-rate','Heart rate',['bpm']],['resting-heart-rate','Resting heart rate',['bpm']],
 ['hrv','Heart rate variability (RMSSD)',['ms']],['oxygen','Oxygen saturation',['%']],['respiration','Respiratory rate',['brpm']],
].map(([kind,label,units])=>Object.freeze({kind,label,units:Object.freeze(units)}));
export const healthBiometricExportKinds=Object.freeze(definitions);
function selection(input){
 fields(input,['kind','from','to','metric','timeZone',...(input?.kind==='pressure'?['secondaryMetric']:[])]);
 const definition=definitions.find(row=>row.kind===input.kind);if(!definition)fail('Choose a supported Health Connect biometric type.');
 const metric=value=>{fields(value,['type','unit']);if(typeof value.type!=='string'||!value.type.trim()||value.type.length>100||!definition.units.includes(value.unit))fail('Choose an exact metric with a supported unit.');return {type:value.type,unit:value.unit};};
 const from=date(input.from),to=date(input.to),timeZone=parseReportTimeZone(input.timeZone);if(from>to)fail('Choose a valid date range.');
 const result={kind:input.kind,from,to,metric:metric(input.metric),timeZone};
 if(input.kind==='pressure'){result.secondaryMetric=metric(input.secondaryMetric);if(result.metric.type===result.secondaryMetric.type)fail('Choose distinct systolic and diastolic metrics.');}
 return result;
}
function nativeValue(kind,row){
 if(typeof row.value!=='number'||!Number.isFinite(row.value))return NaN;
 const n=new Big(row.value);
 if(kind==='weight'||kind==='body-water')return Number(n.times(weightKilogramsPerUnit[row.unit]));
 if(kind==='height')return Number(n.times({cm:1,m:100,in:'2.54',ft:'30.48'}[row.unit]));
 if(kind==='temperature')return row.unit==='°F'?Number(n.minus(32).times(5).div(9)):row.value;
 // Preserve glucose in its source unit. Android owns its SDK unit conversion.
 return row.value;
}
const ranges={weight:[0,1000],'body-water':[0,1000],'body-fat':[0,100],height:[0,300],temperature:[0,100],'heart-rate':[1,300],'resting-heart-rate':[0,300],hrv:[1,200],oxygen:[0,100],respiration:[0,1000],pressure:[20,300]};
function invalid(kind,row,value,secondary=false){
 const [min,max]=kind==='glucose'?[0,row.unit==='mg/dL'?900:50]:secondary?[10,300]:ranges[kind];
 return !Number.isFinite(value)||value<min||value>max||(['heart-rate','resting-heart-rate'].includes(kind)&&!Number.isInteger(value));
}
export function healthBiometricExportOptions(state,timeZone='UTC'){
  parseReportTimeZone(timeZone);
  const metrics=new Map();for(const row of state.biometrics)if(local(row)&&definitions.some(d=>d.units.includes(row.unit)))metrics.set(JSON.stringify([row.type,row.unit]),{type:row.type,unit:row.unit});
  return {version:1,timeZone,kinds:definitions,metrics:[...metrics.values()].sort((a,b)=>a.type.localeCompare(b.type)||a.unit.localeCompare(b.unit))};
 }
export function projectHealthBiometricExport(state,input,namespace){
  validateHealthExportNamespace(namespace);
  const selected=selection(input),records=[],skipped=[];
  const exact=(row,metric)=>row.type===metric.type&&row.unit===metric.unit;
  const selectedRows=state.biometrics.filter(row=>row.date>=selected.from&&row.date<=selected.to&&(exact(row,selected.metric)||(selected.secondaryMetric&&exact(row,selected.secondaryMetric))));
  const eligible=[];
  const skip=(row,reason)=>skipped.push({id:row.id,date:row.date,reason});
  for(const row of selectedRows){
   const reason=!local(row)?'Imported or copied source record; not re-exported.':!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.time??'')?'No recorded time.':null;
   if(reason){skip(row,reason);continue;}date(row.date);eligible.push(row);
  }
  function add(row,secondary){
   const value=nativeValue(selected.kind,row),other=secondary&&nativeValue(selected.kind,secondary);
   if(invalid(selected.kind,row,value)||(secondary&&invalid(selected.kind,secondary,other,true))){skip(row,'Value is outside the supported Health Connect range or requires a whole number.');if(secondary)skip(secondary,'Paired value is outside the supported Health Connect range.');return;}
   records.push({id:row.id,date:row.date,time:row.time,value:row.value,unit:row.unit,nativeValue:value,...(secondary?{secondaryId:secondary.id,secondaryValue:secondary.value,nativeSecondary:other}:{}),clientRecordId:'nourish-export:'+selected.kind+':'+hash(secondary?[namespace,row.id,secondary.id]:[namespace,row.id])});
  }
  if(selected.kind==='pressure'){
   const groups=new Map();for(const row of eligible){const key=JSON.stringify([row.date,row.time]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
   for(const group of groups.values()){
    const primary=group.filter(row=>exact(row,selected.metric)),secondary=group.filter(row=>exact(row,selected.secondaryMetric));
    if(primary.length===1&&secondary.length===1)add(primary[0],secondary[0]);else for(const row of group)skip(row,'No unique systolic/diastolic pair at the exact recorded date and time.');
   }
  }else for(const row of eligible)add(row);
  records.sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)||a.id.localeCompare(b.id));skipped.sort((a,b)=>a.id.localeCompare(b.id));
  const facts={version:1,selection:selected,records,skipped},result={...facts,reviewToken:hash([namespace,facts])};
  if(Buffer.byteLength(JSON.stringify(result))>1048576)fail('This export exceeds the Android response limit. Select a smaller date range.',413);
  return result;
 }
export function createHealthBiometricExport({store,timeZone='UTC'}){
 initializeHealthExportIdentity(store.db);parseReportTimeZone(timeZone);
 const options=()=>healthBiometricExportOptions(store.read(),timeZone);
 const preview=input=>projectHealthBiometricExport(store.read(),input,readHealthExportIdentity(store.db));
 function verify(input){fields(input,['selection','reviewToken']);const current=preview(input.selection);if(typeof input.reviewToken!=='string'||current.reviewToken!==input.reviewToken)fail('Biometric records or export identity changed. Preview again before writing to Health Connect.',409);return {reviewToken:current.reviewToken,valid:true};}
 return {options,preview,verify};
}
