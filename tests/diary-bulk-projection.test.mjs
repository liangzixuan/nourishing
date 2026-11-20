import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,act} from '../server/domain/workspace.mjs';
import {diaryToolsReview,applyDiaryToolsCommand} from '../server/diary-tools.mjs';
import {buildLocalDiary} from '../scripts/package-local-diary.mjs';
await buildLocalDiary();
const {applyWriteToState}=await import('../public/write-projection.js');
const date='2026-11-20';
function fixture(){
 const state=initialState();
 state.foods=[{id:'rice',name:'Rice',serving:'100 g',grams:100,nutrients:{calories:100}}];
 act(state,'entry.add',{foodId:'rice',date,group:'Lunch',quantity:150,unit:'g',time:'12:00'});
 act(state,'note.add',{date,text:'Lunch note',group:'Lunch'});
 act(state,'entry.add',{foodId:'rice',date:'2026-11-19',group:'Lunch',amount:2});
 return state;
}
function compare(type,payload,state=fixture()){
 const local=structuredClone(state),receipt=structuredClone(state),row={command:{type,payload,operationId:'bulk-fixture'}};
 applyDiaryToolsCommand(state,{type,payload});
 applyWriteToState(local,row);
 applyWriteToState(receipt,row,{ok:true,revision:'saved'});
 for(const projected of [local,receipt]){
  for(const collection of ['entries','notes','biometrics'])assert.deepEqual(projected[collection].map(({_pending,...r})=>r),state[collection],collection);
  assert.deepEqual(projected.settings,state.settings);
 }
}
test('pending and acknowledged bulk movement and timestamps agree with canonical commands',()=>{
 let state=fixture();compare('records.move-group',{date,group:'Dinner',records:[{collection:'entries',id:state.entries[0].id,group:'Lunch'},{collection:'notes',id:state.notes[0].id,group:'Lunch'}]},state);
 state=fixture();compare('records.set-time',{date,time:'13:45',records:[{collection:'entries',id:state.entries[0].id,group:'Lunch',time:'12:00'}]},state);
});
test('clearing measured quantities and deleting a selected day are visible before sync',()=>{
 let state=fixture();const review=diaryToolsReview(state,{operation:'clear',selection:{date,scope:'day'}});
 compare('records.clear-amounts',{selection:review.selection,fingerprint:review.fingerprint,confirmed:true},state);
 state=fixture();compare('records.delete',{selection:{date,scope:'day'},confirmed:true},state);
});
test('local global and group ordering agree with canonical settings',()=>{
 compare('diary.order',{mode:'time'});
 const state=fixture();compare('group.order',{group:'Lunch',mode:'time'},state);
 compare('group.order',{group:'Lunch',mode:null},state);
});
