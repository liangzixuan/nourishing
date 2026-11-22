import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initialState,act} from '../server/domain/workspace.mjs';
import {digest} from '../server/data-codec.mjs';
import {signPhotoReview} from '../server/cloud-photo.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {decodeCommandReceipt} from '../server/command-receipt-codec.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';

test('twenty-food photo receipts fit TEXT storage and replay identical provenance after lost acknowledgements',async t=>{
 const state=initialState(),owner='fixture',secret='local-receipt-regression-secret-value',photo={id:'a'.repeat(64)},now=Date.now();
 const food=act(state,'food.save',{name:'Rice',serving:'100 g',grams:100,nutrients:{calories:130}});
 const analysis={observations:Array.from({length:20},(_,i)=>({description:'Cooked rice and mixed vegetables, serving '+(i+1),preparation:'Steamed with a little oil',uncertainty:'The exact portion weight and the amount of added oil cannot be determined from this photograph.'})),notes:'Review each selected food and portion before saving.'};
 const reviewToken=signPhotoReview({owner,photoId:photo.id,analysis},{secret,now}),fixture=diaryStoreFixture(state,owner),createRow=fixture.db.createRow;
 fixture.db.createRow=async input=>{if(input.tableId==='command_receipts')assert.ok(Buffer.byteLength(input.data.result)<=65535,'receipt must fit the existing TEXT column');return createRow(input);};
 const store=createWorkspaceStore(fixture.db,owner),input={requestId:randomUUID(),revision:digest(state),type:'photo.log',payload:{photoId:photo.id,reviewToken,date:'2026-11-20',time:'12:00',group:'Lunch',rows:Array.from({length:20},(_,observationIndex)=>({foodId:food.id,amount:1,observationIndex}))}},context={owner,reviewSecret:secret,photo,now,asOf:'2026-11-20T12:00:00Z',timeZone:'UTC'};
 fixture.lose();const result=await store.command(input,async()=>null,context),receipt=[...fixture.table('command_receipts').values()][0];
 assert.ok(Buffer.byteLength(JSON.stringify(result))>65535,'fixture must reproduce the prior storage overflow');assert.ok(Buffer.byteLength(receipt.result)<65535);assert.deepEqual(decodeCommandReceipt(receipt.result),result);
 t.diagnostic(`20-food photo receipt: ${Buffer.byteLength(JSON.stringify(result))} canonical bytes, ${Buffer.byteLength(receipt.result)} stored bytes`);
 assert.deepEqual(result.records.entries,fixture.state().entries);assert.ok(result.records.entries.every(row=>JSON.stringify(row.photo.analysis)===JSON.stringify(analysis)));
 assert.deepEqual(await store.command(input,async()=>null,context),result);assert.equal(fixture.state().entries.length,20);
 // Already-issued plain receipts remain readable after deploying this codec.
 receipt.result=JSON.stringify(result);assert.deepEqual(await store.command(input,async()=>null,context),result);
});

test('offline receipt readers decode compressed normal and lost-ack replies with unchanged records',async()=>{
 const owner='fixture',fixture=diaryStoreFixture(initialState(),owner),store=createWorkspaceStore(fixture.db,owner),snapshot=await store.offlineSnapshot(),command={...snapshot.identity,operationId:randomUUID(),type:'note.add',payload:{date:'2026-11-20',text:'Receipt provenance stays intact'}};
 fixture.lose();const result=await store.offlineCommand(command);assert.equal(result.replayed,true);assert.equal(result.record.value.text,command.payload.text);
 const replay=await store.offlineCommand(command);assert.deepEqual(replay,result);assert.equal(fixture.state().notes.length,1);
 const receipt=[...fixture.table('command_receipts').values()][0];assert.deepEqual({...decodeCommandReceipt(receipt.result),replayed:true},result);
 receipt.result=JSON.stringify({...result,replayed:false});assert.deepEqual(await store.offlineCommand(command),result);
});

test('a replayed suggestion receipt includes newly captured foods exactly once',async()=>{
 const state=initialState();
 const custom=act(state,'food.save',{name:'Saved barley',serving:'100 g',grams:100,nutrients:{protein:4}});
 const fixture=diaryStoreFixture(state,'fixture'),store=createWorkspaceStore(fixture.db,'fixture');
 const beans={id:'usda:fixture-1:17',name:'Fixture beans',readOnly:true,sample:false,serving:'100 g',grams:100,
  nutrients:{calories:130,protein:7},source:{name:'USDA fixture',datasetId:'fixture-1',fdcId:17}};
 const rice={...beans,id:'usda:fixture-1:26',name:'Fixture rice',source:{...beans.source,fdcId:26}};
 const catalog=new Map([['catalog:beans',beans],[rice.id,rice]]);
 const input={type:'meal.log',requestId:randomUUID(),revision:digest(state),payload:{
  date:'2026-11-20',time:'12:00',group:'Lunch',rows:[
   {foodId:'catalog:beans',quantity:150,unit:'g'},{foodId:rice.id,amount:1},
   {foodId:'catalog:beans',quantity:20,unit:'g'},{foodId:custom.id,amount:1}
  ]
 }};
 const readCatalog=async id=>catalog.get(id);
 const result=await store.command(input,readCatalog);
 const replay=await store.command(input,readCatalog);
 assert.deepEqual(replay,result);
 assert.equal(fixture.table('command_receipts').size,1);
 const canonical=fixture.state();
 assert.deepEqual(replay.records.foods,canonical.foods.filter(food=>food.id!==custom.id));
 assert.deepEqual(replay.records.entries.map(entry=>entry.foodId),[beans.id,rice.id,beans.id,custom.id]);
 assert.deepEqual(replay.records.entries,canonical.entries);
});

test('a library receipt includes a newly captured ingredient only once in its recipe graph',async()=>{
 const fixture=diaryStoreFixture(initialState(),'fixture'),store=createWorkspaceStore(fixture.db,'fixture');
 const food={id:'usda:fixture:1',name:'Fixture rice',readOnly:true,sample:false,grams:100,serving:'100 g',
  nutrients:{calories:130},source:{name:'USDA fixture',datasetId:'fixture',fdcId:1}};
 const input={type:'recipe.save',requestId:randomUUID(),revision:digest(fixture.state()),payload:{
  name:'Rice bowl',servings:1,ingredients:[{foodId:'catalog:rice',quantity:50,unit:'g'}]
 }};
 const result=await store.command(input,async()=>food);
 assert.deepEqual(result.records.foods,fixture.state().foods);
 assert.deepEqual(result.records.recipes,fixture.state().recipes);
 assert.equal(result.records.foods.length,1);
 assert.equal(result.records.recipes[0].ingredients[0].foodId,food.id);
});
