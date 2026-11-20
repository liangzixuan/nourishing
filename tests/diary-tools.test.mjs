import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,act} from '../server/domain/workspace.mjs';
import {entryFacts,calculateSummary} from '../server/domain/nutrition.mjs';
import {importHealth} from '../server/domain/health-connect.mjs';
import {diaryToolsReview,applyDiaryToolsCommand,diaryToolsPresentation} from '../server/diary-tools.mjs';
const date='2026-11-15',destination={date:'2026-11-16',group:'Dinner'};
function setup(){const state=initialState();const id=act(state,'food.save',{name:'Rice',serving:'100 g',grams:100,nutrients:{calories:100,protein:2},portions:[{id:'bowl',label:'Bowl',grams:200}]}).id;for(const time of ['18:00','08:00',''])act(state,'entry.add',{foodId:id,date,time,group:'Lunch',quantity:1,unit:'portion',portionId:'bowl'});act(state,'note.add',{date,time:'09:00',text:'Fixture note'});return state;}
const select=state=>({date,scope:'selected',records:state.entries.map(row=>({collection:'entries',id:row.id}))});
const apply=(state,type,payload)=>applyDiaryToolsCommand(state,{type,payload});
test('capture and reviewed copy preserve quantities and source lineage while rejecting changed sources or destinations',()=>{
 const state=setup(),captured=diaryToolsReview(state,{operation:'capture',selection:select(state)}),review=diaryToolsReview(state,{operation:'copy',selection:captured.selection,destination}),before=structuredClone(state);
 apply(state,'records.copy',{selection:review.selection,destination:review.destination,fingerprint:review.fingerprint,confirmed:true});const copied=state.entries.slice(3);assert.equal(copied.length,3);assert.equal(copied[0].quantity,1);assert.equal(copied[0].portionId,'bowl');assert.equal(copied[0].copiedFrom.id,before.entries[0].id);assert.equal(entryFacts(state,copied[0]).nutrients.calories,200);
 assert.throws(()=>apply(state,'records.copy',{selection:review.selection,destination:review.destination,fingerprint:review.fingerprint,confirmed:true}),{status:409});
 before.foods.find(f=>f.id===before.entries[0].foodId).nutrients.calories=120;assert.throws(()=>diaryToolsReview(before,{operation:'copy',selection:captured.selection,destination}),{status:409});
});
test('health imports copied as manual records retain original provenance without active provider identity',()=>{
 const state=setup();importHealth(state,{format:'nourish-health-connect',version:1,exportedAt:'2026-11-15T12:00:00Z',range:{from:date,to:date,zone:'UTC'},records:[{id:'weight:fixture',type:'Weight',date,time:'08:00',value:70,unit:'kg',start:'2026-11-15T08:00:00Z',source:{app:'fixture.health',recordId:'fixture-record',lastModifiedAt:'2026-11-15T08:01:00Z'}}]});
 const review=diaryToolsReview(state,{operation:'copy',selection:{date,scope:'day'},destination});assert.equal(review.healthImportedCount,1);apply(state,'records.copy',{selection:review.selection,destination:review.destination,fingerprint:review.fingerprint,confirmed:true});const row=state.biometrics.find(r=>r.date===destination.date);assert.equal(row.source,undefined);assert.equal(row.copiedFrom.source.recordId,'fixture-record');
});
test('clear, move, timestamp and delete actions are atomic and respect completed days',()=>{
 const state=setup(),review=diaryToolsReview(state,{operation:'clear',selection:{date,scope:'day'}});assert.equal(review.total,3);apply(state,'records.clear-amounts',{selection:review.selection,fingerprint:review.fingerprint,confirmed:true});assert.ok(state.entries.every(row=>row.quantity===0&&row.portionId==='bowl'));assert.equal(state.notes.length,1);
 const records=state.entries.map(row=>({collection:'entries',id:row.id,group:row.group}));apply(state,'records.move-group',{date,group:'Dinner',records});assert.ok(state.entries.every(row=>row.group==='Dinner'));
 assert.throws(()=>apply(state,'records.move-group',{date,group:'Breakfast',records}),{status:409});
 apply(state,'records.set-time',{date,time:'13:00',records:state.entries.map(row=>({collection:'entries',id:row.id,group:row.group,time:row.time}))});assert.ok(state.entries.every(row=>row.time==='13:00'));
 act(state,'day.complete',{date,completed:true});const before=structuredClone(state);assert.throws(()=>apply(state,'records.delete',{selection:{date,scope:'day'},confirmed:true}));assert.deepEqual(state,before);
 act(state,'day.complete',{date,completed:false});apply(state,'records.delete',{selection:{date,scope:'day'},confirmed:true});assert.equal(state.entries.length,0);assert.equal(state.notes.length,0);
});
test('reusable meal uses original quantities and inline snapshots, with no caller nutrition fields',()=>{
 const state=setup();act(state,'entry.add',{name:'Inline',date,group:'Lunch',amount:2,nutrients:{calories:50}});const review=diaryToolsReview(state,{operation:'meal',selection:select(state)}),before=structuredClone(state.entries);
 assert.ok(review.warningCodes.includes('inline-snapshots'));const result=apply(state,'selection.meal',{selection:review.selection,fingerprint:review.fingerprint,name:'Saved lunch',confirmed:true});assert.equal(result.result.kind,'meal');assert.deepEqual(state.entries,before);
 const meal=state.meals.find(row=>row.id===result.result.id);assert.equal(meal.items.length,4);assert.equal(entryFacts(state,{mealId:meal.id,amount:1}).nutrients.calories,700);
 assert.throws(()=>apply(state,'selection.meal',{selection:review.selection,fingerprint:review.fingerprint,name:'Injected',confirmed:true,nutrients:{calories:1}}),{code:400});assert.throws(()=>apply(state,'selection.meal',{selection:review.selection,fingerprint:review.fingerprint,name:'Stale',confirmed:true}),{status:409});
});

