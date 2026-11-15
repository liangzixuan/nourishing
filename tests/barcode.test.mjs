import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,act} from '../server/domain/workspace.mjs';
import {entryFacts} from '../server/domain/nutrition.mjs';
import {lookupBarcode,applyBarcodeLog,previewBarcode,verifyBarcodeReview,searchBranded,validateBarcodeAction} from '../server/barcode.mjs';
import {takeBrandedBudget} from '../server/provider-budget.mjs';
const code='0012345678901',context={owner:'fixture-owner',reviewSecret:'fixture-signing-secret-at-least-32-bytes',now:1700000000000};
const product={code,product_name:'Fixture cereal',brands:'Fixture',nutrition:{aggregated_set:{per:'100g',preparation:'as_sold',nutrients:{'energy-kcal':{value:125,unit:'kcal',source:'packaging'},proteins:{value:3.5,unit:'g',source:'packaging'},sodium:{value:.2,unit:'g',source:'packaging'},fat:{value:0,unit:'g',source:'packaging'}}}}};
const lookup=state=>lookupBarcode(state,{code,scan:{format:'EAN13',decoder:'zxing-wasm 3.1.6'}},{...context,fetchImpl:async url=>{assert.match(String(url),/api\/v3.6\/product\/0012345678901/);return Response.json({product});}});
const payload=review=>({reviewToken:review.reviewToken,date:'2026-11-15',time:'12:00',group:'Lunch',quantity:50,unit:'g'});
test('provider facts, source provenance and unknown nutrients survive review and atomic logging',async()=>{
 const state=initialState(),before=structuredClone(state),review=await lookup(state);assert.deepEqual(state,before);
 assert.equal(review.resource.grams,100);assert.equal(review.resource.nutrients.sodium,200);assert.equal(review.resource.nutrients.fiber,undefined);
 assert.equal(review.resource.source.apiVersion,'3.6');assert.equal(review.resource.source.barcodeScan.decodedIdentifier,code);
 const preview=previewBarcode(state,payload(review),context);assert.ok(preview);
 const result=applyBarcodeLog(state,payload(review),context);assert.equal(state.entries.length,1);assert.deepEqual(result.entryIds,[state.entries[0].id]);
 assert.equal(entryFacts(state,state.entries[0]).nutrients.calories,62.5);assert.equal(entryFacts(state,state.entries[0]).nutrients.fiber,null);
 assert.deepEqual(state.foods.find(f=>f.id===result.id).source,review.resource.source);
 applyBarcodeLog(state,{...payload(review),saveOnly:true},context);assert.equal(state.foods.filter(f=>f.id===result.id).length,1);assert.equal(state.entries.length,1);
});
test('altered facts, wrong owner, expired review and invalid quantities cannot write',async()=>{
 const state=initialState(),review=await lookup(state),before=structuredClone(state),[encoded,sig]=review.reviewToken.split('.'),decoded=JSON.parse(Buffer.from(encoded,'base64url'));decoded.food.nutrients.calories=999;
 assert.throws(()=>verifyBarcodeReview(Buffer.from(JSON.stringify(decoded)).toString('base64url')+'.'+sig,context),{code:409});
 for(const changed of [{owner:'other'},{now:context.now+1800000},{now:context.now-1}])assert.throws(()=>applyBarcodeLog(state,payload(review),{...context,...changed}),{code:409});
 for(const changed of [{quantity:NaN},{unit:'mL'},{nutrients:{calories:999}},{source:{}},{foodId:'other'}])assert.throws(()=>applyBarcodeLog(state,{...payload(review),...changed},context));
 assert.deepEqual(state,before);act(state,'day.complete',{date:'2026-11-15',completed:true});const completed=structuredClone(state);assert.throws(()=>applyBarcodeLog(state,payload(review),context));assert.deepEqual(state,completed);
});
test('liquid basis cannot be interpreted as grams and retired matches cannot silently reactivate',async()=>{
 const state=initialState(),review=await lookupBarcode(state,{code},{...context,fetchImpl:async()=>Response.json({product:{...product,nutrition:{aggregated_set:{...product.nutrition.aggregated_set,per:'100ml'}}}})});
 assert.equal(review.resource.grams,null);assert.equal(review.resource.milliliters,100);assert.throws(()=>applyBarcodeLog(state,payload(review),context));
 applyBarcodeLog(state,{...payload(review),unit:'mL'},context);assert.equal(entryFacts(state,state.entries[0]).nutrients.calories,62.5);
 state.foods.find(f=>f.id===review.resource.id).retired=true;assert.throws(()=>applyBarcodeLog(state,{...payload(review),saveOnly:true},context),{code:409});
});
test('provider failures, oversized provenance and client fields fail at the owning boundary',async()=>{
 await assert.rejects(lookupBarcode(initialState(),{code},{...context,fetchImpl:async()=>Response.json({},{status:404})}),{code:400});
 await assert.rejects(lookupBarcode(initialState(),{code},{...context,fetchImpl:async()=>Response.json({product:{...product,brands:'x'.repeat(40000)}})}),{code:502});
 await assert.rejects(searchBranded({q:'x',page:1}),{code:400});
 assert.throws(()=>validateBarcodeAction({payload:{reviewToken:'x',saveOnly:'true'}}),{code:400});
 await assert.rejects(lookupBarcode(initialState(),{code,scan:{format:'UPCA',decoder:'fixture',rawCode:'12345678'}},context),{code:400});
});
test('shared atomic provider budget remains bounded under concurrent accounts and minutes',async()=>{
 const rows=new Map(),db={async createRow({rowId,data,permissions}){assert.deepEqual(permissions,[]);if(rows.has(rowId))throw {code:409};const row={$id:rowId,...data};rows.set(rowId,row);return {...row};},async incrementRowColumn({rowId}){return {...rows.get(rowId),attempts:++rows.get(rowId).attempts};},async listRows(){return {rows:[]};}};
 const opts={database:'fixture',operation:'search',now:context.now};
 const outcomes=await Promise.allSettled(Array.from({length:20},(_,i)=>takeBrandedBudget(db,{...opts,owner:'account'+i})));
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,10);assert.equal(outcomes.filter(r=>r.reason?.code===429).length,10);
 await takeBrandedBudget(db,{...opts,owner:'account0',now:context.now+60000});
});
test('account energy preference converts only the barcode presentation',async()=>{
 const state=initialState();state.settings.energyUnit='kJ';const review=await lookup(state),preview=previewBarcode(state,payload(review),context);
 assert.equal(review.energyUnit,'kJ');assert.deepEqual(preview.energy,{value:261.5,unit:'kJ'});assert.equal(preview.nutrition.totals.calories,62.5);
 applyBarcodeLog(state,payload(review),context);assert.equal(entryFacts(state,state.entries[0]).nutrients.calories,62.5);assert.equal(state.foods.find(f=>f.id===review.resource.id).nutrients.calories,125);
});
