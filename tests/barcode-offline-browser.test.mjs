import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {chromium} from 'playwright-core';
import {CHROME_EXECUTABLE} from './_chrome.mjs';
import {pwaFixtureAssets} from './fixtures/pwa-assets.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';
import {waitForOutboxIdle} from './fixtures/browser-outbox.mjs';
import {initialState} from '../server/domain/workspace.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {lookupBarcode,previewBarcode} from '../server/barcode.mjs';
import {createWebHandler} from '../server/http.mjs';

const date='2026-11-20',code='4006381333931';
const fixtureScript=`
 import {openBarcode} from '/barcode.js';
 import {initializeDeviceCache} from '/device-cache.js';
 import {offlineCopy,saveOfflineSnapshot} from '/offline-store.js';
 import {localWorkspaceState} from '/local-engine.js';
 import {startBackgroundWrites,flushBackgroundWrites} from '/background-writes.js';
 const owner=await initializeDeviceCache('fixture');
 if(!(await offlineCopy())?.snapshot)await saveOfflineSnapshot(await(await fetch('/api/offline')).json(),owner);
 window.switchOwner=initializeDeviceCache;window.copy=offlineCopy;window.state=localWorkspaceState;window.sync=flushBackgroundWrites;
 startBackgroundWrites();
 const dialog=document.querySelector('dialog'),close=()=>{dialog.close();dialog.replaceChildren();};
 document.querySelector('main').onclick=event=>{
  const multi=event.target.id==='multi';
  openBarcode({mode:'search',date:()=>'${date}',groups:['Lunch'],group:'Lunch',header:title=>'<h2>'+title+'</h2>',
   content:dialog,show:html=>{dialog.innerHTML=html;dialog.showModal();},close,onChange:async()=>{},
   ...(multi?{onSelect:(food,entry)=>{window.selection={food,entry};close();}}:{})});
 };
 document.body.dataset.ready='true';
`;

