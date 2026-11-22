import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../server/domain/workspace.mjs';
import {removeDiaryRange} from '../server/domain/diary-range-removal.mjs';

const start='2026-11-01',end='2026-11-07',timeZone='America/Chicago';
function diary(){
 const state=initialState();
 const dates=['2026-10-31',start,end,'2026-11-08'];
 state.entries=dates.flatMap((date,index)=>[
  {id:'food'+index,kind:'food',date,foodId:'keep-food'},
  {id:'recipe'+index,kind:'recipe',date,recipeId:'keep-recipe'},
  {id:'meal'+index,kind:'meal',date,mealId:'keep-meal'},
  {id:'exercise'+index,kind:'exercise',date}
 ]);
 state.notes=dates.map((date,index)=>({id:'note'+index,date,text:'Example'}));
 state.biometrics=dates.map((date,index)=>({id:'biometric'+index,date,type:'Example'}));
 state.fasts=[
  {id:'before',start:'2026-11-01T02:30:00Z',end:'2026-11-01T18:00:00Z'},
  {id:'first',start:'2026-11-01T05:30:00Z',end:'2026-11-01T18:00:00Z'},
  {id:'last',start:'2026-11-08T05:30:00Z',end:'2026-11-08T14:00:00Z'},
  {id:'after',start:'2026-11-08T06:30:00Z',end:null}
 ];
 state.settings.completedDays=[...dates];
 return state;
}
function range(types){return {start,end,timeZone,types};}

test('range includes both dates, retires only selected Diary families and reopens completed dates',()=>{
 const state=diary(),before=structuredClone(state);
 const result=removeDiaryRange(state,range(['food','notes','fasts']));
 assert.deepEqual(result,{food:6,exercise:0,biometrics:0,notes:2,fasts:2,daysReopened:2});
 assert.deepEqual(state.entries,before.entries.filter(e=>e.kind==='exercise'||e.date<start||e.date>end));
 assert.deepEqual(state.notes.map(n=>n.id),['note0','note3']);
 assert.deepEqual(state.fasts.map(f=>f.id),['before','after']);
 assert.deepEqual(state.settings.completedDays,['2026-10-31','2026-11-08']);
 for(const k of Object.keys(state))if(!['settings','entries','notes','fasts'].includes(k))assert.deepEqual(state[k],before[k],k);
 assert.deepEqual({...state.settings,completedDays:before.settings.completedDays},before.settings);
});
test('exercise and biometric deletion keep matching food, notes, fasts and definitions',()=>{
 const state=diary(),before=structuredClone(state);
 assert.deepEqual(removeDiaryRange(state,range(['exercise','biometrics'])),{food:0,exercise:2,biometrics:2,notes:0,fasts:0,daysReopened:2});
 assert.deepEqual(state.entries,before.entries.filter(e=>e.kind!=='exercise'||e.date<start||e.date>end));
 assert.deepEqual(state.biometrics.map(n=>n.id),['biometric0','biometric3']);
 assert.deepEqual(state.notes,before.notes);assert.deepEqual(state.fasts,before.fasts);
});
test('invalid selection or reversed dates change nothing',()=>{
 for(const value of [range([]),range(['food','food']),range(['recipes']),{...range(['food']),end:'2026-10-01'},{...range(['fasts']),timeZone:'bad zone'},{...range(['notes']),start:'2026-02-30'}]){
  const state=diary(),before=structuredClone(state);
  assert.throws(()=>removeDiaryRange(state,value));assert.deepEqual(state,before);
 }
});
