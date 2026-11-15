import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initialState} from '../server/domain/workspace.mjs';
import {previewHealthConnect,applyHealthConnectImport,applyHealthConnectCommand,validateHealthExport} from '../server/health-connect.mjs';
const fixture=JSON.parse(await readFile(new URL('../android/fixtures/example-export.json',import.meta.url),'utf8'));
const ownerId='account-A';
const preview=(state,input=fixture,owner=ownerId)=>previewHealthConnect(state,input,{ownerId:owner});
const save=(state,input,review,owner=ownerId)=>applyHealthConnectImport(state,input,{ownerId:owner,review,reviewToken:review.token});

test('Android snapshot preview and import retain measurements, source identity and daily aggregates',()=>{
 const state=initialState(),before=structuredClone(state),{summary,review}=preview(state);
 assert.deepEqual(state,before);assert.equal(summary.counts.added,fixture.records.length);assert.match(summary.reviewToken,/^[a-f0-9]{64}$/);
 assert.ok(summary.warnings.every(value=>typeof value==='string'));assert.equal('records' in summary,false);assert.equal('records' in review,false);
 const {counts}=save(state,fixture,review);assert.deepEqual(counts,summary.counts);assert.equal(state.biometrics.length,fixture.records.length);
 for(const original of fixture.records){const row=state.biometrics.find(value=>value.source.id===original.id);assert.equal(row.value,original.value);assert.equal(row.unit,original.unit);assert.equal(row.source.app,original.source.app);assert.equal(row.source.recordId,original.source.recordId);}
 const again=preview(state);assert.deepEqual(again.summary.counts,{added:0,updated:0,unchanged:fixture.records.length});save(state,fixture,again.review);assert.equal(state.biometrics.length,fixture.records.length);
});

test('preview authority is per immutable account and binds both export and workspace',()=>{
 const state=initialState(),{review}=preview(state),before=structuredClone(state);
 for(const options of [
  {ownerId:'account-B',review,reviewToken:review.token},
  {ownerId,review,reviewToken:'f'.repeat(64)},
  {ownerId,review:{...review,sourceToken:'f'.repeat(64)},reviewToken:review.token},
  {ownerId,review:{...review,ownerId:'account-B'},reviewToken:review.token}
 ])assert.throws(()=>applyHealthConnectImport(state,fixture,options),{code:409});
 assert.deepEqual(state,before);
 const changed=structuredClone(fixture);changed.records[0].value++;
 assert.throws(()=>save(state,changed,review),{code:409});
 state.notes.push({id:'new-note',date:'2026-11-14',time:'12:00',text:'synthetic'});
 assert.throws(()=>save(state,fixture,review),{code:409});
 assert.throws(()=>previewHealthConnect(initialState(),fixture,{}),{code:401});
});

test('empty exports do not erase existing records and updates preserve original local identity',()=>{
 const state=initialState();save(state,fixture,preview(state).review);
 const before=structuredClone(state.biometrics),empty={...fixture,records:[]};
 assert.deepEqual(save(state,empty,preview(state,empty).review).counts,{added:0,updated:0,unchanged:0});assert.deepEqual(state.biometrics,before);
 const changed=structuredClone(fixture);changed.exportedAt='2026-10-29T16:00:00Z';changed.records[0].value=72;changed.records[0].source.lastModifiedAt='2026-10-29T13:05:00Z';
 const projected=preview(state,changed);assert.equal(projected.summary.counts.updated,1);save(state,changed,projected.review);
 assert.equal(state.biometrics[0].id,before[0].id);assert.equal(state.biometrics[0].value,72);
 const older=preview(state,fixture);assert.equal(older.summary.counts.updated,0);save(state,fixture,older.review);assert.equal(state.biometrics[0].value,72);
});

test('source validates duplicate IDs, units, range and aggregation before any write',()=>{
 for(const change of [
  value=>value.records.push(structuredClone(value.records[0])),
  value=>value.records[0].unit='lb',
  value=>value.range.zone='Not/A_Zone',
  value=>value.range.from='2026-09-01',
  value=>value.records[0].value=-1,
  value=>{const row=value.records.find(row=>row.source.aggregation);row.source.recordId='another-identity';}
 ]){
  const state=initialState(),before=structuredClone(state),input=structuredClone(fixture);change(input);
  assert.throws(()=>preview(state,input),{code:400});assert.deepEqual(state,before);
 }
 assert.throws(()=>validateHealthExport({...fixture,ownerId:'account-B'}),{code:400});
 assert.throws(()=>validateHealthExport({...fixture,range:{...fixture.range,ownerId:'account-B'}}),{code:400});
});

test('workspace command only accepts a server-owned review and exposes counts for the commit receipt',()=>{
 const state=initialState(),{review}=preview(state);
 const command={type:'health.import',payload:{export:fixture,reviewToken:review.token}};
 assert.throws(()=>applyHealthConnectCommand(state,command,{ownerId}),{code:409});
 assert.throws(()=>applyHealthConnectCommand(state,{...command,payload:{...command.payload,review}},{ownerId,healthReview:review}),{code:400});
 assert.deepEqual(applyHealthConnectCommand(state,command,{ownerId,healthReview:review}),{handled:true,result:{counts:{added:fixture.records.length,updated:0,unchanged:0}}});
 assert.deepEqual(applyHealthConnectCommand(state,{type:'note.add',payload:{}},{}),{handled:false});
});
