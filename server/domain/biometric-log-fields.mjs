import {biometricGuidance} from './biometric-guidance.mjs';
import {parseBiometricFields,optionalRecordGroup} from './diary-record-fields.mjs';
import {parseBiometricMetric} from './biometric-metrics.mjs';
import {assertDiaryDaysEditable} from './diary-day-status.mjs';
import {createBiometricLibrary,biometricCatalogDefinition,hasBiometricPair,parseCustomBiometrics} from './biometric-library.mjs';

const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export const biometricLogPacketKeys=['operationId','selection','unit','values','date','time','group'];
export function biometricLoggingFields(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||keys.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!keys.includes(key)))fail('Supply exactly the reviewed biometric logging fields.');}
function text(value,label,max){if(typeof value!=='string'||!value.trim()||value.length>max)fail(`${label} must be nonempty text up to ${max} characters.`);return value;}
export const biometricLogPacket=input=>Object.fromEntries(biometricLogPacketKeys.map(key=>[key,input[key]]));

/** The same owner projects warning codes and their canonical source text. */
export function biometricReviewWarnings(selection,{reuseDefinition=false}={}){
 const codes=['recorded-unit'];
 if(selection.kind==='catalog'){
  const catalog=biometricCatalogDefinition(selection.id);if(!catalog)fail('Choose a current biometric library item.');
  codes.push(catalog.source.code);
 }
 if(reuseDefinition)codes.push('reuse-definition');
 return {codes,warnings:codes.map(code=>biometricGuidance[code])};
}

/** Normalize the packet once, including key order used in the review digest. */
export function parseBiometricLog(state,input){
 biometricLoggingFields(input,biometricLogPacketKeys);if(typeof input.operationId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input.operationId))fail('Use a lowercase UUIDv4 logging operation ID.');
 text(input.unit,'Unit',30);if(typeof input.time!=='string')fail('Supply a time string, or an empty string for no time.');if(input.group!==null)text(input.group,'Diary group',100);
 const definitions=parseCustomBiometrics(state.settings?.customBiometrics??[]);let selection,type,unit,roles=['value'],definition=null;
 if(input.selection?.kind==='catalog'){
  biometricLoggingFields(input.selection,['kind','id']);const catalog=biometricCatalogDefinition(input.selection.id);if(!catalog)fail('Choose a current biometric library item.');selection={kind:'catalog',id:catalog.id};type=catalog.type;unit=input.unit.trim();
  if(catalog.id==='blood-pressure'){if(unit!=='mmHg')fail('Paired blood pressure uses mmHg.');roles=['systolic','diastolic'];}
  if(catalog.id==='sleep'&&unit==='hr:min')fail('hr:min is a display format. Enter a numeric duration in h, or choose another explicit numeric unit.');
 }else if(input.selection?.kind==='metric'){
  biometricLoggingFields(input.selection,['kind','type','unit']);const metric=parseBiometricMetric({kind:'biometric',type:input.selection.type,unit:input.selection.unit});if(metric.unit===null||input.unit!==metric.unit)fail('Keep the exact selected metric unit. Choose another metric to change its identity.');selection={kind:'metric',type:metric.type,unit:metric.unit};type=metric.type;unit=metric.unit;
 }else if(input.selection?.kind==='new-custom'){
  biometricLoggingFields(input.selection,['kind','name']);text(input.selection.name,'Custom name',100);selection={kind:'new-custom',name:input.selection.name};definition=parseCustomBiometrics([{name:selection.name.trim(),unit:input.unit.trim()}])[0];type=definition.name;unit=definition.unit;
 }else fail('Choose a catalog, exact metric or new custom definition.');
 biometricLoggingFields(input.values,roles);const values=Object.fromEntries(roles.map(role=>[role,input.values[role]])),packet={operationId:input.operationId,selection,unit:input.unit,values,date:input.date,time:input.time,group:input.group};
 const records=roles.map(role=>{const fields={date:packet.date,time:packet.time,type:roles.length===2?`${role} blood pressure`:type,unit,value:values[role],...(packet.group===null?{}:{group:packet.group})};return {id:`biometric:${packet.operationId}:${role}`,...parseBiometricFields(fields),...optionalRecordGroup(fields)};});
 if(!Array.isArray(state.biometrics))fail('Invalid biometric collection.');const definitionExists=definition&&definitions.some(row=>row.name===definition.name&&row.unit===definition.unit),newDefinition=definition&&!definitionExists?definition:null;
 return {packet,selection,type,unit,records,definitions,newDefinition,definitionExists,warnings:biometricReviewWarnings(selection).warnings};
}

/** Shared new-record checks; replay is owned by the persistent command boundary. */
export function reviewNewBiometricLog(state,parsed,options={}){
 const {packet,selection,type,unit,records,definitions,newDefinition,definitionExists}=parsed,library=createBiometricLibrary(state,options);
 if(packet.group!==null&&!library.groups.includes(packet.group))fail('The diary group changed. Reload the library.',409);
 if(selection.kind==='metric'&&!hasBiometricPair(library,type,unit))fail('This metric is no longer in the current library. Reload before logging.',409);
 assertDiaryDaysEditable(state,records.map(row=>row.date));
 if(state.biometrics.length+records.length>100000)fail('The biometric collection is full.');if(newDefinition&&definitions.length>=100)fail('The custom biometric definition collection is full.');
 return {operationId:packet.operationId,records,newDefinition,warnings:biometricReviewWarnings(selection,{reuseDefinition:!!definitionExists}).warnings,replayed:false,reviewFacts:{packet,records,newDefinition,groups:library.groups,definitions}};
}
export function prepareNewBiometricLog(state,input,options){return reviewNewBiometricLog(state,parseBiometricLog(state,input),options);}
