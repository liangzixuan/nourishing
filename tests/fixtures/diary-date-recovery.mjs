import assert from 'node:assert/strict';
import {chooseDiaryDate} from '../../scripts/diary-test-navigation.mjs';

// Drive the normal calendar in a fresh browser. Hold the real account snapshot
// and fail the coalesced day read once, after the user has confirmed the date.
export async function checkColdDateRecovery(page,{origin,from,to,marker,scenario='recover'}){
 const snapshotGate=Promise.withResolvers(),readGate=Promise.withResolvers();
 const dayPath='/api/diary?date='+to;
 let failures=0,snapshotReads=0;
 const readMessage='Temporary date failure';
 await page.route('**/api/offline',async route=>{
  snapshotReads++;await snapshotGate.promise;
  if(scenario==='unavailable')await route.fulfill({status:503,json:{error:'Temporary snapshot failure'}});
  else await route.continue();
 });
 await page.route('**'+dayPath,async route=>{
  await readGate.promise;failures++;await route.fulfill({status:503,json:{error:readMessage}});
 },{times:1});
 try{
  await page.goto(origin+'/diary',{waitUntil:'domcontentloaded'});
  const header=page.locator('#diary-date');await header.locator('[data-md-calendar]').waitFor();
  const displayed=await header.getAttribute('data-date');
  if(from)assert.equal(displayed,from);
  assert.notEqual(displayed,to);
  await header.locator('[data-md-calendar]').click();
  const picker=page.locator('.mdc-dialog');await picker.locator('[data-mdc-jump]').fill(to.slice(0,7));
  await picker.locator('[data-mdc-date="'+to+'"]').click();
  await picker.locator('[data-mdc-apply]').click();await picker.waitFor({state:'detached'});
  await page.locator('#page[aria-busy=true]').waitFor();
  const failed=page.waitForResponse(r=>new URL(r.url()).pathname+new URL(r.url()).search===dayPath&&r.status()===503);
  readGate.resolve();await failed;
  assert.equal(await header.getAttribute('data-date'),displayed);
  assert.equal(await page.locator('[data-diary-record]').getByText(marker,{exact:true}).count(),0);
  if(scenario==='newer')await chooseDiaryDate(page,displayed);
  if(scenario==='leave'){
   await page.locator('#foods-tab').click();
   // Finish navigating with the snapshot still held, so a late Diary read cannot mask a failed Foods load.
   await page.locator('[data-tab=foods]').waitFor();
  }
  if(scenario==='lock')await page.evaluate(async()=>{await(await import('/offline-store.js')).lockOfflineAccount();});
  const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/offline');
  snapshotGate.resolve();const snapshot=await response;const snapshotStatus=snapshot.status();
  assert.equal(snapshotStatus,scenario==='unavailable'?503:200);
  if(scenario==='recover'){
   await header.locator('[data-md-calendar]').waitFor();
   await page.locator('#diary-date[data-date="'+to+'"]').waitFor();
   await page.locator('[data-diary-record]').getByText(marker,{exact:true}).waitFor();
   assert.equal(await page.locator('#notice').innerText(),'');
  }else if(scenario==='unavailable'){
   await page.getByText(readMessage,{exact:true}).waitFor();
  }
  if(['leave','newer'].includes(scenario)){
   await page.waitForFunction(async()=>!!(await(await import('/offline-store.js')).readWriteCopy())?.snapshot);
   await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  }
  if(scenario==='leave'){
   assert.equal(await page.locator('[data-tab=foods]').isVisible(),true);
   assert.equal(await header.isVisible(),false);
  }
  if(scenario==='lock')await page.waitForURL('**/login');
  else if(!['leave','newer'].includes(scenario))await page.locator('#page[aria-busy=false]').waitFor({state:'attached'});
  if(!['recover','leave'].includes(scenario)){
   assert.notEqual(await header.evaluateAll(nodes=>nodes[0]?.dataset.date),to);
   assert.equal(await page.locator('[data-diary-record]').getByText(marker,{exact:true}).count(),0);
  }
  assert.equal(failures,1);assert.equal(snapshotReads,1);
  return {injectedDateFailures:failures,snapshotReads,snapshotStatus,displayRecovered:scenario==='recover'};
 }finally{readGate.resolve();snapshotGate.resolve();}
}
