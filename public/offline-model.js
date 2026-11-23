import {diaryGroups} from './local-diary-projection.js';
import {applyWriteToState} from './write-projection.js';
import {offlineFailure} from './offline-errors.js';
import {prepareQuantityEdit,prepareFoodDetailsEdit,projectPendingFoodEdit,acceptFoodEditReceipt,isFoodEdit} from './offline-source/public/offline-quantity.js';
import {prepareRecordEdit,projectPendingRecord,acceptRecordReceipt,isRecordCorrection} from './offline-source/public/offline-record.js';
import {resolveFoodQuantity,parseServingAmount} from './report-source/server/food-quantity.mjs';
import {parseNoteFields,parseExerciseFields,parseBiometricFields,parseFoodDiaryFields,optionalRecordGroup,number,waterLimits} from './offline-source/server/diary-record-fields.mjs';
import {assertDiaryDaysEditable} from './report-source/server/diary-day-status.mjs';
import {prepareNewBiometricLog} from './offline-source/server/biometric-log-fields.mjs';
export {calculateSummary} from './report-source/server/nutrition.mjs';
export {createBiometricLibrary} from './offline-source/server/biometric-library.mjs';
export {prepareQuantityEdit,prepareFoodDetailsEdit,prepareRecordEdit};
const sourceCopy=copy=>({...copy,snapshot:{...copy.snapshot,mealInputsVersion:1,identity:{workspaceId:copy.ownerId,generation:copy.snapshot.identity.generation}},pending:copy.pending.map(row=>({...row,preview:row.preview??{},command:{...row.command,workspaceId:row.command.ownerId}}))});
export function offlineEffectiveState(copy){const adapted=sourceCopy(copy),state=structuredClone(copy.snapshot.state);state.settings.groups=diaryGroups(state.settings.groups);for(const row of adapted.pending){if(row.transport){if(!row.command.generation||row.command.generation===copy.snapshot.identity.generation)applyWriteToState(state,row);continue;}if(row.status==='conflict'||row.command.generation!==copy.snapshot.identity.generation||row.command.type==='entry.add'&&row.command.foodVersion!==copy.snapshot.foodVersions[row.command.payload.foodId])continue;if(isFoodEdit(row.command.type))projectPendingFoodEdit(state,adapted.snapshot,row);else if(isRecordCorrection(row.command.type))projectPendingRecord(state,adapted.snapshot,row);else if(row.preview.records){if(row.preview.newDefinition&&!state.settings.customBiometrics.some(item=>item.name===row.preview.newDefinition.name&&item.unit===row.preview.newDefinition.unit))state.settings.customBiometrics.push({...row.preview.newDefinition});for(const record of row.preview.records)if(!state.biometrics.some(r=>r.id===record.id))state.biometrics.push({...record,_pending:true});}else if(!state[row.preview.collection].some(r=>r.id===row.command.operationId))state[row.preview.collection].push({...row.preview.value,id:row.command.operationId,_pending:true});}return state;}
export function prepareOfflineAdd(copy,type,input){
 const state=offlineEffectiveState(copy);assertDiaryDaysEditable(state,[input.date]);
 if(type==='entry.add'){const food=state.foods.find(row=>row.id===input.foodId);if(!food||food.retired)throw offlineFailure('chooseFood');const common=parseFoodDiaryFields({date:input.date,time:input.time,group:input.group},state.settings.groups);if(input.quantity!==undefined)resolveFoodQuantity(food,input);else parseServingAmount(input.amount);return {payload:input,preview:{collection:'entries',value:{...input,...common,name:food.name,kind:'food'}},foodVersion:copy.snapshot.foodVersions[food.id]};}
 if(type==='note.add'){const value={...parseNoteFields(input),...optionalRecordGroup(input,state.settings.groups)};return {payload:input,preview:{collection:'notes',value}};}
 if(type==='exercise.add'){const value=parseExerciseFields(input,state.settings.groups);return {payload:{...input,confirmed:true},preview:{collection:'entries',value:{...value,kind:'exercise'}}};}
 if(type==='water.add'){const value=parseBiometricFields({date:input.date,time:input.time,type:'Water',unit:'mL',value:number(input.amount,'Water',waterLimits.minimumMl,waterLimits.maximumMl)});return {payload:input,preview:{collection:'biometrics',value:{...value,...optionalRecordGroup(input,state.settings.groups)}}};}
 throw offlineFailure('needsConnection');
}
export async function prepareOfflineBiometric(copy,packet){const prepared=prepareNewBiometricLog(offlineEffectiveState(copy),packet,{configuredPairs:copy.snapshot.biometricConfiguredPairs});const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(prepared.reviewFacts))),reviewToken=[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join(''),{operationId,...payload}=packet;return {operationId,payload:{...payload,reviewToken,confirmed:true},preview:{collection:'biometrics',records:prepared.records,newDefinition:prepared.newDefinition}};}
export function acceptOfflineReceipt(copy,pending,result,{snapshotRefreshed=false}={}){
 if(result.operationId!==pending.command.operationId)throw offlineFailure('receiptMismatch');
 if(result.replayed&&snapshotRefreshed){copy.pending=copy.pending.filter(row=>row.command.operationId!==pending.command.operationId);return copy;}
 // A retained baseline can predate a replayed receipt while a transport write
 // remains queued. Apply receipts idempotently, including replayed responses.
 const adapted=sourceCopy(copy),sourcePending=adapted.pending.find(row=>row.command.operationId===pending.command.operationId);
 if(isFoodEdit(pending.command.type))acceptFoodEditReceipt(adapted,sourcePending,result,(_collection,row)=>structuredClone(row));
 else if(isRecordCorrection(pending.command.type))acceptRecordReceipt(adapted,sourcePending,result,(_collection,row)=>structuredClone(row));
 else if(pending.command.type==='biometric.log'){
  if(!Array.isArray(result.records)||result.records.length!==pending.preview.records.length||result.records.some((row,index)=>row.id!==pending.preview.records[index].id))throw offlineFailure('measurementMismatch');
  for(const row of result.records)if(!adapted.snapshot.state.biometrics.some(r=>r.id===row.id)){
   adapted.snapshot.state.biometrics.push(structuredClone(row));adapted.snapshot.biometricReviews[row.id]=structuredClone(result.biometricReviews[row.id]);
  }
  if(result.newDefinition&&!adapted.snapshot.state.settings.customBiometrics.some(row=>row.name===result.newDefinition.name&&row.unit===result.newDefinition.unit))adapted.snapshot.state.settings.customBiometrics.push(structuredClone(result.newDefinition));
 }
 else{
  if(result.record?.collection!==pending.preview.collection||result.record?.value?.id!==pending.command.operationId)throw offlineFailure('receiptMismatch');
  const rows=adapted.snapshot.state[result.record.collection];
  // A refreshed snapshot can already include a newer correction. Its record
  // and review version must stay together when an older add receipt replays.
  if(!rows.some(row=>row.id===result.record.value.id)){
   rows.push(structuredClone(result.record.value));
   for(const [key,review]of [['noteReviews',result.noteReview],['biometricReviews',result.biometricReview],['exerciseReviews',result.exerciseReview]])if(review)adapted.snapshot[key][result.record.value.id]=structuredClone(review);
  }
 }
 copy.snapshot={...adapted.snapshot,identity:copy.snapshot.identity};delete copy.snapshot.mealInputsVersion;copy.pending=copy.pending.filter(row=>row.command.operationId!==pending.command.operationId);return copy;
}
