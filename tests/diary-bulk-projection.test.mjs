import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,act} from '../server/domain/workspace.mjs';
import {diaryToolsReview,applyDiaryToolsCommand} from '../server/diary-tools.mjs';
import {applyWorkspaceCommand} from '../server/workspace-commands.mjs';
import {entryFacts} from '../server/domain/nutrition.mjs';
import {writeReceiptIdentities,remapWriteReferences} from '../public/write-identities.js';
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
 state.settings.diaryGroupOrder={version:1,groups:[{group:'Lunch',mode:'source'}]};
 compare('diary.sort-all',{},state);assert.equal(state.settings.diarySort,'time');assert.equal(state.settings.diaryGroupOrder,undefined);
});

test('recipes and meals from a selection appear locally, then keep canonical identities after acknowledgement',()=>{
 for(const kind of ['recipe','meal']){
  const state=fixture();act(state,'entry.add',{name:'Inline snack',date,amount:2,nutrients:{calories:30}});
  const selection={date,scope:'selected',records:state.entries.filter(row=>row.date===date).map(row=>({collection:'entries',id:row.id}))};
  const review=diaryToolsReview(state,{operation:kind,selection});
  const command={type:'selection.'+kind,operationId:'selected-fixture',payload:{selection:review.selection,fingerprint:review.fingerprint,name:'Saved '+kind,confirmed:true}};
  const row={command,projection:{reusable:{kind,resource:review.resource,foods:review.foods}}},pending=structuredClone(state),acknowledged=structuredClone(state);
  applyWriteToState(pending,row);
  const resource=pending[kind+'s'].find(item=>item.id===command.operationId);
  assert.equal(resource?.name,'Saved '+kind);
  assert.equal(entryFacts(pending,{[kind+'Id']:resource.id,amount:1}).nutrients.calories,210);
  const result=applyWorkspaceCommand(state,{type:command.type,payload:command.payload});applyWriteToState(acknowledged,row,result);
  for(const collection of ['foods','recipes','meals','entries'])assert.deepEqual(acknowledged[collection],state[collection]);
  const identities=writeReceiptIdentities(row,result),next={payload:{[kind+'Id']:resource.id,items:[{foodId:'selected-fixture-food-0'}]}};
  remapWriteReferences(next,identities);
  assert.equal(next.payload[kind+'Id'],result.id);
  assert.equal(next.payload.items[0].foodId,result.records.foods[0].id);
 }
});
