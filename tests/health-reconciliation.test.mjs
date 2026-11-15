import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initialState} from '../server/domain/workspace.mjs';
import {importHealth,prepareHealthImport} from '../server/domain/health-connect.mjs';
import {createHealthReconciliation} from '../server/domain/health-reconciliation.mjs';
import {healthDigest,aggregateHealthRecord} from '../server/domain/health-reconciliation-state.mjs';
import {initializeHealthExportState,readHealthExportState,restoreHealthExportMetadata} from '../server/health-export-state.mjs';
import {previewHealthReconciliation,prepareHealthReconciliation,healthReconciliationReceipt} from '../server/health-reconciliation.mjs';

const ownerId='fixture-owner',reviewSecret='fixture-review-secret-for-reconciliation-tests',context={ownerId,reviewSecret},streamId='00000000-0000-4000-8000-000000000001',at='2026-10-31T12:00:00Z',old='2026-10-30T12:00:00Z';
const snapshot=(records=[],exportedAt=at)=>({format:'nourish-health-connect',version:1,exportedAt,range:{from:'2026-10-30',to:'2026-10-31',zone:'UTC'},records});
const measurement=(id='weight:parent',overrides={})=>({id,type:'Weight',date:'2026-10-30',time:'08:00',value:70,unit:'kg',start:'2026-10-30T08:00:00Z',source:{app:'example.health',recordId:'parent',lastModifiedAt:old},...overrides});
const batch=(overrides={})=>({format:'nourish-health-reconciliation',version:1,streamId,batchId:randomUUID(),sequence:1,previousReceipt:null,observedAt:at,snapshot:snapshot(),nativeChanges:[],aggregateObservations:[],gaps:[],...overrides});
const deletion=(type='Weight',recordId='parent')=>({kind:'delete',type,recordId});
const upsert=records=>({kind:'upsert',type:records[0]?.type??'Heart rate',recordId:'parent',app:'example.health',lastModifiedAt:old,records});
const observation=(overrides={})=>({metric:'steps',date:'2026-10-30',zone:'UTC',start:'2026-10-30T00:00:00Z',end:'2026-10-31T00:00:00Z',observedAt:at,value:123,...overrides});
const fixture=(records=[])=>{const state=initialState();initializeHealthExportState(state);importHealth(state,snapshot(records,old));return state;};
const confirmed=(state,b,allowRemovals=false)=>({batch:b,reviewToken:previewHealthReconciliation(state,b,context).reviewToken,confirmed:true,allowRemovals});
const next=(receipt,overrides={})=>batch({sequence:receipt.sequence+1,previousReceipt:receipt.receiptId,...overrides});
const lookup=receipt=>Object.fromEntries(['streamId','sequence','batchId','batchDigest'].map(key=>[key,receipt[key]]));

test('fresh-account baseline uses source facts and preserves absent records, manual negatives and unknowns',()=>{
 const state=fixture([measurement()]);state.biometrics.push({id:'manual',date:'2026-10-30',time:'',type:'Custom',value:-2,unit:'score'});const before=structuredClone(state),b=batch({gaps:[{type:'Weight',reason:'initial-baseline'}]});
 const preview=previewHealthReconciliation(state,b,context),sourcePreview=createHealthReconciliation({store:{read:()=>state}}).preview(b);assert.deepEqual(state,before);assert.deepEqual({...preview,reviewToken:sourcePreview.reviewToken},sourcePreview);assert.notEqual(preview.reviewToken,sourcePreview.reviewToken);
 const prepared=prepareHealthReconciliation(state,confirmed(state,b),context);assert.deepEqual(prepared.state.biometrics,before.biometrics);assert.equal(prepared.needsSnapshot,false);assert.equal(prepared.result.receipt.recoverySnapshotId,null);assert.deepEqual(state,before);assert.equal(prepared.result.receipt.batchDigest,healthDigest(b));
 const missing=initialState();assert.throws(()=>previewHealthReconciliation(missing,b,context),/setup is incomplete/);assert.throws(()=>previewHealthReconciliation(state,b,{}),{code:401});assert.throws(()=>previewHealthReconciliation(state,b,{ownerId,reviewSecret:'short'}),{code:503});
});

test('removal requires explicit consent and a real store allocation; candidate matches source and leaves input untouched',()=>{
 const state=fixture([measurement()]),before=structuredClone(state),b=batch({nativeChanges:[deletion()]}),input=confirmed(state,b,true);
 assert.throws(()=>prepareHealthReconciliation(state,{...input,allowRemovals:false},{...context,snapshotId:12}),/Explicitly allow/);
 assert.throws(()=>prepareHealthReconciliation(state,input,context),{code:503});assert.deepEqual(state,before);
 const result=prepareHealthReconciliation(state,input,{...context,snapshotId:12});assert.equal(result.needsSnapshot,true);assert.equal(result.result.receipt.recoverySnapshotId,12);assert.equal(result.state.biometrics.length,0);assert.equal(state.biometrics.length,1);
 const original=structuredClone(before),service=createHealthReconciliation({store:{read:()=>original,update:fn=>fn(original),backup:()=>12}}),sourcePreview=service.preview(b),sourceResult=service.apply({...input,reviewToken:sourcePreview.reviewToken});assert.deepEqual(result.state,original);assert.deepEqual(result.result,sourceResult);
 const resurrected=structuredClone(result.state);assert.equal(importHealth(resurrected,snapshot([measurement()],'2027-01-01T00:00:00Z')).unchanged,1);assert.equal(resurrected.biometrics.length,0);
});

