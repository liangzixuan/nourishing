import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,act} from '../server/domain/workspace.mjs';
import {applyWorkspaceCommand,captureActionFoods} from '../server/workspace-commands.mjs';
import {favoriteView,nutritionLabelView,nutritionLabelPreview,libraryExtrasCatalogReferences} from '../server/library-extras.mjs';

const label=(changes={})=>({profile:'us-2016',population:'adult-4-plus',name:'Label oats',serving:'1 cup',grams:'40',values:{calories:{amount:'150'},protein:{amount:'5'},sodium:{percent:'10'}},...changes});
const run=(state,type,payload)=>applyWorkspaceCommand(state,{type,payload});
test('raw label save derives nutrient facts and retains original provenance',()=>{
 const state=initialState(),original=label(),saved=run(state,'food.label.save',{label:original}),food=state.foods.find(row=>row.id===saved.id);
 assert.equal(food.nutrients.sodium,230);assert.equal(food.nutrients.calories,150);assert.equal(food.nutrients.protein,5);assert.equal(food.nutrients.fat,undefined);assert.deepEqual(food.source.original,original);assert.equal(food.source.name,'User-entered nutrition label');assert.equal(food.grams,40);
});
test('label preview uses source library nutrition without mutation',()=>{
 const state=initialState(),before=structuredClone(state),view=nutritionLabelPreview(state,{label:label(),date:'2026-11-15'});
 assert.deepEqual(state,before);assert.equal(view.nutrition.totals.calories,150);assert.equal(view.nutrition.totals.sodium,230);assert.match(view.revision,/^[a-f0-9]{64}$/);
});
test('label metadata exposes all source formats and explicit vitamin forms',()=>{
 const view=nutritionLabelView(initialState());assert.equal(view.profiles.length,5);const legacy=view.profiles.find(p=>p.id==='us-legacy');assert.equal(legacy.rows.find(r=>r.id==='vitaminEIU').forms.length,2);view.profiles[0].rows[0].name='Edited';assert.notEqual(nutritionLabelView(initialState()).profiles[0].rows[0].name,'Edited');
});
test('label formats retain volume basis, salt conversion and unknown IU forms',()=>{
 const state=initialState();const eu=run(state,'food.label.save',{label:label({profile:'eu-1169',population:'adult',basis:'100ml',serving:'100 mL',grams:'',values:{salt:{amount:'1'}}})});const food=state.foods.find(r=>r.id===eu.id);assert.equal(food.milliliters,100);assert.equal(food.grams,null);assert.equal(food.nutrients.sodium,400);
 const legacy=run(state,'food.label.save',{label:label({profile:'us-legacy',values:{vitaminEIU:{amount:'30'},vitaminD:{amount:'400',unit:'IU'}}})});const old=state.foods.find(r=>r.id===legacy.id);assert.equal(old.nutrients.vitaminEIU,30);assert.equal(old.nutrients.vitaminE,undefined);assert.equal(old.nutrients.vitaminD,10);
});
test('label rejects forged nutrients, wrong population, unsupported fields and qualified amounts',()=>{
 const state=initialState(),before=structuredClone(state);
 for(const input of [{label:label(),nutrients:{calories:0}},{label:label({source:{name:'Forged'}})},{label:label({population:'infant'})},{label:label({values:{calories:{amount:'<1'}}})},{label:label({values:{}})}])assert.throws(()=>run(state,'food.label.save',input),{code:400});
 assert.deepEqual(state,before);
});
test('favorite commands are explicit, idempotent, preserve diary and span all library kinds',()=>{
 const state=initialState(),food=act(state,'food.save',{name:'Rice',serving:'100 g',grams:100,nutrients:{calories:130}}).id,recipe=act(state,'recipe.save',{name:'Recipe',servings:1,ingredients:[{foodId:food,amount:1}]}).id,meal=act(state,'meal.save',{name:'Meal',items:[{recipeId:recipe,amount:1}]}).id;
 const before=structuredClone(state.entries);for(const [kind,id] of [['food',food],['recipe',recipe],['meal',meal]]){run(state,'favorite.set',{kind,id,enabled:true});run(state,'favorite.set',{kind,id,enabled:true});}
 assert.equal(favoriteView(state).items.length,3);assert.deepEqual(state.entries,before);state.foods.find(r=>r.id===food).retired=true;assert.equal(favoriteView(state).items.length,2);assert.equal(state.settings.favorites.length,3);run(state,'favorite.set',{kind:'food',id:food,enabled:false});assert.equal(state.settings.favorites.length,2);
});
test('catalog favorites capture immutable source facts and remove without fetching catalog',()=>{
 const state=initialState(),food={id:'usda:fixture:1',name:'Catalog rice',serving:'100 g',grams:100,nutrients:{calories:130},readOnly:true,sample:false,source:{name:'USDA fixture',datasetId:'fixture',fdcId:1}},action={type:'favorite.set',payload:{kind:'food',id:food.id,enabled:true}};
 assert.deepEqual(libraryExtrasCatalogReferences(action),[food.id]);const prepared=captureActionFoods(state,action,new Map([[food.id,food]]));run(state,prepared.type,prepared.payload);assert.equal(favoriteView(state).items[0].id,food.id);assert.equal(state.foods.find(f=>f.id===food.id).nutrients.calories,130);
 assert.deepEqual(libraryExtrasCatalogReferences({type:'favorite.set',payload:{kind:'food',id:food.id,enabled:false}}),[]);assert.equal(captureActionFoods(state,action,new Map([[food.id,food]])).payload.id,food.id);assert.equal(state.foods.filter(f=>f.id===food.id).length,1);
});
test('favorites reject cross-library IDs, invalid kinds and metadata injection',()=>{
 const state=initialState();for(const payload of [{kind:'food',id:'absent',enabled:true},{kind:'note',id:'absent',enabled:true},{kind:'food',id:'absent',enabled:'true'},{kind:'food',id:'absent',enabled:true,source:{}}])assert.throws(()=>run(state,'favorite.set',payload),{code:400});assert.deepEqual(favoriteView(state).items,[]);
});
