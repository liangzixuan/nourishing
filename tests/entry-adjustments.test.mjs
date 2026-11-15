import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,act} from '../server/domain/workspace.mjs';
import {entryFacts} from '../server/domain/nutrition.mjs';
import {entryAdjustmentView,previewEntryAdjustment,prepareEntryAdjustmentCommand} from '../server/entry-adjustments.mjs';
import {createWebHandler} from '../server/http.mjs';
import {parseCommand} from '../server/workspace-commands.mjs';
import {randomUUID} from 'node:crypto';
import {digest} from '../server/data-codec.mjs';
const date='2026-11-14';
function setup(kind='recipe'){
 const state=initialState();state.foods=[];state.recipes=[];state.meals=[];state.entries=[];
 for(const [name,calories] of [['Rice',100],['Chicken',200],['Greens',10]])act(state,'food.save',{name,serving:'100 g',grams:100,nutrients:{calories,protein:10},portions:[{id:'cup',label:'cup',grams:50}]});
 act(state,'recipe.save',{name:'Bowl',servings:2,cookedWeightGrams:200,batchVolumeMl:400,ingredients:state.foods.slice(0,2).map(food=>({foodId:food.id,quantity:100,unit:'g'})),portions:[{id:'half',label:'Half',basis:'batch',portionsPerBatch:2}]});
 act(state,'meal.save',{name:'Lunch',items:[{recipeId:state.recipes[0].id,amount:1},{foodId:state.foods[2].id,amount:1}]});
 for(let i=0;i<2;i++)act(state,'entry.add',{date,group:'Lunch',[kind+'Id']:state[kind+'s'][0].id,...(kind==='recipe'?{quantity:100,unit:'g'}:{amount:2})});
 const view=entryAdjustmentView(state,{kind,date,id:state.entries[0].id}),payload={kind,date,id:view.id,sourceRevision:view.sourceRevision,items:structuredClone(view.items),...(view.basis?{basis:structuredClone(view.basis)}:{})};
 return {state,view,payload};
}
const apply=(state,payload)=>{const action=prepareEntryAdjustmentCommand(state,{type:'entry.ingredients.adjust',payload});return act(state,action.type,action.payload);};
test('recipe adjustment uses source quantities, batch basis and occurrence-only nutrition',()=>{
 const {state,view,payload}=setup(),before=structuredClone(state);assert.ok(view.rows[0].portions.some(portion=>portion.id==='cup'));assert.equal(view.basis.portions[0].portionsPerBatch,2);
 payload.items=[{foodId:state.foods[2].id,quantity:2,unit:'portion',portionId:'cup'},{foodId:state.foods[1].id,quantity:50,unit:'g'}];payload.basis.servings=4;payload.basis.cookedWeightGrams=400;payload.basis.batchVolumeMl=800;payload.basis.portions[0].portionsPerBatch=4;
 const preview=previewEntryAdjustment(state,payload);assert.equal(preview.after.values.calories,27.5);assert.deepEqual(state,before);apply(state,payload);
 assert.equal(entryFacts(state,state.entries[0]).nutrients.calories,27.5);assert.deepEqual(state.recipes,before.recipes);assert.deepEqual(state.entries[1],before.entries[1]);assert.deepEqual(state.entries[0].recipeOverride.portions,payload.basis.portions);
 for(const q of [{amount:1},{quantity:100,unit:'g'},{quantity:200,unit:'mL'},{quantity:1,unit:'portion',portionId:'half'}]){act(state,'entry.update',{id:view.id,...q});assert.equal(entryFacts(state,state.entries[0]).nutrients.calories,27.5);}
 act(state,'entry.update',{id:view.id,quantity:1,unit:'batch'});assert.equal(entryFacts(state,state.entries[0]).nutrients.calories,110);
});
test('meal read expands the logged occurrence and save does not multiply it twice',()=>{
 const {state,view,payload}=setup('meal'),before=structuredClone(state);assert.equal(view.items.length,2);assert.equal(view.items[0].recipeId,state.recipes[0].id);assert.equal(view.items[0].amount,2);assert.equal(view.items[1].amount,2);
 payload.items[0]={foodId:state.foods[0].id,quantity:25,unit:'g'};const preview=previewEntryAdjustment(state,payload);assert.equal(preview.before.values.calories,320);assert.equal(preview.after.values.calories,45);apply(state,payload);
 assert.equal(state.entries[0].amount,1);assert.equal(entryFacts(state,state.entries[0]).nutrients.calories,45);assert.deepEqual(state.meals,before.meals);assert.deepEqual(state.entries[1],before.entries[1]);
});
test('stale sources, completed days, invalid portions and cycles reject without mutation',()=>{
 const {state,payload}=setup();act(state,'food.save',{...state.foods[0],nutrients:{calories:125}});let unchanged=structuredClone(state);assert.throws(()=>apply(state,payload),{status:409});assert.deepEqual(state,unchanged);
 const next=entryAdjustmentView(state,{kind:'recipe',date,id:payload.id});payload.sourceRevision=next.sourceRevision;
 const original=structuredClone(payload);payload.items=[{foodId:state.foods[0].id,quantity:1,unit:'portion',portionId:'missing'}];assert.throws(()=>apply(state,payload),/portion/);assert.deepEqual(state,unchanged);
 payload.items=[{recipeId:state.recipes[0].id,amount:1}];assert.throws(()=>apply(state,payload),/cycle|themselves/);assert.deepEqual(state,unchanged);
 act(state,'day.complete',{date,completed:true});unchanged=structuredClone(state);assert.throws(()=>apply(state,original));assert.deepEqual(state,unchanged);
});
test('unknown measurement remains null and public fields cannot replace recipe identity',()=>{
 const {state,payload}=setup();payload.basis.cookedWeightGrams=null;payload.basis.batchVolumeMl=null;const preview=previewEntryAdjustment(state,payload);assert.equal(preview.basis.cookedWeightGrams,null);assert.equal(preview.basis.batchVolumeMl,null);
 assert.throws(()=>previewEntryAdjustment(state,{...payload,owner:'foreign'}),/fields/);assert.throws(()=>previewEntryAdjustment(state,{...payload,basis:{...payload.basis,ingredients:[]}}),/fields/);assert.throws(()=>entryAdjustmentView(state,{date,id:payload.id}),/recipe or meal/);
 const missing=structuredClone(payload);missing.items=[{foodId:'foreign',amount:1}];assert.throws(()=>apply(state,missing),/does not exist/);
});
test('ingredient HTTP authenticates before large bodies and enforces route/owner/size boundaries',async()=>{
 const config={origin:'https://fixture.example'},headers={origin:config.origin,'content-type':'application/json',cookie:'__Host-nourishing_session=fixture'},paths=['/api/diary/ingredients/preview','/api/diary/ingredients/save'];
 const forbidden=createWebHandler({config,service:{current:async()=>{throw {code:401};}}});
 for(const path of paths){assert.equal((await forbidden({url:config.origin+path,method:'POST',headers:new Headers(headers),get body(){assert.fail('No body read before authentication');}})).status,401);}
 const {state,payload}=setup(),handle=createWebHandler({config,service:{current:async()=>({id:'fixture'}),entryAdjustment:async(_,input)=>entryAdjustmentView(state,input),previewEntryAdjustment:async(_,input)=>previewEntryAdjustment(state,input),workspaceCommand:async(_,input)=>{parseCommand(input);return prepareEntryAdjustmentCommand(state,{type:input.type,payload:input.payload});}}});
 const post=(path,input)=>handle(new Request(config.origin+path,{method:'POST',headers,body:JSON.stringify(input)}));
 assert.equal((await post(paths[0],payload)).status,200);assert.equal((await post(paths[0],{...payload,ownerId:'foreign'})).status,400);
 const packet={requestId:randomUUID(),revision:digest(state),type:'entry.ingredients.adjust',payload};assert.equal((await post(paths[1],packet)).status,200);assert.equal((await post(paths[1],{...packet,type:'entry.delete',payload:{id:payload.id}})).status,400);
 for(const path of paths){assert.equal((await post(path+'?ownerId=foreign',payload)).status,400);assert.equal((await handle({url:config.origin+path,method:'POST',headers:new Headers(headers),body:(async function*(){yield Buffer.alloc(4*1024*1024+1);})()})).status,413);}
 for(const suffix of ['&ownerId=foreign','&id=duplicate'])assert.equal((await handle(new Request(config.origin+'/api/diary/ingredients?'+new URLSearchParams({kind:'recipe',date,id:payload.id})+suffix,{headers}))).status,400);
});
