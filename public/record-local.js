import {catalogExerciseRecord,resolveExerciseWeight,prepareDiaryRecordUpdate,manuallyEditableRecord,sourceRecordReason} from './local-diary-projection.js';
import {request,queueCommand} from './diary-api.js';
import {readDeviceCache} from './device-cache.js';
import {offlineCopy,queueOffline,currentPrivateResponseTicket} from './offline-store.js';
import {offlineEffectiveState,prepareOfflineAdd,prepareOfflineBiometric,createBiometricLibrary} from './offline-model.js';
import {biometricEntryForPair} from './offline-source/server/biometric-library.mjs';
import {exerciseLimits} from './offline-source/server/diary-record-fields.mjs';
import {diaryDayComplete,assertDiaryDaysEditable} from './report-source/server/diary-day-status.mjs';
import {flushBackgroundWrites} from './background-writes.js';

async function localCopy(ticket){if(!ticket)return null;const copy=await offlineCopy();return copy&&!copy.locked&&copy.ownerId===ticket.ownerId&&copy.ticket.epoch===ticket.epoch?copy:null;}
export async function recordEditorData(date,collection,id,signal){
 const {ticket}=await readDeviceCache('/api/diary'),copy=await localCopy(ticket);
 if(!copy)return Promise.all([request('/api/records/options?'+new URLSearchParams({date}),null,signal),id?request('/api/records/item?'+new URLSearchParams({collection,id}),null,signal):null,ticket]);
 const state=offlineEffectiveState(copy);
 const options={revision:copy.snapshot.revision,date,energyUnit:state.settings.energyUnit??'kcal',groups:[...state.settings.groups],exerciseLimits,biometrics:createBiometricLibrary(state,{configuredPairs:copy.snapshot.biometricConfiguredPairs}),exerciseWeight:resolveExerciseWeight(state,date)};
 if(!id)return [options,null,ticket];
 const record=state[collection]?.find(row=>row.id===(copy.recordIds?.[id]??id));
 if(!record)throw Error('This record is no longer available.');
 const completed=diaryDayComplete(state,record.date),editable=!completed&&manuallyEditableRecord(collection,record);
 return [options,{record,editable,reason:completed?'Reopen this diary day before editing.':editable?null:sourceRecordReason,revision:options.revision,deletable:!completed,...(collection==='biometrics'?{biometricChoice:biometricEntryForPair(options.biometrics,record.type,record.unit)}:{})},ticket];
}

/** Validate local fields and persist each intent before closing the editor. */
export async function saveRecordCommand(revision,type,payload,{ticket,activity}={}){
 ticket??=(await readDeviceCache('/api/diary')).ticket;
 if(ticket&&!await currentPrivateResponseTicket(ticket))throw Error('The active account changed. Reopen the editor.');
 const copy=await localCopy(ticket);let prepared;
 if(copy&&type==='exercise.catalog.add'){
  const state=offlineEffectiveState(copy);
  assertDiaryDaysEditable(state,[payload.date]);
  const entry=catalogExerciseRecord(state,payload,activity);
  return queueCommand(revision,type,payload,{ticket,projection:{entries:[entry]}});
 }
 if(type==='record.correct'){
  if(copy)prepareDiaryRecordUpdate(offlineEffectiveState(copy),{...payload,id:copy.recordIds?.[payload.id]??payload.id},activity);
  return queueCommand(revision,type,payload,{ticket,projection:payload.changes?.code&&activity?{exerciseActivity:activity}:{}});
 }
 if(copy){
  if(type==='biometric.log')prepared=await prepareOfflineBiometric(copy,{operationId:crypto.randomUUID(),...payload});
  else if(['exercise.add','note.add','water.add'].includes(type))prepared=prepareOfflineAdd(copy,type,payload);
 }
 if(!prepared)return queueCommand(revision,type,payload,{ticket});
 await queueOffline(copy,prepared.type??type,prepared.payload,prepared.preview,prepared.foodVersion,prepared.operationId);
 window.dispatchEvent(new Event('nourishing-local-changed'));void flushBackgroundWrites().catch(()=>{});
 return {ok:true,queued:true};
}
