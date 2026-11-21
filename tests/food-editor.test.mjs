import {previewLibraryEdit} from '../server/library-edit.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../server/domain/workspace.mjs';
import {applyWorkspaceCommand,previewLibrary} from '../server/workspace-commands.mjs';
const date='2026-11-16',base={name:'Test bowl',serving:'bowl',grams:200,nutrients:{calories:200,fiber:0,protein:10}},basis={serving:'bowl',grams:200,milliliters:null,portions:[]};
const save=(state,draft)=>{if(!draft.id)return applyWorkspaceCommand(state,{type:'food.save',payload:draft});const {reviewToken}=previewLibraryEdit(state,{kind:'food',draft},{owner:'fixture'});return applyWorkspaceCommand(state,{type:'library.edit',payload:{kind:'food',draft,mode:'update'}},{owner:'fixture'});};
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


test('shared label editor preserves EU volume/salt, unknown IU forms and canonical source inputs',()=>{
 const state=initialState(),volume={name:'EU drink',serving:'100 mL',grams:null,milliliters:100,portions:[],nutrients:{},nutrientEdits:[{kind:'label',profile:'eu-1169',quantity:{quantity:100,unit:'mL'},basis:{serving:'100 mL',grams:null,milliliters:100,portions:[]},values:{salt:{amount:'1'},fiber:{amount:'0'}}}]};
 const preview=previewLibrary(state,{kind:'food',draft:volume,date,labelView:{profile:'eu-1169',quantity:{quantity:100,unit:'mL'},units:{}}});assert.equal(preview.resource.nutrients.sodium,400);assert.equal(preview.resource.grams,null);assert.equal(preview.resource.milliliters,100);assert.equal(preview.resource.nutrients.fiber,0);assert.equal(preview.resource.nutrients.protein,undefined);assert.deepEqual(preview.resource.source.labelEdits[0].values,volume.nutrientEdits[0].values);save(state,volume);assert.deepEqual({...state.foods[0],id:undefined},preview.resource);
 const unknown={...base,nutrientEdits:[{kind:'label',profile:'us-legacy',quantity:{amount:1},basis,values:{vitaminEIU:{amount:'30'},vitaminD:{amount:'400',unit:'IU'}}}]};
 const original=structuredClone(state),view=previewLibrary(state,{kind:'food',draft:unknown,date,labelView:{profile:'us-legacy',quantity:{amount:1},units:{}}});assert.deepEqual(state,original);assert.equal(view.resource.nutrients.vitaminEIU,30);assert.equal(view.resource.nutrients.vitaminE,undefined);assert.equal(view.resource.nutrients.vitaminD,10);assert.equal(view.labelView.rows.find(row=>row.id==='vitaminEIU').knownForms,null);assert.equal(view.labelView.profiles.length,5);
 for(const changes of [{values:{calories:{amount:'<1'}}},{values:{vitaminEIU:{amount:'30',forms:{notAForm:'100'}}}},{values:{vitaminEIU:{amount:'30',forms:{naturalAlphaTocopherol:'90'}}}}])assert.throws(()=>save(state,{...base,nutrientEdits:[{...unknown.nutrientEdits[0],...changes}]}),error=>(error.status??error.code)===400);
 assert.deepEqual(state,original);
});

test('known vitamin forms use canonical conversion across named portions and preserve authored provenance on reload',()=>{
 const state=initialState(),portions=[{id:'half',label:'Half bowl',grams:100}],measures={...basis,portions},shares={naturalAlphaTocopherol:'50',syntheticAlphaTocopherol:'50'},draft={...base,portions,nutrientEdits:[{kind:'label',profile:'us-legacy',quantity:{quantity:1,unit:'portion',portionId:'half'},basis:measures,values:{vitaminEIU:{amount:'30',forms:shares},vitaminAIU:{amount:'100',forms:{dietaryBetaCarotene:'100'}}}}]};
 const view=previewLibrary(state,{kind:'food',draft,date,labelView:{profile:'us-legacy',quantity:{quantity:1,unit:'portion',portionId:'half'},units:{}}});assert.equal(view.resource.nutrients.vitaminEIU,60);assert.equal(view.resource.nutrients.vitaminE,33.6);assert.equal(view.resource.nutrients.vitaminAIU,200);assert.equal(view.resource.nutrients.vitaminA,10);const row=view.labelView.rows.find(row=>row.id==='vitaminEIU');assert.equal(row.amount,'30');assert.deepEqual(row.knownForms,shares);assert.deepEqual(row.forms.map(form=>form.id),['naturalAlphaTocopherol','syntheticAlphaTocopherol']);assert.ok(row.forms.every(form=>Object.keys(form).sort().join(',')==='id,name'));save(state,draft);
 const saved=state.foods[0],original=structuredClone(saved.source),reopened=previewLibrary(state,{kind:'food',draft:{id:saved.id,name:saved.name},date,labelView:{profile:'us-legacy',quantity:{amount:1},units:{}}});assert.deepEqual(reopened.resource.source,original);assert.deepEqual(reopened.labelView.rows.find(row=>row.id==='vitaminEIU').knownForms,shares);assert.deepEqual(saved.source.labelEdits[0].values,draft.nutrientEdits[0].values);assert.ok(saved.source.labelEdits[0].derivations.some(row=>row.method==='vitamin-activity-conversion'&&row.id==='vitaminE'));
 row.forms[0].name='Changed';row.knownForms.naturalAlphaTocopherol='99';const again=previewLibrary(state,{kind:'food',draft:{id:saved.id,name:saved.name},date,labelView:{profile:'us-legacy',quantity:{amount:1},units:{}}});assert.notEqual(again.labelView.rows.find(row=>row.id==='vitaminEIU').forms[0].name,'Changed');assert.deepEqual(again.labelView.rows.find(row=>row.id==='vitaminEIU').knownForms,shares);
});


