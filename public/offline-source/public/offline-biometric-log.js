import {diaryRecordErrorText} from './diary-record-errors.js';
import {formatMessage} from './../../report-source/public/message-format.js';
import {createBiometricLibrary,parseCustomBiometrics} from './../server/biometric-library.mjs';
import {biometricLogPacket,parseBiometricLog,prepareNewBiometricLog} from './../server/biometric-log-fields.mjs';

const message=(language,key)=>formatMessage(language,'measurementLog.offline.'+key);
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sameRecord=(a,b)=>a&&b&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>a[k]===b[k]);
export const isMeasurementLog=type=>type==='biometric.log';
export const measurementInputsReady=snapshot=>snapshot?.biometricInputsVersion===1&&Array.isArray(snapshot.biometricConfiguredPairs)&&Array.isArray(snapshot.state.settings.customBiometrics)&&Number.isSafeInteger(snapshot.operationWatermark)&&snapshot.operationWatermark>=0;
function options(snapshot,language='en'){if(!measurementInputsReady(snapshot))fail(message(language,'inputs'));return {configuredPairs:snapshot.biometricConfiguredPairs};}
export function offlineMeasurementLibrary(copy,state,language='en'){return createBiometricLibrary(state,options(copy.snapshot,language));}
export function prepareOfflineMeasurement(copy,state,packet,language='en'){
 const prefix=`biometric:${packet.operationId}:`;if(state.biometrics.some(row=>typeof row.id==='string'&&row.id.startsWith(prefix)))fail(message(language,'duplicate'));
 return prepareNewBiometricLog(state,packet,options(copy.snapshot,language));
}
export async function measurementReviewToken(reviewFacts){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(reviewFacts)));return [...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,'0')).join('');}
export function measurementPreviewResult(prepared,reviewToken){const {reviewFacts,...result}=prepared;return {...result,reviewToken};}
export function queuedMeasurementResult(copy,input,language='en'){
 const pending=copy.pending.find(p=>p.command.operationId===input.operationId);if(!pending)return null;
 if(!isMeasurementLog(pending.command.type))fail(message(language,'otherOperation'));
 const actual=parseBiometricLog(copy.snapshot.state,biometricLogPacket(input)).packet,expected=parseBiometricLog(copy.snapshot.state,biometricLogPacket({operationId:pending.command.operationId,...pending.command.payload})).packet;
 if(!same(actual,expected))fail(message(language,'differentOperation'));
 return {operationId:input.operationId,records:pending.preview.records,newDefinition:pending.preview.newDefinition,warnings:pending.preview.warnings,reviewToken:pending.command.payload.reviewToken,replayed:true};
}
export function projectMeasurementBatch(state,snapshot,pending,language='en'){
 if(!measurementInputsReady(snapshot))return message(language,'projectionInputs');
 if(pending.command.workspaceId!==snapshot.identity.workspaceId||pending.command.generation!==snapshot.identity.generation)return message(language,'earlierWorkspace');
 if(pending.preview.records.some(row=>state.biometrics.some(saved=>saved.id===row.id)))return message(language,'alreadyRecorded');
 if(pending.status==='unknown'&&pending.preview.savedAt!==snapshot.savedAt)return message(language,'refreshedUnknown');
 try{const prepared=prepareNewBiometricLog(state,biometricLogPacket({operationId:pending.command.operationId,...pending.command.payload}),options(snapshot,language));if(JSON.stringify(prepared.reviewFacts)!==pending.preview.reviewKey)return message(language,'projectionChanged');}catch(error){return diaryRecordErrorText(error,language);}
 state.biometrics.push(...pending.preview.records.map(row=>({...row,_pending:true})));
 if(pending.preview.newDefinition)state.settings.customBiometrics.push({...pending.preview.newDefinition});
 return null;
}
export function acceptMeasurementReceipt(current,pending,result,projectRecord,language='en'){
 const expected=pending.preview.records;
 if(result.operationId!==pending.command.operationId||!Array.isArray(result.records)||result.records.length!==expected.length||!result.records.every((row,index)=>sameRecord(row,expected[index]))||!same(result.newDefinition,pending.preview.newDefinition)||!Number.isSafeInteger(result.sequence)||result.sequence<1)throw Error(message(language,'receipt'));
 for(const row of result.records){const review=result.biometricReviews?.[row.id];if(!/^[a-f0-9]{64}$/.test(review?.revision)||typeof review.editable!=='boolean')throw Error(message(language,'receiptReview'));}
 // A fresh snapshot includes every operation up to its ledger watermark. An
 // earlier replay must not restore records or definitions deleted afterwards.
 if(result.sequence<=current.snapshot.operationWatermark)return;
 for(const row of result.records)if(!current.snapshot.state.biometrics.some(saved=>saved.id===row.id)){current.snapshot.state.biometrics.push(projectRecord('biometrics',row));current.snapshot.biometricReviews??={};current.snapshot.biometricReviews[row.id]=result.biometricReviews[row.id];}
 if(result.newDefinition&&!current.snapshot.state.settings.customBiometrics.some(row=>same(row,result.newDefinition)))current.snapshot.state.settings.customBiometrics=parseCustomBiometrics([...current.snapshot.state.settings.customBiometrics,result.newDefinition]);
}
