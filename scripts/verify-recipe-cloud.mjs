// Live disposable Appwrite transactions; fixture HTML replaces only public page transport.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Client,ID,Query,TablesDB} from 'node-appwrite';
import {fixtureOperator} from './fixture-operator.mjs';
import {allRows,databaseId} from './operator.mjs';
import {createAppwriteService} from '../server/appwrite-service.mjs';
import {createDataRepository} from '../server/data-repository.mjs';
import {loadCatalogIndex} from '../server/catalog-index.mjs';
import {importRecipeUrl} from '../server/recipe-import.mjs';
import {foodSourceFacts} from '../server/domain/food-catalog-identity.mjs';
import {recipeNutrition} from '../server/domain/nutrition.mjs';

const {users,db,storage,config}=fixtureOperator(),ids=[ID.unique(),ID.unique()],created=[];
const key=JSON.parse(readFileSync(new URL('../.local/data-key.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
const api=createAppwriteService({endpoint:config.endpoint,project:config.projectId,database:databaseId,profileTable:'profiles'},key.secret);
const args=(tableId,id)=>({databaseId,tableId,rowId:id}),cleanupFailures=[];
const report={at:new Date().toISOString(),checks:[],transport:'Fixture Microdata HTML; real published compact catalog, Appwrite service and transactions. Hosted HTTP not exercised.'};
const ledgerPath=new URL('../.local/recipe-cloud-fixture.json',import.meta.url),reportPath=new URL('../.local/recipe-cloud-verification.json',import.meta.url);
const remember=()=>writeFileSync(ledgerPath,JSON.stringify({accounts:ids,created,cleanupFailures,removed:report.fixtureRemoved??false}));remember();
const denied=operation=>assert.rejects(operation,error=>[401,403,404].includes(error.code));
try{
 const secrets=[];for(const userId of ids){await users.create({userId,email:`recipe-${userId}@example.com`,password:randomUUID()+'Aa1!',name:'Recipe verification fixture'});created.push(userId);remember();secrets.push((await users.createSession({userId})).secret);}
 const [secret,otherSecret]=secrets,owner=ids[0],repository=createDataRepository(db,owner);
 await api.library(secret);await api.library(otherSecret);
 const initial=await repository.readState(),head=await db.getRow(args('catalog_heads','active'));
 const catalog=await loadCatalogIndex({storage,head,namespace:config.endpoint+'/'+config.projectId});
 const html='<div itemscope itemtype="https://schema.org/Recipe"><h1 itemprop="name">Cloud recipe fixture</h1><meta itemprop="recipeYield" content="4 servings"><span itemprop="recipeIngredient">200 g white rice</span><span itemprop="recipeIngredient">100 g black beans</span><p itemprop="recipeInstructions">Mix and cook.</p></div>';
 const source='https://recipe.example/cloud-fixture';
 const imported=await importRecipeUrl(initial,catalog,{url:source},{fetchPage:async()=>({text:html,url:source})});
 const draft=imported.draft;
 for(const [index,row] of draft.rows.entries()){
  row.selection??=imported.review.rows[index].candidates.find(candidate=>candidate.ref.kind==='catalog')?.ref;
  assert.equal(row.selection?.kind,'catalog');row.selection={kind:'catalog',id:row.selection.id};
  row.override={quantity:index===0?150:75,unit:'g'};row.confirmed=true;
 }
 const preview=await api.previewRecipeImport(secret,draft);assert.equal(preview.review.canSave,true);
 const before=await repository.readState();assert.equal(before.recipes.length,0);assert.equal(before.foods.length,initial.foods.length);
 const originals=await Promise.all(draft.rows.map(async row=>(await repository.food(row.selection.id)).food));
 const save={requestId:randomUUID(),revision:preview.revision,draft:preview.draft},saved=await api.saveRecipeImport(secret,save);
 const state=await repository.readState();assert.equal(state.recipes.length,1);const recipe=state.recipes[0];
 assert.equal(recipe.source,source);assert.equal(recipe.instructions,'Mix and cook.');assert.deepEqual(recipe.importReview.originalIngredients,draft.originalIngredients);
 assert.equal(recipe.importReview.modifiedAfterImport,false);assert.equal(recipe.servings,4);
 for(const [index,ingredient] of recipe.ingredients.entries()){
  const captured=state.foods.find(food=>food.id===ingredient.foodId);assert.ok(captured);assert.deepEqual(foodSourceFacts(captured),foodSourceFacts(originals[index]));
  assert.deepEqual({quantity:ingredient.quantity,unit:ingredient.unit},{quantity:index===0?150:75,unit:'g'});
  assert.deepEqual(recipe.importReview.rows[index].selection,draft.rows[index].selection);
 }
 assert.deepEqual(recipeNutrition(state,recipe).nutrients,preview.review.preview.perServing);
 const list=await api.library(secret);assert.equal(list.items.filter(item=>item.kind==='recipe').length,1);
 report.checks.push('production parser and compact catalog preview leaves workspace unchanged','source URL, instructions, review evidence and gram quantities retained','selected catalog facts captured exactly and nutrition agrees with preview','saved recipe appears in Foods library');
 assert.deepEqual(await api.saveRecipeImport(secret,save),saved);assert.equal((await repository.readState()).recipes.length,1);
 await assert.rejects(()=>api.saveRecipeImport(secret,{...save,requestId:randomUUID()}),error=>error.code===409);
 const receipts=await allRows(db,'command_receipts',[Query.equal('ownerId',owner)]);assert.equal(receipts.length,1);
 report.checks.push('same request replays without duplicate recipe or receipt','stale revision rejected');
 const otherDb=new TablesDB(new Client().setEndpoint(config.endpoint).setProject(config.projectId).setSession(otherSecret));
 await denied(()=>otherDb.getRow(args('workspace_heads',owner)));
 const records=await allRows(db,'workspace_records',[Query.equal('ownerId',owner)]);assert.ok(records.length);
 await denied(()=>otherDb.getRow(args('workspace_records',records[0].$id)));
 const foreign=structuredClone(draft);foreign.rows[0].selection={kind:'library',id:recipe.ingredients[0].foodId};
 await assert.rejects(()=>api.previewRecipeImport(otherSecret,foreign),error=>error.code===400);
 assert.equal((await api.library(otherSecret)).items.filter(item=>item.kind==='recipe').length,0);
 await assert.rejects(()=>api.saveRecipeImport(secret,{...save,ownerId:ids[1]}),error=>error.code===400);
 report.checks.push('other account cannot read workspace head or rows or reference private ingredients','owner override rejected');
}finally{
 const clean=async(label,operation)=>{try{await operation();}catch(error){if(error.code!==404)cleanupFailures.push({resource:label,code:error.code??'unknown'});}};
 for(const userId of created){
  for(const tableId of ['command_receipts','workspace_media','workspace_records']){
   let rows=[];await clean(`${tableId}:${userId}:list`,async()=>{rows=await allRows(db,tableId,[Query.equal('ownerId',userId)]);});
   for(const row of rows){assert.equal(row.ownerId,userId);await clean(`${tableId}:${row.$id}`,()=>db.deleteRow(args(tableId,row.$id)));}
  }
  for(const tableId of ['workspace_heads','profiles'])await clean(`${tableId}:${userId}`,()=>db.deleteRow(args(tableId,userId)));
  await clean(`users:${userId}`,()=>users.delete({userId}));
 }
 report.fixtureRemoved=cleanupFailures.length===0;remember();writeFileSync(reportPath,JSON.stringify({...report,status:'verification-incomplete'},null,2));
 if(cleanupFailures.length)throw Error('Recipe fixture cleanup incomplete; see .local/recipe-cloud-fixture.json.');
}
report.status='passed';writeFileSync(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
