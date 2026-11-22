import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {chromium} from 'playwright-core';
import {CHROME_EXECUTABLE} from './_chrome.mjs';
import {act,initialState} from '../server/domain/workspace.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {createDataRepository} from '../server/data-repository.mjs';
import {displayView} from '../server/display-settings.mjs';
import {pauseLifeView} from '../server/pause-life-settings.mjs';
import {createWebHandler} from '../server/http.mjs';
import {buildOfflineAssets} from '../scripts/package-offline-assets.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';
import {pwaFixtureAssets} from './fixtures/pwa-assets.mjs';
import {waitForOutboxIdle} from './fixtures/browser-outbox.mjs';

test('Pause Life saves offline, updates Diary, restarts and replays only for its owner',async()=>{
 const date=new Date().toLocaleDateString('en-CA'),clock={now:new Date(),timeZone:'UTC'},seed=initialState();
 seed.foods=[{id:'rice',name:'Rice',grams:100,nutrients:{calories:133,protein:3,carbs:28,fat:1}},{id:'chicken',name:'Chicken',grams:100,nutrients:{calories:165,protein:30,carbs:0,fat:5}}];
 for(const foodId of ['rice','chicken'])act(seed,'entry.add',{foodId,date,group:'Lunch',amount:1});
 const accounts={fixture:diaryStoreFixture(seed),other:diaryStoreFixture(initialState(),'other')};
 const stores=Object.fromEntries(Object.entries(accounts).map(([id,account])=>[id,createWorkspaceStore(account.db,id)]));
 const attempts=[],before=accounts.fixture.state();
 let loseFirst=true,rejectNext=false,base,handler,browser;
 const service={
  current:async id=>({id,name:id}),
  offlineSnapshot:id=>stores[id].offlineSnapshot(),
  readDiary:(id,day)=>createDataRepository(accounts[id].db,id).diary(day,clock),
  display:id=>displayView(accounts[id].state()),
  pauseLife:id=>pauseLifeView(accounts[id].state()),
  workspaceCommand:async(id,input)=>{
   attempts.push({id,input:structuredClone(input)});
   if(rejectNext){rejectNext=false;throw {code:400,publicMessage:'Rejected setting'};}
   const result=await stores[id].command(input);
   if(loseFirst){loseFirst=false;throw {code:503,publicMessage:'Lost acknowledgement'};}
   return result;
  }
 };
 const assets=await pwaFixtureAssets();
 await buildOfflineAssets();
 const server=createServer(async(req,res)=>{
  const response=await handler(new Request(base+req.url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:req,duplex:'half'})}));
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 base='http://127.0.0.1:'+server.address().port;handler=createWebHandler({config:{origin:base},assets,service});
 try{
  browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});
  const session=id=>({Cookie:'__Host-nourishing_session='+id});
  const context=await browser.newContext({viewport:{width:412,height:915},colorScheme:'dark',extraHTTPHeaders:session('fixture')});
  const page=await context.newPage();page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.exposeFunction('recordCspViolation',directive=>errors.push('CSP '+directive));
  await page.addInitScript(()=>document.addEventListener('securitypolicyviolation',event=>window.recordCspViolation(event.violatedDirective)));
  const launch=async()=>{await page.goto(base+'/diary');await page.locator('#page[aria-busy=false] .md-diary').waitFor();};
  const ready=()=>page.locator('.pause-life[aria-busy=false] [data-pause-enabled]').waitFor();
  const display=async()=>{await page.locator('#settings-tab').click();await page.locator('[data-more-open=display]').click();await page.locator('[data-display-open=pauseLife]').waitFor();};
  const open=async()=>{await display();await page.locator('[data-display-open=pauseLife]').click();await ready();};
  const diary=async()=>{await page.locator('#diary-tab').click();await page.locator('#page[aria-busy=false] .md-diary').waitFor();};
  const enabled=page.locator('[data-pause-enabled]'),program=page.locator('[data-pause-program][value="bfb-ps"]');
  const pending=()=>page.evaluate(async()=>((await(await import('/offline-store.js')).readWriteCopy())?.pending??[]).map(row=>row.command));
  const noWidget=()=>page.locator('[data-md-page-id=pauseLife]').waitFor({state:'detached'});
  const checkWidget=async()=>{
   const card=page.locator('[data-md-page-id=pauseLife]');await card.waitFor();
   assert.equal(await page.locator('[data-md-page-id]').first().getAttribute('data-md-page-id'),'pauseLife');
   assert.equal(await card.locator('.md-target').count(),4);
   await page.waitForFunction(()=>window.Chart?.getChart(document.querySelector('[data-pause-ring]'))?.data.datasets[0].data.reduce((a,b)=>a+b,0)===298);
  };

  await launch();await page.evaluate(async()=>{
   await(await import('/offline-sync.js')).prepareOfflineShell();
   await(await import('/device-sync.js')).ensureDeviceSnapshot();
  });
  await launch();
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  // The test reads queued commands through this source module; the app uses its bundled copy.
  await page.evaluate(()=>import('/offline-store.js').then(()=>true));
  await display();
  // First open of Pause Life occurs after disconnecting, without a cached endpoint response.
  await context.setOffline(true);await page.locator('[data-display-open=pauseLife]').click();await ready();
  assert.equal(await enabled.isChecked(),false);assert.equal(await program.isDisabled(),true);
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.locator('[data-display-open=pauseLife]').click();await ready();assert.deepEqual(await pending(),[]);
  // A failed durable write keeps the prior control value and leaves no command for replay.
  await page.evaluate(()=>{
   const put=IDBObjectStore.prototype.put;
   IDBObjectStore.prototype.put=function(value,...args){
    if(this.name==='accounts'&&value.pending?.at(-1)?.command.type==='pauseLife.save'){
     IDBObjectStore.prototype.put=put;
     throw new DOMException('Fixture storage is full','QuotaExceededError');
    }
    return put.call(this,value,...args);
   };
  });
  await enabled.click();await ready();await page.getByRole('status').filter({hasText:'Fixture storage is full'}).waitFor();
  assert.equal(await enabled.isChecked(),false);assert.deepEqual(await pending(),[]);
  await enabled.click();await ready();assert.equal(await enabled.isChecked(),true);
  await program.click();await ready();assert.equal(await program.isChecked(),true);
  await diary();await checkWidget();

  await launch();assert.equal(await page.locator('meta[name="nourishing-offline-shell"]').count(),1);
  await checkWidget();await open();assert.equal(await program.isChecked(),true);
  await enabled.click();await ready();await diary();await noWidget();
  await open();await enabled.click();await ready();assert.equal(await program.isChecked(),true);
  const queued=await pending();assert.equal(queued.length,4);
  assert.deepEqual(queued.map(row=>[row.type,row.ownerId,row.payload.policy.enabled,row.payload.policy.program]),[
   ['pauseLife.save','fixture',true,'galveston'],['pauseLife.save','fixture',true,'bfb-ps'],
   ['pauseLife.save','fixture',false,'bfb-ps'],['pauseLife.save','fixture',true,'bfb-ps']
  ]);
  assert.equal(attempts.length,0);

  // Navigate under the second session before the old document handles reconnect.
  await page.goto('about:blank');await context.setExtraHTTPHeaders(session('other'));await context.setOffline(false);
  await launch();await noWidget();await open();assert.equal(await enabled.isChecked(),false);
  assert.deepEqual(await pending(),[]);assert.equal(attempts.length,0);

  await context.setExtraHTTPHeaders(session('fixture'));await launch();
  await waitForOutboxIdle(page,()=>accounts.fixture.state().settings.pauseLife?.program==='bfb-ps');
  assert.deepEqual(attempts.map(attempt=>attempt.id),Array(attempts.length).fill('fixture'));
  assert.deepEqual(attempts.map(attempt=>attempt.input.requestId),[queued[0].operationId,...queued.map(row=>row.operationId)]);
  assert.deepEqual(attempts[0].input,attempts[1].input);
  assert.equal(accounts.fixture.table('command_receipts').size,4);
  assert.equal(accounts.other.table('command_receipts').size,0);
  assert.deepEqual(accounts.fixture.state().settings.pauseLife,{version:1,enabled:true,program:'bfb-ps'});
  await checkWidget();await open();assert.equal(await program.isChecked(),true);

  rejectNext=true;await enabled.click();await ready();
  await waitForOutboxIdle(page);await page.waitForFunction(()=>document.querySelector('[data-pause-enabled]')?.checked===true);
  assert.equal(await page.locator('[data-pause-reload]').count(),0);
  await enabled.click();await ready();await waitForOutboxIdle(page,()=>accounts.fixture.state().settings.pauseLife?.enabled===false);
  await diary();await noWidget();await page.setViewportSize({width:320,height:700});await open();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(accounts.fixture.state().settings.targets,before.settings.targets);
  assert.deepEqual(accounts.fixture.state().foods,before.foods);
  assert.deepEqual(accounts.fixture.state().entries,before.entries);assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
