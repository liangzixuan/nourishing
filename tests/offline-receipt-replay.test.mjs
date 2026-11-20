import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initialState} from '../server/domain/workspace.mjs';
import {offlineSnapshot,applyOfflineCommand} from '../server/offline.mjs';
import {previewBiometricLog} from '../server/domain/biometric-logging.mjs';
import {acceptOfflineReceipt} from '../public/offline-model.js';

const identity={ownerId:'owner',generation:'generation'},date='2026-11-20';
const copyOf=state=>({ownerId:identity.ownerId,snapshot:offlineSnapshot(state,identity),pending:[]});

test('custom measurement replay applies missing records once without duplicating definitions or replacing newer reviews',()=>{
 const state=initialState(),copy=copyOf(state),operationId=randomUUID(),packet={operationId,selection:{kind:'new-custom',name:'Focus'},unit:'points',values:{value:5},date,time:'12:00',group:'Lunch'},preview=previewBiometricLog(state,packet),{operationId:_,...payload}=packet;
 const command={...identity,operationId,type:'biometric.log',payload:{...payload,reviewToken:preview.reviewToken,confirmed:true}},pending={command,preview:{records:preview.records}},result={...applyOfflineCommand(state,command,identity),replayed:true};
 copy.pending.push(pending);acceptOfflineReceipt(copy,pending,result);
 assert.deepEqual(copy.snapshot.state.biometrics,state.biometrics);assert.deepEqual(copy.snapshot.state.settings.customBiometrics,[{name:'Focus',unit:'points'}]);
 copy.snapshot.state.biometrics[0].value=8;copy.snapshot.biometricReviews[result.records[0].id].revision='f'.repeat(64);
 assert.notEqual(result.biometricReviews[result.records[0].id].revision,'f'.repeat(64));
 copy.pending.push(pending);acceptOfflineReceipt(copy,pending,result);
 assert.equal(copy.snapshot.state.biometrics.length,1);assert.equal(copy.snapshot.state.biometrics[0].value,8);assert.equal(copy.snapshot.state.settings.customBiometrics.length,1);assert.equal(copy.snapshot.biometricReviews[result.records[0].id].revision,'f'.repeat(64));assert.equal(copy.pending.length,0);
});

test('older note add replay preserves a snapshot correction and its matching review',()=>{
 const state=initialState(),command={...identity,operationId:randomUUID(),type:'note.add',payload:{date,text:'Original'}},result=applyOfflineCommand(state,command,identity),pending={command,preview:{collection:'notes'}},copy=copyOf(state),id=result.record.value.id;
 copy.snapshot.state.notes[0].text='Newer correction';copy.snapshot.noteReviews[id].revision='e'.repeat(64);copy.pending.push(pending);
 acceptOfflineReceipt(copy,pending,{...result,replayed:true});assert.equal(copy.snapshot.state.notes[0].text,'Newer correction');assert.equal(copy.snapshot.noteReviews[id].revision,'e'.repeat(64));assert.equal(copy.pending.length,0);
});
