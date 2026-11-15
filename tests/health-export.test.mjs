import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initialState} from '../server/domain/workspace.mjs';
import {initializeHealthExportState} from '../server/health-export-state.mjs';
import {createHealthExport} from '../server/health-export.mjs';
const day='2026-11-15',timeZone='America/Chicago',ownerId='fixture-owner',reviewSecret='fixture-review-secret-32-characters-long';
const biometric=(kind='weight',type='Weight',unit='lb')=>({kind,from:day,to:day,metric:{type,unit},timeZone});
const intake=(kind='nutrition',waterSource='both')=>({kind,from:day,to:day,timeZone,interval:'recorded-minute',...(kind==='hydration'?{waterSource}:{})});
function fixture(){
 const state=initialState();initializeHealthExportState(state);
 state.biometrics=[{id:'weight',date:day,time:'09:00',type:'Weight',unit:'lb',value:200},{id:'drink',date:day,time:'10:00',type:'Water',unit:'L',value:1.25}];
 state.foods=[{id:'food',name:'Measured food',grams:100,nutrients:{calories:200,protein:10,fat:0,sodium:500,vitaminB12:2.4,water:80}}];state.recipes=[];state.meals=[];
 state.entries=[{id:'meal',foodId:'food',kind:'food',quantity:50,unit:'g',date:day,time:'12:00'}];
 const service=createHealthExport({readState:async()=>structuredClone(state),ownerId,reviewSecret,timeZone});return {state,service};
}
test('cloud options and previews preserve original units, nutrient omissions, source identity and immutable state',async()=>{
 const {state,service}=fixture(),before=structuredClone(state),options=await service.biometric.options();
 assert.equal(options.version,1);assert.equal(options.kinds.length,12);assert.equal(options.accountId,ownerId);assert.equal(options.namespace,state.healthExportState.namespace);assert.equal(options.timeZone,timeZone);assert.equal(Object.hasOwn(options,'saveScope'),false);
 assert.equal((await service.intake.options()).nutritionFields.length,37);
 const weight=await service.biometric.preview(biometric());assert.equal(weight.records[0].nativeValue,90.718474);assert.equal(weight.records[0].unit,'lb');assert.match(weight.reviewToken,/^[a-f0-9]{64}$/);
 const food=await service.intake.preview(intake());assert.deepEqual(food.records[0].nutrients,{energy:100,protein:5,totalFat:0,sodium:0.25,vitaminB12:0.0000012});assert.equal(Object.hasOwn(food.records[0].nutrients,'dietaryFiber'),false);
 assert.deepEqual((await service.intake.preview(intake('hydration'))).records.map(r=>r.milliliters),[1250,40]);
 assert.deepEqual(await service.intake.verify({selection:intake(),reviewToken:food.reviewToken}),{valid:true,reviewToken:food.reviewToken});assert.deepEqual(state,before);
});
test('review binds account, purpose, namespace and restore scope; ordinary unrelated edits remain valid',async()=>{
 const {state,service}=fixture(),selection=biometric(),preview=await service.biometric.preview(selection),input={selection,reviewToken:preview.reviewToken};
 const other=createHealthExport({readState:async()=>state,ownerId:'other-owner',reviewSecret,timeZone});await assert.rejects(()=>other.biometric.verify(input),{code:409});
 state.notes.push({id:'unrelated',date:day,text:'Unrelated edit'});assert.equal((await service.biometric.verify(input)).valid,true);
 const food=await service.intake.preview(intake());await assert.rejects(()=>service.intake.verify({selection:intake(),reviewToken:preview.reviewToken}),{code:409});
 state.foods[0].nutrients.protein=11;await assert.rejects(()=>service.intake.verify({selection:intake(),reviewToken:food.reviewToken}),{code:409});
 state.healthExportState.saveScope=randomUUID();await assert.rejects(()=>service.biometric.verify(input),{code:409});const after=await service.biometric.preview(selection);assert.equal(after.records[0].clientRecordId,preview.records[0].clientRecordId);
 state.healthExportState.namespace=randomUUID();await assert.rejects(()=>service.biometric.verify({selection,reviewToken:after.reviewToken}),{code:409});assert.notEqual((await service.biometric.preview(selection)).records[0].clientRecordId,preview.records[0].clientRecordId);
});
test('biometric exclusions and exact pressure pairing match source behavior',async()=>{
 const {state,service}=fixture();state.biometrics.push({...state.biometrics[0],id:'import',source:{}},{...state.biometrics[0],id:'copy',copiedFrom:{}},{...state.biometrics[0],id:'untimed',time:''});
 const weight=await service.biometric.preview(biometric());assert.deepEqual(weight.records.map(r=>r.id),['weight']);assert.deepEqual(weight.skipped.map(r=>r.id),['copy','import','untimed']);
 state.biometrics=[{id:'sys',date:day,time:'08:00',type:'Systolic',unit:'mmHg',value:120},{id:'dia',date:day,time:'08:00',type:'Diastolic',unit:'mmHg',value:80}];const selection={...biometric('pressure','Systolic','mmHg'),secondaryMetric:{type:'Diastolic',unit:'mmHg'}},p=await service.biometric.preview(selection);assert.equal(p.records[0].nativeSecondary,80);
 state.biometrics[1].value=85;await assert.rejects(()=>service.biometric.verify({selection,reviewToken:p.reviewToken}),{code:409});state.biometrics.push({...state.biometrics[1],id:'duplicate'});assert.equal((await service.biometric.preview(selection)).records.length,0);
});
test('ordinary intake blocks negative corrections and active history, including members moved across dates',async()=>{
 const {state,service}=fixture();state.entries.push({...state.entries[0],id:'native',source:{}},{...state.entries[0],id:'copy',copiedFrom:{}});const p=await service.intake.preview(intake());assert.deepEqual(p.records.map(r=>r.id).sort(),['copy','meal']);assert.equal(p.skipped[0].id,'native');
 state.entries[0].quantity=-50;await assert.rejects(()=>service.intake.preview(intake()),{code:409});state.entries[0].quantity=50;
 state.healthIntakePolicies=[{namespace:state.healthExportState.namespace,kind:'nutrition',date:'2026-11-14',timeZone,revision:1,groups:[],memberIds:['meal']}];await assert.rejects(()=>service.intake.preview(intake()),{code:409});await assert.rejects(()=>service.intake.verify({selection:intake(),reviewToken:p.reviewToken}),{code:409});
 state.healthIntakePolicies[0].kind='hydration';await assert.rejects(()=>service.intake.preview(intake('hydration')),{code:409});assert.equal((await service.intake.preview(intake('hydration','logged'))).records.length,1);
 state.healthIntakePolicies[0].namespace=randomUUID();assert.equal((await service.intake.preview(intake('hydration'))).records.length,3);
});
test('missing lineage and malformed selections or tokens fail without creating metadata',async()=>{
 const {state,service}=fixture();await assert.rejects(()=>service.biometric.preview({...biometric(),accountId:'other'}),{code:400});await assert.rejects(()=>service.intake.preview({...intake(),interval:'all-day'}),{code:400});
 for(const reviewToken of ['',null,'f'.repeat(63),'G'.repeat(64)])await assert.rejects(()=>service.biometric.verify({selection:biometric(),reviewToken}),{code:400});await assert.rejects(()=>service.biometric.verify({selection:biometric(),reviewToken:'a'.repeat(64),namespace:'override'}),{code:400});
 delete state.healthExportState;delete state.healthIntakeDrafts;delete state.healthIntakePolicies;await assert.rejects(()=>service.biometric.options(),{code:409});assert.equal(Object.hasOwn(state,'healthExportState'),false);
 assert.throws(()=>createHealthExport({readState:async()=>state,ownerId,reviewSecret:'short'}),{code:503});
});
test('biometric and intake response limits include options and reject oversized reviews',async()=>{
 const {state,service}=fixture();state.entries=Array.from({length:1500},(_,i)=>({...state.entries[0],id:String(i)+'x'.repeat(800)}));await assert.rejects(()=>service.intake.preview(intake()),{code:413});
 state.biometrics=Array.from({length:1500},(_,i)=>({...state.biometrics[0],id:String(i)+'x'.repeat(800)}));await assert.rejects(()=>service.biometric.preview(biometric()),{code:413});
 state.biometrics=Array.from({length:10000},(_,i)=>({type:String(i)+'x'.repeat(100),unit:'kg'}));await assert.rejects(()=>service.biometric.options(),{code:413});
});
