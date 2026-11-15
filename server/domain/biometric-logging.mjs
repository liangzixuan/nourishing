import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {captureLoggingRecords} from './logging-streaks.mjs';
import {createBiometricLibrary,parseCustomBiometrics} from './biometric-library.mjs';
import {biometricLogPacketKeys,biometricLoggingFields,biometricLogPacket,parseBiometricLog,reviewNewBiometricLog} from './biometric-log-fields.mjs';

const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function previewBiometricLog(state,input){
 const parsed=parseBiometricLog(state,input),{packet,selection,records,newDefinition,warnings}=parsed,prefix=`biometric:${packet.operationId}:`,existing=state.biometrics.filter(row=>typeof row.id==='string'&&row.id.startsWith(prefix));
 if(existing.length){
  const byId=new Map(existing.map(row=>[row.id,row]));if(existing.length!==records.length||byId.size!==existing.length||records.some(row=>!isDeepStrictEqual(row,byId.get(row.id)))||newDefinition)fail('This operation has changed or incomplete records. Reload and review the saved facts.',409);
  return {operationId:packet.operationId,reviewToken:digest({records,selection}),records,newDefinition:null,warnings,replayed:true};
 }
 const {reviewFacts,...review}=reviewNewBiometricLog(state,parsed);return {...review,reviewToken:digest(reviewFacts)};
}
function validateSave(input){
 biometricLoggingFields(input,[...biometricLogPacketKeys,'reviewToken','confirmed']);if(input.confirmed!==true||typeof input.reviewToken!=='string'||!/^[0-9a-f]{64}$/.test(input.reviewToken))fail('Confirm a current reviewed biometric log.');
 return biometricLogPacket(input);
}
export function applyBiometricLog(state,input,{allowReplay=true}={}){
 const prepared=previewBiometricLog(state,validateSave(input));
 if(prepared.replayed){if(!allowReplay)fail('These measurement IDs already exist without this offline operation receipt. Review the saved records.',409);return {operationId:prepared.operationId,records:prepared.records,newDefinition:null,replayed:true};}
 if(prepared.reviewToken!==input.reviewToken)fail('Metric definitions or diary groups changed. Preview again.',409);
 if(prepared.newDefinition)state.settings.customBiometrics=parseCustomBiometrics([...(state.settings.customBiometrics??[]),prepared.newDefinition]);state.biometrics.push(...prepared.records);
 return {operationId:prepared.operationId,records:structuredClone(prepared.records),newDefinition:prepared.newDefinition?{...prepared.newDefinition}:null,replayed:false};
}
export function createBiometricLogging({store,recordActivity}){
 return {
  library(){return createBiometricLibrary(store.read());},
  preview(input){return previewBiometricLog(store.read(),input);},
  save(input){const read=previewBiometricLog(store.read(),validateSave(input));if(read.replayed)return {operationId:read.operationId,records:read.records,newDefinition:null,replayed:true};let result;store.update(state=>{const before=recordActivity?captureLoggingRecords(state):null;result=applyBiometricLog(state,input);if(!result.replayed&&recordActivity)recordActivity(state,before,'biometric.add');});return result;}
 };
}
