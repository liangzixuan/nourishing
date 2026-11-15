import {formatMessage} from './../../report-source/public/message-format.js';
const message=(language,key)=>formatMessage(language,'offlineCorrection.'+key);
import {foodEditAvailable,prepareFoodDetailsEdit} from './offline-quantity.js';
import {parseNoteFields,parseBiometricFields,parseExerciseFields,optionalRecordGroup} from './../server/diary-record-fields.mjs';
import {assertDiaryDaysEditable,diaryDayComplete} from './../../report-source/server/diary-day-status.mjs';

const definitions={entries:{type:'exercise.correct',reviews:'exerciseReviews',receipt:'exerciseReview',parse:parseExerciseFields},notes:{type:'note.correct',reviews:'noteReviews',receipt:'noteReview',parse:parseNoteFields},biometrics:{type:'biometric.correct',reviews:'biometricReviews',receipt:'biometricReview',parse:parseBiometricFields}};
function definition(collection,language='en'){if(!Object.hasOwn(definitions,collection))throw Error(message(language,'recordRequired'));return definitions[collection];}
export const isRecordCorrection=type=>type==='exercise.correct'||type==='note.correct'||type==='biometric.correct';
const exerciseRecord=(snapshot,collection,id)=>collection==='entries'&&snapshot.state.entries.find(row=>row.id===id)?.kind==='exercise';
export const recordReviews=(snapshot,collection,id)=>collection==='entries'&&!exerciseRecord(snapshot,collection,id)?snapshot.quantityReviews:snapshot[definition(collection).reviews];
export function recordEditAvailable(copy,collection,id){
 if(collection==='entries'&&!exerciseRecord(copy.snapshot,collection,id))return foodEditAvailable(copy,id);
 const review=recordReviews(copy.snapshot,collection,id)?.[id],row=copy.snapshot.state[collection].find(row=>row.id===id);
 return Boolean(row&&!diaryDayComplete(copy.snapshot.state,row.date)&&review?.editable===true&&/^[a-f0-9]{64}$/.test(review.revision)&&!copy.pending.some(p=>p.preview.collection===collection&&(p.preview.records?.some(row=>row.id===id)||(isRecordCorrection(p.command.type)?p.command.payload.id:p.command.operationId)===id)));
}
export function prepareRecordEdit(copy,collection,id,changes,language='en'){
 if(collection==='entries'&&!exerciseRecord(copy.snapshot,collection,id))return prepareFoodDetailsEdit(copy,id,changes,language);
 const config=definition(collection,language);
 if(!recordEditAvailable(copy,collection,id))throw Error(message(language,'unavailable'));
 if(collection==='biometrics')for(const key of ['type','unit'])if(typeof changes[key]!=='string'||!changes[key].trim())throw Error(message(language,'metricRequired'));
 const row=copy.snapshot.state[collection].find(row=>row.id===id),normalized=collection==='entries'?parseExerciseFields(changes,copy.snapshot.state.settings.groups):{...config.parse(changes),...optionalRecordGroup(changes,copy.snapshot.state.settings.groups)};
 assertDiaryDaysEditable(copy.snapshot.state,[row.date,normalized.date]);
 return {type:config.type,payload:{collection,id,revision:recordReviews(copy.snapshot,collection,id)[id].revision,changes:collection==='entries'?{date:normalized.date,time:normalized.time,group:normalized.group,name:normalized.name,duration:normalized.duration,calories:normalized.caloriesBurned}:normalized,confirmed:true},preview:{collection,value:{...row,...normalized}}};
}
export function recordPreviewAvailable(snapshot,pending){
 if(pending.command.workspaceId!==snapshot.identity.workspaceId||pending.command.generation!==snapshot.identity.generation)return false;
 const {collection,id,revision,changes}=pending.command.payload;
 if(recordReviews(snapshot,collection,id)?.[id]?.revision!==revision)return false;
 const row=snapshot.state[collection].find(row=>row.id===id);if(!row)return false;
 try{optionalRecordGroup(changes,snapshot.state.settings.groups);assertDiaryDaysEditable(snapshot.state,[row.date,changes.date]);}catch{return false;}
 return true;
}
export function projectPendingRecord(state,snapshot,pending){
 const {collection,id,revision}=pending.command.payload;
 if(!recordPreviewAvailable(snapshot,pending))return;
 const index=state[collection].findIndex(row=>row.id===id);if(index>=0)state[collection][index]={...pending.preview.value,_pending:true};
}
export function acceptRecordReceipt(current,pending,result,projectRecord,language='en'){
 const {collection,id,revision}=pending.command.payload,config=definition(collection,language),review=result[config.receipt];
 if(result.record?.collection!==collection||result.record.value?.id!==id||!/^[a-f0-9]{64}$/.test(review?.revision)||typeof review.editable!=='boolean')throw Error(message(language,'receipt'));
 if(collection==='entries'&&Object.keys(pending.preview.value).some(key=>pending.preview.value[key]!==result.record.value[key]))throw Error(message(language,'exerciseReceipt'));
 if(recordReviews(current.snapshot,collection,id)?.[id]?.revision!==revision)return;
 const index=current.snapshot.state[collection].findIndex(row=>row.id===id);if(index<0)return;
 current.snapshot.state[collection][index]=projectRecord(collection,result.record.value);current.snapshot[config.reviews][id]=review;
}