test('review binds account, namespace, restore scope and affected facts without invalidating unrelated manual changes',()=>{
 const state=fixture([measurement()]),b=batch({nativeChanges:[deletion()]}),input=confirmed(state,b,true),snapshotId=13;
 assert.throws(()=>prepareHealthReconciliation(state,input,{...context,ownerId:'another',snapshotId}),{code:409});
 const changed=structuredClone(state);changed.biometrics[0].value=71;assert.throws(()=>prepareHealthReconciliation(changed,input,{...context,snapshotId}),{code:409});
 const restored=structuredClone(state),{saveScope:ignored,...metadata}=readHealthExportState(restored);restoreHealthExportMetadata(restored,metadata);assert.throws(()=>prepareHealthReconciliation(restored,input,{...context,snapshotId}),{code:409});
 const foreign=fixture([measurement()]);assert.throws(()=>prepareHealthReconciliation(foreign,input,{...context,snapshotId}),{code:409});
 state.notes.push({id:'manual-note',date:'2026-10-30',text:'Unrelated'});const result=prepareHealthReconciliation(state,input,{...context,snapshotId});assert.equal(result.state.notes[0].text,'Unrelated');
});

test('lost replies replay the exact source receipt without another snapshot, including after restore scope rotates',()=>{
 const state=fixture([measurement()]),b=batch({nativeChanges:[deletion()]}),input=confirmed(state,b,true),committed=prepareHealthReconciliation(state,input,{...context,snapshotId:7});
 const replay=prepareHealthReconciliation(committed.state,{...input,allowRemovals:false},context);assert.equal(replay.result.replayed,true);assert.equal(replay.needsSnapshot,false);assert.deepEqual(replay.result.receipt,committed.result.receipt);assert.deepEqual(replay.state,committed.state);assert.deepEqual(healthReconciliationReceipt(committed.state,lookup(committed.result.receipt)),{receipt:committed.result.receipt});
 const restored=structuredClone(committed.state),{saveScope:ignored,...metadata}=readHealthExportState(restored);restoreHealthExportMetadata(restored,metadata);assert.deepEqual(prepareHealthReconciliation(restored,input,context).result.receipt,committed.result.receipt);
 assert.throws(()=>prepareHealthReconciliation(committed.state,{...input,batch:{...b,gaps:[{type:'Sleep',reason:'initial-baseline'}]}},context),{code:409});
 const second=next(committed.result.receipt),accepted=prepareHealthReconciliation(committed.state,confirmed(committed.state,second),context);assert.throws(()=>healthReconciliationReceipt(accepted.state,lookup(committed.result.receipt)),{code:409});assert.throws(()=>previewHealthReconciliation(committed.state,{...second,sequence:3},context),{code:409});
});

test('native projection replacement and aggregate invalidation preserve source allowlists and null versus zero',()=>{
 const heart=id=>measurement('hr:'+id,{type:'Heart rate',unit:'bpm',value:60}),state=fixture([heart('a'),heart('b')]),b=batch({nativeChanges:[upsert([heart('a')])]});const replacement=prepareHealthReconciliation(state,confirmed(state,b,true),{...context,snapshotId:21});assert.equal(replacement.result.receipt.counts.replaced,1);assert.equal(replacement.state.biometrics.length,1);
 const imported=structuredClone(replacement.state);assert.equal(importHealth(imported,snapshot([heart('b')],'2027-01-01T00:00:00Z')).unchanged,1);assert.equal(imported.biometrics.length,1);
 const empty=fixture(),first=batch({aggregateObservations:[observation()]}),a=prepareHealthReconciliation(empty,confirmed(empty,first),context),later='2026-10-31T13:00:00Z',remove=next(a.result.receipt,{observedAt:later,snapshot:snapshot([],later),aggregateObservations:[observation({observedAt:later,value:null})]}),removed=prepareHealthReconciliation(a.state,confirmed(a.state,remove,true),{...context,snapshotId:22});assert.equal(removed.result.receipt.counts.invalidated,1);assert.equal(removed.state.biometrics.length,0);assert.equal(prepareHealthImport(removed.state,snapshot([aggregateHealthRecord(observation())])).counts.unchanged,1);
 const latest='2026-10-31T14:00:00Z',zero=next(removed.result.receipt,{observedAt:latest,snapshot:snapshot([],latest),aggregateObservations:[observation({observedAt:latest,value:0})]}),z=prepareHealthReconciliation(removed.state,confirmed(removed.state,zero),context);assert.equal(z.state.biometrics[0].value,0);assert.equal(z.needsSnapshot,false);
});

test('unknown deletion has no snapshot and malformed confirmations or fields do not change state',()=>{
 const state=fixture(),b=batch({nativeChanges:[deletion()]}),input=confirmed(state,b),before=structuredClone(state),result=prepareHealthReconciliation(state,input,context);assert.equal(result.needsSnapshot,false);assert.equal(result.result.receipt.recoverySnapshotId,null);assert.equal(result.state.healthSync.nativeRecords[0].app,null);
 for(const changes of [{confirmed:false},{allowRemovals:'yes'},{ownerId:'another'},{snapshotId:123}])assert.throws(()=>prepareHealthReconciliation(state,{...input,...changes},context),{code:400});assert.deepEqual(state,before);
});
