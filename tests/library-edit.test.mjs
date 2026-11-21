import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initialState,act} from '../server/domain/workspace.mjs';
import {applyWorkspaceCommand,previewLibrary,catalogReferences,captureActionFoods} from '../server/workspace-commands.mjs';
import {previewLibraryEdit} from '../server/library-edit.mjs';
import {libraryView} from '../server/library-view.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';
import {digest} from '../server/data-codec.mjs';
import {entryFacts} from '../server/domain/nutrition.mjs';
const owner='fixture',context={owner},date='2026-11-16';
function setup(){
 const state=initialState(),food=act(state,'food.save',{name:'Grain',serving:'100 g',grams:100,nutrients:{calories:100,protein:0},notes:'Retain',portions:[{id:'cup',label:'Cup',grams:50,translations:[{locale:'fr',label:'Tasse'}]}]}).id;
 const recipe=act(state,'recipe.save',{name:'Bowl',servings:2,ingredients:[{foodId:food,amount:2}],source:'https://example.com/bowl',instructions:'Cook.',cookedWeightGrams:150,batchVolumeMl:300,categoryId:'MEALS_ENTREES_AND_SIDEDISHES',tags:['Vegan'],serving:'Bowl',portions:[{id:'half',label:'Half',basis:'batch',portionsPerBatch:2,translations:[{locale:'fr',label:'Demi'}]}]}).id;
 const meal=act(state,'meal.save',{name:'Plate',items:[{recipeId:recipe,amount:1}]}).id;
 act(state,'entry.add',{mealId:meal,date,group:'Lunch',amount:1});return {state,food,recipe,meal};
}
function edit(state,kind,draft,mode='update',ctx=context){const review=previewLibraryEdit(state,{kind,draft},ctx),payload={kind,draft,mode};return {review,payload,save:()=>applyWorkspaceCommand(state,{type:'library.edit',payload},ctx)};}
test('reviewed update changes used identity and preserves source, translations and zero/missing nutrients',()=>{
 const {state,food,recipe}=setup(),before=structuredClone(state),change=edit(state,'food',{id:food,name:'Renamed',nutrientEdits:[{kind:'manual',values:{calories:200}}],portions:[{id:'cup',label:'Small cup',grams:40}]});
 assert.deepEqual(state,before);assert.equal(change.review.counts.entries,1);assert.equal(change.review.counts.recipes,1);assert.equal(change.review.hasUses,true);
 assert.equal(change.save().id,food);const saved=state.foods[0];assert.equal(saved.notes,'Retain');assert.deepEqual(saved.portions[0].translations,before.foods[0].portions[0].translations);assert.equal(saved.nutrients.protein,0);assert.equal(saved.nutrients.fat,undefined);assert.equal(entryFacts(state,state.entries[0]).nutrients.calories,200);
 edit(state,'recipe',{id:recipe,name:'New bowl',categoryId:null,tags:[],portions:[{id:'half',label:'Half bowl',basis:'batch',portionsPerBatch:2}]}).save();const r=state.recipes[0];assert.equal(r.categoryId,undefined);assert.equal(r.tags,undefined);assert.equal(r.source,before.recipes[0].source);assert.equal(r.instructions,'Cook.');assert.deepEqual(r.portions[0].translations,before.recipes[0].portions[0].translations);
});
test('preserve retires old definitions and keeps diary, recipes and meals bound to old identities',()=>{
 for(const kind of ['food','recipe','meal']){const fixture=setup(),{state}=fixture,before=structuredClone(state),id=fixture[kind],saved=edit(state,kind,{id,name:'New version'},'preserve').save();assert.notEqual(saved.id,id);assert.equal(state[kind+'s'].find(row=>row.id===id).retired,true);assert.equal(state[kind+'s'].find(row=>row.id===saved.id).retired,undefined);assert.deepEqual(state.entries,before.entries);assert.equal(entryFacts(state,state.entries[0]).nutrients.calories,100);}
});
test('used quantity constraints reject update atomically while preserve retains the old named portion',()=>{
 const {state,food}=setup();act(state,'entry.add',{foodId:food,date,group:'Lunch',quantity:1,unit:'portion',portionId:'cup'});
 const before=structuredClone(state),change=edit(state,'food',{id:food,portions:[]});assert.throws(change.save,/portion/i);assert.deepEqual(state,before);
 const saved=edit(state,'food',{id:food,portions:[]},'preserve').save();assert.equal(state.foods.find(row=>row.id===saved.id).portions.length,0);assert.equal(entryFacts(state,state.entries.at(-1)).nutrients.calories,50);
});
test('recipe editor validates editable translations, retains omitted labels and clears explicit empty lists',()=>{
 const {state,recipe,food}=setup(),portion={id:'half',label:'Half',basis:'batch',portionsPerBatch:2},translated=[{locale:'de',label:'Halbe'}];
 const created=applyWorkspaceCommand(state,{type:'recipe.save',payload:{name:'Translated',servings:1,ingredients:[{foodId:food,amount:1}],servingTranslations:[{locale:'fr',label:'Bol'}],portions:[{...portion,translations:translated}]}});
 assert.deepEqual(state.recipes.find(row=>row.id===created.id).portions[0].translations,translated);
 edit(state,'recipe',{id:recipe,portions:[{...portion,translations:translated}],servingTranslations:[{locale:'fr',label:'Bol'}]}).save();
 assert.deepEqual(state.recipes[0].portions[0].translations,translated);assert.deepEqual(state.recipes[0].servingTranslations,[{locale:'fr',label:'Bol'}]);
 edit(state,'recipe',{id:recipe,portions:[portion]}).save();assert.deepEqual(state.recipes[0].portions[0].translations,translated);
 const before=structuredClone(state);
 for(const translations of [[{locale:'xx',label:'Invalid'}],[{locale:'fr',label:'A'},{locale:'fr',label:'B'}],[{locale:'fr',label:'',source:'Forged'}]])assert.throws(()=>edit(state,'recipe',{id:recipe,portions:[{...portion,translations}]}));
 assert.throws(()=>edit(state,'recipe',{id:recipe,portions:[{...portion,source:'Forged'}]}));assert.deepEqual(state,before);
 edit(state,'recipe',{id:recipe,portions:[{...portion,translations:[]}],servingTranslations:[]}).save();assert.equal(state.recipes[0].portions[0].translations,undefined);assert.equal(state.recipes[0].servingTranslations,undefined);
});
test('edits use the latest local ingredient facts',()=>{
 const {state,recipe}=setup(),child=act(state,'food.save',{name:'New ingredient',grams:100,nutrients:{calories:300}}).id,change=edit(state,'recipe',{id:recipe,ingredients:[{foodId:child,amount:1}]});
 state.foods.find(row=>row.id===child).nutrients.calories=400;change.save();assert.equal(entryFacts(state,{recipeId:recipe,amount:1}).nutrients.calories,200);
});
test('edits validate account context, identifiers, fields and current uses',()=>{
 const {state,recipe,food}=setup(),draft={id:recipe,name:'Changed'},change=edit(state,'recipe',draft);
 assert.throws(()=>applyWorkspaceCommand(state,{type:'library.edit',payload:change.payload},{}),{code:401});
 state.foods[0].nutrients.calories=101;act(state,'entry.add',{recipeId:recipe,date,amount:1,group:'Lunch'});
 change.save();assert.equal(state.recipes[0].name,'Changed');assert.equal(entryFacts(state,state.entries.at(-1)).nutrients.calories,101);
 const before=structuredClone(state);assert.throws(()=>applyWorkspaceCommand(state,{type:'library.edit',payload:{...change.payload,mode:'unknown'}},context));assert.deepEqual(state,before);
 for(const kind of ['food','recipe','meal'])assert.throws(()=>applyWorkspaceCommand(state,{type:kind+'.save',payload:{id:state[kind+'s'][0].id,name:'Bypass'}}),{code:400});
 for(const extra of [{readOnly:false},{ownerId:'other'},{source:{name:'Forged'}},{photoReview:{}},{unknown:'metadata'}])assert.throws(()=>previewLibraryEdit(state,{kind:'food',draft:{id:food,...extra}},context));
 assert.throws(()=>previewLibraryEdit(state,{kind:'recipe',draft:{id:recipe,ingredients:[{recipeId:recipe,amount:1}]}},context));
 assert.throws(()=>previewLibraryEdit(state,{kind:'food',draft:{id:'foreign'}},context),{status:404});
});

