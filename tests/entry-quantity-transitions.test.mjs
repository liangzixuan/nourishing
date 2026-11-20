import test from 'node:test';
import assert from 'node:assert/strict';
import {packageAdjustmentModel} from '../scripts/package-adjustment-model.mjs';
import {initialState,act,previewDiaryItem} from '../server/domain/workspace.mjs';
import {entryFacts} from '../server/domain/nutrition.mjs';
import {mergeEntryUpdate} from '../server/domain/entry-update-fields.mjs';
await packageAdjustmentModel();
const {applyWriteToState}=await import('../public/write-projection.js');
const date='2026-11-20';
function fixture(kind){
 const state=initialState();state.foods=[{id:'food',name:'Rice',serving:'100 g',grams:100,nutrients:{calories:200,protein:10},portions:[{id:'bowl',label:'Bowl',grams:150}]}];
 act(state,'recipe.save',{name:'Recipe',servings:4,cookedWeightGrams:400,ingredients:[{foodId:'food',amount:4}],portions:[{id:'half',label:'Half',basis:'batch',portionsPerBatch:2},{id:'quarter',label:'Quarter',basis:'batch',portionsPerBatch:4}]});
 act(state,'entry.add',{date,group:'Lunch',...(kind==='food'?{foodId:'food',quantity:75,unit:'g'}:{recipeId:state.recipes[0].id,quantity:1,unit:'portion',portionId:'half'})});
 return state;
}
function transition(state,patch,expectedCalories){
 const old=structuredClone(state.entries[0]),payload={id:old.id,...patch},preview=previewDiaryItem(state,payload),local=structuredClone(state);
 applyWriteToState(local,{command:{type:'entry.update',payload,operationId:'local-update'}});
 assert.equal(entryFacts(local,local.entries[0]).nutrients.calories,expectedCalories);
 assert.equal(entryFacts(local,local.entries[0]).nutrients.calories,preview.nutrition.totals.calories);
 act(state,'entry.update',payload);
 assert.deepEqual(entryFacts(local,local.entries[0]).nutrients,entryFacts(state,state.entries[0]).nutrients);
 const merged=mergeEntryUpdate(old,payload);
 if(patch.amount!==undefined){for(const key of ['quantity','unit','portionId','portionLabel','grams','milliliters'])assert.equal(Object.hasOwn(merged,key),false,key+' must not survive a serving edit');}
 if(patch.quantity!==undefined){assert.equal(Object.hasOwn(merged,'amount'),false);if(['g','batch'].includes(patch.unit))assert.equal(Object.hasOwn(merged,'portionId'),false);}
}
test('pending food edits use the same source quantities as server previews across grams, servings and portions',()=>{
 const state=fixture('food');transition(state,{amount:2},400);transition(state,{quantity:1,unit:'portion',portionId:'bowl'},300);transition(state,{quantity:50,unit:'g'},100);transition(state,{quantity:25},50);
});
test('pending recipe edits clear superseded portion metadata and preserve quantity-only portion changes',()=>{
 const state=fixture('recipe');transition(state,{quantity:100,unit:'g'},200);transition(state,{quantity:1,unit:'portion',portionId:'quarter'},200);transition(state,{quantity:2},400);assert.equal(state.entries[0].portionId,'quarter');transition(state,{amount:1},200);transition(state,{quantity:0.5,unit:'batch'},400);
});
test('changing a resource removes its old identity, measured portion and occurrence override',()=>{
 const state=fixture('recipe'),old={...state.entries[0],recipeOverride:{version:1},mealItems:[{foodId:'stale',amount:1}]},next=mergeEntryUpdate(old,{id:old.id,foodId:'food',amount:2});
 assert.equal(next.foodId,'food');for(const key of ['recipeId','mealId','recipeOverride','mealItems','quantity','unit','portionId'])assert.equal(Object.hasOwn(next,key),false);assert.equal(next.amount,2);assert.equal(old.recipeId,state.recipes[0].id);
});
