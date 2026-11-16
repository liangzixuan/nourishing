import {randomUUID} from 'node:crypto';
import {act} from './domain/workspace.mjs';
import {prepareNewBiometricLog} from './domain/biometric-log-fields.mjs';
import {applyDiaryRecordCorrection} from './domain/diary-record-correction.mjs';
import {parseCustomBiometrics} from './domain/biometric-library.mjs';

export const recordCommandFields=Object.freeze({
 'water.add':['date','time','amount'],
 'exercise.add':['date','time','group','name','duration','calories'],
 'exercise.catalog.add':['date','time','group','code','duration','weightKg','useEstimate','calories'],
 'biometric.log':['selection','unit','values','date','time','group'],
 'biometric.delete':['id'],
 'record.correct':['collection','id','recordRevision','changes']
});
const invalid=message=>{throw Object.assign(Error(message),{status:400});};
/** Called inside the shared workspace transaction; the workspace revision owns concurrency. */
export function applyRecordCommand(state,{type,payload}){
 if(!Object.hasOwn(recordCommandFields,type))return {handled:false};
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).some(key=>!recordCommandFields[type].includes(key)))invalid('Invalid diary record fields.');
 if(type==='biometric.log'){
  const prepared=prepareNewBiometricLog(state,{operationId:randomUUID(),...payload});
  if(prepared.newDefinition)state.settings.customBiometrics=parseCustomBiometrics([...(state.settings.customBiometrics??[]),prepared.newDefinition]);
  state.biometrics.push(...prepared.records);
  return {handled:true,result:{kind:'biometric',id:prepared.records[0].id}};
 }
 if(type==='record.correct'){
  const result=applyDiaryRecordCorrection(state,{collection:payload.collection,id:payload.id,revision:payload.recordRevision,changes:payload.changes,confirmed:true});
  return {handled:true,result:{kind:payload.collection==='entries'?'exercise':payload.collection==='notes'?'note':'biometric',id:result.record.id}};
 }
 act(state,type,payload);return {handled:true};
}
