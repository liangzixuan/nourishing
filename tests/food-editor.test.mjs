import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../server/domain/workspace.mjs';
import {applyWorkspaceCommand,previewLibrary} from '../server/workspace-commands.mjs';
const date='2026-11-16',base={name:'Test bowl',serving:'bowl',grams:200,nutrients:{calories:200,fiber:0,protein:10}},basis={serving:'bowl',grams:200,milliliters:null,portions:[]};
const save=(state,draft)=>applyWorkspaceCommand(state,{type:'food.save',payload:draft});
test('ordered label/profile/basis/manual edits produce identical canonical preview and atomic save',()=>{
 const state=initialState(),draft={...base,portions:[{id:'cup',label:'Cup',grams:100}],nutrientEdits:[
  {kind:'label',profile:'us-2016',quantity:{quantity:100,unit:'g'},basis,values:{fat:{percent:'10',unit:'g'}}},
  {kind:'label',profile:'us-legacy',quantity:{amount:1},basis,values:{fat:{percent:'10',unit:'g'}}},
  {kind:'manual',values:{fat:4,protein:null,sodium:0}},
  {kind:'label',profile:'us-2016',quantity:{amount:1},basis,values:{fiber:{amount:'',unit:'g'}}}
 ]};
 const before=structuredClone(state),preview=previewLibrary(state,{kind:'food',draft,date,quantity:{quantity:1,unit:'portion',portionId:'cup'},labelView:{profile:'us-2016',quantity:{amount:1},units:{}}});assert.deepEqual(state,before);
 assert.equal(preview.nutrition.totals.calories,100);assert.equal(preview.nutrition.totals.fat,2);assert.equal(preview.resource.nutrients.sodium,0);assert.equal(preview.resource.nutrients.protein,undefined);assert.equal(preview.resource.nutrients.fiber,undefined);
 save(state,draft);assert.deepEqual({...state.foods[0],id:undefined},preview.resource);assert.equal(state.foods[0].source.labelEdits.length,3);assert.equal(state.foods[0].source.originalSource,'User-provided label or manual entry');
 const sodium=preview.labelView.rows.find(row=>row.id==='sodium');assert.equal(sodium.amount,'0');assert.equal(preview.labelView.rows.find(row=>row.id==='fiber').amount,'');
});
test('food editor rejects invalid portions and forged source or operation fields without mutation',()=>{
 const state=initialState();save(state,base);const before=structuredClone(state);
 for(const extra of [{source:{name:'Forged'}},{portions:[{id:'bad',label:'bad',milliliters:50}]},{portions:[{id:'bad',label:'bad',grams:0}]},{nutrientEdits:[{kind:'manual',values:{noSuchNutrient:1}}]},{nutrientEdits:[{kind:'manual',values:{fat:-1}}]},{nutrientEdits:[{kind:'label',profile:'us-2016',quantity:{amount:0},basis,values:{fat:{amount:'2'}}}]},{nutrientEdits:[{kind:'label',profile:'us-2016',quantity:{amount:1},basis:{...basis,source:'forged'},values:{fat:{amount:'2'}}}]}]){assert.throws(()=>save(state,{id:state.foods[0].id,...base,...extra}));assert.deepEqual(state,before);}
 assert.throws(()=>save(state,{...base,id:'another-account-food'}));assert.deepEqual(state,before);
});
test('food editor retains saved provenance, translated portions and unrelated metadata',()=>{
 const state=initialState();save(state,{...base,portions:[{id:'cup',label:'Cup',grams:100}]});const food=state.foods[0];food.source={name:'Original source',document:'fixture'};food.notes='Retain';food.portions[0].translations=[{locale:'fr',label:'Tasse'}];
 save(state,{id:food.id,name:'Renamed',portions:[{id:'cup',label:'Small cup',grams:90}],nutrientEdits:[{kind:'label',profile:'us-2016',quantity:{amount:1},basis,values:{fat:{amount:'0',unit:'g'}}}]});
 const saved=state.foods[0];assert.equal(saved.notes,'Retain');assert.deepEqual(saved.portions[0].translations,food.portions[0].translations);assert.deepEqual(saved.source.originalSource,{name:'Original source',document:'fixture'});assert.equal(saved.nutrients.fat,0);
});