test('new catalog dependencies are reviewed without side effects and save captures the current facts',()=>{
 const {state,recipe}=setup(),draft={id:recipe,ingredients:[{foodId:'catalog:grain',quantity:50,unit:'g'}]},food={id:'usda:fixture:1',name:'Source grain',serving:'100 g',grams:100,nutrients:{calories:120},readOnly:true,sample:false,source:{name:'USDA fixture',datasetId:'fixture',fdcId:1}},catalogFoods=new Map([['catalog:grain',food]]),ctx={owner,catalogFoods},before=structuredClone(state),change=edit(state,'recipe',draft,'update',ctx);
 assert.deepEqual(state,before);const action={type:'library.edit',payload:change.payload};assert.deepEqual(catalogReferences(action),['catalog:grain']);assert.deepEqual(captureActionFoods(state,action,catalogFoods),action);assert.deepEqual(state,before);
 catalogFoods.set('catalog:grain',{...food,nutrients:{calories:130}});change.save();assert.equal(state.foods.at(-1).nutrients.calories,130);assert.equal(state.recipes[0].ingredients[0].foodId,food.id);assert.equal(state.foods.at(-1).readOnly,true);
});
test('workspace transaction rolls back candidate and receipt; lost response and repeat replay once',async()=>{
 const {state,recipe}=setup(),fixture=diaryStoreFixture(state,owner),store=createWorkspaceStore(fixture.db,owner),draft={id:recipe,name:'Preserved'},review=previewLibraryEdit(state,{kind:'recipe',draft},context),input={requestId:randomUUID(),revision:digest(state),type:'library.edit',payload:{kind:'recipe',draft,mode:'preserve'}};
 fixture.fail();await assert.rejects(store.command(input,async()=>null));assert.deepEqual(fixture.state(),state);assert.equal(fixture.table('command_receipts').size,0);
 fixture.lose();const saved=await store.command(input,async()=>null);assert.equal(saved.ok,true);assert.equal(fixture.state().recipes.length,2);assert.equal(fixture.table('command_receipts').size,1);assert.deepEqual(await store.command(input,async()=>{throw Error('Receipt must precede catalog reads');}),saved);assert.equal(fixture.state().recipes.length,2);assert.equal(saved.recoverySnapshotId,undefined);
});
test('recipe preview projects canonical batch, portion, weight and volume without mutating saved data',()=>{
 const {state,recipe,food}=setup(),before=structuredClone(state),preview=quantity=>previewLibrary(state,{kind:'recipe',draft:{id:recipe},date,quantity}).recipe;
 assert.deepEqual(preview({amount:1}).quantity,{grams:75,milliliters:150,amount:1});assert.equal(preview({quantity:1,unit:'batch'}).weight.grams,150);assert.equal(preview({quantity:1,unit:'batch'}).originalWeight.grams,200);assert.deepEqual(preview({quantity:50,unit:'g'}).quantity,{grams:50,milliliters:100,amount:2/3});assert.deepEqual(preview({quantity:150,unit:'mL'}).quantity,{grams:75,milliliters:150,amount:1});assert.deepEqual(preview({quantity:0,unit:'portion',portionId:'half'}).quantity,{grams:0,milliliters:0,amount:0});assert.deepEqual(state,before);
 state.foods[0].grams=null;state.foods[0].milliliters=100;const unknown=previewLibrary(state,{kind:'recipe',draft:{id:recipe,cookedWeightGrams:null,ingredients:[{foodId:food,amount:1}]},date,quantity:{amount:1}}).recipe;assert.equal(unknown.quantity.grams,null);assert.equal(unknown.originalWeight.grams,null);assert.equal(unknown.quantity.milliliters,150);assert.ok(!unknown.options.some(([id])=>id==='g'));
 assert.ok(libraryView(state).taxonomy.categories.some(row=>row.id==='MEALS_ENTREES_AND_SIDEDISHES'));assert.ok(libraryView(state).taxonomy.tags.includes('Vegan'));
});


test('an unrelated pending save does not invalidate an existing library edit',()=>{
 const {state,recipe}=setup(),change=edit(state,'recipe',{id:recipe,name:'Updated bowl'});
 act(state,'entry.add',{recipeId:recipe,date,amount:1,group:'Lunch'});
 const result=change.save();
 assert.equal(result.id,recipe);
 assert.equal(state.recipes.find(row=>row.id===recipe).name,'Updated bowl');
 assert.equal(state.entries.length,2);
});
