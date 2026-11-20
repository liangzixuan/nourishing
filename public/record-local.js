import {request,queueCommand} from './diary-api.js';
import {readDeviceCache} from './device-cache.js';
import {offlineCopy,queueOffline} from './offline-store.js';
import {offlineEffectiveState,prepareOfflineAdd,prepareOfflineEdit,prepareOfflineBiometric,createBiometricLibrary} from './offline-model.js';
import {biometricEntryForPair} from './offline-source/server/biometric-library.mjs';
import {exerciseLimits} from './offline-source/server/diary-record-fields.mjs';
import {diaryDayComplete} from './report-source/server/diary-day-status.mjs';
import {flushBackgroundWrites} from './background-writes.js';

async function localCopy(){const {ticket}=await readDeviceCache('/api/diary');if(!ticket)return null;const copy=await offlineCopy();return copy&&!copy.locked&&copy.snapshot&&copy.ownerId===ticket.ownerId?copy:null;}
export async function recordEditorData(date,collection,id,signal){
 const copy=await localCopy();
 if(!copy)return Promise.all([request('/api/records/options?'+new URLSearchParams({date}),null,signal),id?request('/api/records/item?'+new URLSearchParams({collection,id}),null,signal):null]);
 const state=offlineEffectiveState(copy),cached=await readDeviceCache('/api/records/options?'+new URLSearchParams({date})),diary=await readDeviceCache('/api/diary?'+new URLSearchParams({date}));
 const options={...cached.value,revision:cached.value?.revision??diary.value?.revision,date,energyUnit:state.settings.energyUnit??'kcal',groups:[...state.settings.groups],exerciseLimits,biometrics:createBiometricLibrary(state,{configuredPairs:copy.snapshot.biometricConfiguredPairs}),exerciseWeight:cached.value?.exerciseWeight??{status:'unknown',kilograms:null,source:null}};
 if(!id)return [options,null];
 const record=state[collection]?.find(row=>row.id===id),reviews={notes:'noteReviews',biometrics:'biometricReviews',entries:'exerciseReviews'},review=copy.snapshot[reviews[collection]]?.[id];
 if(!record)throw Error('This record is no longer available.');
 const completed=diaryDayComplete(state,record.date),pending=copy.pending.some(row=>row.command.payload.id===id||row.command.operationId===id||row.preview?.records?.some(item=>item.id===id));
 if(!review&&!pending&&navigator.onLine!==false)return [options,await request('/api/records/item?'+new URLSearchParams({collection,id}),null,signal,{fresh:true})];
 const editable=Boolean(review?.editable&&!completed&&!pending);
 return [options,{record,editable,reason:completed?'Reopen this diary day before editing.':pending?'This change is waiting to sync.':review?.reason,recordRevision:review?.revision,revision:options.revision,deletable:!completed&&!pending,...(collection==='biometrics'?{biometricChoice:biometricEntryForPair(options.biometrics,record.type,record.unit)}:{})}];
}

/** Persist the existing reviewed offline contract into the shared account outbox. */
export async function saveRecordCommand(revision,type,payload){
 const copy=await localCopy();let prepared;
 if(copy){
  if(type==='record.correct')prepared=prepareOfflineEdit(copy,payload.collection,payload.id,payload.changes);
  else if(type==='biometric.log')prepared=await prepareOfflineBiometric(copy,{operationId:crypto.randomUUID(),...payload});
  else if(['exercise.add','note.add','water.add'].includes(type))prepared=prepareOfflineAdd(copy,type,payload);
 }
 if(!prepared)return queueCommand(revision,type,payload);
 await queueOffline(copy,prepared.type??type,prepared.payload,prepared.preview,prepared.foodVersion,prepared.operationId);
 window.dispatchEvent(new Event('nourishing-local-changed'));void flushBackgroundWrites().catch(()=>{});
 return {ok:true,queued:true};
}
