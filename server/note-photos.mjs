import {randomUUID} from 'node:crypto';
import {normalizePhoto} from './domain/photo-images.mjs';
import {parseNoteRecord} from './domain/workspace.mjs';
import {applyDiaryRecordCorrection} from './domain/diary-record-correction.mjs';
import {assertDiaryDaysEditable} from './domain/diary-day-status.mjs';

export const NOTE_MEDIA_NAMESPACE='note_photos';
export const notePhotoCommandFields=Object.freeze({'note.photo.save':['id','recordRevision','fields','photo']});
const fail=(message,code=400)=>{throw Object.assign(Error(message),{code,publicMessage:message});};
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function fields(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))fail('Invalid note fields.');}
function source(operation){try{return operation();}catch(error){if([400,404,409,507].includes(error.status))throw Object.assign(error,{code:error.status,publicMessage:error.message});throw error;}}

/** Source normalization strips metadata. A prepared photo is not a persisted attachment. */
export async function prepareNotePhoto(input){
 fields(input,['dataUrl']);let photo;
 try{photo=await normalizePhoto(input.dataUrl);}catch(error){if([400,503].includes(error.status))throw Object.assign(error,{code:error.status,publicMessage:error.message});throw error;}
 return {photo:{id:photo.id,dataUrl:photo.dataUrl}};
}
export function validateNotePhotoAction({type,payload}){
 if(type!=='note.photo.save')fail('Invalid note action.');fields(payload,notePhotoCommandFields[type]);
 if(payload.id===null){if(payload.recordRevision!==null)fail('Start a new note.');}
 else if(typeof payload.id!=='string'||!payload.id.trim()||payload.id.length>1000||!hash(payload.recordRevision))fail('Reload this note before saving.');
 fields(payload.fields,['date','time','text','group']);
 if(typeof payload.fields.time!=='string')fail('Choose a time, or leave it empty.');
 const mode=payload.photo?.mode;if(!['keep','remove','replace'].includes(mode))fail('Choose whether to keep, remove or replace the photo.');
 fields(payload.photo,mode==='replace'?['mode','id']:['mode']);
 if(mode==='replace'&&!hash(payload.photo.id))fail('Choose a valid note photo.');
 return payload;
}

/** Runs within the shared revision-guarded workspace transaction; photo is validateStoredPhoto output. */
export function applyNotePhotoCommand(state,action,{photo}={}){
 if(!Object.hasOwn(notePhotoCommandFields,action.type))return {handled:false};
 const input=validateNotePhotoAction(action);
 if(input.photo.mode==='replace'&&(!photo||photo.id!==input.photo.id||photo.mime!=='image/jpeg'||!Buffer.isBuffer(photo.bytes)))fail('Choose a valid normalized note photo.');
 let note;
 if(input.id===null){
  if(state.notes.length>=100000)fail('The workspace note limit has been reached.',507);
  note={...source(()=>parseNoteRecord(input.fields,state.settings.groups)),id:randomUUID()};
  source(()=>assertDiaryDaysEditable(state,[note.date]));
  state.notes.push(note);
 }else{
  // The source correction owner preserves photo, copy lineage and all immutable source facts.
  const result=source(()=>applyDiaryRecordCorrection(state,{collection:'notes',id:input.id,revision:input.recordRevision,changes:input.fields,confirmed:true}));
  note=state.notes.find(row=>row.id===result.record.id);
 }
 if(input.photo.mode==='replace')note.imageId=photo.id;
 if(input.photo.mode==='remove')delete note.imageId;
 return {handled:true,result:{kind:'note',id:note.id}};
}
