import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import test from 'node:test';
import {chromium} from 'playwright-core';
import {createDataRepository} from '../server/data-repository.mjs';
import {dashboardView} from '../server/dashboard-view.mjs';
import {chartSurfaceView} from '../server/dashboard-pinned-charts.mjs';
import {displayView} from '../server/display-settings.mjs';
import {initialState} from '../server/domain/workspace.mjs';
import {fastingView} from '../server/fasting.mjs';
import {createWebHandler} from '../server/http.mjs';
import {favoriteView} from '../server/library-extras.mjs';
import {libraryView} from '../server/library-view.mjs';
import {reportView,targetView} from '../server/nutrition-views.mjs';
import {profileSettingsView} from '../server/profile-settings.mjs';
import {exerciseCatalogView,recordOptions} from '../server/record-views.mjs';
import {repeatView} from '../server/repeat-view.mjs';
import {snapshotsView} from '../server/snapshots.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {CHROME_EXECUTABLE} from './_chrome.mjs';
import {waitForOutboxIdle} from './fixtures/browser-outbox.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';
import {pwaFixtureAssets} from './fixtures/pwa-assets.mjs';

test('Diary estimates with each account’s cold options cache and reopens a pending catalogue exercise across restart and receipt replay',async()=>{
 const day=new Date().toLocaleDateString('en-CA'),clock={now:new Date(),timeZone:'UTC'};
 const accounts=new Map();
 for(const owner of ['profile','measurement']){
  const seed=initialState();
  seed.settings.groups.unshift('Uncategorized');
  seed.profile.weight=66;
  if(owner==='measurement'){
   seed.settings.bodyComposition={version:2,weightMetric:{kind:'biometric',type:'Weight',unit:'kg'},bodyFatMetric:null,heightMetric:null,useForResting:false,useHeightForResting:false,useForKeto:false};
   seed.biometrics.push({id:'measured-weight',date:day,type:'Weight',unit:'kg',value:82});
  }
  const fixture=diaryStoreFixture(seed,owner);
  accounts.set(owner,{fixture,store:createWorkspaceStore(fixture.db,owner),repository:createDataRepository(fixture.db,owner)});
 }
 let owner='profile',lose=true,optionsReads=0;
 const attempts=[],active=()=>accounts.get(owner);
 const service={
  current:async()=>({id:owner,name:'Fixture'}),
  offlineSnapshot:()=>active().store.offlineSnapshot(),
  readDiary:(_,date)=>active().repository.diary(date,clock),
  catalogSearchIndex:async()=>({version:1,generation:'empty',datasets:[],sourceIds:[],categoryIds:[],rows:[]}),
  display:async()=>displayView(active().fixture.state()),
  library:async()=>libraryView(active().fixture.state()),
  favorites:async()=>favoriteView(active().fixture.state()),
  profileSettings:async(_,date)=>profileSettingsView(active().fixture.state(),date),
  targets:async(_,date)=>targetView(active().fixture.state(),date),
  fasting:async(_,input)=>fastingView(active().fixture.state(),clock,input),
  dashboard:async(_,date)=>dashboardView(active().fixture.state(),{date},clock),
  charts:async(_,input)=>chartSurfaceView(active().fixture.state(),input,clock),
  nutritionReport:async(_,input)=>reportView(active().fixture.state(),input,clock),
  reminders:async()=>({schedules:[],devices:[],recent:[],paused:true}),
  repeats:async(_,date)=>repeatView(active().fixture.state(),date),
  snapshots:async()=>snapshotsView(active().fixture.state()),
  exerciseCatalog:async()=>exerciseCatalogView(),
  recordOptions:async(_,date)=>{optionsReads++;return recordOptions(active().fixture.state(),date);},
  workspaceCommand:async(_,input)=>{
   attempts.push(structuredClone(input));
   const result=await active().store.command(input);
   if(lose){lose=false;throw {code:503,publicMessage:'Reply interrupted'};}
   return result;
  },
 };
 let base,handler,browser;
 const server=createServer(async(req,res)=>{
  const response=await handler(new Request(base+req.url,{method:req.method,headers:{...req.headers,cookie:'__Host-nourishing_session='+owner},...(req.method==='GET'?{}:{body:req,duplex:'half'})}));
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 base='http://127.0.0.1:'+server.address().port;
 try{
  handler=createWebHandler({config:{origin:base},assets:await pwaFixtureAssets(),service});
  browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});
  const context=await browser.newContext({viewport:{width:412,height:915},serviceWorkers:'block'});
  const page=await context.newPage();page.setDefaultTimeout(7000);
  // The shell may prefetch options in the background. Keep them absent for both accounts.
  await page.route('**/api/records/options?*',route=>route.abort());
  const snapshotReady=async()=>{await page.waitForFunction(async owner=>(await(await import('/offline-store.js')).readWriteCopy())?.snapshot?.identity.ownerId===owner,owner);};
  const walk=async()=>{
   await page.locator('#add-food').click();
   await page.getByRole('button',{name:'Add Exercise',exact:true}).click();
   for(const key of ['cardio','walking','generalWalking'])await page.locator('[data-meb-node='+key+']').click();
   await page.locator('[name=duration]').fill('10');
   await page.waitForFunction(()=>Number(document.querySelector('[name=calories]')?.value)>0);
  };
  const row=page.locator('[data-diary-record]').filter({hasText:'Walking'});
  const edit=()=>row.locator('[data-action=edit-entry]').first().click();
  const save=async()=>{await page.locator('#sheet .me-save').click();await page.locator('#sheet').waitFor({state:'hidden'});};
  await page.goto(base+'/diary');await snapshotReady();await walk();
  assert.equal(await page.locator('[name=weightKg]').inputValue(),'66');

  // Switching the verified device session leaves the old form open until its next action.
  owner='measurement';
  await page.evaluate(async()=>{await(await import('/device-cache.js')).initializeDeviceCache('measurement');});
  await page.locator('#sheet .me-save').click();
  await page.getByRole('alert').filter({hasText:'account changed'}).waitFor();
  assert.equal(attempts.length,0);
  await page.reload();await snapshotReady();await walk();
  assert.equal(await page.locator('[name=weightKg]').inputValue(),'82');
  assert.match(await page.locator('[data-mec-weight]').innerText(),/82/);
  assert.equal(optionsReads,0);

  await context.setOffline(true);await save();await row.waitFor();
  await edit();await page.locator('[name=duration]').fill('15');await save();
  const pending=await page.evaluate(async()=>(await(await import('/offline-store.js')).readWriteCopy()).pending);
  assert.deepEqual(pending.map(row=>row.command.type),['exercise.catalog.add','record.correct']);
  assert.equal(pending[1].command.payload.id,pending[0].command.operationId);
  assert.equal(active().fixture.state().entries.length,0);

  // Load the full document again while the write transport is still unavailable.
  await page.route('**/api/workspace/command',route=>route.abort());
  await context.setOffline(false);await page.reload();await row.waitFor();await edit();
  assert.equal(await page.locator('[name=duration]').inputValue(),'15');
  await page.unroute('**/api/workspace/command');
  await waitForOutboxIdle(page,()=>active().fixture.state().entries[0]?.duration===15);
  const [entry]=active().fixture.state().entries;
  assert.equal(active().fixture.state().entries.length,1);
  assert.deepEqual(attempts.map(x=>x.type),['exercise.catalog.add','exercise.catalog.add','record.correct']);
  assert.deepEqual(attempts[0],attempts[1]);
  assert.equal(attempts[2].payload.id,entry.id);
  assert.equal(entry.exerciseBasis.minutes,10);
  assert.equal(entry.exerciseBasis.weightSource,'biometric');
  // This editor opened against the queued ID, and the server acknowledged it while open.
  await page.locator('[name=duration]').fill('20');await save();
  await waitForOutboxIdle(page,()=>active().fixture.state().entries[0]?.duration===20);
  assert.equal(attempts.at(-1).payload.id,entry.id);
  assert.equal(accounts.get('profile').fixture.state().entries.length,0);
 }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
