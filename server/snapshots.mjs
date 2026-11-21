import {randomUUID} from 'node:crypto';
import {digest} from './data-codec.mjs';
import {normalizePhoto} from './domain/photo-images.mjs';
import {parseProgressSnapshot,mergeProgressSnapshots,createProgressSnapshots} from './domain/progress-snapshots.mjs';
import {captureSnapshotMeasurements,retainMeasurementCapture} from './domain/progress-measurements.mjs';

export const SNAPSHOT_MEDIA_NAMESPACE='progress_photos';
const editable=['date','time','title','note','vitals'];
export const snapshotCommandFields=Object.freeze({
 'snapshot.add':['photoId',...editable,'captureMeasurements'],
 'snapshot.update':['id',...editable],
 'snapshot.delete':['id']
});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fail=(message,code=400)=>{throw Object.assign(Error(message),{code,publicMessage:message});};
function source(operation){try{return operation();}catch(error){if([400,404,409,503].includes(error.status))throw Object.assign(error,{code:error.status,publicMessage:error.message});throw error;}}
function fields(value,allowed){if(!object(value)||Object.keys(value).some(key=>!allowed.includes(key)))fail('Invalid snapshot fields.');}
const metadata=value=>Object.fromEntries(editable.filter(key=>Object.hasOwn(value,key)).map(key=>[key,value[key]]));
function captured(state,value){
 if(Object.hasOwn(value,'captureMeasurements')){
  if(value.captureMeasurements!==true||Object.hasOwn(value,'vitals'))fail('Choose saved measurements or enter snapshot measurements.');
  return {...metadata(value),...source(()=>captureSnapshotMeasurements(state,value.date))};
 }
 return metadata(value);
}
function clock(asOf){const value=new Date(asOf??Date.now());if(!Number.isFinite(+value))fail('Snapshot time is unavailable.',503);return value.toISOString();}
function find(state,id){const row=(state.progressSnapshots??[]).find(item=>item.id===id);if(!row)fail('Snapshot not found.',404);return source(()=>parseProgressSnapshot(row));}

export function snapshotsView(state){
 const {snapshots}=source(()=>createProgressSnapshots({store:{read:()=>state}}).list());
 return {revision:digest(state),items:snapshots};
}

/** Normalization removes original image metadata. No photo or draft is persisted here. */
export async function prepareSnapshot(state,input,{asOf}={}){
 fields(input,['dataUrl',...editable,'captureMeasurements']);
 const photo=await sourceAsync(()=>normalizePhoto(input.dataUrl));
 const draft=source(()=>parseProgressSnapshot({id:randomUUID(),imageId:photo.id,createdAt:clock(asOf),...captured(state,input)}));
 const values=Object.hasOwn(input,'captureMeasurements')?{...metadata(draft),captureMeasurements:true}:metadata(draft);
 if(values.captureMeasurements)delete values.vitals;
 return {revision:digest(state),photo:{id:photo.id,dataUrl:photo.dataUrl},metadata:values};
}
async function sourceAsync(operation){try{return await operation();}catch(error){if([400,404,409,503].includes(error.status))throw Object.assign(error,{code:error.status,publicMessage:error.message});throw error;}}

export function validateSnapshotAction({type,payload}){
 const allowed=snapshotCommandFields[type];if(!allowed)fail('Invalid snapshot action.');fields(payload,allowed);
 if(type==='snapshot.add'&&(typeof payload.photoId!=='string'||!/^[a-f0-9]{64}$/.test(payload.photoId)))fail('Choose a snapshot photo.');
 if(type!=='snapshot.add'&&(typeof payload.id!=='string'||!payload.id))fail('Choose a snapshot.');
 return payload;
}

/** photo comes from authenticated validateStoredPhoto; storage staging shares the workspace transaction. */
export function applySnapshotCommand(state,action,{photo,asOf}={}){
 if(!Object.hasOwn(snapshotCommandFields,action.type))return {handled:false};
 const value=validateSnapshotAction(action);
 if(action.type==='snapshot.add'){
  if(!photo||photo.id!==value.photoId||photo.mime!=='image/jpeg'||!Buffer.isBuffer(photo.bytes))fail('Choose a valid normalized snapshot photo.');
  const row=source(()=>parseProgressSnapshot({id:randomUUID(),imageId:photo.id,createdAt:clock(asOf),...captured(state,value)}));
  state.progressSnapshots=source(()=>mergeProgressSnapshots(state.progressSnapshots,[row]));
  return {handled:true,result:{kind:'snapshot',id:row.id,records:{progressSnapshots:[structuredClone(row)]}}};
 }
 const existing=find(state,value.id);
 if(action.type==='snapshot.delete'){
  state.progressSnapshots=state.progressSnapshots.filter(row=>row.id!==existing.id);
  return {handled:true,result:{deletedSnapshotId:existing.id,...(!state.progressSnapshots.some(row=>row.imageId===existing.imageId)?{releasedImageId:existing.imageId}:{})}};
 }
 const candidate=source(()=>parseProgressSnapshot({id:existing.id,imageId:existing.imageId,createdAt:existing.createdAt,...metadata(existing),...metadata(value)}));
 const retained=source(()=>retainMeasurementCapture(existing,candidate.vitals));
 const row=source(()=>parseProgressSnapshot({...candidate,...(retained?{measurementCapture:retained}:{})}));
 state.progressSnapshots=state.progressSnapshots.map(item=>item.id===row.id?row:item);
 return {handled:true,result:{kind:'snapshot',id:row.id}};
}
