import {captureSnapshotMeasurements,parseMeasurementCapture,retainMeasurementCapture} from './progress-measurements.mjs';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {normalizePhoto,validateStoredPhoto} from './photo-images.mjs';
import {bodyMassIndex} from './body-composition.mjs';

const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const editableKeys=['date','title','note','vitals','time'];
const recordKeys=['id','imageId','createdAt','measurementCapture',...editableKeys];
export const PROGRESS_RETENTION='Deleting removes the photo from your timeline. Recovery snapshots and local or T7 backups can retain the image and its saved details.';

function object(value,keys,label){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))fail(`${label} contains unsupported fields or is not an object.`);
}
function finite(value,label,min,max,{exclusiveMinimum=false,integer=false}={}){
  if(typeof value!=='number'||!Number.isFinite(value)||(exclusiveMinimum?value<=min:value<min)||value>max||(integer&&!Number.isInteger(value)))fail(`${label} must be a finite ${integer?'whole ':''}number ${exclusiveMinimum?'greater than':'from'} ${min} to ${max}.`);
  return value;
}
function measurement(value,units,factors,maximum,label){
  object(value,['value','unit'],label);
  if(!units.includes(value.unit))fail(`${label} has an unsupported unit.`);
  finite(value.value,label,0,maximum/factors[value.unit],{exclusiveMinimum:true});
  return {value:value.value,unit:value.unit};
}
function parseVitals(value){
  object(value,['age','weight','height','bodyFat'],'Snapshot measurements');
  const result={};
  if(Object.hasOwn(value,'age'))result.age=finite(value.age,'Age',0,150,{integer:true});
  if(Object.hasOwn(value,'weight'))result.weight=measurement(value.weight,['kg','lb'],{kg:1,lb:0.45359237},1000,'Weight');
  if(Object.hasOwn(value,'height'))result.height=measurement(value.height,['cm','in'],{cm:1,in:2.54},300,'Height');
  if(Object.hasOwn(value,'bodyFat'))result.bodyFat=finite(value.bodyFat,'Body fat',0,100);
  return result;
}
function parseEditable(value){
  const parsedDate=typeof value.date==='string'?new Date(`${value.date}T12:00:00Z`):null;
  if(typeof value.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value.date)||!Number.isFinite(parsedDate.valueOf())||parsedDate.toISOString().slice(0,10)!==value.date)fail('Use a valid YYYY-MM-DD snapshot date.');
  for(const [key,max]of [['title',200],['note',10000]])if(typeof value[key]!=='string'||value[key].length>max)fail(`Snapshot ${key} must be text up to ${max} characters.`);
  const result={date:value.date,title:value.title,note:value.note,vitals:parseVitals(value.vitals)};
  if(Object.hasOwn(value,'time')){
    if(typeof value.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time))fail('Use a valid HH:MM snapshot time, or omit it when unknown.');
    result.time=value.time;
  }
  return result;
}
export function parseProgressSnapshot(value){
  object(value,recordKeys,'Progress snapshot');
  if(typeof value.id!=='string'||!uuid.test(value.id))fail('Snapshot ID must be a lowercase UUID v4.');
  if(typeof value.imageId!=='string'||!/^[a-f0-9]{64}$/.test(value.imageId))fail('Snapshot image ID must be a SHA-256 digest.');
  const created=new Date(value.createdAt);
  if(typeof value.createdAt!=='string'||!Number.isFinite(created.valueOf())||created.toISOString()!==value.createdAt)fail('Snapshot creation time must be an ISO UTC timestamp.');
  const metadata=parseEditable(value);
  return {id:value.id,imageId:value.imageId,createdAt:value.createdAt,...metadata,...(Object.hasOwn(value,'measurementCapture')?{measurementCapture:parseMeasurementCapture(value.measurementCapture,metadata.vitals)}:{})};
}
function records(value,label){
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>100000)fail(`${label} must contain at most 100000 progress snapshots.`);
  const seen=new Set();
  return value.map(row=>{const parsed=parseProgressSnapshot(row);if(seen.has(parsed.id))fail(`${label} contains duplicate progress snapshot IDs.`);seen.add(parsed.id);return parsed;});
}
export function mergeProgressSnapshots(current,incoming){
  const result=records(current,'Workspace'),byId=new Map(result.map(row=>[row.id,row]));
  for(const row of records(incoming,'Import')){
    const existing=byId.get(row.id);
    if(existing){if(!isDeepStrictEqual(existing,row))fail('A progress snapshot with this ID has different saved details. Resolve the conflicting snapshot before importing.',409);}
    else{result.push(row);byId.set(row.id,row);}
  }
  if(result.length>100000)fail('The merged workspace exceeds 100000 progress snapshots.');
  return result;
}
function view(record){
  const result=structuredClone(record),{weight,height}=record.vitals;
  if(weight&&height){
    const kilograms=weight.value*(weight.unit==='lb'?0.45359237:1),centimetres=height.value*(height.unit==='in'?2.54:1),bmi=bodyMassIndex(kilograms,centimetres);
    if(bmi!==null)result.bmi=Number(bmi.toFixed(2));
  }
  return result;
}
function find(state,id){
  if(typeof id!=='string'||!uuid.test(id))fail('Progress snapshot not found.',404);
  const row=(state.progressSnapshots??[]).find(row=>row.id===id);
  if(!row)fail('Progress snapshot not found.',404);
  return parseProgressSnapshot(row);
}
const descending=(a,b)=>a===b?0:a>b?-1:1;

