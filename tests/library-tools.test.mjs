import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,act} from '../server/domain/workspace.mjs';
import {previewLibraryEdit,applyLibraryEdit} from '../server/library-edit.mjs';
import {entryFacts} from '../server/domain/nutrition.mjs';
import {libraryToolsView} from '../server/library-tools.mjs';

function fixture(){const state=initialState();const food=act(state,'food.save',{name:'Rice',serving:'100 g',grams:100,milliliters:150,nutrients:{calories:130,protein:3},notes:'Keep this note',portions:[{id:'bowl',label:'Bowl',grams:200,translations:[{locale:'fr',label:'Bol'}]}]}).id;const recipe=act(state,'recipe.save',{name:'Rice recipe',servings:2,ingredients:[{foodId:food,amount:2}],cookedWeightGrams:200,batchVolumeMl:300,source:'https://example.com/recipe',instructions:'Cook rice.'}).id;return {state,food,recipe};}
function run(state,type,payload){return act(state,type,payload);}
function portionsEdit(state,kind,id,portions){const draft={id,portions},context={owner:'fixture'},review=previewLibraryEdit(state,{kind,draft},context);return applyLibraryEdit(state,{kind,draft,mode:'update'},context);}
test('food portion edits preserve identity, translations, notes and nutrition',()=>{
 const {state,food}=fixture(),before=structuredClone(state.foods.find(row=>row.id===food));
 portionsEdit(state,'food',food,[{id:'bowl',label:'Large bowl',grams:250},{id:'cup',label:'Cup',milliliters:150}]);
 const after=state.foods.find(row=>row.id===food);for(const key of ['id','notes','nutrients','source','grams','milliliters'])assert.deepEqual(after[key],before[key]);
 assert.deepEqual(after.portions[0].translations,before.portions[0].translations);
 assert.equal(entryFacts(state,{foodId:food,quantity:1,unit:'portion',portionId:'bowl'}).nutrients.calories,325);
});
test('recipe portions use batch, weight and volume source arithmetic',()=>{
 const {state,recipe}=fixture(),old=structuredClone(state.recipes[0]);
 portionsEdit(state,'recipe',recipe,[{id:'half',label:'Half',basis:'batch',portionsPerBatch:2},{id:'weight',label:'Scoop',basis:'weight',grams:50},{id:'volume',label:'Cup',basis:'volume',milliliters:150}]);
 const facts=id=>entryFacts(state,{recipeId:recipe,quantity:1,unit:'portion',portionId:id});
 assert.equal(facts('half').nutrients.calories,130);assert.equal(facts('weight').nutrients.calories,65);assert.equal(facts('volume').nutrients.calories,130);
 assert.equal(state.recipes[0].source,old.source);assert.deepEqual(state.recipes[0].ingredients,old.ingredients);
});
test('used portions cannot be removed and invalid definitions leave saved state intact',()=>{
 const {state,food}=fixture();act(state,'entry.add',{foodId:food,quantity:1,unit:'portion',portionId:'bowl',date:'2026-11-14',group:state.settings.groups[0]});const before=structuredClone(state);
 assert.throws(()=>portionsEdit(state,'food',food,[]),/portion/i);
 for(const portions of [[{id:'bowl',label:'Bowl',grams:0}],[{id:'bowl',label:'Bowl',grams:100,milliliters:10}],[{id:'bowl',label:'Bowl',grams:100,nutrients:{calories:0}}]])assert.throws(()=>portionsEdit(state,'food',food,portions),{status:400});
 assert.deepEqual(state,before);
});
test('retirement reviews count dependencies, preserve history and reject stale review',()=>{
 const {state,food}=fixture();act(state,'entry.add',{foodId:food,amount:1,date:'2026-11-14',group:state.settings.groups[0]});
 const view=libraryToolsView(state,{kind:'food',id:food});assert.equal(view.review.counts.entries,1);assert.equal(view.review.counts.recipes,1);
 act(state,'entry.add',{foodId:food,amount:2,date:'2026-11-14',group:state.settings.groups[0]});
 assert.throws(()=>run(state,'library.retirement',{kind:'food',id:food,retired:true,fingerprint:view.review.fingerprint,confirmed:true}),{status:409});
 const entries=structuredClone(state.entries),updated=libraryToolsView(state,{kind:'food',id:food});run(state,'library.retirement',{kind:'food',id:food,retired:true,fingerprint:updated.review.fingerprint,confirmed:true});
 assert.equal(state.foods.find(row=>row.id===food).retired,true);assert.deepEqual(state.entries,entries);assert.equal(entryFacts(state,entries[0]).nutrients.calories,130);
 run(state,'library.retirement',{kind:'food',id:food,retired:false,fingerprint:libraryToolsView(state,{kind:'food',id:food}).review.fingerprint,confirmed:true});assert.equal(state.foods.find(row=>row.id===food).retired,undefined);
});
test('catalog foods and meals cannot receive custom portions; metadata cannot be forged',()=>{
 const {state,food}=fixture();state.foods.find(row=>row.id===food).readOnly=true;
 assert.throws(()=>libraryToolsView(state,{kind:'food',id:food}),{status:400});assert.throws(()=>portionsEdit(state,'food',food,[]),{status:400});
 assert.throws(()=>portionsEdit(state,'meal','none',[]),/supported library editor fields/i);
});