test('prepared barcode foods and entries survive offline save, restart and lost acknowledgment',async()=>{
 const fixture=diaryStoreFixture(initialState()),store=createWorkspaceStore(fixture.db,'fixture');
 const context={owner:'fixture',reviewSecret:'synthetic-review-key-with-over-32-bytes',asOf:date+'T12:00:00Z',timeZone:'UTC'};
 const writes=[];let lose=false,handler,base,blocked=false,now=Date.now();
 const signedContext=()=>({...context,now});
 const files=await pwaFixtureAssets();
 const assets={get(path){
  if(path==='/')return {type:'text/html',body:'<!doctype html><main><button id="open">Find a food</button><button id="multi">Select multiple</button></main><dialog></dialog><script type="module" src="/fixture.js"></script>'};
  if(path==='/fixture.js')return {type:'text/javascript',body:fixtureScript};
  return files.get(path);
 }};
 const service={current:()=>({id:'fixture'}),offlineSnapshot:()=>store.offlineSnapshot(),readDiary:async()=>({revision:(await store.offlineSnapshot()).revision}),
  brandedSearch:async()=>({items:[{name:'Sample cereal',barcode:code}],nextPage:null}),
  barcodeLookup:(_,input)=>lookupBarcode(fixture.state(),input,{...signedContext(),fetchImpl:async()=>Response.json({product:{code,product_name:'Sample cereal',nutrition:{aggregated_set:{per:'100g',preparation:'as_sold',nutrients:{'energy-kcal':{value:100,unit:'kcal',source:'packaging'}}}}}})}),
  barcodePreview:(_,input)=>previewBarcode(fixture.state(),input,signedContext()),
  barcodeSave:async(_,body)=>{writes.push(structuredClone(body));const result=await store.command(body,async()=>null,signedContext());if(lose){lose=false;blocked=true;throw {code:503,publicMessage:'Reply interrupted'};}return result;}
 };
 const server=createServer(async(req,res)=>{
  const result=await handler(new Request(base+req.url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:req,duplex:'half'})}));
  res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;handler=createWebHandler({config:{origin:base},assets,service});
 let browser;
 try{
  browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});
  const page=await browser.newPage({extraHTTPHeaders:{Cookie:'__Host-nourishing_session=fixture'}});page.setDefaultTimeout(5000);
  await page.route('**/api/**',route=>blocked?route.abort():route.continue());
  await page.goto(base);await page.locator('[data-ready=true]').waitFor();
  const lookup=async opener=>{await page.locator(opener).click();await page.getByRole('searchbox').fill('cereal');await page.locator('.branded-search-form button').click();await page.locator('[data-barcode]').click();await page.locator('.barcode-review h3').waitFor();};
  await lookup('#open');blocked=true;await page.locator('[name=amount]').fill('2');await page.waitForFunction(()=>document.querySelector('.nutrition-preview')?.innerText.includes('200 kcal'));
  await page.locator('form .primary').click();
  await page.waitForFunction(()=>!document.querySelector('dialog').open);
  let local=await page.evaluate(()=>window.state());assert.equal(local.foods.length,1);assert.equal(local.entries.length,1);assert.equal(local.entries[0].amount,2);assert.equal(writes.length,0);
  await page.reload();await page.locator('[data-ready=true]').waitFor();
  local=await page.evaluate(()=>window.state());assert.equal(local.entries[0].foodId,local.foods[0].id);
  lose=true;blocked=false;await page.evaluate(()=>window.sync());assert.equal(fixture.state().entries.length,1);assert.equal((await page.evaluate(()=>window.copy())).pending.length,1);
  now+=31*60000;blocked=false;await page.evaluate(()=>window.sync());await waitForOutboxIdle(page,()=>fixture.state().entries.length===1);
  assert.equal(writes.length,2);assert.equal(writes[0].requestId,writes[1].requestId);assert.deepEqual(writes[0].payload,writes[1].payload);
  local=await page.evaluate(()=>window.state());assert.deepEqual(local.entries,fixture.state().entries);
  for(const [opener,save] of [['#open','[data-save-food]'],['#multi','form .primary']]){
   const before=fixture.state().foods.length;
   await lookup(opener);blocked=true;await page.locator(save).click();await page.waitForFunction(()=>!document.querySelector('dialog').open);
   if(opener==='#multi'){const selection=await page.evaluate(()=>window.selection);assert.equal(selection.food.id,(await page.evaluate(()=>window.state())).foods.at(-1).id);assert.equal(selection.entry.group,'Lunch');}
   assert.equal((await page.evaluate(()=>window.copy())).pending.length,1);blocked=false;await page.evaluate(()=>window.sync());await waitForOutboxIdle(page);assert.equal(fixture.state().foods.length,before+1);assert.equal(fixture.state().entries.length,1);
  }
  // A first send after expiry receives no receipt. The worker removes its pending food and entry.
  const beforeExpired=structuredClone(fixture.state());
  await lookup('#open');blocked=true;await page.locator('form .primary').click();await page.waitForFunction(()=>!document.querySelector('dialog').open);
  now+=31*60000;blocked=false;await page.evaluate(()=>window.sync());await waitForOutboxIdle(page);
  assert.deepEqual(fixture.state().foods,beforeExpired.foods);assert.deepEqual(fixture.state().entries,beforeExpired.entries);
  assert.equal((await page.evaluate(()=>window.state())).entries.length,1);
  await lookup('#open');const writesBeforeSwitch=writes.length;await page.evaluate(()=>window.switchOwner('other-account'));
  await page.locator('[data-save-food]').click();await page.waitForFunction(()=>document.querySelector('.barcode-review [role=status]').textContent.trim());
  assert.equal((await page.evaluate(()=>window.copy()))?.pending.length??0,0);assert.equal(writes.length,writesBeforeSwitch);
 }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