export function createProgressSnapshots({store,photoStore,now=()=>new Date()}){
  if(typeof now!=='function')throw new Error('Progress snapshot clock must be a function.');
  async function preview(input){
    object(input,['dataUrl','captureMeasurements',...editableKeys],'Progress photo preview');
    const automatic=Object.hasOwn(input,'captureMeasurements');
    if(automatic&&(input.captureMeasurements!==true||Object.hasOwn(input,'vitals')))fail('Choose automatic capture or explicit snapshot measurements.');
    const metadata=parseEditable({...input,vitals:automatic?{}:input.vitals});
    const captured=automatic?captureSnapshotMeasurements(store.read(),metadata.date):{};
    const photo=await normalizePhoto(input.dataUrl),clock=now();
    if(!(clock instanceof Date)||!Number.isFinite(clock.valueOf()))fail('The snapshot clock is unavailable.',503);
    const draft=parseProgressSnapshot({id:randomUUID(),imageId:photo.id,createdAt:clock.toISOString(),...metadata,...captured});
    return {draft,dataUrl:photo.dataUrl,width:photo.width,height:photo.height};
  }
  async function create(input){
    object(input,['snapshot','dataUrl'],'Progress photo save');
    const record=parseProgressSnapshot(input.snapshot),photo=await validateStoredPhoto({id:record.imageId,dataUrl:input.dataUrl});
    store.update(state=>{
      state.progressSnapshots=mergeProgressSnapshots(state.progressSnapshots,[record]);
      photoStore.put(photo);
      photoStore.verifyReferences(state);
    });
    return {snapshot:view(record)};
  }
  function update(id,input){
    object(input,editableKeys,'Progress snapshot edit');const metadata=parseEditable(input);let record;
    store.update(state=>{
      const existing=find(state,id);
      const measurementCapture=retainMeasurementCapture(existing,metadata.vitals);
      record=parseProgressSnapshot({id:existing.id,imageId:existing.imageId,createdAt:existing.createdAt,...metadata,...(measurementCapture?{measurementCapture}:{})});
      state.progressSnapshots=state.progressSnapshots.map(row=>row.id===id?record:row);
      photoStore.verifyReferences(state);
    });
    return {snapshot:view(record)};
  }
  function remove(id){
    let recoverySnapshotId;
    store.update(state=>{
      find(state,id);
      recoverySnapshotId=store.retainSnapshot(state);
      state.progressSnapshots=state.progressSnapshots.filter(row=>row.id!==id);
    });
    return {recoverySnapshotId};
  }
  function list(){
    const snapshots=records(store.read().progressSnapshots,'Workspace').sort((a,b)=>descending(a.date,b.date)||descending(a.time??'',b.time??'')||descending(a.createdAt,b.createdAt)||descending(a.id,b.id)).map(view);
    return {snapshots,retention:PROGRESS_RETENTION};
  }
  function image(id){
    const snapshot=find(store.read(),id),photo=photoStore.get(snapshot.imageId);
    if(!photo)fail('Progress photo is missing. Restore its image from a complete backup.',404);
    return {snapshot,photo};
  }
  return {preview,create,update,remove,list,image};
}
