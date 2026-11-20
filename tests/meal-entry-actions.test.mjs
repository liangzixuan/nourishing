import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,webcrypto} from 'node:crypto';
import {initialState,act} from '../server/domain/workspace.mjs';
import {entryFacts} from '../server/domain/nutrition.mjs';
import {diaryToolsReview} from '../server/diary-tools.mjs';
import {applyWorkspaceCommand,parseCommand} from '../server/workspace-commands.mjs';
import {entryAdjustmentView,previewEntryAdjustment} from '../server/entry-adjustments.mjs';
import {adjustmentSource,adjustmentProjection,adjustmentRevisionFacts} from '../server/domain/diary-adjustment-model.mjs';
import {offlineSnapshot} from '../server/offline.mjs';
import {contentDigestInput} from '../server/domain/content-digest-input.mjs';
import {digest} from '../server/data-codec.mjs';
import {expandedDiarySources} from '../server/domain/resource-expansion.mjs';
import {writeReceiptIdentities} from '../public/write-identities.js';

const date='2026-11-20';
function setup(){
 const state=initialState(),food=act(state,'food.save',{name:'Rice',serving:'100 g',grams:100,nutrients:{calories:200,protein:10,carbs:40,fat:2},portions:[{id:'bowl',label:'Bowl',grams:150}]}),recipe=act(state,'recipe.save',{name:'Rice bowl',servings:2,ingredients:[{foodId:food.id,quantity:2,unit:'portion',portionId:'bowl'}]});
 const meal=act(state,'meal.save',{name:'Lunch',items:[{recipeId:recipe.id,amount:1},{foodId:food.id,quantity:0.5,unit:'portion',portionId:'bowl'}]});
 for(let i=0;i<2;i++)act(state,'entry.add',{date,group:'Lunch',time:'12:30',mealId:meal.id,amount:2});
 return {state,food,recipe,meal,entry:state.entries.at(-2),other:structuredClone(state.entries.at(-1))};
}

