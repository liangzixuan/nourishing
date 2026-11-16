// Verify deployed Targets using a disposable account; never change owner settings.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import {ID,Query} from 'node-appwrite';
import {fixtureOperator} from './fixture-operator.mjs';
import {allRows,databaseId} from './operator.mjs';
const origin='https://nourishing.app',{users,db}=fixtureOperator(),id=ID.unique(),email=`targets-${id}@example.com`,password=randomUUID()+'Aa1!';
const owner=JSON.parse(readFileSync('.local/migration-destination.json')).accountId,before=await db.getRow({databaseId,tableId:'workspace_heads',rowId:owner});
const report={at:new Date().toISOString(),checks:[],fixtureRemoved:false};let browser,page,created=false;
try{
 await users.create({userId:id,email,password,name:'Targets hosted fixture'});created=true;
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});context.setDefaultTimeout(60000);
 assert.equal((await context.request.post(origin+'/api/auth/login',{headers:{Origin:origin},data:{email,password}})).status(),200);
 const day=new Date().toLocaleDateString('en-CA'),get=async path=>{const response=await context.request.get(origin+path);assert.equal(response.status(),200,path);return response.json();};
 page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.addInitScript(()=>{window.cspErrors=[];document.addEventListener('securitypolicyviolation',event=>window.cspErrors.push(event.violatedDirective));});
 await page.goto(origin+'/diary');await page.locator('.md-summary').waitFor();await page.getByRole('button',{name:'More',exact:true}).click();await page.getByRole('button',{name:'Targets',exact:true}).click();assert.equal(await page.locator('[data-mt-home] button').count(),6);
 await page.getByRole('button',{name:'Nutrient Targets',exact:true}).click();const ready=()=>page.locator('[data-mnt-ready]').waitFor();await ready();assert.equal(await page.locator('[data-mnt-category]').count(),6);await page.screenshot({path:'.local/targets-home-hosted.png'});
 await page.locator('[data-mnt-category=minerals]').click();const sodium=page.locator('[data-mnt-row=sodium]');
 if(!await sodium.locator('[data-mnt-field=custom]').isChecked()){await sodium.locator('[data-mnt-field=custom]').check();await ready();}
 await sodium.locator('[data-mnt-field=dailyTarget]').fill('1234');await sodium.locator('[data-mnt-field=dailyTarget]').press('Tab');await ready();
 await sodium.locator('[data-mnt-field=maximum]').fill('2300');await sodium.locator('[data-mnt-field=maximum]').press('Tab');await ready();
 const readSodium=async()=> (await get('/api/nutrient-targets?date='+day)).groups.flatMap(group=>group.nutrients).find(row=>row.id==='sodium');
 let saved=await readSodium();assert.equal(saved.dailyTarget.effective,1234);assert.equal(saved.maximum.effective,2300);
 await sodium.locator('[data-mnt-field=custom]').uncheck();await ready();assert.equal(await sodium.locator('[data-mnt-field=dailyTarget]').isDisabled(),true);await sodium.locator('[data-mnt-field=custom]').check();await ready();assert.equal(await sodium.locator('[data-mnt-field=dailyTarget]').inputValue(),'1234');
 await sodium.locator('[data-mnt-help]').click();await page.locator('.mnt-help-dialog').waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('.mnt-help-dialog').count(),0);await sodium.scrollIntoViewIfNeeded();await page.screenshot({path:'.local/targets-minerals-hosted.png'});
 report.checks.push('six-row Targets home and six nutrient categories render','custom target and maximum persist; reference mode preserves custom values; help dismisses');
 await page.locator('[data-mt-back]').click();await page.locator('[data-mnt-edit-highlights]').click();await page.getByLabel('Highlighted nutrient 1',{exact:true}).selectOption('ash');await page.locator('#sheet').getByRole('button',{name:'Save',exact:true}).click();await ready();assert.equal(await page.locator('[data-mnt-highlight=ash]').count(),1);
 await page.locator('[data-mt-back]').click();await page.getByRole('button',{name:'Nutrition Scores',exact:true}).click();await page.locator('[name=showScores]').waitFor();await page.keyboard.press('Escape');await page.locator('[data-mt-home]').waitFor();await page.locator('[data-mt-back]').click();await page.getByRole('heading',{name:'More',exact:true}).waitFor();
 await page.getByRole('button',{name:'Targets',exact:true}).click();await page.getByRole('button',{name:'Nutrient Targets',exact:true}).click();await ready();await page.locator('[data-mnt-category=minerals]').click();assert.equal(await page.locator('[data-mnt-row=sodium] [data-mnt-field=dailyTarget]').inputValue(),'1234');
 report.checks.push('highlight edits refresh; scores and Back return to correct screens; saved targets survive reopening');
 const after=await db.getRow({databaseId,tableId:'workspace_heads',rowId:owner});assert.equal(after.digest,before.digest);assert.equal(after.$updatedAt,before.$updatedAt);assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.cspErrors),[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));report.checks.push('owner unchanged; no browser/CSP errors or horizontal overflow');report.status='passed';
}catch(error){await page?.screenshot({path:'.local/targets-hosted-failure.png'}).catch(()=>{});throw error;}finally{
 await browser?.close();for(const tableId of ['command_receipts','workspace_records','workspace_media'])for(const row of await allRows(db,tableId,[Query.equal('ownerId',id)]))await db.deleteRow({databaseId,tableId,rowId:row.$id});for(const tableId of ['workspace_heads','profiles'])try{await db.deleteRow({databaseId,tableId,rowId:id});}catch(error){if(error.code!==404)throw error;}if(created)await users.delete({userId:id});
}
report.fixtureRemoved=true;writeFileSync('.local/targets-hosted-result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
