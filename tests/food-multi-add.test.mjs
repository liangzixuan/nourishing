import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initialState,act,captureCatalogFood} from '../server/domain/workspace.mjs';
import {digest} from '../server/data-codec.mjs';
import {previewFoodMultiAdd,applyFoodMultiAdd,validateFoodMultiInput} from '../server/food-multi-add.mjs';
import {readActionFoods,captureActionFoods,applyWorkspaceCommand} from '../server/workspace-commands.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {createWebHandler} from '../server/http.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';
const date='2026-11-16',owner='fixture',context={owner,asOf:date+'T12:00:00Z',timeZone:'UTC'};
function fixture(){
 const state=initialState();state.foods=[];state.recipes=[];state.meals=[];
 const food=act(state,'food.save',{name:'Rice',serving:'100 g',grams:100,nutrients:{calories:100,protein:2},portions:[{id:'bowl',label:'Bowl',grams:200}]}).id;
 const recipe=act(state,'recipe.save',{name:'Rice recipe',servings:2,ingredients:[{foodId:food,amount:2}],cookedWeightGrams:200}).id;
 const meal=act(state,'meal.save',{name:'Rice meal',items:[{recipeId:recipe,amount:1},{foodId:food,amount:1}]}).id;
 const catalog={id:'usda:fixture:7',name:'Catalog beans',serving:'100 g',grams:100,nutrients:{calories:110,protein:5},readOnly:true,sample:false,source:{name:'USDA fixture',datasetId:'fixture',fdcId:7,archiveSha256:'a'.repeat(64),normalizerSha256:'b'.repeat(64)}};
 const catalogFoods=new Map([[catalog.id,catalog]]),row=(kind,id,q={amount:1})=>({id:randomUUID(),selection:{kind,id},entry:{date,group:'Lunch',time:'12:00',...q}});
 const input={destination:{kind:'diary'},rows:[row('catalog',catalog.id,{quantity:50,unit:'g'}),row('foods',food,{quantity:1,unit:'portion',portionId:'bowl'}),row('recipes',recipe,{quantity:.5,unit:'batch'}),row('meals',meal,{amount:.5})]};
 return {state,food,recipe,meal,catalog,catalogFoods,row,input,context:{...context,catalogFoods}};
}
const payload=(f,input=f.input)=>({...input,reviewToken:previewFoodMultiAdd(f.state,input,f.context).reviewToken,confirmed:true});

test('mixed multi-add preserves source quantities and captures catalog facts only on confirmed atomic save',()=>{
 const f=fixture(),before=structuredClone(f.state),review=previewFoodMultiAdd(f.state,f.input,f.context);assert.deepEqual(f.state,before);assert.equal(review.revision,digest(before));assert.equal(review.totals.calories,455);assert.equal(review.rows.length,4);
 const saved=applyFoodMultiAdd(f.state,{...f.input,reviewToken:review.reviewToken,confirmed:true},f.context);assert.equal(saved.entryIds.length,4);assert.deepEqual(f.state.entries.map(row=>[row.foodId??row.recipeId??row.mealId,row.quantity??row.amount]),[[f.catalog.id,50],[f.food,1],[f.recipe,.5],[f.meal,.5]]);assert.equal(f.state.foods.find(row=>row.id===f.catalog.id).source.archiveSha256,f.catalog.source.archiveSha256);
 const expanded=fixture();expanded.state.settings.alwaysExpandMeals=true;const expandedResult=applyFoodMultiAdd(expanded.state,payload(expanded),expanded.context);assert.equal(expandedResult.entryIds.length,5);assert.equal(expanded.state.entries.some(row=>row.mealId),false);
});

test('batch review rejects changed sources, account, settings, invalid rows and completed days without mutation',()=>{
 for(const mutate of [f=>f.catalog.nutrients.calories++,f=>{f.context.owner='other';},f=>{f.state.settings.alwaysExpandMeals=true;},f=>{f.state.recipes[0].servings=3;}]){const f=fixture(),p=payload(f);mutate(f);const before=structuredClone(f.state);assert.throws(()=>applyFoodMultiAdd(f.state,p,f.context),{status:409});assert.deepEqual(f.state,before);}
 const f=fixture(),p=payload(f);p.rows.at(-1).entry.amount=-1;const before=structuredClone(f.state);assert.throws(()=>applyFoodMultiAdd(f.state,p,f.context));assert.deepEqual(f.state,before);
 const valid=payload(f);act(f.state,'day.complete',{date,completed:true});const completed=structuredClone(f.state);assert.throws(()=>applyFoodMultiAdd(f.state,valid,f.context),/complete/i);assert.deepEqual(f.state,completed);
 const retired=fixture();retired.state.foods.find(row=>row.id===retired.food).retired=true;assert.throws(()=>previewFoodMultiAdd(retired.state,retired.input,retired.context),/retired/i);const missing=fixture();missing.state.recipes[0].ingredients[0].foodId='missing';assert.throws(()=>previewFoodMultiAdd(missing.state,missing.input,missing.context),/missing ingredient/i);
});

