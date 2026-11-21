import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,act} from '../server/domain/workspace.mjs';
import {offlineSnapshot} from '../server/offline.mjs';
import {diaryToolsReview} from '../server/diary-tools.mjs';
import {prepareDiaryReview,diaryReviewGuard,assertDiaryReviewGuard} from '../server/domain/diary-preparation.mjs';

test('shared Diary preparation matches canonical reviews for mixed records and reusable items',()=>{
 const state=initialState(),date='2026-11-20';state.foods=[{id:'rice',name:'Rice',grams:100,nutrients:{calories:100}}];
 act(state,'entry.add',{foodId:'rice',date,amount:2,group:'Lunch'});
 act(state,'entry.add',{name:'Sauce',date,amount:1,nutrients:{calories:20},group:'Lunch'});
 act(state,'note.add',{date,text:'Lunch note'});act(state,'water.add',{date,amount:250});
 const day={date,scope:'day'},foods={date,scope:'selected',records:state.entries.map(row=>({collection:'entries',id:row.id}))};
 for(const input of [{operation:'capture',selection:day},{operation:'copy',selection:day,destination:{date:'2026-11-21',group:null}},{operation:'clear',selection:day},{operation:'recipe',selection:foods},{operation:'meal',selection:foods}]){
  const {revision,...canonical}=diaryToolsReview(state,input);
  assert.deepEqual(prepareDiaryReview(state,input),canonical);
  const cached=JSON.parse(JSON.stringify(offlineSnapshot(state,{ownerId:'fixture',generation:'one'}).state));
  assert.deepEqual(prepareDiaryReview(cached,input),canonical);
 }
});


test('local review guard rejects changed source facts, amounts and copy destinations',()=>{
 const state=initialState(),date='2026-11-20';state.foods=[{id:'rice',name:'Rice',grams:100,nutrients:{calories:100}}];
 act(state,'entry.add',{foodId:'rice',date,amount:2,group:'Lunch'});
 const input={operation:'copy',selection:{date,scope:'day'},destination:{date:'2026-11-21',group:null}},guard=diaryReviewGuard(state,input);
 for(const mutate of [s=>{s.entries[0].amount=3;},s=>{s.foods[0].nutrients.calories=200;},s=>{act(s,'entry.add',{foodId:'rice',date:'2026-11-21',amount:1,group:'Lunch'});}]){
  const changed=structuredClone(state);mutate(changed);
  assert.throws(()=>assertDiaryReviewGuard(guard,diaryReviewGuard(changed,input)),error=>error.status===409);
 }
 const withDefault=structuredClone(state);withDefault.entries[0].time='';
 assert.doesNotThrow(()=>assertDiaryReviewGuard(guard,diaryReviewGuard(withDefault,input)));
});


test('device reviews retain recipe metadata, source facts and copied record history',()=>{
 const state=initialState(),date='2026-11-20';
 const food=act(state,'food.save',{name:'Rice',serving:'100 g',grams:100,nutrients:{calories:100},notes:'Private annotation'});
 const recipe=act(state,'recipe.save',{name:'Cooked rice',servings:2,cookedWeightGrams:200,ingredients:[{foodId:food.id,amount:2}],instructions:'Simmer',source:'Family recipe'});
 act(state,'entry.add',{recipeId:recipe.id,date,amount:1,group:'Lunch'});
 const copied=prepareDiaryReview(state,{operation:'copy',selection:{date,scope:'day'},destination:{date:'2026-11-21',group:null}});
 act(state,'records.copy',{selection:copied.selection,destination:copied.destination,fingerprint:copied.fingerprint,confirmed:true});
 const cached=JSON.parse(JSON.stringify(offlineSnapshot(state,{ownerId:'fixture',generation:'one'}).state));
 assert.equal(cached.foods.at(-1).notes,undefined);
 assert.equal(cached.recipes.at(-1).instructions,'Simmer');assert.ok(cached.entries.at(-1).copiedFrom);
 for(const operation of ['capture','clear','recipe','meal','copy']){
  const input={operation,selection:{date:'2026-11-21',scope:'day'},...(operation==='copy'?{destination:{date:'2026-11-22',group:null}}:{})};
  assert.deepEqual(prepareDiaryReview(cached,input),prepareDiaryReview(state,input));
 }
});
