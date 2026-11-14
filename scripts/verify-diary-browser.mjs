import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import {ID,Query} from 'node-appwrite';
import {operator,allRows,databaseId} from './operator.mjs';
const origin='https://nourishing-cloud.appwrite.network', {users,db}=operator(),owner=ID.unique(),email=`browser-${owner}@example.com`,password=randomUUID()+'Aa1!';
writeFileSync('.local/diary-browser-fixture.json',JSON.stringify({owner}));
let browser,page,created=false;const errors=[],report={at:new Date().toISOString()};
try{
 await users.create({userId:owner,email,password,name:'Browser diary fixture'});created=true;
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({viewport:{width:412,height:915},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin+'/login');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.waitForURL('**/diary');await page.locator('#page[aria-busy="false"] .calorie-summary').waitFor();
 assert.equal(await page.locator('[data-diary-record]').count(),0);
 await page.getByRole('button',{name:'Add food',exact:true}).click();const searched=page.waitForResponse(r=>r.url().includes('/api/catalog/search?')&&r.url().includes('rice')&&r.status()===200);await page.getByRole('searchbox',{name:'Search foods'}).fill('rice cooked');await searched;await page.locator('.search-results button').first().waitFor();
 await page.locator('.search-results button').first().click();await page.locator('.entry-form').waitFor();await page.getByLabel('Amount',{exact:true}).fill('150');await page.getByLabel('Serving',{exact:true}).selectOption('g');await page.getByLabel('Group',{exact:true}).selectOption('Lunch');
 await page.locator('.nutrition-preview strong').waitFor();await page.screenshot({path:'.local/cloud-food-editor.png'});
 await page.getByRole('button',{name:'Add to diary',exact:true}).click();await page.locator('#sheet').waitFor({state:'hidden'});await page.locator('[data-diary-record]').waitFor();
 await page.reload();await page.locator('[data-diary-record]').waitFor();assert.equal(await page.locator('[data-diary-record]').count(),1);
 await page.locator('.entry-name').click();await page.getByLabel('Amount',{exact:true}).fill('75');await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.locator('#sheet').waitFor({state:'hidden'});await page.locator('.food-meta').filter({hasText:'75 g'}).waitFor();
 await page.screenshot({path:'.local/cloud-diary-phone.png'});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.getByRole('button',{name:'Mark day complete'}).click();await page.getByRole('button',{name:'Reopen day'}).waitFor();await page.getByRole('button',{name:'Reopen day'}).click();await page.getByRole('button',{name:'Mark day complete'}).waitFor();
 await page.getByRole('button',{name:'Add note'}).click();await page.getByRole('textbox',{name:'Note',exact:true}).fill('Fixture note');await page.getByRole('button',{name:'Save note'}).click();await page.getByText('Fixture note',{exact:false}).waitFor();
 await page.locator('.entry-name').click();await page.getByRole('button',{name:'Delete',exact:true}).click();await page.locator('#sheet').waitFor({state:'hidden'});await page.waitForFunction(()=>document.querySelectorAll('[data-diary-record]').length===0);
 await page.setViewportSize({width:1000,height:800});await page.getByRole('button',{name:'Add food',exact:true}).click();await page.mouse.click(5,5);await page.locator('#sheet').waitFor({state:'hidden'});
 await page.getByRole('link',{name:'Account',exact:true}).click();await page.getByRole('button',{name:'Sign out'}).click();await page.waitForURL('**/login');await page.goto(origin+'/diary');await page.waitForURL('**/login');
 assert.deepEqual(errors,[]);report.checks=['phone-sized sign-in and empty diary','catalog search and nutrient preview','food add persists after reload','edit amount','day complete and reopen','note add','food delete','outside-tap dismissal','sign-out blocks diary','no horizontal overflow or browser exceptions'];report.status='passed';
}catch(error){await page?.screenshot({path:'.local/cloud-diary-failure.png'}).catch(()=>{});throw error;}finally{
 await browser?.close();
 for(const tableId of ['command_receipts','workspace_records','workspace_media'])for(const row of await allRows(db,tableId,[Query.equal('ownerId',owner)]))await db.deleteRow({databaseId,tableId,rowId:row.$id});
 for(const tableId of ['workspace_heads','profiles'])try{await db.deleteRow({databaseId,tableId,rowId:owner});}catch(error){if(error.code!==404)throw error;}
 if(created)await users.delete({userId:owner});
}
report.fixtureRemoved=true;writeFileSync('.local/diary-browser-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
