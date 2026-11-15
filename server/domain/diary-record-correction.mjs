import {correctionWarningCodes} from './diary-correction-contract.mjs';
import {diaryDayComplete,completedDiaryMessage,assertDiaryDaysEditable} from './diary-day-status.mjs';
import {createHash} from 'node:crypto';
import {parseExerciseFields} from './diary-record-fields.mjs';
import {parseBiometricRecord,parseNoteRecord} from './workspace.mjs';

const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const digest=record=>createHash('sha256').update(JSON.stringify(record)).digest('hex');
const sourceReason='This record is linked to its source app. Correct it in that app, then import the updated record.';
function fields(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||keys.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!keys.includes(key)))fail('Supply only the required diary correction fields.');}
function identity(value){if(typeof value!=='string'||!value.trim()||value.length>1000)fail('Choose a valid diary record ID.');return value;}
function collection(value){if(!['notes','biometrics','entries'].includes(value))fail('Choose notes, biometrics or exercise entries.');return value;}
function revision(value){if(typeof value!=='string'||! /^[a-f0-9]{64}$/.test(value))fail('Reload the record before reviewing corrections.');return value;}
function lookup(state,input){
  const name=collection(input.collection),id=identity(input.id),rows=state[name];if(!Array.isArray(rows))fail('Invalid diary record collection.');
  let index=-1;
  for(let i=0;i<rows.length;i++)if(rows[i]?.id===id){if(index!==-1)fail('This record identity is duplicated. Resolve it before correcting the record.',409);index=i;}
  if(index===-1)fail('This diary record no longer exists.',404);
  if(name==='entries'&&rows[index].kind!=='exercise')fail('Choose an exercise entry.');
  return {collection:name,index,record:structuredClone(rows[index])};
}
const editable=(name,record)=>name==='notes'||!Object.hasOwn(record,'source');
function prepare(state,input){
  fields(input,['collection','id','revision','changes']);revision(input.revision);
  const selected=lookup(state,input),before=selected.record;
  if(digest(before)!==input.revision)fail('This record changed. Reload it and review your correction again.',409);
  if(!editable(selected.collection,before))fail(sourceReason,409);
  const exercise=selected.collection==='entries',biometric=selected.collection==='biometrics',keys=exercise?['date','time','name','duration','calories','group']:biometric?['date','time','type','value','unit']:['date','time','text'];if(!exercise&&input.changes&&Object.hasOwn(input.changes,'group'))keys.push('group');fields(input.changes,keys);
  if(typeof input.changes.time!=='string')fail('Supply a time string, or an empty string for no time.');
  if(biometric)for(const key of ['type','unit'])if(typeof input.changes[key]!=='string'||!input.changes[key].trim())fail('Supply an explicit biometric type and unit.');
  const normalized=exercise?parseExerciseFields(input.changes,state.settings.groups):(biometric?parseBiometricRecord:parseNoteRecord)(input.changes,state.settings.groups),after={...before,...normalized};
  assertDiaryDaysEditable(state,[before.date,after.date]);
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