test('catalog and library identities remain separate, preserve old snapshots and reject conflicting source identities',async()=>{
 const f=fixture(),old={...structuredClone(f.catalog),nutrients:{calories:90},source:{...f.catalog.source,normalizerSha256:'c'.repeat(64)}};captureCatalogFood(f.state,old);
 f.input.rows=[f.row('foods',old.id),f.row('catalog',f.catalog.id)];const review=previewFoodMultiAdd(f.state,f.input,f.context);assert.notEqual(review.entries[0].foodId,review.entries[1].foodId);const action={type:'food.multi.add',payload:{...f.input,reviewToken:review.reviewToken,confirmed:true}},reads=[];
 const captured=captureActionFoods(f.state,action,await readActionFoods(action,async id=>{reads.push(id);return f.catalog;}));assert.deepEqual(reads,[f.catalog.id]);assert.deepEqual(captured.payload.rows.map(row=>row.selection.kind),['foods','catalog']);applyWorkspaceCommand(f.state,captured,f.context);assert.equal(f.state.foods.find(row=>row.id===old.id).nutrients.calories,90);assert.equal(f.state.foods.find(row=>row.id===review.entries[1].foodId).nutrients.calories,110);
 const collision=fixture();collision.state.foods.push({...collision.catalog,readOnly:false,nutrients:{calories:1}});const before=structuredClone(collision.state);assert.throws(()=>previewFoodMultiAdd(collision.state,collision.input,collision.context),/source identity/);assert.deepEqual(collision.state,before);
});

test('Create Recipe expands mixed selections with exact quantities and does not log diary entries',async()=>{
 const f=fixture();f.input.destination={kind:'recipe',name:'Mixed bowl',servings:2};const review=previewFoodMultiAdd(f.state,f.input,f.context);assert.equal(review.perServing.totals.calories,227.5);const saved=applyFoodMultiAdd(f.state,payload(f),f.context);assert.equal(saved.kind,'recipe');assert.equal(f.state.entries.length,0);assert.equal(f.state.recipes.find(row=>row.id===saved.id).ingredients.length,5);
 const next=fixture();next.input.destination={kind:'recipe',name:'Saved recipe',servings:2};const db=diaryStoreFixture(next.state),store=createWorkspaceStore(db.db,owner),input={requestId:randomUUID(),revision:digest(next.state),type:'food.multi.add',payload:payload(next)};const result=await store.command(input,async id=>next.catalogFoods.get(id),context);assert.equal(result.item.kind,'recipe');assert.equal(db.state().entries.length,0);assert.equal(db.state().recipes.find(row=>row.id===result.item.id).name,'Saved recipe');assert.equal(db.state().loggingStreaks?.events?.length??0,0);
});

test('production command store rolls back whole batch and replays saved receipt without catalog reads',async()=>{
 const f=fixture(),db=diaryStoreFixture(f.state),store=createWorkspaceStore(db.db,owner),p=payload(f),input={requestId:randomUUID(),revision:digest(f.state),type:'food.multi.add',payload:p};
 db.fail();await assert.rejects(store.command(input,async id=>f.catalogFoods.get(id),context),/Fixture commit failed/);assert.deepEqual(db.state(),f.state);assert.equal(db.table('command_receipts').size,0);
 db.lose();const saved=await store.command(input,async id=>f.catalogFoods.get(id),context);assert.equal(saved.entryIds.length,4);assert.ok(db.state().loggingStreaks.events.length);assert.deepEqual(await store.command(input,async()=>{throw Error('No replay reads');},context),saved);assert.equal(db.state().entries.length,4);assert.equal(db.table('command_receipts').size,1);
 await assert.rejects(store.command({...input,requestId:randomUUID()},async()=>null,context),{code:409});
 const other=diaryStoreFixture(f.state,'other'),otherStore=createWorkspaceStore(other.db,'other');await assert.rejects(otherStore.command({...input,requestId:randomUUID()},async id=>f.catalogFoods.get(id),context),{code:409});assert.deepEqual(other.state(),f.state);
});

test('multi-add preview HTTP requires session and origin and returns no-store canonical review',async()=>{
 const f=fixture(),origin='https://fixture.example',handler=createWebHandler({config:{origin},service:{previewFoodMultiAdd:async(secret,input)=>{assert.equal(secret,'session');validateFoodMultiInput(input);return previewFoodMultiAdd(f.state,input,f.context);}}});
 const req=(input=f.input,headers={})=>new Request(origin+'/api/food-search/preview',{method:'POST',headers:{origin,'content-type':'application/json',cookie:'__Host-nourishing_session=session',...headers},body:JSON.stringify(input)});
 assert.equal((await handler(req(f.input,{cookie:''}))).status,401);assert.equal((await handler(req(f.input,{origin:'https://other.example'}))).status,403);assert.equal((await handler(req({...f.input,owner:'other'}))).status,400);
 const response=await handler(req());assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).reviewToken,previewFoodMultiAdd(f.state,f.input,f.context).reviewToken);
});
