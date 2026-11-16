// Production language acceptance uses one disposable account; it never changes the owner.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import {ID,Query} from 'node-appwrite';
import {fixtureOperator} from './fixture-operator.mjs';
import {allRows,databaseId} from './operator.mjs';
import {uiMessages} from '../public/report-source/public/locales/index.js';
import {coreText} from '../public/core-cloud-messages.js';

const origin='https://nourishing.app',{users,db}=fixtureOperator(),id=ID.unique(),email=`language-${id}@example.com`,password=randomUUID()+'Aa1!';
const owner=JSON.parse(readFileSync('.local/migration-destination.json')).accountId;
const report={at:new Date().toISOString(),checks:[],fixtureRemoved:false};let browser,page,created=false,failure,routeFailure,before,phase='Create fixture';
const safeFailure=(error,stage)=>({stage,kind:error?.name==='AssertionError'?'assertion':error?.name==='TimeoutError'?'timeout':'operation',...(Number.isInteger(error?.code)?{status:error.code}:{})});
mkdirSync('.local/language-hosted',{recursive:true});
try{
 before=await db.getRow({databaseId,tableId:'workspace_heads',rowId:owner});
 await users.create({userId:id,email,password,name:'Language fixture'});created=true;
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const context=await browser.newContext({locale:'pt-BR',viewport:{width:412,height:915},isMobile:true,hasTouch:true});context.setDefaultTimeout(60000);
 assert.equal((await context.request.post(origin+'/api/auth/login',{headers:{Origin:origin},data:{email,password}})).status(),200);
 const get=async path=>{const response=await context.request.get(origin+path);assert.equal(response.status(),200,path);return response.json();};
 const day=new Date().toLocaleDateString('en-CA'),command=async(type,payload)=>{const diary=await get('/api/diary?date='+day);const response=await context.request.post(origin+(type==='food.save'?'/api/library/command':'/api/workspace/command'),{headers:{Origin:origin},data:{requestId:randomUUID(),revision:diary.revision,type,payload}});assert.equal(response.status(),200,type);return response.json();};
 const food=(await command('food.save',{name:'Original Food',serving:'Original bowl',grams:100,nutrients:{calories:120,protein:0}})).item.id;await command('entry.add',{foodId:food,date:day,time:'12:34',group:'Lunch',amount:1});const initial=await get('/api/diary?date='+day);
 await command('display.save',{appLanguage:'fr'});
 page=await context.newPage();const errors=[],writes=[];page.on('pageerror',error=>errors.push(error.message));await page.addInitScript(()=>{window.cspErrors=[];document.addEventListener('securitypolicyviolation',event=>window.cspErrors.push(event.violatedDirective));});
 phase='Tab timing baseline';await page.goto(origin+'/diary');await page.locator('.md-diary').waitFor();
 const timings=[],apiReads=[];const readListener=req=>{const url=new URL(req.url());if(req.method()==='GET'&&url.pathname.startsWith('/api/'))apiReads.push(url.pathname);};page.on('request',readListener);
 for(let round=0;round<3;round++)for(const [name,button,ready]of [['Dashboard','#discover-tab','.cloud-dashboard'],['Charts','.dc-tabs [data-tab=charts]','[data-manage]'],['Report','.dc-tabs [data-tab=report]','.mobile-report-toolbar'],['Diary','#diary-tab','.md-diary']]){
  const count=apiReads.length,start=performance.now();await page.locator(button).click();await page.locator(ready).waitFor();timings.push({round,name,elapsedMs:Math.round(performance.now()-start),requests:apiReads.slice(count)});
 }
 page.off('request',readListener);writeFileSync('.local/language-hosted/tab-timings.json',JSON.stringify({at:new Date().toISOString(),samples:timings,readyDefinition:'Click to visible content. A loaded Diary can be shown while server validation continues.',limitations:'Disposable account, desktop Chrome mobile viewport; includes network and automation time. Physical-device timing, CPU, memory and agent-token costs were not measured.'},null,2));
 for(const [language,next]of [['fr','de'],['de','pt-BR'],['pt-BR','en']]){
  phase=language+' Diary and Add menu';await page.goto(origin+'/diary');await page.locator('.md-diary').waitFor();assert.equal(await page.locator('html').getAttribute('lang'),language);assert.equal(await page.locator('#diary-tab').innerText(),uiMessages[language]['discover.nav.diary']);assert.equal(await page.locator('[data-diary-record]').filter({hasText:'Original Food'}).count(),1);
  await page.locator('#add-food').click();await page.locator('.am-sheet').waitFor();assert.equal(await page.locator('.am-sheet h2').textContent(),coreText('add.title',{},language));assert.equal(await page.locator('[data-am=select][data-id=photo]').getAttribute('aria-label'),coreText('add.photo',{},language));await page.screenshot({path:'.local/language-hosted/'+language+'-add.png'});await page.keyboard.press('Escape');
  phase=language+' Discover headers';await page.locator('#discover-tab').click();await page.locator('.cloud-dashboard').waitFor();
  for(const tab of ['charts','report','snapshots','dashboard']){
   await page.locator('.dc-tabs [data-tab="'+tab+'"]').click();await page.locator('.dc-tabs [data-tab="'+tab+'"][aria-current=page]').waitFor();assert.equal(await page.locator('.dc-tabs [data-tab="'+tab+'"]').textContent(),uiMessages[language]['discover.nav.'+tab]);assert.equal(await page.locator('[data-discover=shell-newsfeed]').getAttribute('aria-label'),uiMessages[language]['discover.title.newsfeed']);if(tab!=='snapshots')assert.equal(await page.locator('[data-discover=shell-settings]').count(),1);
  }
  await page.locator('.cloud-dashboard').waitFor();await page.screenshot({path:'.local/language-hosted/'+language+'-dashboard.png'});
  phase=language+' Display language persistence';await page.locator('#settings-tab').click();await page.locator('[data-more-open=display]').click();await page.locator('[data-display-open=appLanguage]').click();await page.locator('input[name=choice][value="'+next+'"]').check();await page.keyboard.press('Escape');assert.equal((await get('/api/display')).settings.appLanguage,language);
  await page.locator('[data-display-open=appLanguage]').click();await page.locator('input[name=choice][value="'+next+'"]').check();
  if(language==='fr'){
   let drop=true;await page.route('**/api/workspace/command',async route=>{try{const input=route.request().postDataJSON();if(input.type!=='display.save'||!input.payload.appLanguage)return await route.continue();writes.push(input);if(drop){drop=false;const response=await route.fetch();assert.equal(response.status(),200);return await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({errorCode:'request.unavailable',error:'Interrupted save reply'})});}return await route.continue();}catch(error){routeFailure=error;await route.abort().catch(()=>{});}});
  }
  await page.locator('[data-display-apply]').click();if(language==='fr'){await page.locator('[data-display-retry]').waitFor();assert.equal((await get('/api/display')).settings.appLanguage,next);await page.locator('[data-display-retry]').click();}
  await page.waitForFunction(value=>document.documentElement.lang===value,next);await page.locator('[data-display-open=appLanguage]').waitFor();if(language==='fr'){await page.unrouteAll({behavior:'wait'});assert.equal(Boolean(routeFailure),false);assert.deepEqual(writes[0],writes[1]);}
  assert.equal(await page.locator('.mm-child-header h1').textContent(),uiMessages[next]['mobileDisplay.title']);await page.screenshot({path:'.local/language-hosted/'+next+'-display.png'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));report.checks.push(language+': Diary/Add/Discover headers localized; Display Cancel and saved language preserved');
 }
 phase='Data and owner integrity';const final=await get('/api/diary?date='+day);assert.deepEqual(final.entries,initial.entries);assert.deepEqual(final.summary,initial.summary);assert.equal((await get('/api/display')).settings.appLanguage,'en');const after=await db.getRow({databaseId,tableId:'workspace_heads',rowId:owner});assert.equal(after.digest,before.digest);assert.equal(after.$updatedAt,before.$updatedAt);assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.cspErrors),[]);report.checks.push('Lost successful-save reply replays the same command; records, nutrition and owner unchanged; no browser/CSP errors');report.status='passed';
}catch(error){failure=safeFailure(error,phase);await page?.screenshot({path:'.local/language-hosted/failure.png'}).catch(()=>{});}finally{
 try{await page?.unrouteAll({behavior:'wait'});}catch(error){failure??=safeFailure(error,'Drain routes');}
 if(routeFailure)failure??=safeFailure(routeFailure,'Intercepted route');
 try{await browser?.close();}catch(error){failure??=safeFailure(error,'Close browser');}
 try{
  for(const tableId of ['command_receipts','workspace_records','workspace_media'])for(const row of await allRows(db,tableId,[Query.equal('ownerId',id)])){assert.equal(row.ownerId,id);await db.deleteRow({databaseId,tableId,rowId:row.$id});}
  for(const tableId of ['workspace_heads','profiles'])try{await db.deleteRow({databaseId,tableId,rowId:id});}catch(error){if(error.code!==404)throw error;}
  if(created)await users.delete({userId:id});report.fixtureRemoved=true;
 }catch(error){failure??=safeFailure(error,'Fixture cleanup');}
}
if(failure){report.status='failed';report.failure=failure;process.exitCode=1;}
writeFileSync('.local/language-hosted/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
