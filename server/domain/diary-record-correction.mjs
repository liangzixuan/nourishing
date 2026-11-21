import {correctionWarningCodes} from './diary-correction-contract.mjs';
import {diaryDayComplete,completedDiaryMessage} from './diary-day-status.mjs';
import {createHash} from 'node:crypto';
import {selectDiaryRecord as lookup,prepareDiaryRecordUpdate,manuallyEditableRecord as editable,sourceRecordReason as sourceReason} from './diary-record-update.mjs';

const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const digest=record=>createHash('sha256').update(JSON.stringify(record)).digest('hex');
function fields(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||keys.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!keys.includes(key)))fail('Supply only the required diary correction fields.');}
function identity(value){if(typeof value!=='string'||!value.trim()||value.length>1000)fail('Choose a valid diary record ID.');return value;}
function collection(value){if(!['notes','biometrics','entries'].includes(value))fail('Choose notes, biometrics or exercise entries.');return value;}
function revision(value){if(typeof value!=='string'||! /^[a-f0-9]{64}$/.test(value))fail('Reload the record before reviewing corrections.');return value;}
function prepare(state,input){
  fields(input,['collection','id','revision','changes']);revision(input.revision);
  const selected=lookup(state,input),before=selected.record;
  if(digest(before)!==input.revision)fail('This record changed. Reload it and review your correction again.',409);
  const {after}=prepareDiaryRecordUpdate(state,input);
  const warningCodes=correctionWarningCodes(selected.collection,before,after);
  return {...selected,before,after,revision:input.revision,afterRevision:digest(after),warningCodes};
}
function recordView(state,name,record){const complete=diaryDayComplete(state,record.date),allowed=!complete&&editable(name,record);return {revision:digest(record),editable:allowed,reason:allowed?null:complete?completedDiaryMessage(record.date):sourceReason};}
export function readDiaryRecordCorrection(state,input){
  fields(input,['collection','id']);const selected=lookup(state,input);return {collection:selected.collection,record:selected.record,...recordView(state,selected.collection,selected.record)};
}
export function readDiaryRecordReviews(state,name){
  collection(name);const reviews=Object.create(null),counts=new Map();
  for(const row of state[name])if(typeof row?.id==='string')counts.set(row.id,(counts.get(row.id)??0)+1);
  for(const row of state[name]){
    // An unidentifiable row stays in the snapshot, without an invented editable ID.
    const id=row?.id;if(typeof id!=='string')continue;
    if(name==='entries'&&row.kind!=='exercise')continue;
    try{identity(id);reviews[id]=counts.get(id)>1?{error:'This record identity is duplicated. Resolve it before correcting the record.'}:recordView(state,name,row);}
    catch(error){if(![400,409].includes(error.status))throw error;reviews[id]={error:error.message};}
  }
  return reviews;
}
export function applyDiaryRecordCorrection(state,input){
  fields(input,['collection','id','revision','changes','confirmed']);if(input.confirmed!==true)fail('Confirm the reviewed diary correction.');
  const checked=prepare(state,{collection:input.collection,id:input.id,revision:input.revision,changes:input.changes});
  state[checked.collection][checked.index]=checked.after;
  return {collection:checked.collection,record:structuredClone(checked.after),revision:checked.afterRevision};
}
export function createDiaryRecordCorrection({store}){
  return {
    record:input=>readDiaryRecordCorrection(store.read(),input),
    preview(input){const {collection,before,after,revision,afterRevision,warningCodes}=prepare(store.read(),input);return {collection,before,after,revision,afterRevision,warningCodes};},
    save(input){let result;store.update(state=>{result=applyDiaryRecordCorrection(state,input);});return result;}
  };
}
