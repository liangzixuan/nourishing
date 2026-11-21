import {waitForOutboxIdle} from './fixtures/browser-outbox.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright-core';
import {CHROME_EXECUTABLE} from './_chrome.mjs';
import {initialState,act,previewDiaryItem} from '../server/domain/workspace.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {createDataRepository} from '../server/data-repository.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';
import {createWebHandler} from '../server/http.mjs';
import {diaryToolsReview} from '../server/diary-tools.mjs';
import {entryAdjustmentView,previewEntryAdjustment} from '../server/entry-adjustments.mjs';
import {libraryView,libraryItem} from '../server/library-view.mjs';
import {previewLibrary} from '../server/workspace-commands.mjs';
import {displayView} from '../server/display-settings.mjs';
import {repeatView} from '../server/repeat-view.mjs';
import {offlineSnapshot} from '../server/offline.mjs';
import {recordOptions} from '../server/record-views.mjs';
import {barcodeAssets} from '../scripts/package-barcode-assets.mjs';

test('saved meal actions distinguish original, copy and occurrence; local adjustment and explosion preserve nutrition',async()=>{
 const date=new Date().toLocaleDateString('en-CA'),seed=initialState();
 const food=act(seed,'food.save',{name:'Fixture oats',serving:'100 g',grams:100,nutrients:{calories:200,protein:10,carbs:30,fat:5},portions:[{id:'bowl',label:'Bowl',grams:150}]}),meal=act(seed,'meal.save',{name:'Saved lunch',items:[{foodId:food.id,quantity:1,unit:'portion',portionId:'bowl'}]});
 act(seed,'entry.add',{date,time:'12:30',group:'Lunch',mealId:meal.id,amount:2});
 act(seed,'entry.add',{date,time:'13:00',group:'Lunch',foodId:food.id,amount:1});
 const fixture=diaryStoreFixture(seed),store=createWorkspaceStore(fixture.db,'fixture'),repository=createDataRepository(fixture.db,'fixture'),state=()=>fixture.state(),entryId=seed.entries[0].id,original=structuredClone(seed.meals),clock={owner:'fixture',asOf:date+'T18:00:00Z',now:new Date(),timeZone:'UTC'};
 let handler,base,browser,page,slowPreview=false,previewRequests=0;const errors=[];
 const service={current:async()=>({id:'fixture',name:'Fixture',email:'fixture@example.com'}),readDiary:async(_,day)=>repository.diary(day,clock),offlineSnapshot:async()=>offlineSnapshot(state(),{ownerId:'fixture',generation:'meal-test'}),display:async()=>displayView(state()),recordOptions:async(_,day)=>recordOptions(state(),day),library:async()=>libraryView(state()),libraryItem:async(_,kind,id,entry)=>libraryItem(state(),kind,state()[kind+'s'].find(row=>row.id===id),state().entries.find(row=>row.id===entry)),previewLibrary:async(_,input)=>previewLibrary(state(),input),previewDiary:async(_,input)=>({...previewDiaryItem(state(),input),energy:{unit:'kcal'}}),repeats:async(_,day)=>repeatView(state(),day),diaryToolsReview:async(_,input)=>diaryToolsReview(state(),input),entryAdjustment:async(_,input)=>entryAdjustmentView(state(),input),previewEntryAdjustment:async(_,input)=>{previewRequests++;if(slowPreview)await delay(1500);return previewEntryAdjustment(state(),input);},workspaceCommand:async(_,input)=>store.command(input,async()=>null,clock)};
 // These views are only requested by background warming in this focused journey.
 for(const name of ['catalogSearchIndex','favorites','exerciseCatalog','dashboard','profileSettings','targets','fasting','reminders','charts','snapshots','nutritionReport'])service[name]??=async()=>({});
 const vendor=new Map((await barcodeAssets()).map(asset=>['/'+asset.path,asset]));
 const assets={get(path){if(vendor.has(path))return vendor.get(path);const file=resolve('public','.'+(path==='/diary'?'/diary.html':path)),ext=extname(file);if((file.startsWith(resolve('public')+'\\')||file.startsWith(resolve('public')+'/'))&&existsSync(file)&&['.html','.js','.mjs','.css','.svg','.woff2'].includes(ext))return {body:readFileSync(file),type:ext==='.html'?'text/html':ext==='.css'?'text/css':ext==='.svg'?'image/svg+xml':ext==='.woff2'?'font/woff2':'text/javascript'};}};
 const server=createServer(async(req,res)=>{const response=await handler(new Request(base+req.url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:req,duplex:'half'})}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;handler=createWebHandler({config:{origin:base},service,assets});
 try{
  browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});page=await browser.newPage({viewport:{width:412,height:915},extraHTTPHeaders:{Cookie:'__Host-nourishing_session=fixture'}});page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));await page.goto(base+'/diary');await page.locator('.md-diary').waitFor();for(let i=0;i<50;i++){if(await page.evaluate(async()=>Boolean((await (await import('/offline-store.js')).offlineCopy())?.snapshot)))break;await delay(100);}assert.equal(await page.evaluate(async()=>Boolean((await (await import('/offline-store.js')).offlineCopy())?.snapshot)),true);

  const menu=async()=>{await page.locator(`[data-diary-record][data-id="${entryId}"] [data-md-context]`).click();};
  mkdirSync('.local/meal-actions',{recursive:true});
  await menu();await page.screenshot({path:'.local/meal-actions/entry-menu.png'});
  assert.equal(await page.locator('.diary-meal-menu button img').count(),9);
  assert.ok(await page.locator('#sheet').evaluate(el=>el.getBoundingClientRect().bottom<=document.querySelector('.app-nav').getBoundingClientRect().top+1));
  await page.mouse.click(8,12);await page.locator('#sheet').waitFor({state:'hidden'});await menu();
  await page.keyboard.press('Escape');await page.locator('#sheet').waitFor({state:'hidden'});await menu();
  assert.deepEqual(await page.locator('[data-diary-tool]').allTextContents(),['Repeat','Edit Original Meal','Edit a Copy of Meal','Adjust Meal','Explode Meal','Custom Meals Settings','Copy','Show Nutrition Summary','Delete']);
  await page.getByRole('button',{name:'Edit Original Meal',exact:true}).click();await page.locator('[name=name]').waitFor();assert.equal(await page.locator('[name=name]').inputValue(),'Saved lunch');await page.keyboard.press('Escape');await page.locator('#diary-tab').click();
  await menu();await page.getByRole('button',{name:'Edit a Copy of Meal',exact:true}).click();await page.locator('[name=name]').waitFor();assert.equal(await page.locator('[name=name]').inputValue(),'Saved lunch (copy)');await page.locator('[name=name]').fill('Copied lunch');await page.locator('[data-mce-next]').click();await page.locator('[data-mce-next]').click();await page.locator('.meal-editor').waitFor({state:'detached'});await waitForOutboxIdle(page,()=>state().meals.length===2);assert.equal(state().meals.length,2);assert.equal(state().entries.find(row=>row.id===entryId).mealId,meal.id);assert.equal(state().entries.find(row=>row.id===entryId).amount,2);assert.deepEqual(state().meals.find(row=>row.id===meal.id),original[0]);await page.locator('#diary-tab').click();
  await menu();await page.getByRole('button',{name:'Repeat',exact:true}).click();await page.locator('.mr-form').waitFor();assert.equal(await page.locator('[name=amount]').inputValue(),'2');assert.equal(await page.locator('[name=group]').inputValue(),'Lunch');await page.keyboard.press('Escape');await page.locator('#diary-tab').click();
  await menu();await page.getByRole('button',{name:'Custom Meals Settings',exact:true}).click();await page.getByRole('switch').waitFor();assert.equal(await page.getByRole('switch').isChecked(),false);await page.keyboard.press('Escape');
  await menu();await page.getByRole('button',{name:'Show Nutrition Summary',exact:true}).click();await page.locator('.meal-nutrition-summary .mf-preview[aria-busy=false]').waitFor();assert.match(await page.locator('.meal-nutrition-summary').innerText(),/600/);assert.equal(await page.locator('.meal-nutrition-summary form').count(),0);await page.keyboard.press('Escape');
  slowPreview=true;await menu();await page.getByRole('button',{name:'Adjust Meal',exact:true}).click();await page.locator('.entry-adjustment [data-edit="0"]').click();await page.locator('[name=amount]').fill('0.5');const started=Date.now();await page.getByRole('button',{name:'Use ingredient',exact:true}).click();await page.getByRole('button',{name:'Save changes',exact:true}).waitFor();await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.locator('.entry-adjustment').waitFor({state:'detached'});assert.equal(previewRequests,0);assert.ok(Date.now()-started<1200,'local adjustment does not wait for slow remote preview');
  await page.evaluate(async()=>{await (await import('/background-writes.js')).flushBackgroundWrites();});assert.equal(state().entries.find(row=>row.id===entryId).amount,1);assert.equal(state().entries.find(row=>row.id===entryId).mealItems[0].quantity,0.5);assert.deepEqual(state().meals.find(row=>row.id===meal.id),original[0]);
  let remoteReviews=0;
  await page.route('**/api/diary/tools/review',route=>{remoteReviews++;return route.abort();});
  await page.evaluate(()=>Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false}));
  await menu();await page.getByRole('button',{name:'Explode Meal',exact:true}).click();await page.locator('#sheet').waitFor({state:'hidden'});
  await page.locator(`[data-diary-record][data-id="${entryId}"]`).waitFor({state:'detached'});
  assert.ok(state().entries.some(row=>row.id===entryId));
  const projected=await page.evaluate(async()=>(await (await import('/local-engine.js')).localWorkspaceState()).entries);
  assert.equal(projected[0].expandedFrom.id,entryId);
  assert.equal(projected[1].id,seed.entries[1].id);
  await page.screenshot({path:'.local/meal-actions/expanded-diary.png'});
  assert.equal(remoteReviews,0);
  await page.evaluate(async()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});await (await import('/background-writes.js')).flushBackgroundWrites();});await page.locator(`[data-diary-record][data-id="${entryId}"]`).waitFor({state:'detached'});const children=state().entries.filter(row=>row.expandedFrom?.id===entryId);assert.equal(children.length,1);assert.equal(children[0].quantity,0.5);assert.equal(children[0].portionId,'bowl');const localServingPreview=await page.evaluate(async id=>(await import('/local-engine.js')).localPreviewDiaryItem({id,amount:2}),children[0].id);assert.equal(localServingPreview.nutrition.totals.calories,400);assert.deepEqual(state().meals.find(row=>row.id===meal.id),original[0]);assert.deepEqual(errors,[]);

  await page.locator('#foods-tab').click();
  await page.locator('[data-action=new-food]').click();
  await page.getByLabel('Name',{exact:true}).fill('Packed lunch');
  await page.evaluate(()=>Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false}));
  await page.locator('[data-mfe-submit]:enabled').click();
  await page.locator('[data-mfe-add]:enabled').click();
  await page.getByRole('heading',{name:'Packed lunch',exact:true}).waitFor();
  await page.getByRole('button',{name:'Add to Diary',exact:true}).click();
  await page.locator('#sheet').waitFor({state:'hidden'});
  assert.equal(state().foods.some(row=>row.name==='Packed lunch'),false);
  await page.locator('#diary-tab').click();
  await page.locator('[data-diary-record]').filter({hasText:'Packed lunch'}).waitFor();
  await page.evaluate(async()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});await (await import('/background-writes.js')).flushBackgroundWrites();});
  const created=state().foods.filter(row=>row.name==='Packed lunch');
  assert.equal(created.length,1);
  assert.equal(state().entries.filter(row=>row.foodId===created[0].id).length,1);
 }catch(error){if(page){mkdirSync('.local/meal-actions',{recursive:true});await page.screenshot({path:'.local/meal-actions/failure.png'});console.error(page.url(),await page.locator('body').innerText(),errors);}throw error;}
 finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
