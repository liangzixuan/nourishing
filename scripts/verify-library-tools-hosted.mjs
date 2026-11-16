// Run after the candidate is active. Uses and removes one disposable account.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {ID,Query} from 'node-appwrite';
import {fixtureOperator} from './fixture-operator.mjs';
import {allRows,databaseId} from './operator.mjs';
const origin='https://nourishing.app',{users,db}=fixtureOperator(),id=ID.unique(),email=`retirement-${id}@example.com`,password=randomUUID()+'Aa1!';
const owner=JSON.parse(readFileSync('.local/migration-destination.json')).accountId;let before;
const report={at:new Date().toISOString(),checks:[],fixtureRemoved:false};let browser,page,created=false,failure,routeFailure,phase='Create fixture';
const safeFailure=(error,stage)=>({stage,kind:error?.name==='AssertionError'?'assertion':error?.name==='TimeoutError'?'timeout':'operation',...(Number.isInteger(error?.code)?{status:error.code}:{})});
try{
 before=await db.getRow({databaseId,tableId:'workspace_heads',rowId:owner});
 await users.create({userId:id,email,password,name:'Library retirement fixture'});created=true;
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});context.setDefaultTimeout(60000);
 assert.equal((await context.request.post(origin+'/api/auth/login',{headers:{Origin:origin},data:{email,password}})).status(),200);
 const get=async path=>{const response=await context.request.get(origin+path);assert.equal(response.status(),200,path);return response.json();},post=async(path,data)=>{const response=await context.request.post(origin+path,{headers:{Origin:origin},data});assert.equal(response.status(),200,path);return response.json();},command=async(type,payload)=>post('/api/library/command',{requestId:randomUUID(),revision:(await get('/api/library')).revision,type,payload});
 const food=(await command('food.save',{name:'Fixture rice',serving:'100 g',grams:100,nutrients:{calories:130,protein:3},portions:[{id:'bowl',label:'Bowl',grams:200}]})).item.id;
 await command('recipe.save',{name:'Fixture rice recipe',servings:2,ingredients:[{foodId:food,amount:2}]});
 const day=new Date().toLocaleDateString('en-CA'),addEntry=async()=>post('/api/workspace/command',{requestId:randomUUID(),revision:(await get('/api/library')).revision,type:'entry.add',payload:{foodId:food,date:day,group:'Lunch',amount:1}});await addEntry();
 const saved=async()=>(await get('/api/library/item?kind=food&id='+encodeURIComponent(food))).resource;
 page=await context.newPage();const errors=[],writes=[];page.on('pageerror',error=>errors.push(error.message));await page.addInitScript(()=>{window.cspErrors=[];document.addEventListener('securitypolicyviolation',event=>window.cspErrors.push(event.violatedDirective));});
 await page.goto(origin+'/diary');await page.locator('.md-summary').waitFor();await page.getByRole('button',{name:'Foods',exact:true}).click();await page.locator('[data-tab=foods]').click();await page.locator(`[data-library-item="${food}"]`).click();
 const ready=()=>page.waitForFunction(()=>document.querySelector('[data-mfe-submit]')?.disabled===false),layer=()=>page.locator('.library-retirement'),loaded=async()=>{await layer().locator('[name=confirmed]').waitFor();await layer().locator('[data-retirement-save]').waitFor();await page.waitForFunction(()=>{const form=document.querySelector('.library-retirement form');return form&&!form.inert;});},action=async label=>{const button=page.locator(`[data-food-action="${label}"]`);if(!await button.isVisible())await page.getByText('More Details',{exact:true}).click();await button.waitFor({state:'visible'});await button.click();},confirm=async()=>{await layer().locator('[name=confirmed]').check();await layer().locator('[data-retirement-save]').click();};
 phase='Editor retirement cancellation';await ready();await page.getByLabel('Name',{exact:true}).fill('Unsaved fixture draft');await page.locator('.mobile-food-editor').evaluate(node=>node.dataset.identity='original');await action('retire');await loaded();assert.match(await layer().locator('dl').innerText(),/Diary entries\s+1/);assert.match(await layer().locator('dl').innerText(),/Recipes\s+1/);await page.keyboard.press('Escape');assert.equal(await page.getByLabel('Name',{exact:true}).inputValue(),'Unsaved fixture draft');assert.equal(await page.locator('[data-food-action="retire"]').evaluate(node=>node===document.activeElement),true);
 // Lost response, child dismissal and reopening must retain the identical command receipt.
 phase='Interrupted retirement receipt';let drop=true;await page.route('**/api/library/command',async route=>{try{const input=route.request().postDataJSON();if(input.type!=='library.retirement')return await route.continue();writes.push(input);if(drop){drop=false;const response=await route.fetch();assert.equal(response.status(),200);return await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Save reply interrupted'})});}return await route.continue();}catch(error){routeFailure=error;await route.abort().catch(()=>{});}});
 await action('retire');await loaded();await confirm();await layer().getByRole('button',{name:'Try again',exact:true}).waitFor();assert.equal((await saved()).retired,true);await layer().getByRole('button',{name:'Cancel',exact:true}).click();await action('retire');await layer().getByRole('button',{name:'Try again',exact:true}).click();await layer().waitFor({state:'detached'});await page.unrouteAll({behavior:'wait'});assert.equal(Boolean(routeFailure),false,'Intercepted route failed');assert.deepEqual(writes[0],writes[1]);assert.equal(await page.locator('.mobile-food-editor').getAttribute('data-identity'),'original');assert.equal(await page.getByLabel('Name',{exact:true}).inputValue(),'Unsaved fixture draft');assert.equal((await saved()).name,'Fixture rice');
 // A newly logged use invalidates the review; a fresh review restores the same saved identity.
 phase='Open restore review';await action('restore');await loaded();
 phase='Invalidate restore revision';await addEntry();await confirm();await layer().getByRole('button',{name:'Review latest',exact:true}).waitFor();assert.equal((await saved()).retired,true);
 phase='Wait for fresh dependency review';const freshResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/library/tools'&&response.request().method()==='GET');await layer().getByRole('button',{name:'Review latest',exact:true}).click();const response=await freshResponse;assert.equal(response.status(),200);const fresh=await response.json();assert.equal(fresh.review.counts.entries,2);await loaded();await layer().getByRole('button',{name:'Restore',exact:true}).waitFor();assert.equal(await layer().getByRole('button',{name:'Review latest',exact:true}).count(),0);assert.match(await layer().locator('dl').innerText(),/Diary entries\s+2/);await page.screenshot({path:'.local/library-tools-hosted-mobile.png'});
 phase='Apply refreshed restore';await confirm();await layer().waitFor({state:'detached'});await ready();assert.equal((await saved()).retired,undefined);assert.equal(await page.getByLabel('Name',{exact:true}).inputValue(),'Unsaved fixture draft');
 phase='Verify restored history and saved identity';await page.locator('[data-mfe-close]').click();assert.equal((await saved()).name,'Fixture rice');assert.deepEqual((await saved()).portions,[{id:'bowl',label:'Bowl',grams:200}]);assert.equal((await get('/api/diary?date='+day)).entries.length,2);
 // The same source review is available directly from the collection action sheet.
 phase='Collection cancellation';await page.locator(`[data-library-item="${food}"]`).dispatchEvent('contextmenu');await page.getByRole('button',{name:'Retire from library',exact:true}).click();await loaded();await layer().getByRole('button',{name:'Cancel',exact:true}).click();assert.equal((await saved()).retired,undefined);
 report.checks.push('Actual Foods editor and collection open direct source retirement review','Cancel restores original focus and keeps unsaved editor draft','Interrupted committed response retries the exact receipt after reopening','Stale revision requires fresh dependency review before restore','Saved identity, portions, original name and diary history retained');
 phase='Owner and browser integrity';const after=await db.getRow({databaseId,tableId:'workspace_heads',rowId:owner});assert.equal(after.digest,before.digest);assert.equal(after.$updatedAt,before.$updatedAt);assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.cspErrors),[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));report.checks.push('Owner unchanged; no browser/CSP errors or horizontal overflow');report.status='passed';
}catch(error){failure=safeFailure(error,phase);await page?.screenshot({path:'.local/library-tools-hosted-failure.png'}).catch(()=>{});}finally{
 try{await page?.unrouteAll({behavior:'wait'});}catch(error){failure??=safeFailure(error,'Drain intercepted routes');}
 if(routeFailure)failure??=safeFailure(routeFailure,'Intercepted route');
 try{await browser?.close();}catch(error){failure??=safeFailure(error,'Close browser');}
 try{
  for(const tableId of ['command_receipts','workspace_records','workspace_media'])for(const row of await allRows(db,tableId,[Query.equal('ownerId',id)])){assert.equal(row.ownerId,id);await db.deleteRow({databaseId,tableId,rowId:row.$id});}
  for(const tableId of ['workspace_heads','profiles'])try{await db.deleteRow({databaseId,tableId,rowId:id});}catch(error){if(error.code!==404)throw error;}
  if(created)await users.delete({userId:id});report.fixtureRemoved=true;
 }catch(error){failure??=safeFailure(error,'Fixture cleanup');report.fixtureRemoved=false;}
}
if(failure){report.status='failed';report.failure=failure;process.exitCode=1;}
writeFileSync('.local/library-tools-hosted-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
