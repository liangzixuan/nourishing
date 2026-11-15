import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {initialState} from '../server/domain/workspace.mjs';
import {validateStoredPhoto} from '../server/domain/photo-images.mjs';
import {prepareSnapshot,snapshotsView,applySnapshotCommand} from '../server/snapshots.mjs';
const day='2026-11-14',asOf='2026-11-14T12:00:00.000Z';
const image=await sharp({create:{width:24,height:30,channels:3,background:'#4a796b'}}).png().toBuffer();
const dataUrl='data:image/png;base64,'+image.toString('base64');
const base={date:day,time:'08:30',title:'',note:''};
const prepare=state=>prepareSnapshot(state,{dataUrl,...base,captureMeasurements:true},{asOf});

test('snapshot normalizes to private JPEG and captures only available measurements',async()=>{
 const state=initialState(),before=structuredClone(state),ready=await prepare(state);
 assert.deepEqual(state,before);assert.match(ready.photo.dataUrl,/^data:image\/jpeg;base64,/);assert.equal(ready.metadata.captureMeasurements,true);assert.equal('vitals' in ready.metadata,false);
 const photo=await validateStoredPhoto(ready.photo),result=applySnapshotCommand(state,{type:'snapshot.add',payload:{photoId:photo.id,...ready.metadata}},{photo,asOf});
 assert.equal(result.result.kind,'snapshot');const row=state.progressSnapshots[0];assert.equal(row.imageId,photo.id);assert.equal(row.createdAt,asOf);assert.deepEqual(row.vitals,{});
 const view=snapshotsView(state);assert.equal(view.items[0].id,result.result.id);assert.equal('bmi' in view.items[0],false);
 const metadata=await sharp(photo.bytes).metadata();assert.equal(metadata.exif,undefined);assert.equal(metadata.xmp,undefined);
});

test('manual measurements derive BMI and edits preserve immutable image identity',async()=>{
 const state=initialState(),vitals={weight:{value:70,unit:'kg'},height:{value:175,unit:'cm'},bodyFat:20,age:30};
 const ready=await prepareSnapshot(state,{dataUrl,...base,vitals},{asOf}),photo=await validateStoredPhoto(ready.photo);
 applySnapshotCommand(state,{type:'snapshot.add',payload:{photoId:photo.id,...ready.metadata}},{photo,asOf});const original=structuredClone(state.progressSnapshots[0]);
 assert.equal(snapshotsView(state).items[0].bmi,22.86);
 applySnapshotCommand(state,{type:'snapshot.update',payload:{id:original.id,...base,date:'2026-11-13',note:'Edited caption',vitals}});
 const edited=state.progressSnapshots[0];assert.equal(edited.imageId,original.imageId);assert.equal(edited.createdAt,original.createdAt);assert.equal(edited.note,'Edited caption');
 assert.throws(()=>applySnapshotCommand(state,{type:'snapshot.update',payload:{id:original.id,...base,vitals,imageId:'f'.repeat(64)}}),{code:400});
});

test('captured sources stay frozen and changing one measurement removes only its attribution',async()=>{
 const state=initialState();state.settings.bodyComposition={version:2,weightMetric:{kind:'biometric',type:'Weight',unit:'kg'},heightMetric:{kind:'biometric',type:'Height',unit:'cm'},bodyFatMetric:null,useForResting:false,useHeightForResting:false,useForKeto:false};
 state.biometrics=[{id:'weight',date:day,time:'07:00',type:'Weight',unit:'kg',value:70},{id:'height',date:day,time:'07:00',type:'Height',unit:'cm',value:175}];
 const ready=await prepare(state),photo=await validateStoredPhoto(ready.photo);applySnapshotCommand(state,{type:'snapshot.add',payload:{photoId:photo.id,...ready.metadata}},{photo,asOf});
 const row=state.progressSnapshots[0];assert.equal(row.vitals.weight.value,70);assert.equal(row.measurementCapture.sources.weight.reading.value,70);
 state.biometrics[0].value=75;assert.equal(snapshotsView(state).items[0].vitals.weight.value,70);
 applySnapshotCommand(state,{type:'snapshot.update',payload:{id:row.id,...base,vitals:{...row.vitals,weight:{value:72,unit:'kg'}}}});
 assert.equal(state.progressSnapshots[0].measurementCapture.sources.weight,undefined);assert.ok(state.progressSnapshots[0].measurementCapture.sources.height);
});

test('deleting a snapshot releases its image reference only after the final shared snapshot',async()=>{
 const state=initialState(),ready=await prepare(state),photo=await validateStoredPhoto(ready.photo);
 for(const date of [day,'2026-11-13'])applySnapshotCommand(state,{type:'snapshot.add',payload:{photoId:photo.id,...ready.metadata,date}},{photo,asOf});
 const [first,second]=snapshotsView(state).items;assert.equal(first.date,day);
 const removed=applySnapshotCommand(state,{type:'snapshot.delete',payload:{id:first.id}});assert.equal(removed.result.releasedImageId,undefined);
 const last=applySnapshotCommand(state,{type:'snapshot.delete',payload:{id:second.id}});assert.equal(last.result.releasedImageId,photo.id);assert.equal(snapshotsView(state).items.length,0);
 assert.throws(()=>applySnapshotCommand(state,{type:'snapshot.delete',payload:{id:second.id}}),{code:404});
});

test('invalid date, image, source injection and measurements fail without state mutation',async()=>{
 const state=initialState(),before=structuredClone(state);
 for(const input of [{dataUrl,...base,date:'2026-02-30',vitals:{}},{dataUrl,...base,vitals:{weight:{value:0,unit:'kg'}}},{dataUrl,...base,vitals:{},captureMeasurements:true},{dataUrl,...base,vitals:{},measurementCapture:{}}])await assert.rejects(()=>prepareSnapshot(state,input),{code:400});
 await assert.rejects(()=>prepareSnapshot(state,{dataUrl:'data:text/plain;base64,eA==',...base,vitals:{}}),{code:400});
 assert.throws(()=>applySnapshotCommand(state,{type:'snapshot.add',payload:{photoId:'a'.repeat(64),...base,vitals:{}}}),{code:400});
 assert.deepEqual(state,before);
});