test('selection recipe keeps measured ingredients and creates a reusable snapshot without changing the diary',()=>{
 const state=setup();act(state,'entry.add',{name:'Inline',date,group:'Lunch',amount:2,nutrients:{calories:50}});
 const review=diaryToolsReview(state,{operation:'recipe',selection:select(state)}),before=structuredClone(state.entries);
 const result=apply(state,'selection.recipe',{selection:review.selection,fingerprint:review.fingerprint,name:'Saved recipe',confirmed:true});
 const recipe=state.recipes.find(row=>row.id===result.result.id);
 assert.equal(recipe.name,'Saved recipe');assert.equal(recipe.ingredients.length,4);
 assert.equal(entryFacts(state,{recipeId:recipe.id,amount:1}).nutrients.calories,700);
 assert.deepEqual(state.entries,before);
 assert.throws(()=>apply(state,'selection.recipe',{selection:review.selection,fingerprint:review.fingerprint,name:'Stale recipe',confirmed:true}),{status:409});
});
test('global and group order change display only; account kJ conversion never changes recorded calories',()=>{
 const state=setup(),before=structuredClone(state.entries);state.settings.energyUnit='kJ';apply(state,'diary.order',{mode:'time'});apply(state,'group.order',{group:'Lunch',mode:'source'});
 const project=()=>diaryToolsPresentation(state,{groups:state.settings.groups,entries:state.entries.map(row=>({...row,facts:entryFacts(state,row)})),summary:calculateSummary(state,date)});
 let view=project();assert.deepEqual(view.entries.map(r=>r.id),before.map(r=>r.id));assert.equal(view.energyUnit,'kJ');assert.equal(view.entries[0].energyValue,836.8);assert.equal(view.consumedEnergy,2510.4);
 apply(state,'group.order',{group:'Lunch',mode:null});view=project();assert.deepEqual(view.entries.map(r=>r.time),['08:00','18:00','']);assert.deepEqual(state.entries,before);assert.equal(view.entries[0].facts.nutrients.calories,200);
 assert.throws(()=>apply(state,'diary.order',{mode:'bogus'}));
});
