// Hosted mobile UI and HTTP checks using accounts created and removed by this run.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import {ID,Query} from 'node-appwrite';
import {fixtureOperator} from './fixture-operator.mjs';
import {allRows,databaseId} from './operator.mjs';
import {createDataRepository} from '../server/data-repository.mjs';
import {entryFacts} from '../server/domain/nutrition.mjs';
const origin='https://nourishing-cloud.appwrite.network',{users,db}=fixtureOperator(),created=[],cleanupFailures=[],report={at:new Date().toISOString(),origin,checks:[]};let browser,page;
const ledger='.local/entry-adjustments-browser-fixture.json',output='.local/entry-adjustments-browser-verification.json';
const remember=()=>writeFileSync(ledger,JSON.stringify({created,cleanupFailures,removed:report.fixtureRemoved??false}));remember();
try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 async function account(){const id=ID.unique();await users.create({userId:id,email:`ingredient-ui-${id}@example.com`,password:randomUUID()+'Aa1!',name:'Ingredient UI fixture'});created.push(id);remember();const session=await users.createSession({userId:id}),context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});await context.addCookies([{name:'__Host-nourishing_session',value:session.secret,url:origin+'/',secure:true,httpOnly:true,sameSite:'Lax'}]);return {id,context};}
 const owner=await account(),context=owner.context,date='2026-11-14',repository=createDataRepository(db,owner.id);
 async function api(path,body){const response=body?await context.request.post(origin+path,{headers:{Origin:origin},data:body}):await context.request.get(origin+path);assert.equal(response.status(),200,`${path}: ${response.status()}`);return response.json();}
 const command=async(type,payload)=>api('/api/workspace/command',{requestId:randomUUID(),revision:(await api('/api/library')).revision,type,payload});
 const food=(await command('food.save',{name:'Ingredient UI rice',serving:'100 g',grams:100,nutrients:{calories:100,protein:10}})).item;
 const recipe=(await command('recipe.save',{name:'Ingredient UI bowl',servings:2,cookedWeightGrams:200,batchVolumeMl:400,ingredients:[{foodId:food.id,quantity:200,unit:'g'}]})).item;
 const meal=(await command('meal.save',{name:'Ingredient UI lunch',items:[{recipeId:recipe.id,amount:1},{foodId:food.id,amount:1}]})).item;
 for(let i=0;i<2;i++)await command('entry.add',{date,group:'Lunch',recipeId:recipe.id,quantity:100,unit:'g'});
 await command('entry.add',{date,group:'Lunch',mealId:meal.id,amount:2});const initial=await repository.readState();
 page=await context.newPage();page.setDefaultTimeout(30000);const errors=[],failures=[];page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.url().includes('/api/')&&response.status()>=400)failures.push([response.status(),new URL(response.url()).pathname]);});const button=name=>page.getByRole('button',{name,exact:true});
 await page.goto(origin+'/diary');await page.locator('.calorie-summary').waitFor();await page.getByLabel('Diary date',{exact:true}).fill(date);await button('Ingredient UI bowl').first().click();await button('Adjust ingredients').click();await page.locator('[data-edit="0"]').click();await page.locator('[name=amount]').fill('50');await page.getByLabel('Serving',{exact:true}).selectOption('g');await button('Use ingredient').click();await page.getByText('Recipe yield & portions',{exact:true}).click();await page.getByLabel('Cooked weight (g)',{exact:true}).fill('100');await page.locator('.nutrition-preview strong').filter({hasText:'50 kcal'}).waitFor();await page.screenshot({path:'.local/entry-adjustments-hosted-mobile.png'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));await button('Save changes').click();await page.locator('#sheet').waitFor({state:'hidden'});
 let state=await repository.readState();assert.equal(entryFacts(state,state.entries[0]).nutrients.calories,50);assert.equal(entryFacts(state,state.entries[1]).nutrients.calories,100);assert.deepEqual(state.recipes,initial.recipes);
 await button('Ingredient UI lunch').click();await button('Adjust ingredients').click();await button('Remove ingredient 2').click();await page.locator('.nutrition-preview strong').filter({hasText:'200 kcal'}).waitFor();await command('note.add',{date,group:'Lunch',time:'12:00',text:'Concurrent UI fixture update'});await button('Save changes').click();await button('Reload latest').click();await button('Remove ingredient 2').click();await page.locator('.nutrition-preview strong').filter({hasText:'200 kcal'}).waitFor();await button('Save changes').click();await page.locator('#sheet').waitFor({state:'hidden'});
 state=await repository.readState();const mealEntry=state.entries.find(row=>row.mealId);assert.equal(mealEntry.amount,1);assert.equal(entryFacts(state,mealEntry).nutrients.calories,200);assert.deepEqual(state.meals,initial.meals);assert.deepEqual(errors,[]);assert.deepEqual(failures,[[409,'/api/diary/ingredients/save']]);
 const second=await account();const selection={kind:'recipe',date,id:state.entries[0].id},path='/api/diary/ingredients?'+new URLSearchParams(selection);const forbidden=await second.context.request.get(origin+path);assert.equal(forbidden.status(),409);const extra=await context.request.get(origin+path+'&ownerId='+second.id);assert.equal(extra.status(),400);
 report.checks.push('hosted recipe ingredient quantity and cooked weight edit','preview matches saved occurrence','library and other occurrence unchanged','hosted meal removal and expansion','stale revision reload and retry','other account and owner query denied','mobile layout and no browser errors');
}catch(error){await page?.screenshot({path:'.local/entry-adjustments-hosted-failure.png'});throw error;}finally{
 await browser?.close();const clean=async(label,operation)=>{try{await operation();}catch(error){if(error.code!==404)cleanupFailures.push({resource:label,code:error.code??'unknown'});}};
 for(const owner of created){for(const tableId of ['command_receipts','workspace_media','workspace_records']){let rows=[];await clean(tableId+':list',async()=>{rows=await allRows(db,tableId,[Query.equal('ownerId',owner)]);});for(const row of rows){assert.equal(row.ownerId,owner);await clean(tableId+':'+row.$id,()=>db.deleteRow({databaseId,tableId,rowId:row.$id}));}}for(const tableId of ['workspace_heads','profiles'])await clean(tableId+':'+owner,()=>db.deleteRow({databaseId,tableId,rowId:owner}));await clean('user:'+owner,()=>users.delete({userId:owner}));}
 report.fixtureRemoved=cleanupFailures.length===0;remember();writeFileSync(output,JSON.stringify({...report,status:'verification-incomplete'},null,2));if(cleanupFailures.length)throw Error('Hosted ingredient fixture cleanup incomplete; see local ledger.');
}
report.status='passed';writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
