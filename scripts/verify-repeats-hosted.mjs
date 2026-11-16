import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import {ID,Query} from 'node-appwrite';
import {fixtureOperator} from './fixture-operator.mjs';
import {allRows,databaseId} from './operator.mjs';
const origin='https://nourishing.app',{users,db}=fixtureOperator(),id=ID.unique(),email=`repeat-${id}@example.com`,password=randomUUID()+'Aa1!';
const owner=JSON.parse(readFileSync('.local/migration-destination.json')).accountId,before=await db.getRow({databaseId,tableId:'workspace_heads',rowId:owner});
const report={at:new Date().toISOString(),checks:[],fixtureRemoved:false};let browser,page,created=false;
try{
 await users.create({userId:id,email,password,name:'Repeat hosted fixture'});created=true;
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});context.setDefaultTimeout(60000);
 assert.equal((await context.request.post(origin+'/api/auth/login',{headers:{Origin:origin},data:{email,password}})).status(),200);
 const day=new Date().toLocaleDateString('en-CA'),get=async path=>{const response=await context.request.get(origin+path);assert.equal(response.status(),200,path);return response.json();};
 let diary=await get('/api/diary?date='+day);const command=async(type,payload)=>{const response=await context.request.post(origin+'/api/workspace/command',{headers:{Origin:origin},data:{requestId:randomUUID(),revision:diary.revision,type,payload}});assert.equal(response.status(),200,type);diary=await get('/api/diary?date='+day);return response.json();};
 const food=(await command('food.save',{name:'Fixture oats',serving:'100 g',grams:100,nutrients:{calories:200,protein:10}})).item.id;
 await command('repeat.save',{foodId:food,quantity:50,unit:'g',group:'Breakfast',time:'08:00',startDate:day,days:[0,1,2,3,4,5,6],enabled:true});
 page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.addInitScript(()=>{window.cspErrors=[];document.addEventListener('securitypolicyviolation',event=>window.cspErrors.push(event.violatedDirective));});
 await page.goto(origin+'/diary');await page.locator('.md-summary').waitFor();await page.getByRole('button',{name:'Foods',exact:true}).click();await page.locator('[data-library-repeats]').click();await page.locator('[data-mr-item]').waitFor();
 await page.locator('[data-mr-search]').fill('no matching item');await page.locator('[data-mr-no-results]').waitFor();await page.locator('[data-mr-search]').fill('oats');await page.locator('[data-action=edit-repeat]').click();await page.getByRole('heading',{name:'Set Repeat',exact:true}).waitFor();
 await page.locator('[data-mr-menu]').click();await page.getByRole('menuitem',{name:'Disable',exact:true}).click();await page.getByText('Schedule has been disabled',{exact:true}).waitFor();assert.equal((await get('/api/repeats?date='+day)).items[0].enabled,false);await page.getByRole('button',{name:'Enable Repeat',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[data-mr-fields]')?.disabled);
 await page.locator('[data-mr-timestamp]').uncheck();await page.getByLabel('Amount',{exact:true}).fill('75');await page.screenshot({path:'.local/repeat-editor-hosted.png'});
 let drop=true;const writes=[];await page.route('**/api/workspace/command',async route=>{const input=route.request().postDataJSON();if(input.type!=='repeat.save')return route.continue();writes.push(input);if(drop){drop=false;const response=await route.fetch();assert.equal(response.status(),200);return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Save reply interrupted'})});}return route.continue();});
 await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('button',{name:'Retry',exact:true}).waitFor();await page.getByRole('button',{name:'Retry',exact:true}).click();await page.locator('.mr-form').waitFor({state:'detached'});await page.locator('[data-mr-item]').waitFor();await page.unroute('**/api/workspace/command');assert.deepEqual(writes[0],writes[1]);const repeats=await get('/api/repeats?date='+day);assert.equal(repeats.items.length,1);assert.equal(repeats.items[0].quantity,75);assert.equal(repeats.items[0].time,'');assert.equal(repeats.items[0].enabled,true);
 report.checks.push('Foods opens source Repeat Items; search, disable/enable and timestamp controls work','committed save with lost reply retries the identical receipt and retains one schedule');
 await page.locator('[data-action=apply-repeats]').click();await page.getByRole('button',{name:'Add to diary',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#sheet').open);diary=await get('/api/diary?date='+day);assert.equal(diary.entries.length,1);assert.equal(diary.entries[0].facts.nutrients.calories,150);await page.locator('[data-action=repeat-home]').click();await page.locator('[data-library-repeats]').waitFor();
 report.checks.push('reviewed apply adds the expected 150 kcal once; Back returns to Foods');
 const after=await db.getRow({databaseId,tableId:'workspace_heads',rowId:owner});assert.equal(after.digest,before.digest);assert.equal(after.$updatedAt,before.$updatedAt);assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.cspErrors),[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));report.checks.push('owner unchanged; no browser/CSP errors or overflow');report.status='passed';
}catch(error){await page?.screenshot({path:'.local/repeats-hosted-failure.png'}).catch(()=>{});throw error;}finally{
 await browser?.close();for(const tableId of ['command_receipts','workspace_records','workspace_media'])for(const row of await allRows(db,tableId,[Query.equal('ownerId',id)]))await db.deleteRow({databaseId,tableId,rowId:row.$id});for(const tableId of ['workspace_heads','profiles'])try{await db.deleteRow({databaseId,tableId,rowId:id});}catch(error){if(error.code!==404)throw error;}if(created)await users.delete({userId:id});
}
report.fixtureRemoved=true;writeFileSync('.local/repeats-hosted-result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
