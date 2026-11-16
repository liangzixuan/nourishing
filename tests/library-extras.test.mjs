import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,act} from '../server/domain/workspace.mjs';
import {applyWorkspaceCommand,captureActionFoods} from '../server/workspace-commands.mjs';
import {favoriteView,libraryExtrasCatalogReferences} from '../server/library-extras.mjs';

const run=(state,type,payload)=>applyWorkspaceCommand(state,{type,payload});

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
