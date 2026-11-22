import {waitForOutboxIdle} from './fixtures/browser-outbox.mjs';
import {CHROME_EXECUTABLE} from './_chrome.mjs';
import {diaryCalendarView} from '../server/diary-calendar-view.mjs';
import {recordOptions,exerciseCatalogView} from '../server/record-views.mjs';
import {chooseDiaryDate} from '../scripts/diary-test-navigation.mjs';
import {barcodeAssets} from '../scripts/package-barcode-assets.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright-core';
import {initialState,act} from '../server/domain/workspace.mjs';
import {createDataRepository} from '../server/data-repository.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {diaryToolsReview} from '../server/diary-tools.mjs';
import {nutrientDetail} from '../server/nutrient-detail.mjs';
import {pauseLifeView} from '../server/pause-life-settings.mjs';
import {displayView} from '../server/display-settings.mjs';
import {createWebHandler} from '../server/http.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';



test('Diary selection stays local through offline edits and rapid selection changes',async()=>{
 const date=new Date().toLocaleDateString('en-CA'),seed=initialState();seed.settings.pauseLife={version:1,enabled:true,program:'galveston'};seed.foods=[{id:'rice',name:'Rice',grams:100,nutrients:{calories:133,protein:3,carbs:28,fat:1}},{id:'chicken',name:'Chicken',grams:100,nutrients:{calories:165,protein:30,carbs:0,fat:5}}];
 seed.foods.push({id:'snack',name:'Pending snack',grams:100,nutrients:{calories:33,protein:1,carbs:5,fat:1}});
 for(const foodId of ['rice','chicken'])act(seed,'entry.add',{foodId,date,group:'Lunch',amount:1});act(seed,'note.add',{date,group:'Lunch',text:'Note'});act(seed,'exercise.add',{date,group:'Lunch',name:'Walk',duration:30,calories:80});
 const fixture=diaryStoreFixture(seed),store=createWorkspaceStore(fixture.db,'fixture'),repository=createDataRepository(fixture.db,'fixture'),clock={now:new Date(),timeZone:'UTC'},before=fixture.state(),requests=[];let base,handler,browser,page,nutritionFailures=Infinity;
 const service={current:async()=>({id:'fixture',email:'fixture@example.com',name:'Fixture'}),offlineSnapshot:()=>store.offlineSnapshot(),workspaceCommand:(_,input)=>store.command(input,async()=>null),readDiary:async(_,day)=>repository.diary(day,clock),nutrientDetail:async(_,input)=>nutrientDetail(fixture.state(),input),diaryToolsReview:async(_,input)=>{requests.push(input);if(input.operation==='nutrition'&&nutritionFailures-->0)throw {code:503,publicMessage:'Selected totals unavailable'};return diaryToolsReview(fixture.state(),input);}};
 const vendor=new Map((await barcodeAssets()).map(asset=>['/'+asset.path,asset]));
 const assets={get(path){if(vendor.has(path))return vendor.get(path);const relative=path==='/diary'?'/diary.html':path;for(const root of ['public']){const file=resolve(root,'.'+relative);if(!file.startsWith(resolve(root)+'\\')&&!file.startsWith(resolve(root)+'/'))continue;const ext=extname(file);if(existsSync(file)&&['.html','.js','.mjs','.css','.svg','.woff2'].includes(ext))return {body:readFileSync(file),type:ext==='.html'?'text/html':ext==='.css'?'text/css':ext==='.svg'?'image/svg+xml':ext==='.woff2'?'font/woff2':'text/javascript'};}}};
 const server=createServer(async(req,res)=>{const response=await handler(new Request(base+req.url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:req,duplex:'half'})}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));});await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;handler=createWebHandler({config:{origin:base},service,assets});


 try{
  browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});page=await browser.newPage({viewport:{width:412,height:915},colorScheme:'dark',extraHTTPHeaders:{Cookie:'__Host-nourishing_session=fixture'}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false});window.csp=[];document.addEventListener('securitypolicyviolation',e=>window.csp.push(e.violatedDirective));});await page.goto(base+'/diary');await page.locator('.md-diary').waitFor();
  const ring=amount=>page.waitForFunction(amount=>window.Chart?.getChart(document.querySelector('[data-pause-ring]'))?.data.datasets[0].data.reduce((a,b)=>a+b,0)===amount,amount),selectGroup=async()=>{await page.getByRole('button',{name:'Diary actions',exact:true}).click();await page.getByRole('button',{name:'Multi-Select',exact:true}).click();await page.locator('[data-tool-select-group=Lunch]').check();};
  await ring(298);await page.waitForFunction(async()=>!!await(await import('/local-engine.js')).localWorkspaceState());
  await page.getByRole('button',{name:'Diary actions',exact:true}).click();
  assert.deepEqual(await page.locator('.diary-menu-sheet button').allTextContents(),['Complete Day','View Daily Report','Share Diary Widgets','Sort All Entries by Time','Multi-Select','Copy Current Day','Copy Previous Day','Clear All Serving Sizes','Delete All Diary Entries']);
  mkdirSync('.local/diary-selection',{recursive:true});await page.screenshot({path:'.local/diary-selection/day-menu.png'});
  await page.getByRole('button',{name:'Delete All Diary Entries',exact:true}).click();
  const deletion=page.locator('.diary-delete-confirm');
  await deletion.getByRole('heading',{name:'Delete All Diary Entries?',exact:true}).waitFor();
  assert.equal(await deletion.locator('p').first().innerText(),'Are you sure you want to delete all diary entries for the current day?');
  assert.ok(await deletion.getByRole('button',{name:'Delete All',exact:true}).isVisible());
  await page.setViewportSize({width:448,height:872});
  const bounds=await page.locator('#sheet').boundingBox();
  assert.equal(Math.round(bounds.width),368);
  assert.ok(Math.abs(bounds.y*2+bounds.height-872)<2);
  await page.screenshot({path:'.local/diary-selection/day-delete.png'});
  await page.setViewportSize({width:412,height:915});
  await deletion.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.deepEqual(fixture.state().entries,before.entries);
  await page.getByRole('button',{name:'Diary actions',exact:true}).click();
  await page.getByRole('button',{name:'Share Diary Widgets',exact:true}).click();
  await page.screenshot({path:'.local/diary-selection/share-choose.png'});
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await page.locator('.diary-share-preview img').waitFor();
  await page.waitForFunction(()=>document.querySelector('.diary-share-preview img')?.naturalWidth===900);
  await page.screenshot({path:'.local/diary-selection/share-preview.png'});
  const imageDownload=page.waitForEvent('download');await page.locator('[data-share]').click();
  await(await imageDownload).saveAs('.local/diary-selection/shared-diary.png');
  assert.equal(await page.locator('.diary-share-preview img').evaluate(img=>img.naturalWidth),900);
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await selectGroup();
  assert.equal(await page.locator('.diary-selection-tools').count(),0);
  await page.getByRole('heading',{name:'Multi Select Mode',exact:true}).waitFor();
  const titleBox=await page.getByRole('heading',{name:'Multi Select Mode',exact:true}).boundingBox(),backBox=await page.getByRole('button',{name:'Back',exact:true}).boundingBox();
  assert.ok(Math.abs(titleBox.y+titleBox.height/2-backBox.y-backBox.height/2)<2,'selection header stays on one line');
  await page.getByRole('button',{name:'Selected entry actions',exact:true}).click();
  assert.deepEqual(await page.locator('.diary-menu-sheet button').allTextContents(),['Add Timestamp to Selected','Create Recipe from Selection','Create Meal from Selection','Copy','Show Nutrition Summary','Delete']);
  assert.equal(await page.getByRole('button',{name:'Create Recipe from Selection',exact:true}).isDisabled(),true);
  const sheetLayout=await page.locator('.diary-menu-sheet').evaluate(sheet=>({
   icons:[...sheet.querySelectorAll('button img')].map(icon=>[icon.alt,icon.getBoundingClientRect().x]),
   labels:[...sheet.querySelectorAll('button span')].map(label=>label.getBoundingClientRect().x),
   last:sheet.querySelector('button:last-of-type').getBoundingClientRect().bottom,
   nav:sheet.nextElementSibling?.getBoundingClientRect().top
  }));
  assert.equal(sheetLayout.icons.length,6);assert.ok(sheetLayout.icons.every(([alt,x])=>alt===''&&x===sheetLayout.icons[0][1]));
  assert.equal(new Set(sheetLayout.labels).size,1);assert.ok(sheetLayout.last<=sheetLayout.nav+1);
  assert.equal(await page.locator('.diary-menu-navigation [aria-current=page]').getAttribute('data-discover'),'shell-diary');
  await page.getByRole('button',{name:'Delete',exact:true}).click();
  const selectedDelete=page.locator('.diary-delete-confirm[data-scope=selected]');
  await selectedDelete.getByRole('heading',{name:'Delete Entries?',exact:true}).waitFor();
  assert.equal(Math.round((await selectedDelete.boundingBox()).width),368);
  assert.match(await selectedDelete.locator('p').first().textContent(),/^Are you sure you want to delete these [0-9]+ entries\?$/);
  await selectedDelete.getByRole('button',{name:'Cancel',exact:true}).click();
  for(const name of ['Note','Walk'])await page.getByRole('checkbox',{name:'Select '+name,exact:true}).uncheck();
  await page.getByRole('button',{name:'Selected entry actions',exact:true}).click();
  await page.getByRole('button',{name:'Create Recipe from Selection',exact:true}).click();
  await page.getByRole('textbox',{name:'Recipe Name',exact:true}).waitFor();
  assert.equal(await page.locator('[data-recipe-item]').count(),2);
  assert.equal(await page.getByLabel('Recipe Name',{exact:true}).inputValue(),'');
  await page.getByRole('button',{name:'Close',exact:true}).click();
  assert.equal(await page.getByRole('checkbox',{name:'Select Rice',exact:true}).isChecked(),true);
  await page.getByRole('button',{name:'Selected entry actions',exact:true}).click();
  await page.getByRole('button',{name:'Show Nutrition Summary',exact:true}).click();
  await page.locator('.meal-nutrition-summary [aria-busy=false]').waitFor();
  assert.match(await page.locator('.meal-nutrition-summary').innerText(),/298/);
  await page.keyboard.press('Escape');
  for(const name of ['Note','Walk'])await page.getByRole('checkbox',{name:'Select '+name,exact:true}).check();
  await page.locator('[data-diary-record]').filter({hasText:'Rice'}).locator('.entry-name').click();
  assert.equal(await page.getByRole('checkbox',{name:'Select Rice',exact:true}).isChecked(),false);
  assert.equal(await page.locator('#sheet[open]').count(),0);
  await page.locator('[data-diary-record]').filter({hasText:'Rice'}).locator('.entry-name').click();
  await page.locator('.md-scope').waitFor();await ring(298);await page.getByRole('checkbox',{name:'Select Chicken',exact:true}).uncheck();await ring(133);assert.equal(await page.locator('.md-scope').innerText(),'Selected foods');
  await page.locator('[data-md-page-id=pauseLife] .md-target-protein').click();await page.locator('.nutrient-detail[aria-busy=false]').waitFor();assert.match(await page.locator('.nutrient-detail').innerText(),/Rice/);assert.doesNotMatch(await page.locator('.nutrient-detail').innerText(),/Chicken/);await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Macronutrient Targets',exact:true}).click();assert.match(await page.locator('[data-md-page-id=macros] .md-target-protein').innerText(),/3 \/ /);
  await page.getByRole('button',{name:'Energy Summary',exact:true}).click();await page.evaluate(()=>window.scrollTo(0,0));
  await page.locator('[data-md-page-id=energy] [data-action=mobile-diary-energy]').first().click();
  const detail=page.locator('.ds-energy');
  assert.equal(await detail.locator('[data-card=consumed] .ds-energy-ring strong').innerText(),'133');
  assert.match(await detail.locator('[data-component=unattributed]').innerText(),/133 kcal/);
  assert.equal(await detail.locator('[data-component=resting] dd').first().textContent(),'Unknown');
  assert.deepEqual(fixture.state(),before);
  await detail.getByRole('button',{name:'Balance',exact:true}).click();
  await waitForOutboxIdle(page,()=>fixture.state().settings.diaryEnergyDisplay==='balance');
  assert.equal(await detail.locator('[data-card=balance] .ds-energy-ring small').textContent(),'Unknown');
  await page.waitForFunction(()=>[...document.querySelectorAll('.ds-energy canvas')].every(c=>window.Chart.getChart(c)));
  const rings=await detail.locator('canvas').evaluateAll(nodes=>nodes.map(c=>window.Chart.getChart(c).id));
  await page.keyboard.press('Escape');
  assert.ok(await page.evaluate(ids=>ids.every(id=>!window.Chart.instances[id]),rings));
  await page.getByRole('button',{name:'The Pause Life Settings',exact:true}).click();
  await page.context().setOffline(true);
  await page.getByRole('checkbox',{name:'Select Chicken',exact:true}).check();await ring(298);
  await page.getByRole('checkbox',{name:'Select Chicken',exact:true}).uncheck();await page.getByRole('checkbox',{name:'Select Rice',exact:true}).uncheck();await ring(298);assert.equal(await page.locator('.md-scope').count(),0);
  await page.getByRole('checkbox',{name:'Select Rice',exact:true}).check();await ring(133);assert.equal(await page.locator('[data-summary-retry]').count(),0);assert.doesNotMatch(await page.locator('.md-summary').innerText(),/unavailable|changed|try again|reload/i);
  await page.context().setOffline(false);
  mkdirSync('.local/diary-selection',{recursive:true});await page.screenshot({path:'.local/diary-selection/selected.png'});await page.getByRole('button',{name:'Back',exact:true}).click();await ring(298);assert.equal(await page.locator('.md-scope').count(),0);await selectGroup();await ring(298);await page.locator('[data-tool-select-group=Lunch]').uncheck();await ring(298);assert.equal(await page.locator('.md-scope').count(),0);
  await page.evaluate(async()=>{const {applyFontPreferences}=await import('/font-presentation.js');applyFontPreferences({fontScale:2});});await page.getByRole('button',{name:'Energy Summary',exact:true}).click();await page.evaluate(()=>window.scrollTo(0,0));await page.locator('[data-md-page-id=energy] [data-action=mobile-diary-energy]').first().click();await page.locator('.ds-energy').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.keyboard.press('Escape');await page.evaluate(async()=>{const {applyFontPreferences}=await import('/font-presentation.js');applyFontPreferences({fontScale:1});});
  assert.deepEqual(fixture.state(),{...before,settings:{...before.settings,diaryEnergyDisplay:'balance'}});
  await page.getByRole('checkbox',{name:'Select Rice',exact:true}).check();await ring(133);
  await page.evaluate(async()=>{window.queueTestCommand=(await import('/diary-api.js')).queueCommand;});
  await page.context().setOffline(true);
  await page.evaluate(async()=>{const {localWorkspaceState}=await import('/local-engine.js');const state=await localWorkspaceState(),rice=state.entries.find(row=>row.foodId==='rice');await window.queueTestCommand('cached','entry.update',{id:rice.id,amount:2});});
  await ring(266);assert.equal(fixture.state().entries.find(row=>row.foodId==='rice').amount,1);
  await page.context().setOffline(false);await waitForOutboxIdle(page,()=>fixture.state().entries.find(row=>row.foodId==='rice').amount===2);
  await page.context().setOffline(true);
  await page.evaluate(async date=>{await window.queueTestCommand('cached','entry.add',{date,group:'Lunch',foodId:'snack',amount:1});},date);
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await page.locator('.md-diary').waitFor();
  await page.getByRole('checkbox',{name:'Select Pending snack',exact:true}).check();await page.getByRole('checkbox',{name:'Select Rice',exact:true}).uncheck();await ring(33);
  await page.getByRole('button',{name:'Selected entry actions',exact:true}).click();await page.getByRole('button',{name:'Show Nutrition Summary',exact:true}).click();await page.locator('.meal-nutrition-summary [aria-busy=false]').waitFor();assert.equal(await page.locator('[data-mf-energy]').innerText(),'33');
  await page.context().setOffline(false);await waitForOutboxIdle(page,()=>fixture.state().entries.some(row=>row.foodId==='snack'));await page.waitForFunction(()=>document.querySelector('[data-mf-energy]')?.textContent==='33');assert.equal(await page.locator('[data-mf-energy]').innerText(),'33');await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.keyboard.press('Tab');await page.locator('[data-tool-group=Lunch]').focus();await page.keyboard.press('Enter');await page.locator('[data-diary-tool=meal]').click();
  await page.getByLabel('Meal Name',{exact:true}).fill('Group lunch');
  assert.equal(await page.locator('[data-meal-item]').count(),3);
  await page.locator('[data-mce-help]').click();await page.getByRole('dialog',{name:'User Manual'}).waitFor();await page.keyboard.press('Escape');
  await page.locator('[data-meal-item="0"]').click();
  const apply=page.locator('[data-mci-apply]');
  await page.getByLabel('Amount',{exact:true}).fill('3');await apply.click();
  await page.locator('[data-meal-next]').click();await page.locator('[data-meal-preview] [data-mf-energy]').waitFor();
  const entriesBeforeDefinitions=fixture.state().entries;
  assert.deepEqual(await page.locator('.mce-footer').getByRole('button').allTextContents(),['Back','Save Meal']);
  assert.equal(await page.locator('.mce-progress:visible').count(),0);
  assert.equal(await page.locator('.mce-navigation').evaluate(el=>getComputedStyle(el).columnGap),'8px');
  await page.context().setOffline(true);
  await page.locator('[data-meal-next]').click();await page.waitForFunction(()=>!document.querySelector('#sheet').open);
  assert.equal(fixture.state().meals.length,0);
  const meal=await page.evaluate(async()=>(await(await import('/local-engine.js')).localWorkspaceState()).meals.find(row=>row.name==='Group lunch'));
  assert.equal(meal.items[0].amount??meal.items[0].quantity,3);
  await page.context().setOffline(false);await waitForOutboxIdle(page,()=>fixture.state().meals.length===1);
  assert.deepEqual(fixture.state().meals[0].items,meal.items);
  await page.getByRole('button',{name:'Diary actions',exact:true}).click();await page.getByRole('button',{name:'Multi-Select',exact:true}).click();
  await page.getByRole('checkbox',{name:'Select Rice',exact:true}).check();await page.getByRole('button',{name:'Selected entry actions',exact:true}).click();await page.locator('[data-diary-tool=recipe]').click();
  await page.getByLabel('Recipe Name',{exact:true}).fill('Rice batch');await page.waitForFunction(()=>document.querySelector('.recipe-editor')?.dataset.recipeBusy==='false');
  await page.screenshot({path:'.local/diary-selection/recipe-ingredients.png'});
  await page.locator('[data-mce-next]').click();await page.locator('input[name=servings]:visible').fill('2');await page.locator('[data-mce-next]').click();await page.locator('[name=instructions]').fill('Stir.');await page.locator('[data-mce-next]').click();
  await page.getByRole('button',{name:'Save Recipe',exact:true}).waitFor();
  assert.deepEqual(await page.locator('.mce-footer').getByRole('button').allTextContents(),['Back','Save Recipe']);
  assert.equal(await page.locator('[data-mce-dot]:visible').count(),4);
  assert.equal(await page.locator('[data-mce-dot]').last().getAttribute('aria-current'),'step');
  assert.equal(await page.locator('.mce-navigation').evaluate(el=>getComputedStyle(el).columnGap),'16px');
  await page.getByRole('button',{name:'Save Recipe',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#sheet').open);
  await waitForOutboxIdle(page,()=>fixture.state().recipes.some(row=>row.name==='Rice batch'));
  assert.deepEqual(fixture.state().entries,entriesBeforeDefinitions);
  const recipe=fixture.state().recipes.find(row=>row.name==='Rice batch');assert.equal(recipe.servings,2);assert.equal(recipe.instructions,'Stir.');assert.equal(recipe.ingredients[0].foodId,'rice');assert.equal(recipe.ingredients[0].amount,2);
  await page.locator('#settings-tab').click();await page.getByRole('searchbox',{name:'Search More'}).waitFor();assert.equal(await page.locator('[data-md-summary]').count(),0);await page.waitForFunction(()=>!Object.values(window.Chart?.instances??{}).length);assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.csp),[]);assert.equal(requests.filter(row=>row.operation==='nutrition').length,0);
  await page.close();
  page=await browser.newPage({viewport:{width:448,height:936},extraHTTPHeaders:{Cookie:'__Host-nourishing_session=fixture'}});
  const held=Promise.withResolvers(),snapshotStarted=Promise.withResolvers(),coldReviews=[];
  let coldReads=0;
  await page.route('**/api/offline',async route=>{coldReads++;snapshotStarted.resolve();await held.promise;await route.continue();});
  await page.route('**/api/diary/tools/review',async route=>{
   coldReviews.push(route.request().postDataJSON().operation);
   await route.fulfill({status:503,contentType:'application/json',body:'{"error":"The account is busy. Please try again."}'});
  });
  try{
   await page.goto(base+'/diary');await page.locator('.md-diary').waitFor();await snapshotStarted.promise;
   await page.getByRole('button',{name:'Diary actions',exact:true}).click();
   await page.getByRole('button',{name:'Multi-Select',exact:true}).click();
   await page.getByRole('checkbox',{name:'Select Rice',exact:true}).check();
   await page.getByRole('button',{name:'Selected entry actions',exact:true}).click();
   await page.getByRole('button',{name:'Create Recipe from Selection',exact:true}).click();
   await page.locator('.diary-tools-sheet').waitFor();held.resolve();
   await page.locator('.recipe-editor').waitFor();
   assert.equal(coldReads,1);assert.deepEqual(coldReviews,[]);
  }finally{held.resolve();}
  await page.close();
  for(const change of ['lock','switch']){
   page=await browser.newPage({extraHTTPHeaders:{Cookie:'__Host-nourishing_session=fixture'}});
   const started=Promise.withResolvers(),release=Promise.withResolvers();
   let fallbacks=0;
   await page.route('**/owner-check',route=>route.fulfill({contentType:'text/html',body:'<title>Fixture</title>'}));
   await page.route('**/api/offline',async route=>{started.resolve();await release.promise;await route.continue();});
   await page.route('**/api/diary/tools/review',async route=>{fallbacks++;await route.abort();});
   await page.goto(base+'/owner-check');
   await page.evaluate(async()=>{await(await import('/device-cache.js')).initializeDeviceCache('fixture');});
   const review=()=>page.evaluate(async date=>{
    const {prepareLocalDiaryReview}=await import('/diary-preparation.js');
    try{await prepareLocalDiaryReview({operation:'recipe',selection:{date,scope:'day'}},'fixture-revision');return 'returned';}
    catch(error){return error.name;}
   },date);
   const pendingReview=review();
   try{
    await started.promise;
    await page.evaluate(async change=>{
     if(change==='lock')await(await import('/offline-store.js')).lockOfflineAccount();
     else await(await import('/device-cache.js')).initializeDeviceCache('different-account');
    },change);
   }finally{release.resolve();}
   assert.equal(await pendingReview,'AbortError');
   if(change==='lock')assert.equal(await review(),'AbortError');
   assert.equal(fallbacks,0);await page.close();
  }
  nutritionFailures=1;
  page=await browser.newPage({viewport:{width:412,height:915},colorScheme:'dark',extraHTTPHeaders:{Cookie:'__Host-nourishing_session=fixture'}});page.setDefaultTimeout(10000);
  await page.route('**/api/offline',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"Snapshot temporarily unavailable"}'}));
  await page.goto(base+'/diary');await page.locator('.md-diary').waitFor();await selectGroup();await ring(464);
  assert.equal(requests.filter(row=>row.operation==='nutrition').length,2);assert.equal(await page.locator('[data-summary-retry]').count(),0);assert.doesNotMatch(await page.locator('.md-summary').innerText(),/unavailable|changed|try again|reload/i);
  nutritionFailures=Infinity;const attempted=requests.length;await page.getByRole('checkbox',{name:'Select Chicken',exact:true}).uncheck();for(let i=0;i<100&&requests.length===attempted;i++)await new Promise(r=>setTimeout(r,10));assert.equal(requests.length,attempted+1);await page.locator('#settings-tab').click();await page.getByRole('searchbox',{name:'Search More'}).waitFor();await new Promise(r=>setTimeout(r,1200));assert.equal(requests.length,attempted+1);assert.equal(await page.locator('[data-md-summary]').count(),0);


 }catch(error){mkdirSync('.local/diary-selection',{recursive:true});await page.screenshot({path:'.local/diary-selection/failure.png'});console.error(await page.evaluate(()=>[...document.querySelectorAll('.diary-selection-tools,.md-summary,.md-summary-heading,#page,#diary-date')].map(n=>({class:n.className,y:n.getBoundingClientRect().y,height:n.getBoundingClientRect().height,position:getComputedStyle(n).position,parent:n.parentElement.className}))));throw error;}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
