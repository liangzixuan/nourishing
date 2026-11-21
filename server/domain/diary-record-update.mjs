import {parseExerciseFields,parseBiometricFields,parseNoteFields,optionalRecordGroup} from './diary-record-fields.mjs';
import {assertDiaryDaysEditable} from './diary-day-status.mjs';
import {correctedCatalogExercise} from './catalog-exercise.mjs';

const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
export const sourceRecordReason='This record is linked to its source app. Correct it in that app, then import the updated record.';
export const manuallyEditableRecord=(collection,record)=>collection==='notes'||!Object.hasOwn(record,'source');
export function selectDiaryRecord(state,{collection,id}){
 if(!['notes','biometrics','entries'].includes(collection))fail('Choose notes, biometrics or exercise entries.');
 if(typeof id!=='string'||!id.trim()||id.length>1000)fail('Choose a valid diary record ID.');
 const rows=state[collection];if(!Array.isArray(rows))fail('Invalid diary record collection.');
 const index=rows.findIndex(row=>row?.id===id);
 if(index===-1)fail('This diary record no longer exists.',404);
 if(rows.some((row,i)=>i!==index&&row?.id===id))fail('This record identity is duplicated.',409);
 if(collection==='entries'&&rows[index].kind!=='exercise')fail('Choose an exercise entry.');
 return {collection,index,record:structuredClone(rows[index])};
}
/** Normalize once for local projection and the serialized server transaction. */
export function prepareDiaryRecordUpdate(state,{collection,id,changes},activity){
 const selected=selectDiaryRecord(state,{collection,id}),before=selected.record;
 if(!manuallyEditableRecord(collection,before))fail(sourceRecordReason,409);
 const exercise=collection==='entries',biometric=collection==='biometrics';
 if(exercise&&changes&&Object.hasOwn(changes,'code')){
  const after={...before,...correctedCatalogExercise(before,changes,state.settings.groups,activity)};
  assertDiaryDaysEditable(state,[before.date,after.date]);
  return {...selected,before,after};
 }
 const keys=exercise?['date','time','name','duration','calories','group']:biometric?['date','time','type','value','unit']:['date','time','text'];
 if(!exercise&&changes&&Object.hasOwn(changes,'group'))keys.push('group');
 if(!changes||typeof changes!=='object'||Array.isArray(changes)||keys.some(key=>!Object.hasOwn(changes,key))||Object.keys(changes).some(key=>!keys.includes(key)))fail('Supply only the required diary correction fields.');
 if(typeof changes.time!=='string')fail('Supply a time string, or an empty string for no time.');
 if(biometric)for(const key of ['type','unit'])if(typeof changes[key]!=='string'||!changes[key].trim())fail('Supply an explicit biometric type and unit.');
 const normalized=exercise?parseExerciseFields(changes,state.settings.groups):{...(biometric?parseBiometricFields:parseNoteFields)(changes),...optionalRecordGroup(changes,state.settings.groups)};
 const after={...before,...normalized};
 if(exercise&&before.exerciseSelection)after.exerciseSelection={...before.exerciseSelection,useEstimate:false};
 assertDiaryDaysEditable(state,[before.date,after.date]);
 return {...selected,before,after};
}
export function applyDiaryRecordUpdate(state,input,activity){
 const update=prepareDiaryRecordUpdate(state,input,activity);
 state[update.collection][update.index]=update.after;
 return {collection:update.collection,record:structuredClone(update.after)};
}
