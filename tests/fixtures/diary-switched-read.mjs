import assert from 'node:assert/strict';

// Use a clean disposable context and a day outside the adjacent-day warmup.
// Change device ownership only. The HTTP session still serves the original account.
export async function checkSwitchedDateRead(page,{origin,from,to,marker,ownerId,source}){
 assert.ok(['snapshot','canonical'].includes(source));
 assert.ok(Math.abs(Date.parse(from)-Date.parse(to))>86400000);
 const dayPath='/api/diary?date='+to,dayGate=Promise.withResolvers(),snapshotGate=Promise.withResolvers();
 const ready=Promise.withResolvers(),canonical=source==='canonical';
 let networkReads=0;
 await page.route('**/api/offline',async route=>{await snapshotGate.promise;await route.continue();});
 await page.route('**'+dayPath,async route=>{
  networkReads++;
  try{
   const data=canonical?await route.fetch({timeout:20000}):null;
   if(data){assert.equal(data.status(),200);const json=await data.json();assert.equal(json.date,to);assert.ok(JSON.stringify(json).includes(marker));}
   ready.resolve();await dayGate.promise;
   if(data)await route.fulfill({response:data});else await route.fulfill({status:503,json:{error:'Temporary date failure'}});
  }catch(error){ready.reject(error);throw error;}
 });
 try{
  await page.goto(origin+'/diary',{waitUntil:'domcontentloaded'});
  const header=page.locator('#diary-date'),toggle=header.locator('[data-md-calendar]');await toggle.waitFor();
  assert.equal(await header.getAttribute('data-date'),from);
  const initiator=await page.evaluate(async()=> (await import('/device-cache.js')).captureDeviceOwner());
  assert.equal(initiator?.ownerId,ownerId);
  await toggle.click();const picker=page.locator('.mdc-dialog');await picker.locator('[data-mdc-jump]').fill(to.slice(0,7));
  await picker.locator('[data-mdc-date="'+to+'"]').click();
  await Promise.all([page.waitForRequest(r=>new URL(r.url()).pathname+new URL(r.url()).search===dayPath),picker.locator('[data-mdc-apply]').click()]);
  await picker.waitFor({state:'detached'});
  await page.locator('#page[aria-busy=true]').waitFor();await ready.promise;
  const dayResponse=page.waitForResponse(r=>new URL(r.url()).pathname+new URL(r.url()).search===dayPath);
  if(!canonical){dayGate.resolve();assert.equal((await dayResponse).status(),503);}
  const transition=await page.evaluate(async({marker,to,dayPath})=>{
   const cache=await import('/device-cache.js'),header=()=>document.querySelector('#diary-date')?.dataset.date;
   const rendered=()=>header()===to||[...document.querySelectorAll('[data-diary-record]')].some(n=>n.textContent.includes(marker));
   const before={date:header(),rendered:rendered()};
   const owner=await cache.initializeDeviceCache('disposable-'+crypto.randomUUID());
   window.switchedRender={seen:rendered(),observer:new MutationObserver(()=>{if(rendered())window.switchedRender.seen=true;})};
   window.switchedRender.observer.observe(document.body,{attributes:true,childList:true,subtree:true});
   return {before,ownerId:owner.ownerId,epoch:owner.epoch,cacheEmpty:(await cache.readDeviceCache(dayPath)).value===undefined};
  },{marker,to,dayPath});
  assert.deepEqual(transition.before,{date:from,rendered:false});assert.notEqual(transition.epoch,initiator.epoch);assert.ok(transition.cacheEmpty);
  const snapshotResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/offline');
  dayGate.resolve();snapshotGate.resolve();
  if(canonical)assert.equal((await dayResponse).status(),200);
  const r=await snapshotResponse;assert.equal(r.status(),200);const s=await r.json();
  assert.equal(s.identity.ownerId,ownerId);assert.ok(s.state.notes.some(n=>n.date===to&&n.text===marker));
  await page.locator('#page[aria-busy=false]').waitFor({state:'attached'});
  const receipt=await page.evaluate(async({initiator,dayPath})=>{
   const {request}=await import('/diary-api.js'),{readDeviceCache}=await import('/device-cache.js');
   let rejected=false;try{await request(dayPath,undefined,undefined,{owner:initiator});}catch(error){rejected=error.name==='AbortError';}
   const cache=await readDeviceCache(dayPath),copy=await(await import('/offline-store.js')).readWriteCopy();
   const unexpectedRender=window.switchedRender.seen;window.switchedRender.observer.disconnect();
   return {rejected,cached:cache.value!==undefined,epoch:cache.ticket?.epoch,savedSnapshot:!!copy?.snapshot,unexpectedRender,date:document.querySelector('#diary-date')?.dataset.date};
  },{initiator,dayPath});
  assert.deepEqual(receipt,{rejected:true,cached:false,epoch:transition.epoch,savedSnapshot:false,unexpectedRender:false,date:from});
  assert.equal(networkReads,1);
  return {source,initiatorPinned:true,dayStatus:canonical?200:503,snapshotStatus:r.status(),distinctDeviceEpoch:true,lateDateRendered:false,staleRequestRejected:true,originalDataCachedForReplacement:false,networkDayReads:networkReads};
 }finally{dayGate.resolve();snapshotGate.resolve();}
}
