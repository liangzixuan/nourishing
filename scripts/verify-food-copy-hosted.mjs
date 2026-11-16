// Deployed copy flow, with public catalog facts and a disposable private account.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import {ID,Query} from 'node-appwrite';
import {fixtureOperator} from './fixture-operator.mjs';
import {allRows,databaseId} from './operator.mjs';
const origin='https://nourishing.app',{users,db}=fixtureOperator(),id=ID.unique(),email=`copy-${id}@example.com`,password=randomUUID()+'Aa1!';
const owner=JSON.parse(readFileSync('.local/migration-destination.json')).accountId,before=await db.getRow({databaseId,tableId:'workspace_heads',rowId:owner});
const report={at:new Date().toISOString(),checks:[],fixtureRemoved:false};let browser,page,created=false;
try{
 await users.create({userId:id,email,password,name:'Food copy hosted fixture'});created=true;
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});context.setDefaultTimeout(60000);
 const login=await context.request.post(origin+'/api/auth/login',{headers:{Origin:origin},data:{email,password}});assert.equal(login.status(),200);
 const get=async path=>{const response=await context.request.get(origin+path);assert.equal(response.status(),200,path);return response.json();};
 page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.addInitScript(()=>{window.cspErrors=[];document.addEventListener('securitypolicyviolation',event=>window.cspErrors.push(event.violatedDirective));});
 await page.goto(origin+'/diary');await page.locator('#page[aria-busy=false] .md-diary').waitFor();
 await page.locator('#add-food').click();await page.getByRole('button',{name:'Search Food',exact:true}).click();await page.getByRole('searchbox').fill('rice cooked');await page.locator('.mfs-result').first().waitFor();
 const detailResponse=page.waitForResponse(response=>response.url().includes('/api/library/item?')&&response.status()===200);await page.locator('.mfs-result').first().click();const original=await(await detailResponse).json();
 await page.getByLabel('Amount',{exact:true}).fill('125');await page.getByLabel('Serving',{exact:true}).selectOption('g');await page.getByLabel('Group',{exact:true}).selectOption('Lunch');await page.getByLabel('Include timestamp',{exact:true}).check();await page.getByLabel('Timestamp',{exact:true}).fill('12:34');
 const copy=async()=>{await page.locator('.mf-menu>summary').click();await page.getByRole('button',{name:'Edit a copy',exact:true}).click();await page.locator('.food-copy-editor').waitFor();};
 await copy();await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.locator('.mf-form').waitFor();assert.equal(await page.getByLabel('Amount',{exact:true}).inputValue(),'125');assert.equal(await page.getByLabel('Group',{exact:true}).inputValue(),'Lunch');assert.equal(await page.getByLabel('Timestamp',{exact:true}).inputValue(),'12:34');assert.equal((await get('/api/library')).items.filter(row=>row.kind==='food').length,0);report.checks.push('cancel restores unsaved quantity/group/time without creating a food');
 await copy();await page.locator('[name=name]').fill('Hosted custom rice');await page.locator('[name="nutrient:calories"]').fill('123');await page.screenshot({path:'.local/food-copy-hosted.png'});await page.getByRole('button',{name:'Save Food',exact:true}).click();await page.locator('#sheet').waitFor({state:'hidden'});
 const items=(await get('/api/library')).items.filter(row=>row.kind==='food');assert.equal(items.length,1);assert.equal(items[0].name,'Hosted custom rice');const copied=(await get('/api/library/item?kind=food&id='+encodeURIComponent(items[0].id))).resource;assert.equal(copied.nutrients.calories,123);assert.equal(copied.source.userModified,true);assert.deepEqual(copied.portions,original.resource.portions??[]);assert.notEqual(copied.id,original.resource.id);
 const source=(await get('/api/library/item?kind=food&id='+encodeURIComponent(original.resource.id))).resource;assert.deepEqual(source,original.resource);const day=new Date().toLocaleDateString('en-CA');assert.equal((await get('/api/diary?date='+day)).entries.length,0);report.checks.push('new editable custom food keeps source provenance and named portions','original catalog food unchanged','copy creates no diary entries');
 assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.cspErrors),[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const after=await db.getRow({databaseId,tableId:'workspace_heads',rowId:owner});assert.equal(after.digest,before.digest);assert.equal(after.$updatedAt,before.$updatedAt);report.checks.push('owner workspace unchanged; no browser/CSP errors or horizontal overflow');report.status='passed';
}catch(error){await page?.screenshot({path:'.local/food-copy-hosted-failure.png'}).catch(()=>{});console.error(await page?.locator('#sheet').innerText().catch(()=>''));throw error;}finally{
 await browser?.close();for(const tableId of ['command_receipts','workspace_records','workspace_media'])for(const row of await allRows(db,tableId,[Query.equal('ownerId',id)]))await db.deleteRow({databaseId,tableId,rowId:row.$id});for(const tableId of ['workspace_heads','profiles'])try{await db.deleteRow({databaseId,tableId,rowId:id});}catch(error){if(error.code!==404)throw error;}if(created)await users.delete({userId:id});
}
report.fixtureRemoved=true;writeFileSync('.local/food-copy-hosted-result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
