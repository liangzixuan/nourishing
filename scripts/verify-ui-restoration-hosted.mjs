// Production PWA navigation and settings, with one disposable account.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import {ID,Query} from 'node-appwrite';
import {fixtureOperator} from './fixture-operator.mjs';
import {allRows,databaseId} from './operator.mjs';

const origin=process.env.VERIFY_ORIGIN??'https://nourishing.app';
assert.equal(origin,'https://nourishing.app');
const {users,db}=fixtureOperator(),id=ID.unique(),email=`ui-${id}@example.com`,password=randomUUID()+'Aa1!';
const owner=JSON.parse(readFileSync('.local/migration-destination.json')).accountId;
const args=(tableId,rowId)=>({databaseId,tableId,rowId});
const before=await db.getRow(args('workspace_heads',owner));
const directory='.local/ui-restoration-hosted';mkdirSync(directory,{recursive:true});
const report={at:new Date().toISOString(),origin,checks:[],fixtureRemoved:false};
const check=label=>{report.checks.push(label);console.log(label);};
let browser,page,created=false,primaryError;
try{
 await users.create({userId:id,email,password,name:'UI restoration fixture'});created=true;
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true,colorScheme:'dark'});
 assert.equal((await context.request.post(origin+'/api/auth/login',{headers:{Origin:origin},data:{email,password}})).status(),200);
 page=await context.newPage();page.setDefaultTimeout(45000);const errors=[],failed=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('response',response=>{if(response.status()>=400)failed.push({status:response.status(),path:new URL(response.url()).pathname});});
 await page.addInitScript(()=>{window.cspViolations=[];document.addEventListener('securitypolicyviolation',event=>window.cspViolations.push(event.violatedDirective));});
 const button=name=>page.getByRole('button',{name,exact:true});
 const capture=async name=>{await page.evaluate(()=>Promise.all([...document.images].map(img=>img.decode())));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${directory}/${name}.png`});};
 const diary=async()=>{const response=await context.request.get(origin+'/api/diary?date='+await page.locator('#date-picker').inputValue());assert.equal(response.status(),200);return response.json();};
 await page.goto(origin+'/diary');await page.locator('.md-summary').waitFor();await capture('diary');
 assert.equal(await page.locator('.dc-bottom button').count(),5);assert.equal(await page.locator('.app-header').isVisible(),false);
 await button('Diary actions').click();await button('Diary Display').click();await page.getByRole('switch',{name:'Water',exact:true}).uncheck();await button('Save').click();await page.locator('#sheet').waitFor({state:'hidden'});assert.equal((await diary()).presentation.settings.showWater,false);
 await page.reload();await page.locator('.md-summary').waitFor();assert.equal(await page.locator('.md-water').count(),0);
 await button('Diary actions').click();await button('Diary Display').click();await page.getByRole('switch',{name:'Water',exact:true}).check();await button('Save').click();await page.locator('#sheet').waitFor({state:'hidden'});await page.locator('.md-water').waitFor();
 await button('Add water').click();await page.locator('input[name=amount]').fill('250');await button('Add to Diary').click();await page.locator('#sheet').waitFor({state:'hidden'});assert.equal((await diary()).summary.hydration.logged,250);
 check('source Diary carousel, persistent display settings and water logging');
 await page.locator('#add-food').click();await page.locator('.am-sheet').waitFor();await capture('add-menu');
 assert.equal(await page.locator('.am-tile').count(),4);assert.equal(await page.locator('.am-row').count(),5);assert.ok(await page.locator('.am-sheet').evaluate(el=>el.getBoundingClientRect().top>200));
 await button('EDIT MENU').click();await button('Hide Voice Log').click();await button('Color for Search Food').click();await button('Color #ff9377').click();await button('DONE').click();await button('EDIT MENU').waitFor();
 await page.keyboard.press('Escape');await page.reload();await page.locator('.md-summary').waitFor();await page.locator('#add-food').click();assert.equal(await page.locator('[data-am=select][data-id=voice]').count(),0);assert.equal(await page.locator('[data-id=food] .am-icon').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 147, 119)');
 await button('EDIT MENU').click();await button('Hide Search Food').click();await page.keyboard.press('Escape');await button('Search Food').waitFor();await page.mouse.click(10,20);await page.locator('.am-sheet').waitFor({state:'detached'});
 await page.locator('#add-food').click();await button('Search Food').click();await page.locator('.mfs-header').waitFor();await button('Close').click();
 await page.locator('#add-food').click();await button('New Fast').click();await page.locator('.fasting-menu').waitFor();await button('Close').click();await button('Diary').click();await page.locator('.md-summary').waitFor();
 check('source Add to Diary sheet, cloud menu preferences, cancelled edits, outside dismissal and food-search destination');
 await button('Foods').click();await page.locator('.mfh-home').waitFor();await page.waitForFunction(()=>!document.querySelector('[data-action="new-food"]').disabled);await capture('foods');assert.equal(await page.locator('.mfh-card').count(),6);
 await page.locator('[data-tab=foods]').click();await page.getByRole('heading',{name:'Custom Foods',exact:true}).waitFor();await page.locator('[data-action=foods-home]').click();assert.equal(await page.locator('input:focus').count(),0);
 check('source Foods home and collection navigation');
 await button('More').click();await page.locator('.mm-home-header').waitFor();await capture('more');await button('Display').click();await page.getByRole('combobox',{name:'Theme',exact:true}).selectOption('system');await page.waitForFunction(()=>!document.querySelector('[aria-label=Theme]').disabled);assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('dark')),true);
 await button('Back').click();assert.equal(await page.locator('input:focus').count(),0);await button('Account').click();await page.waitForURL('**/account');await page.getByRole('heading',{name:'Account',exact:true}).waitFor();await page.getByRole('link',{name:'Open diary',exact:true}).click();await page.locator('.md-summary').waitFor();
 check('More menu, system theme, Back focus and authenticated Account route');
 await button('Discover').click();await page.locator('.dc-dashboard').waitFor();await page.waitForFunction(()=>!document.querySelector('[data-discover="shell-settings"]').disabled);await capture('discover');assert.equal(await page.locator('.dc-toolbar').count(),0);
 await button('Dashboard Settings').click();await page.getByRole('switch',{name:'Show News',exact:true}).uncheck();await page.waitForFunction(()=>document.querySelector('[data-pref=newsVisible]')?.checked===false);await button('Close').click();await button('Newsfeed').click();await page.getByRole('heading',{name:'Newsfeed',exact:true}).waitFor();await button('Close').click();
 await button('VIEW FULL REPORT').click();await page.locator('.mobile-report-toolbar').waitFor();
 await page.locator('[data-report-energy-kind=consumed]').waitFor();await capture('report');
 await button('Report Settings').click();await page.getByRole('dialog',{name:'Report Settings',exact:true}).waitFor();
 await page.getByRole('switch',{name:'Include Supplements'}).uncheck();await page.waitForFunction(()=>!document.querySelector('[name=includeSupplements]').disabled);
 await page.keyboard.press('Escape');await page.locator('[data-mobile-report=settings]').waitFor({state:'detached'});
 await button('Newsfeed').click();await page.getByRole('heading',{name:'Newsfeed',exact:true}).waitFor();await button('Close').click();
 await button('Charts').click();await page.locator('.chart-page:not([aria-busy]) [data-manage]').waitFor();await capture('charts');
 await page.locator('.app-header').getByRole('button',{name:'Manage Charts',exact:true}).click();await page.locator('[data-chart-manager]').waitFor();await button('Close').click();
 await button('Newsfeed').click();await page.getByRole('heading',{name:'Newsfeed',exact:true}).waitFor();await button('Close').click();
 await button('Snapshots').click();await page.locator('.snapshot-empty').waitFor();await button('Add Snapshot').waitFor();await capture('snapshots');
 await button('Newsfeed').click();await page.getByRole('heading',{name:'Newsfeed',exact:true}).waitFor();await button('Close').click();
 check('source Discover header, Newsfeed, settings and Report/Charts/Snapshots navigation');
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.deepEqual(await page.evaluate(()=>window.cspViolations),[]);
 assert.deepEqual(await db.getRow(args('workspace_heads',owner)),before);check('owner workspace unchanged; no browser, HTTP or CSP errors');report.status='passed';
}catch(error){primaryError=error;report.status='failed';report.error=error.message;await page?.screenshot({path:`${directory}/failure.png`}).catch(()=>{});}
finally{
 await browser?.close();
 if(created){try{
  for(const tableId of ['workspace_records','workspace_media','workspace_recoveries','command_receipts'])for(const row of await allRows(db,tableId,[Query.equal('ownerId',id)]))await db.deleteRow(args(tableId,row.$id));
  for(const tableId of ['workspace_heads','profiles','reminder_dispatch','fasting_dispatch'])try{await db.deleteRow(args(tableId,id));}catch(error){if(error.code!==404)throw error;}
  await users.delete({userId:id});report.fixtureRemoved=true;
 }catch(error){report.cleanupError=error.message;primaryError??=error;}}
 writeFileSync(`${directory}/result.json`,JSON.stringify(report,null,2));
}
console.log(JSON.stringify(report));if(primaryError)throw primaryError;
