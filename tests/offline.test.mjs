import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initialState,act} from '../server/domain/workspace.mjs';
import {offlineSnapshot,parseOfflineCommand,applyOfflineCommand} from '../server/offline.mjs';
import {previewBiometricLog} from '../server/domain/biometric-logging.mjs';
const identity={ownerId:'account-a',generation:'generation-one'},now=new Date('2026-11-15T12:00:00Z');
const command=(type,payload,extra={})=>({...identity,operationId:randomUUID(),type,payload,...extra});
function fixture(){const state=initialState();state.foods=[];const foodId=act(state,'food.save',{name:'Rice',serving:'100 g',grams:100,nutrients:{calories:130}}).id;return {state,foodId,snapshot:()=>offlineSnapshot(state,{...identity,now})};}
test('offline snapshot includes source versions and excludes media and private food notes',()=>{
 const {state,foodId,snapshot}=fixture();state.foods[0].notes='Private label notes';act(state,'entry.add',{foodId,amount:1,date:'2026-11-15',group:'Lunch'});const view=snapshot();assert.deepEqual(view.identity,identity);assert.equal(view.state.foods[0].notes,undefined);assert.match(view.foodVersions[foodId],/^[a-f0-9]{64}$/);assert.match(view.quantityReviews[state.entries[0].id].revision,/^[a-f0-9]{64}$/);assert.equal(view.savedAt,now.toISOString());assert.equal(state.foods[0].notes,'Private label notes');
});
test('saved food additions use stable IDs and reject changed quantities without partial mutation',()=>{
 const {state,foodId,snapshot}=fixture(),view=snapshot(),input=command('entry.add',{foodId,quantity:150,unit:'g',date:'2026-11-15',time:'12:00',group:'Lunch'},{foodVersion:view.foodVersions[foodId]});const result=applyOfflineCommand(state,input,identity);assert.equal(result.record.value.id,input.operationId);assert.equal(state.entries[0].quantity,150);assert.throws(()=>applyOfflineCommand(state,input,identity),{status:409});
 state.foods[0].grams=200;const before=structuredClone(state);assert.throws(()=>applyOfflineCommand(state,{...input,operationId:randomUUID()},identity),{status:409});assert.deepEqual(state,before);
});
test('quantity corrections use source record revisions and preserve later unrelated records',()=>{
 const {state,foodId,snapshot}=fixture();act(state,'entry.add',{foodId,amount:1,date:'2026-11-15',group:'Lunch'});const id=state.entries[0].id,view=snapshot();act(state,'note.add',{date:'2026-11-15',text:'Other device note'});const input=command('entry.quantity',{date:'2026-11-15',id,revision:view.quantityReviews[id].revision,quantity:{quantity:200,unit:'g'}});const result=applyOfflineCommand(state,input,identity);assert.equal(state.entries[0].quantity,200);assert.equal(state.notes.length,1);assert.match(result.quantityReview.revision,/^[a-f0-9]{64}$/);assert.throws(()=>applyOfflineCommand(state,{...input,operationId:randomUUID()},identity),{status:409});
});
test('notes, water and exercise use source validation and correction receipts',()=>{
 const {state,snapshot}=fixture();const note=applyOfflineCommand(state,command('note.add',{date:'2026-11-15',time:'12:00',group:'Lunch',text:'Note'}),identity);assert.equal(note.record.collection,'notes');const correction=command('note.correct',{collection:'notes',id:note.record.value.id,revision:note.noteReview.revision,changes:{date:'2026-11-15',time:'12:01',text:'Edited',group:'Lunch'},confirmed:true});applyOfflineCommand(state,correction,identity);assert.equal(state.notes[0].text,'Edited');
 const water=applyOfflineCommand(state,command('water.add',{date:'2026-11-15',time:'12:00',amount:250}),identity);assert.equal(water.record.collection,'biometrics');assert.ok(water.biometricReview.editable);
 const exercise=applyOfflineCommand(state,command('exercise.add',{date:'2026-11-15',time:'12:00',group:'Lunch',name:'Walk',duration:20,calories:80,confirmed:true}),identity);assert.equal(exercise.record.value.kind,'exercise');assert.ok(snapshot().exerciseReviews[exercise.record.value.id].editable);
});
test('measurement batches retain source review token and stable identities',()=>{
 const {state}=fixture(),operationId=randomUUID(),packet={operationId,selection:{kind:'catalog',id:'weight'},unit:'kg',values:{value:75},date:'2026-11-15',time:'12:00',group:'Lunch'},preview=previewBiometricLog(state,packet),{operationId:_,...payload}=packet;
 const result=applyOfflineCommand(state,command('biometric.log',{...payload,reviewToken:preview.reviewToken,confirmed:true},{operationId}),identity);assert.equal(result.records.length,1);assert.ok(result.records[0].id.includes(operationId));assert.match(result.biometricReviews[result.records[0].id].revision,/^[a-f0-9]{64}$/);
});
test('account, restore, completed days and malformed commands reject without mutation',()=>{
 const {state,foodId,snapshot}=fixture(),input=command('entry.add',{foodId,amount:1,date:'2026-11-15',group:'Lunch'},{foodVersion:snapshot().foodVersions[foodId]});for(const patch of [{ownerId:'account-b'},{generation:'old-generation'}])assert.throws(()=>applyOfflineCommand(state,{...input,...patch},identity),{status:409});
 for(const patch of [{operationId:'bad'},{payload:{...input.payload,photo:{}}},{type:'photo.log'},{payload:{...input.payload,amount:NaN}}])assert.throws(()=>parseOfflineCommand({...input,...patch}),{status:400});state.settings.completedDays=['2026-11-15'];const before=structuredClone(state);assert.throws(()=>applyOfflineCommand(state,input,identity));assert.deepEqual(state,before);
});
