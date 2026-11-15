// Actual service and Appwrite transaction checks; disposable accounts only.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Client,ID,Query,TablesDB} from 'node-appwrite';
import {fixtureOperator} from './fixture-operator.mjs';
import {allRows,databaseId} from './operator.mjs';
import {createAppwriteService} from '../server/appwrite-service.mjs';
import {createDataRepository} from '../server/data-repository.mjs';
import {foodSourceFacts} from '../server/domain/food-catalog-identity.mjs';
import {entryFacts} from '../server/domain/nutrition.mjs';
const {users,db,config}=fixtureOperator(),ids=[ID.unique(),ID.unique()],created=[],cleanupFailures=[];
const key=JSON.parse(readFileSync(new URL('../.local/data-key.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
const api=createAppwriteService({endpoint:config.endpoint,project:config.projectId,database:databaseId,profileTable:'profiles'},key.secret);
const args=(tableId,id)=>({databaseId,tableId,rowId:id}),report={at:new Date().toISOString(),checks:[],transport:'Actual createAppwriteService and Appwrite database; hosted HTTP not exercised.'};
const ledger=new URL('../.local/entry-adjustments-cloud-fixture.json',import.meta.url),output=new URL('../.local/entry-adjustments-cloud-verification.json',import.meta.url);
const remember=()=>writeFileSync(ledger,JSON.stringify({accounts:ids,created,cleanupFailures,removed:report.fixtureRemoved??false}));remember();
try{
 const sessions=[];for(const userId of ids){await users.create({userId,email:`ingredients-${userId}@example.com`,password:randomUUID()+'Aa1!',name:'Ingredient verification fixture'});created.push(userId);remember();sessions.push((await users.createSession({userId})).secret);}
 const [secret,otherSecret]=sessions,date='2026-11-14',owner=ids[0],repository=createDataRepository(db,owner);
 await api.library(secret);await api.library(otherSecret);
 const command=async(type,payload)=>api.workspaceCommand(secret,{requestId:randomUUID(),revision:(await api.library(secret)).revision,type,payload});
 const food=(await command('food.save',{name:'Fixture rice',serving:'100 g',grams:100,nutrients:{calories:100,protein:10}})).item;
 const recipe=(await command('recipe.save',{name:'Fixture bowl',servings:2,cookedWeightGrams:200,batchVolumeMl:400,ingredients:[{foodId:food.id,quantity:200,unit:'g'}]})).item;
 const meal=(await command('meal.save',{name:'Fixture lunch',items:[{recipeId:recipe.id,amount:1},{foodId:food.id,amount:1}]})).item;
 for(let i=0;i<2;i++)await command('entry.add',{date,group:'Lunch',recipeId:recipe.id,quantity:100,unit:'g'});
 await command('entry.add',{date,group:'Lunch',mealId:meal.id,amount:2});
 const before=await repository.readState(),entry=before.entries[0],selection={kind:'recipe',date,id:entry.id};
 const view=await api.entryAdjustment(secret,selection),results=await repository.search({query:'rice cooked',limit:20});
 let catalogFood;for(const candidate of results.items){const candidateFood=(await repository.food(candidate.id)).food;if(candidateFood.grams>0){catalogFood=candidateFood;break;}}assert.ok(catalogFood,'published catalog includes a gram-based rice record');
 const payload={kind:'recipe',date,id:entry.id,sourceRevision:view.sourceRevision,items:[{foodId:catalogFood.id,quantity:100,unit:'g'}],basis:{...view.basis,servings:4,cookedWeightGrams:400,batchVolumeMl:800}};
 const preview=await api.previewEntryAdjustment(secret,payload);assert.deepEqual(await repository.readState(),before);
 const packet={requestId:randomUUID(),revision:view.revision,type:'entry.ingredients.adjust',payload},saved=await api.workspaceCommand(secret,packet);
 let state=await repository.readState();assert.deepEqual(state.recipes,before.recipes);assert.deepEqual(state.entries[1],before.entries[1]);assert.equal(entryFacts(state,state.entries[0]).nutrients.calories,preview.after.values.calories);
 assert.deepEqual(foodSourceFacts(state.foods.find(row=>row.id===state.entries[0].recipeOverride.ingredients[0].foodId)),foodSourceFacts(catalogFood));
 assert.deepEqual(await api.workspaceCommand(secret,packet),saved);await assert.rejects(()=>api.workspaceCommand(secret,{...packet,requestId:randomUUID()}),error=>error.code===409);
 report.checks.push('catalog preview writes nothing','exact selected catalog facts captured with recipe-only adjustment','library definition and second occurrence unchanged','preview and saved nutrition agree','identical request replay and stale revision rejection');
 const mealEntry=state.entries.find(row=>row.mealId),mealView=await api.entryAdjustment(secret,{kind:'meal',date,id:mealEntry.id});
 assert.equal(mealView.items[0].amount,2);const mealPayload={kind:'meal',date,id:mealEntry.id,sourceRevision:mealView.sourceRevision,items:mealView.items.slice(0,1)};
 const mealPreview=await api.previewEntryAdjustment(secret,mealPayload);await api.workspaceCommand(secret,{requestId:randomUUID(),revision:mealView.revision,type:'entry.ingredients.adjust',payload:mealPayload});
 state=await repository.readState();assert.equal(state.entries.find(row=>row.id===mealEntry.id).amount,1);assert.equal(entryFacts(state,state.entries.find(row=>row.id===mealEntry.id)).nutrients.calories,mealPreview.after.values.calories);assert.deepEqual(state.meals,before.meals);
 await assert.rejects(()=>api.entryAdjustment(otherSecret,selection),error=>error.code===409);await assert.rejects(()=>api.previewEntryAdjustment(otherSecret,payload),error=>error.code===409);
 const otherDb=new TablesDB(new Client().setEndpoint(config.endpoint).setProject(config.projectId).setSession(otherSecret));await assert.rejects(()=>otherDb.getRow(args('workspace_heads',owner)),error=>[401,403,404].includes(error.code));
 const current=await api.entryAdjustment(secret,selection);await command('day.complete',{date,completed:true});await assert.rejects(()=>api.entryAdjustment(secret,selection),error=>[400,409].includes(error.code));
 const unchanged=await repository.readState();await assert.rejects(()=>api.previewEntryAdjustment(secret,{...payload,sourceRevision:current.sourceRevision}),error=>[400,409].includes(error.code));assert.deepEqual(await repository.readState(),unchanged);
 report.checks.push('meal logged amount expands once','other account denied source and private head access','completed day prevents further adjustments');
}finally{
 const clean=async(label,operation)=>{try{await operation();}catch(error){if(error.code!==404)cleanupFailures.push({resource:label,code:error.code??'unknown'});}};
 for(const owner of created){for(const tableId of ['command_receipts','workspace_media','workspace_records']){let rows=[];await clean(tableId+':list',async()=>{rows=await allRows(db,tableId,[Query.equal('ownerId',owner)]);});for(const row of rows){assert.equal(row.ownerId,owner);await clean(tableId+':'+row.$id,()=>db.deleteRow(args(tableId,row.$id)));}}for(const tableId of ['workspace_heads','profiles'])await clean(tableId+':'+owner,()=>db.deleteRow(args(tableId,owner)));await clean('user:'+owner,()=>users.delete({userId:owner}));}
 report.fixtureRemoved=cleanupFailures.length===0;remember();writeFileSync(output,JSON.stringify({...report,status:'verification-incomplete'},null,2));if(cleanupFailures.length)throw Error('Ingredient fixture cleanup incomplete; see local ledger.');
}
report.status='passed';writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
