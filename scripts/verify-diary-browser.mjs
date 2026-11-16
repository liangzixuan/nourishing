import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import {ID,Query} from 'node-appwrite';
import {fixtureOperator} from './fixture-operator.mjs';
import {allRows,databaseId} from './operator.mjs';
const origin='https://nourishing.app', {users,db}=fixtureOperator(),owner=ID.unique(),email=`browser-${owner}@example.com`,password=randomUUID()+'Aa1!';
writeFileSync('.local/diary-browser-fixture.json',JSON.stringify({owner}));
let browser,page,created=false;const errors=[],report={at:new Date().toISOString()};
try{
 await users.create({userId:owner,email,password,name:'Browser diary fixture'});created=true;
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({viewport:{width:412,height:915},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 page=await context.newPage();page.setDefaultTimeout(60000);page.on('pageerror',error=>errors.push(error.message));await page.addInitScript(()=>{window.cspViolations=[];document.addEventListener('securitypolicyviolation',event=>window.cspViolations.push(event.violatedDirective));});
 await page.goto(origin+'/login');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.waitForURL('**/diary');await page.locator('#page[aria-busy="false"] .md-summary').waitFor();
 assert.equal(await page.locator('[data-diary-record]').count(),0);const beverage=await context.request.get(origin+'/api/food-search?category=beverages&limit=5');assert.equal(beverage.status(),200);const beverageResult=await beverage.json();assert.ok(beverageResult.total>0);assert.equal(beverageResult.options.category,'beverages');report.beverageMatches=beverageResult.total;
 await page.locator('#add-food').click();await page.getByRole('button',{name:'Search Food',exact:true}).click();const searched=page.waitForResponse(r=>r.url().includes('/api/food-search?')&&r.url().includes('rice')&&r.status()===200);await page.getByRole('searchbox').fill('rice cooked');await searched;await page.locator('.mfs-result').first().waitFor();
 assert.equal(await page.locator('[data-mfs-category]').count(),8);await page.screenshot({path:'.local/cloud-food-search.png'});await page.locator('.mfs-result').first().click();await page.locator('.mf-form').waitFor();await page.getByRole('button',{name:'Add to favorites',exact:true}).click();await page.getByRole('button',{name:'Remove from favorites',exact:true}).waitFor();await page.getByLabel('Amount',{exact:true}).fill('150');await page.getByLabel('Serving',{exact:true}).selectOption('g');await page.getByLabel('Group',{exact:true}).selectOption('Lunch');
 await page.locator('.mf-preview:not([aria-busy=true]) canvas').waitFor();await page.screenshot({path:'.local/cloud-food-editor.png'});
 await page.getByRole('button',{name:'Add to Diary',exact:true}).click();await page.locator('#sheet').waitFor({state:'hidden'});await page.locator('[data-diary-record]').waitFor();
 await page.reload();await page.locator('[data-diary-record]').waitFor();assert.equal(await page.locator('[data-diary-record]').count(),1);
 await page.locator('.entry-name').click();await page.getByLabel('Amount',{exact:true}).fill('75');await page.getByRole('button',{name:'Save Changes',exact:true}).click();await page.locator('#sheet').waitFor({state:'hidden'});await page.locator('.food-meta').filter({hasText:'75 g'}).waitFor();
 await page.screenshot({path:'.local/cloud-diary-phone.png'});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.getByRole('button',{name:'Mark day complete'}).click();await page.getByRole('button',{name:'Reopen day'}).waitFor();await page.getByRole('button',{name:'Reopen day'}).click();await page.getByRole('button',{name:'Mark day complete'}).waitFor();
 await page.getByRole('button',{name:'Add note'}).click();await page.getByRole('textbox',{name:'Note',exact:true}).fill('Fixture note');await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByText('Fixture note',{exact:false}).waitFor();
 await page.locator('.entry-name').click();await page.locator('.mf-menu summary').click();await page.getByRole('button',{name:'Delete Entry',exact:true}).click();await page.locator('#sheet').waitFor({state:'hidden'});await page.waitForFunction(()=>document.querySelectorAll('[data-diary-record]').length===0);
 await page.setViewportSize({width:1000,height:800});await page.locator('#add-food').click();await page.getByRole('button',{name:'Search Food',exact:true}).click();await page.mouse.click(5,5);await page.locator('#sheet').waitFor({state:'hidden'});
 await page.getByRole('button',{name:'More',exact:true}).click();await page.getByRole('button',{name:'Account',exact:true}).click();await page.getByRole('button',{name:'Sign out'}).click();await page.waitForURL('**/login');await page.goto(origin+'/diary');await page.waitForURL('**/login');
 assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.cspViolations),[]);report.checks=['phone-sized sign-in and empty diary','live indexed beverage category','catalog search and nutrient preview','favorite mutation','food add persists after reload','edit amount','day complete and reopen','note add','food delete','outside-tap dismissal','sign-out blocks diary','no horizontal overflow or browser exceptions'];report.status='passed';
}catch(error){await page?.screenshot({path:'.local/cloud-diary-failure.png'}).catch(()=>{});throw error;}finally{
 await browser?.close();
 for(const tableId of ['command_receipts','workspace_records','workspace_media'])for(const row of await allRows(db,tableId,[Query.equal('ownerId',owner)]))await db.deleteRow({databaseId,tableId,rowId:row.$id});
 for(const tableId of ['workspace_heads','profiles'])try{await db.deleteRow({databaseId,tableId,rowId:owner});}catch(error){if(error.code!==404)throw error;}
 if(created)await users.delete({userId:owner});
}
report.fixtureRemoved=true;writeFileSync('.local/diary-browser-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