test('single-ingredient automatic expansion retains measured source and uses a child identity',()=>{
 const {state,food,meal}=setup();state.entries=[];state.settings.alwaysExpandMeals=true;state.meals.find(row=>row.id===meal.id).items=[{foodId:food.id,quantity:0.5,unit:'portion',portionId:'bowl'}];
 const operationId=randomUUID(),payload={date,mealId:meal.id,amount:2,group:'Lunch',time:'12:30'},local=expandedDiarySources(state,{...payload,id:operationId}),result=applyWorkspaceCommand(state,{type:'entry.add',payload});
 assert.equal(local.length,1);assert.equal(result.records.entries.length,1);assert.equal(local[0].quantity,1);assert.equal(local[0].unit,'portion');assert.equal(local[0].portionId,'bowl');assert.deepEqual(local[0].expandedFrom.path,result.records.entries[0].expandedFrom.path);
 assert.deepEqual(writeReceiptIdentities({command:{type:'entry.add',operationId,payload}},result),{[operationId+'-0']:result.records.entries[0].id});
 assert.deepEqual(entryFacts(state,local[0]).nutrients,entryFacts(state,result.records.entries[0]).nutrients);
});
test('public meal expansion preserves adjusted occurrence nutrients, portions, identity and original definition',()=>{
 const {state,entry,other}=setup(),definition=structuredClone(state.meals),view=entryAdjustmentView(state,{kind:'meal',date,id:entry.id});
 const payload={kind:'meal',date,id:entry.id,sourceRevision:view.sourceRevision,items:structuredClone(view.items)};payload.items[1].quantity=0.25;
 applyWorkspaceCommand(state,{type:'entry.ingredients.adjust',payload});
 const original=structuredClone(state.entries.find(row=>row.id===entry.id)),before=entryFacts(state,original).nutrients;
 const review=diaryToolsReview(state,{operation:'expand',date,id:entry.id});assert.deepEqual(review.before.values,review.after.values);
 const command=parseCommand({requestId:randomUUID(),revision:review.revision,type:'entry.expand',payload:{date,id:entry.id,fingerprint:review.fingerprint,confirmed:true}});
 const result=applyWorkspaceCommand(state,{type:command.type,payload:command.payload});
 const children=state.entries.filter(row=>row.expandedFrom?.id===entry.id);assert.equal(children.length,2);assert.equal(state.entries.some(row=>row.id===entry.id),false);
 assert.deepEqual(result.records.entries,children);
 assert.ok(children.every(row=>row.date===date&&row.group==='Lunch'&&row.time==='12:30'&&(row.foodId||row.recipeId)));
 assert.equal(children[0].amount,2);assert.ok(children[0].recipeId);assert.deepEqual([children[1].quantity,children[1].unit,children[1].portionId],[0.25,'portion','bowl']);
 for(const nutrient of ['calories','protein','carbs','fat'])assert.equal(children.reduce((sum,row)=>sum+entryFacts(state,row).nutrients[nutrient],0),before[nutrient]);
 assert.deepEqual(state.meals,definition);assert.deepEqual(state.entries.find(row=>row.id===other.id),other);
 assert.throws(()=>applyWorkspaceCommand(state,{type:command.type,payload:command.payload}),{status:409});
});
test('expansion rejects stale ingredients, completed diary days and foreign records without mutation',()=>{
 const {state,entry}=setup(),review=diaryToolsReview(state,{operation:'expand',date,id:entry.id}),command={type:'entry.expand',payload:{date,id:entry.id,fingerprint:review.fingerprint,confirmed:true}};
 state.entries.find(row=>row.id===entry.id).amount=3;let before=structuredClone(state);assert.throws(()=>applyWorkspaceCommand(state,{type:command.type,payload:command.payload}),{status:409});assert.deepEqual(state,before);
 const latest=diaryToolsReview(state,{operation:'expand',date,id:entry.id});command.payload.fingerprint=latest.fingerprint;act(state,'day.complete',{date,completed:true});before=structuredClone(state);assert.throws(()=>applyWorkspaceCommand(state,{type:command.type,payload:command.payload}));assert.deepEqual(state,before);
 assert.throws(()=>diaryToolsReview(state,{operation:'expand',date,id:'foreign'}),{status:409});assert.throws(()=>diaryToolsReview(state,{operation:'expand',date,id:entry.id,owner:'other'}),{status:400});
});
test('browser adjustment model and source digest match the server without changing saved quantities',async()=>{
 const {state,entry}=setup(),before=structuredClone(state),view=entryAdjustmentView(state,{kind:'meal',date,id:entry.id});
 const source=adjustmentSource(state,{date,id:entry.id},'meal'),hash=await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(contentDigestInput(adjustmentRevisionFacts(state,source))));
 assert.equal(Buffer.from(hash).toString('hex'),view.sourceRevision);
 const payload={kind:'meal',date,id:entry.id,sourceRevision:view.sourceRevision,items:structuredClone(view.items)};payload.items[1].quantity=0.125;
 const local=adjustmentProjection(state,source.entry,payload,'meal'),server=previewEntryAdjustment(state,payload);
 assert.deepEqual(local.before,server.before);assert.deepEqual(local.after,server.after);assert.deepEqual(local.items,server.items);assert.equal(local.afterEntry.amount,1);assert.deepEqual(state,before);assert.equal(digest(state),view.revision);
 const device=offlineSnapshot(state,{ownerId:'fixture',generation:'test'}).state,deviceSource=adjustmentSource(device,{date,id:entry.id},'meal');
 assert.deepEqual(adjustmentRevisionFacts(device,deviceSource),adjustmentRevisionFacts(state,source));
 assert.deepEqual(adjustmentProjection(device,deviceSource.entry,payload,'meal').after,server.after);
});
test('measured recipe revisions agree across the compact snapshot and retain food classification',()=>{
 const {state,recipe}=setup();state.foods[0].classification='supplement';
 act(state,'entry.add',{date,group:'Lunch',recipeId:recipe.id,quantity:150,unit:'g'});
 const entry=state.entries.at(-1),view=entryAdjustmentView(state,{kind:'recipe',date,id:entry.id}),device=offlineSnapshot(state,{ownerId:'fixture',generation:'test'}).state;
 const raw=adjustmentSource(state,{date,id:entry.id},'recipe'),local=adjustmentSource(device,{date,id:entry.id},'recipe');
 assert.deepEqual(adjustmentRevisionFacts(device,local),adjustmentRevisionFacts(state,raw));assert.equal(device.foods[0].classification,'supplement');
 const payload={kind:'recipe',date,id:entry.id,sourceRevision:view.sourceRevision,items:view.items,basis:view.basis};
 assert.deepEqual(adjustmentProjection(device,local.entry,payload,'recipe').after,previewEntryAdjustment(state,payload).after);
});
