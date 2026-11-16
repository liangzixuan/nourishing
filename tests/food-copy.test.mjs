import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initialState,act} from '../server/domain/workspace.mjs';
import {foodCopyView,applyFoodCopy,validateFoodCopy} from '../server/food-copy.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';
import {createWebHandler} from '../server/http.mjs';
const owner='fixture',context={owner,asOf:'2026-11-16T12:00:00Z',timeZone:'UTC'};
function fixture(){const state=initialState();state.foods=[];const original={id:'usda:fixture:7',name:'Rice',serving:'100 g',grams:100,nutrients:{calories:110,protein:0},portions:[{id:'cup:opaque',label:'Cup',grams:150}],readOnly:true,sample:false,source:{name:'USDA fixture',datasetId:'fixture',fdcId:7,recordLocator:{fdcId:7},archiveSha256:'a'.repeat(64)}};return {state,original,selection:{kind:'catalog',id:original.id},context:{...context,catalogFoods:new Map([[original.id,original]])}};}
const payload=view=>({selection:view.selection,sourceFingerprint:view.sourceFingerprint,changes:view.draft});
test('food copy preview has no writes; save preserves portions, unknowns and server source provenance without capturing original',()=>{
 const f=fixture(),before=structuredClone(f.state),view=foodCopyView(f.state,f.selection,f.context);assert.deepEqual(f.state,before);assert.equal(view.draft.name,'Rice (copy)');assert.equal(Object.hasOwn(view.draft.nutrients,'fat'),false);
 const saved=applyFoodCopy(f.state,{...payload(view),changes:{...view.draft,name:'My rice',nutrients:{calories:120,protein:0}}},f.context),copy=f.state.foods.find(row=>row.id===saved.id);
 assert.equal(saved.kind,'food');assert.equal(copy.name,'My rice');assert.equal(copy.readOnly,undefined);assert.equal(copy.nutrients.protein,0);assert.equal(Object.hasOwn(copy.nutrients,'fat'),false);assert.deepEqual(copy.portions,f.original.portions);assert.equal(copy.source.userModified,true);assert.equal(copy.source.originalSource.archiveSha256,f.original.source.archiveSha256);assert.equal(f.state.foods.length,1);assert.equal(f.original.nutrients.calories,110);
});
test('copy of saved food retains server-owned metadata and null measurement basis while becoming active',()=>{
 const f=fixture(),id=act(f.state,'food.save',{name:'Unknown bowl',serving:'1 bowl',grams:null,nutrients:{},notes:'My note',source:{name:'Local provenance',evidence:'kept'}}).id;f.state.foods[0].retired=true;const before=structuredClone(f.state.foods[0]),view=foodCopyView(f.state,{kind:'library',id},f.context);assert.equal(view.draft.grams,null);
 const result=applyFoodCopy(f.state,payload(view),f.context),copy=f.state.foods.find(row=>row.id===result.id);assert.notEqual(copy.id,id);assert.equal(copy.grams,null);assert.equal(copy.milliliters,undefined);assert.deepEqual(copy.nutrients,{});assert.equal(copy.retired,undefined);assert.deepEqual(copy.source,before.source);assert.deepEqual(f.state.foods[0],before);
});
test('copy rejects injected source/identity, changed originals and other account reviews without partial mutation',()=>{
 const f=fixture(),view=foodCopyView(f.state,f.selection,f.context),before=structuredClone(f.state);
 for(const field of ['source','id','portions','readOnly','sample'])assert.throws(()=>validateFoodCopy({...payload(view),changes:{...view.draft,[field]:'forged'}}),{code:400});
 f.original.nutrients.calories++;assert.throws(()=>applyFoodCopy(f.state,payload(view),f.context),{code:409});assert.deepEqual(f.state,before);
 assert.throws(()=>applyFoodCopy(f.state,payload(view),{...f.context,owner:'other'}),{code:409});assert.deepEqual(f.state,before);
 const current=foodCopyView(f.state,f.selection,f.context);assert.throws(()=>applyFoodCopy(f.state,{...payload(current),changes:{...current.draft,grams:-1}},f.context));assert.deepEqual(f.state,before);
});
test('food copy command commits once after lost response and rolls back failed save, keeping original unchanged',async()=>{
 const f=fixture(),db=diaryStoreFixture(f.state),store=createWorkspaceStore(db.db,owner),view=foodCopyView(f.state,f.selection,f.context),input={requestId:randomUUID(),revision:view.revision,type:'food.copy',payload:payload(view)};
 db.fail();await assert.rejects(store.command(input,async()=>f.original,context),/Fixture commit failed/);assert.deepEqual(db.state(),f.state);
 db.lose();const result=await store.command(input,async()=>f.original,context);assert.equal(result.item.kind,'food');assert.equal(db.state().foods.length,1);assert.deepEqual(await store.command(input,async()=>{throw Error('No second read');},context),result);assert.equal(db.state().foods.length,1);assert.equal(db.table('command_receipts').size,1);
});
test('food copy HTTP is authenticated, no-store and rejects duplicate/foreign parameters',async()=>{
 const f=fixture(),origin='https://fixture.example',handler=createWebHandler({config:{origin},service:{foodCopy:async(secret,selection)=>{assert.equal(secret,'session');return foodCopyView(f.state,selection,f.context);}}});const req=(query,signed=true)=>new Request(origin+'/api/library/food-copy?'+query,{headers:signed?{cookie:'__Host-nourishing_session=session'}:{}});
 assert.equal((await handler(req('kind=catalog&id='+f.original.id,false))).status,401);assert.equal((await handler(req('kind=catalog&id=a&id=b'))).status,400);assert.equal((await handler(req('kind=catalog&id=a&owner=other'))).status,400);const response=await handler(req('kind=catalog&id='+f.original.id));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).draft.name,'Rice (copy)');
});