test('changing known IU forms invalidates only its owned conversion and preserves manual activity, including zero',()=>{
 const state=initialState(),known={kind:'label',profile:'us-legacy',quantity:{amount:1},basis,values:{vitaminEIU:{amount:'30',forms:{naturalAlphaTocopherol:'100'}}}},unknown={...known,values:{vitaminEIU:{amount:'30'}}};
 const project=edits=>previewLibrary(state,{kind:'food',draft:{...base,nutrientEdits:edits},date,labelView:{profile:'us-legacy',quantity:{amount:1},units:{}}}).resource;
 assert.equal(project([known]).nutrients.vitaminE,20.1);const cleared=project([known,unknown]);assert.equal(cleared.nutrients.vitaminEIU,30);assert.equal(cleared.nutrients.vitaminE,undefined);assert.ok(cleared.source.labelEdits.at(-1).cleared.includes('vitaminE'));assert.equal(project([unknown,known]).nutrients.vitaminE,20.1);assert.equal(project([known,{kind:'manual',values:{vitaminE:7}},known]).nutrients.vitaminE,20.1);
 for(const value of [20.1,7,0]){const manual=project([known,{kind:'manual',values:{vitaminE:value}},unknown]);assert.equal(manual.nutrients.vitaminE,value);assert.equal(manual.nutrients.vitaminEIU,30);}
 const zeroKnown={...known,values:{vitaminEIU:{amount:'0',forms:{naturalAlphaTocopherol:'100'}}}},zeroUnknown={...known,values:{vitaminEIU:{amount:'0'}}};assert.equal(project([zeroKnown]).nutrients.vitaminE,0);assert.equal(project([zeroKnown,zeroUnknown]).nutrients.vitaminE,undefined);assert.equal(project([zeroKnown,zeroUnknown]).nutrients.vitaminEIU,0);assert.equal(project([known,{...unknown,values:{vitaminEIU:{amount:''}}}]).nutrients.vitaminEIU,undefined);assert.equal(project([known,{...unknown,values:{vitaminEIU:{amount:''}}}]).nutrients.vitaminE,undefined);
 save(state,{...base,nutrientEdits:[known,{kind:'manual',values:{vitaminE:20.1}}]});const saved=state.foods[0],original=structuredClone(saved.source);save(state,{id:saved.id,name:saved.name,nutrientEdits:[unknown]});assert.equal(state.foods[0].nutrients.vitaminE,20.1);assert.deepEqual(state.foods[0].source.originalSource,original.originalSource);assert.deepEqual(state.foods[0].source.labelEdits.slice(0,-1),original.labelEdits);
});

test('activity ownership uses the recorded label basis and preserves later direct activity measurements',()=>{
 const state=initialState(),portions=[{id:'half',label:'Half bowl',grams:100}],portionBasis={...basis,portions},known={kind:'label',profile:'us-legacy',quantity:{quantity:1,unit:'portion',portionId:'half'},basis:portionBasis,values:{vitaminEIU:{amount:'30',forms:{naturalAlphaTocopherol:'100'}},vitaminAIU:{amount:'100',forms:{dietaryBetaCarotene:'100'}}}},unknown={...known,values:{vitaminEIU:{amount:'30'},vitaminAIU:{amount:'100'}}};
 const project=edits=>previewLibrary(state,{kind:'food',draft:{...base,portions,nutrientEdits:edits},date}).resource;
 assert.equal(project([known]).nutrients.vitaminE,40.2);assert.equal(project([known]).nutrients.vitaminA,10);const cleared=project([known,unknown]);assert.equal(cleared.nutrients.vitaminE,undefined);assert.equal(cleared.nutrients.vitaminA,undefined);assert.equal(cleared.nutrients.vitaminEIU,60);assert.equal(cleared.nutrients.vitaminAIU,200);
 const direct={kind:'label',profile:'us-2016',quantity:{amount:1},basis:portionBasis,values:{vitaminE:{amount:'40.2'},vitaminA:{amount:'10'}}};const retained=project([known,direct,unknown]);assert.equal(retained.nutrients.vitaminE,40.2);assert.equal(retained.nutrients.vitaminA,10);assert.ok(!retained.source.labelEdits.at(-1).cleared.includes('vitaminE'));
});
