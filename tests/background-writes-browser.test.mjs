import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright-core';
import {CHROME_EXECUTABLE} from './_chrome.mjs';
import {initialState,act} from '../server/domain/workspace.mjs';
import {fastingView} from '../server/fasting.mjs';
import {chartSurfaceView} from '../server/dashboard-pinned-charts.mjs';
import {digest} from '../server/data-codec.mjs';
import {offlineSnapshot} from '../server/offline.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';
import {diaryToolsReview} from '../server/diary-tools.mjs';

test('selection-created recipes stay visible in cached library reads before and after lost-ack recovery',async()=>{
 const state=initialState(),date='2026-11-20';state.foods=[{id:'rice',name:'Rice',grams:100,nutrients:{calories:100}}];act(state,'entry.add',{foodId:'rice',date,amount:1});
 const review=diaryToolsReview(state,{operation:'recipe',selection:{date,scope:'selected',records:state.entries.map(row=>({collection:'entries',id:row.id}))}});
 await realQueueFixture(state,async({page,fixture,flush})=>{
  const result=await page.evaluate(async review=>{
   const {queueCommand}=await import('/diary-api.js'),{overlayPendingResponse}=await import('/background-writes.js');
   const result=await queueCommand(review.revision,'selection.recipe',{selection:review.selection,fingerprint:review.fingerprint,name:'Local lunch',confirmed:true},{projection:{reusable:{kind:'recipe',resource:review.resource,foods:review.foods}}});
   return {result,view:await overlayPendingResponse('/api/library',{items:[]})};
  },review);
  assert.ok(result.view.items.some(item=>item.kind==='recipe'&&item.name==='Local lunch'));
  await flush();assert.equal(fixture.state().recipes.length,1);
  await page.reload();await flush();
  const view=await page.evaluate(async()=>await(await import('/background-writes.js')).overlayPendingResponse('/api/library',{items:[]}));
  assert.deepEqual(view.items.filter(item=>item.kind==='recipe').map(item=>({id:item.id,name:item.name})),fixture.state().recipes.map(({id,name})=>({id,name})));
 },{losePath:'/api/workspace/command'});
});

async function realQueueFixture(state,run,{losePath,loseType,rejectWrite,commandTime}={}){
 const owner='owner-a',date='2026-11-20',fixture=diaryStoreFixture(state,owner),store=createWorkspaceStore(fixture.db,owner),sent=[];let lose=Boolean(losePath);
 const server=createServer(async(req,res)=>{try{
  if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end('<main></main>');}
  if(req.url.startsWith('/api/')){
   res.setHeader('Content-Type','application/json');
   if(req.url==='/api/account')return res.end(JSON.stringify({id:owner}));
   if(req.url==='/api/offline')return res.end(JSON.stringify(await store.offlineSnapshot()));
   const url=new URL(req.url,'http://localhost'),clock={now:new Date(date+'T12:00:00Z'),timeZone:'UTC'};
   if(url.pathname==='/api/fasting')return res.end(JSON.stringify(fastingView(fixture.state(),clock)));
   if(url.pathname==='/api/charts')return res.end(JSON.stringify(chartSurfaceView(fixture.state(),Object.fromEntries(url.searchParams),clock)));
   if(req.url.startsWith('/api/diary'))return res.end(JSON.stringify({revision:digest(fixture.state())}));
   let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);sent.push({path:req.url,body});
   const rejected=rejectWrite?.(body);if(rejected)throw rejected;
   const result=req.url==='/api/offline/commands'?await store.offlineCommand(body):await store.command(body,async()=>null,{owner,asOf:commandTime??date+'T12:00:00Z',timeZone:'UTC'});
   if(lose&&req.url===losePath&&(!loseType||body.type===loseType)){lose=false;throw {code:503,message:'Lost acknowledgement'};}
   return res.end(JSON.stringify(result));
  }
  res.setHeader('Content-Type','text/javascript');res.end(await readFile(resolve('public','.'+req.url.split('?')[0])));
 }catch(error){res.statusCode=typeof error.code==='number'?error.code:500;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:error.message}));}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true}),page=await browser.newPage();
 const initialize=()=>page.evaluate(async()=>{const ticket=await(await import('/device-cache.js')).initializeDeviceCache('owner-a');Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});return ticket;});
 const flush=()=>page.evaluate(async()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});await(await import('/background-writes.js')).flushBackgroundWrites();Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});});
 try{await page.goto('http://127.0.0.1:'+server.address().port);const ticket=await initialize();await page.evaluate(async({snapshot,ticket})=>await(await import('/offline-store.js')).saveOfflineSnapshot(snapshot,ticket),{snapshot:await store.offlineSnapshot(),ticket});await run({page,fixture,store,sent,initialize,flush,date});}
 finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
}

test('temporary failures retain writes; irreconcilable changes settle silently and later writes continue',async()=>{
 let failure={code:503,message:'Unable to connect. Please try again.'};
 await realQueueFixture(initialState(),async({page,flush,date,sent,fixture})=>{
  await page.evaluate(async date=>{
   await(await import('/diary-api.js')).queueCommand('a'.repeat(64),'water.add',{date,amount:250});
   await(await import('/diary-api.js')).queueCommand('a'.repeat(64),'water.add',{date,amount:500});
  },date);
  await flush();await flush();
  assert.equal((await page.evaluate(async()=>(await(await import('/offline-store.js')).readWriteCopy()).pending)).length,2);
  failure={code:409,message:'Your data has changed. Please try again.'};
  await flush();
  assert.equal((await page.evaluate(async()=>(await(await import('/offline-store.js')).readWriteCopy()).pending)).length,0);
  assert.deepEqual(fixture.state().biometrics.map(row=>row.value),[500]);
  const requests=sent.length;await flush();assert.equal(sent.length,requests);
  assert.equal(await page.evaluate(async()=>{const {readWriteCopy}=await import('/offline-store.js'),{offlineEffectiveState}=await import('/offline-model.js');return offlineEffectiveState(await readWriteCopy()).biometrics.length;}),1);
 },{rejectWrite:body=>body.payload?.amount===250?failure:null});
});

test('a retained conflict from an earlier app version retries against the latest revision automatically',async()=>{
 await realQueueFixture(initialState(),async({page,flush,date,fixture,store})=>{
  await page.evaluate(async date=>{
   const result=await(await import('/diary-api.js')).queueCommand('a'.repeat(64),'water.add',{date,amount:250});
   const storage=await import('/offline-store.js'),copy=await storage.readWriteCopy();
   await storage.changeBackgroundWrite(copy.ticket,result.requestId,row=>{row.status='conflict';row.error='Review this change.';});
  },date);
  await store.command({requestId:crypto.randomUUID(),revision:digest(fixture.state()),type:'note.add',payload:{date,text:'Other device'}});
  await flush();
  assert.equal((await page.evaluate(async()=>(await(await import('/offline-store.js')).readWriteCopy()).pending)).length,0);
  assert.equal(fixture.state().notes[0].text,'Other device');assert.equal(fixture.state().biometrics[0].value,250);
 });
});

test('copied mixed records appear locally and keep edit identities through a lost acknowledgement and restart',async()=>{
 const state=initialState(),sourceDate='2026-11-19';
 const food=act(state,'food.save',{name:'Rice',serving:'100 g',grams:100,nutrients:{calories:100}});
 act(state,'entry.add',{foodId:food.id,date:sourceDate,group:'Lunch',amount:1});
 act(state,'note.add',{date:sourceDate,text:'Copied note'});
 act(state,'water.add',{date:sourceDate,amount:250});
 const review=diaryToolsReview(state,{operation:'copy',selection:{date:sourceDate,scope:'day'},destination:{date:'2026-11-20',group:null}});
 await realQueueFixture(state,async({page,flush,initialize,fixture,date,sent})=>{
  const local=await page.evaluate(async({review,date})=>{
   const {queueCommand}=await import('/diary-api.js'),{readWriteCopy}=await import('/offline-store.js'),{offlineEffectiveState}=await import('/offline-model.js');
   await queueCommand(review.revision,'records.copy',{selection:review.selection,destination:review.destination,fingerprint:review.fingerprint,confirmed:true});
   const state=offlineEffectiveState(await readWriteCopy()),entry=state.entries.find(row=>row.date===date),note=state.notes.find(row=>row.date===date);
   if(!entry||!note||!state.biometrics.some(row=>row.date===date))throw Error('Copy did not project all record collections');
   await queueCommand(review.revision,'entry.update',{id:entry.id,amount:3});
   await queueCommand(review.revision,'note.delete',{id:note.id});
   return {entry:entry.id,note:note.id};
  },{review,date});
  await flush();assert.equal(fixture.state().entries.filter(row=>row.date===date).length,1);
  await page.reload();await initialize();await flush();
  const copy=await page.evaluate(async()=>(await(await import('/offline-store.js')).readWriteCopy()));
  assert.equal(copy.pending.length,0);
  const entries=fixture.state().entries.filter(row=>row.date===date);assert.equal(entries.length,1);assert.equal(entries[0].amount,3);
  assert.equal(fixture.state().notes.filter(row=>row.date===date).length,0);assert.equal(fixture.state().biometrics.filter(row=>row.date===date).length,1);
  assert.deepEqual(copy.snapshot.state.entries,fixture.state().entries);
  assert.ok(sent.filter(row=>row.body.type==='entry.update').every(row=>row.body.payload.id===entries[0].id));
  assert.notEqual(entries[0].id,local.entry);
 },{losePath:'/api/workspace/command'});
});

test('rapid single-device adds and edits use each preceding receipt revision without conflict retries',async()=>{
 const seed=initialState();seed.foods=[{id:'rice',name:'Rice',grams:100,nutrients:{calories:100}}];
 await realQueueFixture(seed,async({page,fixture,flush,date,sent})=>{
  const initialRevision=digest(seed);
  await page.evaluate(async({date,revision})=>{
   const {queueCommand}=await import('/diary-api.js');
   for(let index=0;index<12;index++)await queueCommand(revision,'water.add',{date,amount:250});
   const entry=await queueCommand(revision,'entry.add',{date,foodId:'rice',amount:1});
   await queueCommand(revision,'entry.update',{id:entry.requestId,amount:2,date});
   await queueCommand(revision,'display.save',{showWater:false});
   await queueCommand(revision,'display.save',{showWater:true});
  },{date,revision:initialRevision});
  await flush();
  assert.equal(sent.length,16,'Each command should succeed on its first send');
  assert.equal(fixture.state().entries[0]?.amount,2);
  assert.equal(new Set(sent.map(row=>row.body.revision)).size,16,'Each save uses the preceding receipt revision');
  assert.equal(sent[0].body.revision,initialRevision);
  assert.equal(fixture.state().biometrics.length,12);
  assert.equal(fixture.state().entries[0].amount,2);
  assert.equal(fixture.state().settings.showWater,true);
  assert.equal((await page.evaluate(async()=>(await(await import('/offline-store.js')).readWriteCopy()).pending)).length,0);
 });
});

test('calendar markers reflect local visibility changes before and after sync instead of stale responses',async()=>{
 const state=initialState();act(state,'food.save',{name:'Rice',serving:'100 g',grams:100,nutrients:{calories:100}});
 act(state,'entry.add',{foodId:state.foods[0].id,date:'2026-11-20',group:'Lunch',amount:1});
 await realQueueFixture(state,async({page,flush})=>{
  const change=visible=>page.evaluate(async ({visible,revision})=>{
   const {readWriteCopy}=await import('/offline-store.js');
   const {queueCommand}=await import('/diary-api.js');
   await queueCommand(revision,'display.save',{diaryCalendar:{version:1,food:visible,exercise:true,biometric:true,note:true,fast:true}});
  },{visible,revision:digest(state)});
  const markers=stale=>page.evaluate(async stale=>{
   const {overlayPendingResponse}=await import('/background-writes.js');
   return (await overlayPendingResponse('/api/diary/calendar?month=2026-11',{month:'2026-11',markers:stale,completedDays:[],calendar:{asOf:'2026-11-20T12:00:00Z',timeZone:'UTC'}})).markers;
  },stale);
  await change(false);assert.deepEqual(await markers({'2026-11-20':['food']}),{});
  await flush();assert.deepEqual(await markers({'2026-11-20':['food']}),{});
  await change(true);assert.deepEqual(await markers({}),{'2026-11-20':['food']});
  await flush();assert.deepEqual(await markers({}),{'2026-11-20':['food']});
 });
});

test('automatically expanded meals keep child edit and delete identities through a lost acknowledgement',{timeout:30000},async()=>{
 const state=initialState();state.settings.alwaysExpandMeals=true;
 const foodA=act(state,'food.save',{name:'Rice',serving:'100 g',grams:100,nutrients:{calories:100}}),foodB=act(state,'food.save',{name:'Beans',serving:'100 g',grams:100,nutrients:{calories:200}});
 const meal=act(state,'meal.save',{name:'Rice and beans',items:[{foodId:foodA.id,quantity:50,unit:'g'},{foodId:foodB.id,amount:1}]});
 await realQueueFixture(state,async({page,fixture,sent,initialize,flush,date})=>{
  const ids=await page.evaluate(async({mealId,date,revision})=>{
   const {queueCommand}=await import('/diary-api.js'),{offlineEffectiveState}=await import('/offline-model.js'),{readWriteCopy}=await import('/offline-store.js');
   const queued=await queueCommand(revision,'entry.add',{mealId,date,group:'Lunch',amount:2});
   const rows=offlineEffectiveState(await readWriteCopy()).entries;
   if(rows.length!==2)throw Error('Expected two pending ingredient rows, received '+rows.length);
   await queueCommand(revision,'entry.update',{id:rows[0].id,amount:3});await queueCommand(revision,'entry.delete',{id:rows[1].id});return {operation:queued.requestId,first:rows[0].id,second:rows[1].id};
  },{mealId:meal.id,date,revision:digest(state)});
  assert.deepEqual([ids.first,ids.second],[ids.operation+'-0',ids.operation+'-1']);
  await flush();assert.equal(fixture.state().entries.length,2);
  await page.reload();await initialize();await flush();
  const entries=fixture.state().entries;assert.equal(entries.length,1);assert.equal(entries[0].foodId,foodA.id);assert.equal(entries[0].amount,3);assert.equal(entries[0].quantity,undefined);
  assert.ok(sent.filter(row=>row.body.type==='entry.update').every(row=>row.body.payload.id===entries[0].id));
  const copy=await page.evaluate(async()=>await(await import('/offline-store.js')).readWriteCopy());assert.equal(copy.pending.length,0);assert.deepEqual(copy.snapshot.state.entries,entries);
  // An editor that stayed open retains the temporary child ID after receipt.
  await page.evaluate(async({id,revision})=>await(await import('/diary-api.js')).queueCommand(revision,'entry.delete',{id}),{id:ids.first,revision:digest(fixture.state())});await flush();assert.equal(fixture.state().entries.length,0);
 },{losePath:'/api/workspace/command'});
});

test('a replayed offline receipt fills the retained baseline when a transport write is also pending',{timeout:30000},async()=>{
 const state=initialState();await realQueueFixture(state,async({page,fixture,sent,initialize,flush,date})=>{
  await page.evaluate(async({date,revision})=>{
   const store=await import('/offline-store.js'),{prepareOfflineAdd}=await import('/offline-model.js'),copy=await store.readWriteCopy(),prepared=prepareOfflineAdd(copy,'note.add',{date,text:'Saved before the reply was lost'});
   await store.queueOffline(copy,'note.add',prepared.payload,prepared.preview);
   await(await import('/diary-api.js')).queueCommand(revision,'water.add',{date,amount:250});
  },{date,revision:digest(state)});
  await flush();assert.equal(fixture.state().notes.length,1);
  await page.reload();await initialize();await flush();
  const copy=await page.evaluate(async()=>await(await import('/offline-store.js')).readWriteCopy());assert.equal(copy.pending.length,0);assert.deepEqual(copy.snapshot.state.notes,fixture.state().notes);assert.deepEqual(copy.snapshot.state.biometrics,fixture.state().biometrics);
  assert.equal(sent.filter(row=>row.path==='/api/offline/commands').length,2);assert.equal(fixture.state().notes.length,1);assert.equal(fixture.state().biometrics.length,1);
 },{losePath:'/api/offline/commands'});
});

test('a refreshed snapshot deletion survives replay of an older offline add',{timeout:30000},async()=>{
 const state=initialState();await realQueueFixture(state,async({page,fixture,store,initialize,flush,date})=>{
  await page.evaluate(async date=>{
   const store=await import('/offline-store.js'),{prepareOfflineAdd}=await import('/offline-model.js'),copy=await store.readWriteCopy(),prepared=prepareOfflineAdd(copy,'note.add',{date,text:'Later deleted on another device'});
   await store.queueOffline(copy,'note.add',prepared.payload,prepared.preview);
  },date);
  await flush();assert.equal(fixture.state().notes.length,1);
  await store.command({requestId:crypto.randomUUID(),revision:digest(fixture.state()),type:'note.delete',payload:{id:fixture.state().notes[0].id}},async()=>null);
  await page.reload();await initialize();await flush();
  const copy=await page.evaluate(async()=>await(await import('/offline-store.js')).readWriteCopy());assert.equal(copy.pending.length,0);assert.deepEqual(copy.snapshot.state.notes,[]);assert.deepEqual(fixture.state().notes,[]);
 },{losePath:'/api/offline/commands'});
});

test('persisted writes survive reload, retry lost replies once and stay account scoped', {timeout:30000}, async()=>{
  let online=false, loseReply=true;
  const receipts=new Map(), received=[];
  const server=createServer(async(req,res)=>{
    if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end('<main id="page"></main>');}
    if(req.url==='/api/workspace/command'){
      let raw='';for await(const chunk of req)raw+=chunk;
      const body=JSON.parse(raw);received.push(body);
      res.setHeader('Content-Type','application/json');
      if(!online){res.statusCode=503;return res.end('{}');}
      if(!receipts.has(body.requestId))receipts.set(body.requestId,{ok:true,revision:'b'.repeat(64)});
      if(loseReply){loseReply=false;res.statusCode=503;return res.end('{}');}
      return res.end(JSON.stringify(receipts.get(body.requestId)));
    }
    if(req.url==='/api/offline'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(offlineSnapshot(initialState(),{ownerId:'owner-a',generation:'test-generation'})));}
    if(req.url.startsWith('/api/')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({id:'owner-a',revision:'a'.repeat(64)}));}
    try{res.setHeader('Content-Type','text/javascript');res.end(await readFile(resolve('public','.'+req.url.split('?')[0])));}catch{res.statusCode=404;res.end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});
  const page=await browser.newPage();
  const base='http://127.0.0.1:'+server.address().port;
  const initialize=owner=>page.evaluate(async owner=>{await(await import('/device-cache.js')).initializeDeviceCache(owner);},owner);
  try{
    await page.goto(base);await initialize('owner-a');
    // A failed device transaction must not be presented as a saved change.
    const storageFailure=await page.evaluate(async()=>{
      const put=IDBObjectStore.prototype.put;let failed=false;
      IDBObjectStore.prototype.put=function(value,...args){if(this.name==='accounts'&&value.pending?.length&&!failed){failed=true;throw new DOMException('Device storage is full.','QuotaExceededError');}return put.call(this,value,...args);};
      try{await(await import('/diary-api.js')).queueCommand('a'.repeat(64),'water.add',{date:'2026-11-20',amount:250});return false;}catch(error){return error.name==='QuotaExceededError';}finally{IDBObjectStore.prototype.put=put;}
    });
    assert.equal(storageFailure,true);
    assert.equal(await page.evaluate(async()=>(await(await import('/offline-store.js')).readWriteCopy())?.pending.length??0),0);
    const id=await page.evaluate(async()=>{
      const {queueCommand}=await import('/diary-api.js');
      const result=await queueCommand('a'.repeat(64),'water.add',{date:'2026-11-20',amount:250});
      return result.requestId;
    });
    assert.equal(typeof id,'string');
    await page.reload();await initialize('owner-b');
    online=true;
    await page.evaluate(async()=>await(await import('/background-writes.js')).flushBackgroundWrites());
    assert.equal(receipts.size,0);
    await initialize('owner-a');
    await page.evaluate(async()=>await(await import('/background-writes.js')).flushBackgroundWrites());
    assert.equal(receipts.size,1);
    assert.equal(await page.evaluate(async()=>(await(await import('/offline-store.js')).readWriteCopy()).pending.length),1);
    await page.reload();await initialize('owner-a');
    await page.evaluate(async()=>await(await import('/background-writes.js')).flushBackgroundWrites());
    assert.equal(receipts.size,1);
    assert.equal(await page.evaluate(async()=>(await(await import('/offline-store.js')).readWriteCopy()).pending.length),0);
    assert.ok(received.every(body=>body.requestId===id));
  }finally{await browser.close();await new Promise(r=>server.close(r));}
});

test('rapid add/edit/delete replays through real receipts across restart and late editor saves', {timeout:30000}, async()=>{
 const state=initialState(),date='2026-11-20',owner='owner-a';
 const food=act(state,'food.save',{name:'Rice',serving:'100 g',grams:100,nutrients:{calories:100,protein:2}});
 const fixture=diaryStoreFixture(state,owner),store=createWorkspaceStore(fixture.db,owner);
 let online=false,lose=true;const sent=[];
 const server=createServer(async(req,res)=>{try{
  if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end('<main id="page"></main>');}
  if(req.url.startsWith('/api/')){
   res.setHeader('Content-Type','application/json');
   if(!online)throw {code:503,message:'Offline'};
   if(req.url==='/api/account')return res.end(JSON.stringify({id:owner}));
   if(req.url==='/api/offline')return res.end(JSON.stringify(await store.offlineSnapshot()));
   if(req.url.startsWith('/api/diary'))return res.end(JSON.stringify({revision:digest(fixture.state())}));
   let raw='';for await(const chunk of req)raw+=chunk;const input=JSON.parse(raw);sent.push(input);
   const result=await store.command(input,async()=>null,{owner,asOf:date+'T12:00:00Z',timeZone:'UTC'});
   if(lose){lose=false;throw {code:503,message:'Lost acknowledgement'};}
   return res.end(JSON.stringify(result));
  }
  res.setHeader('Content-Type','text/javascript');res.end(await readFile(resolve('public','.'+req.url.split('?')[0])));
 }catch(error){res.statusCode=typeof error.code==='number'?error.code:404;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:error.message}));}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true}),page=await browser.newPage();
 const initialize=()=>page.evaluate(async()=>await(await import('/device-cache.js')).initializeDeviceCache('owner-a'));
 try{
  await page.goto('http://127.0.0.1:'+server.address().port);await initialize();
  const id=await page.evaluate(async({revision,foodId,date})=>{
   const {queueCommand}=await import('/diary-api.js');
   const result=await queueCommand(revision,'entry.add',{foodId,date,group:'Lunch',amount:1});
   await queueCommand(revision,'entry.update',{id:result.requestId,date,group:'Lunch',amount:2});
   return result.requestId;
  },{revision:digest(state),foodId:food.id,date});
  await page.reload();await initialize();online=true;
  await page.evaluate(async()=>await(await import('/background-writes.js')).flushBackgroundWrites());
  assert.equal(fixture.state().entries.length,1);
  await page.reload();await initialize();
  await page.evaluate(async()=>await(await import('/background-writes.js')).flushBackgroundWrites());
  assert.equal(fixture.state().entries.length,1);assert.equal(fixture.state().entries[0].amount,2,JSON.stringify({sent,copy:await page.evaluate(async()=>(await(await import('/offline-store.js')).readWriteCopy()).pending)}));
  assert.equal(fixture.table('command_receipts').size,2);
  assert.equal(sent.filter(row=>row.type==='entry.add').length,2);
  assert.ok(sent.filter(row=>row.type==='entry.update').every(row=>row.payload.id===fixture.state().entries[0].id));
  // An editor opened before acknowledgement still holds the local ID.
  await page.evaluate(async({id,revision,date})=>await(await import('/diary-api.js')).queueCommand(revision,'entry.delete',{id}),{id,revision:digest(state),date});
  await page.evaluate(async()=>await(await import('/background-writes.js')).flushBackgroundWrites());
  assert.equal(fixture.state().entries.length,0);assert.equal(fixture.table('command_receipts').size,3);
  assert.equal(await page.evaluate(async()=>(await(await import('/offline-store.js')).readWriteCopy()).pending.length),0);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});

test('restored diary edits settle silently while malformed snapshots retain unsent changes',{timeout:30000},async()=>{
 const owner='owner-a',state=initialState();let generation='original',malformed=false,restoreOnWrite=false;const sent=[];
 const snapshot=()=>offlineSnapshot(state,{ownerId:owner,generation});
 const server=createServer(async(req,res)=>{
  if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end('<main id="page"></main>');}
  if(req.url.startsWith('/api/')){
   res.setHeader('Content-Type','application/json');
   if(req.url==='/api/account')return res.end(JSON.stringify({id:owner}));
   if(req.url==='/api/offline')return res.end(JSON.stringify(malformed?{version:2}:snapshot()));
   if(req.url.startsWith('/api/diary'))return res.end(JSON.stringify({revision:digest(state)}));
   let raw='';for await(const chunk of req)raw+=chunk;sent.push(JSON.parse(raw));
   if(restoreOnWrite){restoreOnWrite=false;generation='restored-during-write';res.statusCode=409;return res.end(JSON.stringify({error:'Diary changed'}));}
   return res.end(JSON.stringify({ok:true,revision:digest(state)}));
  }
  try{res.setHeader('Content-Type','text/javascript');res.end(await readFile(resolve('public','.'+req.url.split('?')[0])));}catch{res.statusCode=404;res.end();}
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true}),page=await browser.newPage();
 const queue=async()=>page.evaluate(async snapshot=>{
  const cache=await import('/device-cache.js'),store=await import('/offline-store.js');
  const ticket=await cache.initializeDeviceCache('owner-a');await store.saveOfflineSnapshot(snapshot,ticket);
  Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});
  return (await(await import('/diary-api.js')).queueCommand('a'.repeat(64),'water.add',{date:'2026-11-20',amount:250})).requestId;
 },snapshot());
 const flush=()=>page.evaluate(async()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});return(await import('/background-writes.js')).flushBackgroundWrites();});
 const pending=()=>page.evaluate(async()=>(await(await import('/offline-store.js')).readWriteCopy()).pending);
 try{
  await page.goto('http://127.0.0.1:'+server.address().port);const id=await queue();generation='restored';await flush();
  assert.equal((await pending()).length,0);assert.equal(sent.length,0);
  await page.reload();await page.evaluate(async()=>await(await import('/device-cache.js')).initializeDeviceCache('owner-a'));await flush();assert.equal((await pending()).length,0);assert.equal(sent.length,0);
  // A fresh command cannot bypass the version check with an unrecognized response.
  await page.evaluate(async()=>await(await import('/offline-store.js')).clearOfflineAccount({discardPending:true}));await queue();malformed=true;
  await assert.rejects(flush(),/could not be verified/);assert.equal((await pending()).length,1);assert.equal(sent.length,0);
  malformed=false;restoreOnWrite=true;await flush();assert.equal(sent.length,1);assert.equal((await pending()).length,0);
  await flush();assert.equal(sent.length,1);assert.equal((await pending()).length,0);
 }finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});


test('offline entry can immediately become a recipe and copy through acknowledgement loss and restart',async()=>{
 const state=initialState();state.foods=[{id:'rice',name:'Rice',grams:100,nutrients:{calories:100}}];
 await realQueueFixture(state,async({page,fixture,flush,initialize,date})=>{
  const reviews=[];page.on('request',request=>{if(request.url().includes('/api/diary/tools/review'))reviews.push(request.url());});
  const local=await page.evaluate(async date=>{
   const {queueCommand}=await import('/diary-api.js'),{prepareLocalDiaryReview}=await import('/diary-preparation.js');
   const {readWriteCopy}=await import('/offline-store.js'),{offlineEffectiveState}=await import('/offline-model.js');
   const revision='a'.repeat(64),entry=await queueCommand(revision,'entry.add',{foodId:'rice',date,amount:2,group:'Lunch'});
   const selection={date,scope:'selected',records:[{collection:'entries',id:entry.requestId}]};
   const recipe=await prepareLocalDiaryReview({operation:'recipe',selection},revision);
   await queueCommand(revision,'selection.recipe',{selection:recipe.selection,fingerprint:recipe.fingerprint,name:'Offline rice',confirmed:true},{projection:{diaryReview:recipe.localReview,reusable:{kind:'recipe',resource:recipe.resource,foods:recipe.foods}}});
   const copy=await prepareLocalDiaryReview({operation:'copy',selection,destination:{date:'2026-11-21',group:null}},revision);
   await queueCommand(revision,'records.copy',{selection:copy.selection,destination:copy.destination,fingerprint:copy.fingerprint,confirmed:true},{projection:{diaryReview:copy.localReview}});
   const effective=offlineEffectiveState(await readWriteCopy());
   return {entries:effective.entries.length,recipes:effective.recipes.map(row=>row.name)};
  },date);
  assert.deepEqual(local,{entries:2,recipes:['Offline rice']});assert.deepEqual(reviews,[]);
  await flush();assert.equal(fixture.state().entries.length,1);
  await page.reload();await initialize();await flush();
  const pending=await page.evaluate(async()=>(await(await import('/offline-store.js')).readWriteCopy()).pending);
  assert.deepEqual(pending.map(row=>({type:row.command.type,error:row.error})),[]);
  assert.equal(fixture.state().entries.length,2);assert.equal(fixture.state().recipes.length,1);
  assert.equal(fixture.state().recipes[0].name,'Offline rice');
  assert.ok(fixture.state().entries.every(row=>row.amount===2&&row.foodId==='rice'));
  await page.reload();await initialize();await flush();assert.equal(fixture.state().entries.length,2);assert.equal(fixture.state().recipes.length,1);
 },{losePath:'/api/workspace/command'});
});


for(const operation of ['meal','copy'])test(`locally prepared ${operation} retries the exact saved payload after a lost reply`,async()=>{
 const state=initialState(),date='2026-11-20';act(state,'entry.add',{name:'Sauce',date,amount:2,nutrients:{calories:20}});
 await realQueueFixture(state,async({page,fixture,flush,initialize,sent})=>{
  await page.evaluate(async({operation,date})=>{
   const {queueCommand}=await import('/diary-api.js'),{prepareLocalDiaryReview}=await import('/diary-preparation.js');
   const {readWriteCopy}=await import('/offline-store.js');
   const selection={date,scope:'day'},revision='a'.repeat(64);
   const review=await prepareLocalDiaryReview({operation,selection,...(operation==='copy'?{destination:{date:'2026-11-21',group:null}}:{})},revision);
   await queueCommand(revision,operation==='copy'?'records.copy':'selection.meal',{selection:review.selection,fingerprint:review.fingerprint,confirmed:true,...(operation==='copy'?{destination:review.destination}:{name:'Local sauce'})},{projection:{diaryReview:review.localReview,...(operation==='meal'?{reusable:{kind:'meal',resource:review.resource,foods:review.foods}}:{})}});
  },{operation,date});
  await flush();
  const prepared=await page.evaluate(async()=>{const copy=await(await import('/offline-store.js')).readWriteCopy();return copy.pending[0];});
  assert.equal(prepared.projection.diaryReview.prepared,true);assert.equal(prepared.status,'unknown',JSON.stringify({error:prepared.error,sent}));
  const saved=structuredClone(fixture.state());
  await page.reload();await initialize();await flush();
  assert.deepEqual(fixture.state(),saved);
  assert.deepEqual(sent.at(-1).body.payload,prepared.transport.body.payload);
  assert.equal((await page.evaluate(async()=>(await(await import('/offline-store.js')).readWriteCopy()).pending)).length,0);
 },{losePath:'/api/workspace/command',loseType:operation==='copy'?'records.copy':'selection.meal'});
});

test('captured pending entries survive identity acknowledgement but reject later source edits',async()=>{
 const state=initialState();state.foods=[{id:'rice',name:'Rice',grams:100,nutrients:{calories:100}}];
 await realQueueFixture(state,async({page,flush,date})=>{
  const captured=await page.evaluate(async date=>{
   const {queueCommand}=await import('/diary-api.js'),{prepareLocalDiaryReview}=await import('/diary-preparation.js');
   const revision='a'.repeat(64),entry=await queueCommand(revision,'entry.add',{foodId:'rice',date,amount:2,group:'Lunch'});
   return prepareLocalDiaryReview({operation:'capture',selection:{date,scope:'day'}},revision);
  },date);
  await flush();
  const check=async()=>page.evaluate(async captured=>{
   const {prepareLocalDiaryReview}=await import('/diary-preparation.js');
   try{return await prepareLocalDiaryReview({operation:'copy',selection:captured.selection,destination:{date:'2026-11-21',group:null}},captured.revision,{captured:captured.localReview});}
   catch(error){return {status:error.status,error:error.message};}
  },captured);
  const review=await check();assert.equal(review.total,1);assert.notEqual(review.selection.records[0].id,captured.selection.records[0].id);
  await page.evaluate(async date=>await(await import('/diary-api.js')).queueCommand('a'.repeat(64),'entry.add',{foodId:'rice',date,amount:1,group:'Dinner'}),date);
  assert.equal((await check()).total,1);
  await page.evaluate(async review=>{
   await(await import('/diary-api.js')).queueCommand(review.revision,'entry.update',{id:review.selection.records[0].id,date:review.selection.date,foodId:'rice',amount:3,group:'Lunch'});
  },review);
  assert.equal((await check()).status,409);
 });
});


test('an edited selection from a pending copied inline food survives a restart and a lost recipe reply',async()=>{
 const state=initialState(),sourceDate='2026-11-19',date='2026-11-20';
 act(state,'entry.add',{name:'Sauce',date:sourceDate,amount:1,nutrients:{calories:20},group:'Lunch'});
 await realQueueFixture(state,async({page,fixture,flush,initialize,sent})=>{
  await page.evaluate(async({sourceDate,date})=>{
   const {queueCommand}=await import('/diary-api.js'),{prepareLocalDiaryReview}=await import('/diary-preparation.js');
   const {saveLocalLibrary,previewLocalLibrary}=await import('/library-local.js');
   const revision='a'.repeat(64);
   const copy=await prepareLocalDiaryReview({operation:'copy',selection:{date:sourceDate,scope:'day'},destination:{date,group:null}},revision);
   await queueCommand(revision,'records.copy',{selection:copy.selection,destination:copy.destination,fingerprint:copy.fingerprint,confirmed:true},{projection:{diaryReview:copy.localReview}});
   const selection=await prepareLocalDiaryReview({operation:'recipe',selection:{date,scope:'day'}},revision);
   const draft={name:'Sauce batch',ingredients:[{foodId:selection.items[0].foodId,amount:3}],servings:2,instructions:'Stir.'};
   await previewLocalLibrary({kind:'recipe',date,draft},undefined,selection);
   const saved=await saveLocalLibrary('recipe',draft,{revision,selection});
   await queueCommand(revision,'entry.add',{date,group:'Lunch',recipeId:saved.item.id,amount:1});
  },{sourceDate,date});
  await page.reload();await initialize();await flush();
  assert.equal(fixture.state().recipes.length,1);
  await page.reload();await initialize();await flush();
  const result=fixture.state(),recipe=result.recipes[0];
  assert.equal(recipe.servings,2);assert.equal(recipe.instructions,'Stir.');
  assert.equal(recipe.ingredients[0].amount,3);assert.equal(recipe.ingredients[0].foodId,result.foods[0].id);
  assert.equal(result.foods[0].nutrients.calories,20);assert.equal(result.entries.at(-1).recipeId,recipe.id);
  const saves=sent.filter(row=>row.body.type==='selection.recipe');
  assert.equal(saves.length,2);assert.deepEqual(saves[0].body,saves[1].body);
 },{losePath:'/api/workspace/command',loseType:'selection.recipe'});
});

test('an open reusable editor follows an earlier recipe acknowledgement before Save',async()=>{
 const state=initialState(),date='2026-11-20';state.foods=[{id:'rice',name:'Rice',grams:100,nutrients:{calories:100}}];act(state,'entry.add',{foodId:'rice',date,amount:1});
 await realQueueFixture(state,async({page,flush,fixture})=>{
  const laterReview=await page.evaluate(async date=>{
   const {queueCommand}=await import('/diary-api.js'),{prepareLocalDiaryReview}=await import('/diary-preparation.js');
   const selection={date,scope:'day'},revision='a'.repeat(64),review=await prepareLocalDiaryReview({operation:'recipe',selection},revision);
   await queueCommand(revision,'selection.recipe',{selection:review.selection,fingerprint:review.fingerprint,name:'First recipe',confirmed:true},{projection:{diaryReview:review.localReview,reusable:{kind:'recipe',resource:review.resource,foods:review.foods}}});
   return prepareLocalDiaryReview({operation:'meal',selection},revision);
  },date);
  await flush();assert.equal(fixture.state().recipes.length,1);
  await page.evaluate(async review=>{
   await(await import('/diary-api.js')).queueCommand(review.revision,'selection.meal',{selection:review.selection,fingerprint:review.fingerprint,name:'Later meal',confirmed:true},{projection:{diaryReview:review.localReview,reusable:{kind:'meal',resource:review.resource,foods:review.foods}}});
  },laterReview);
  await flush();
  assert.deepEqual(await page.evaluate(async()=>{const copy=await(await import('/offline-store.js')).readWriteCopy();const {diaryReviewGuard}=await import('/local-diary-projection.js');return copy.pending.map(row=>({error:row.error,expected:row.projection.diaryReview.guard,actual:diaryReviewGuard(copy.snapshot.state,row.projection.diaryReview.input)}));}),[]);
  assert.equal(fixture.state().meals.length,1);
 });
});


test('offline library create, dependent edits and diary additions reconcile once after a lost reply and reload',async()=>{
 const state=initialState();
 await realQueueFixture(state,async({page,fixture,initialize,flush,sent,date})=>{
  const local=await page.evaluate(async date=>{
   const {saveLocalLibrary,previewLocalLibrary}=await import('/library-local.js');
   const {queueCommand}=await import('/diary-api.js');
   const {localLibraryItem,localLibraryView}=await import('/local-engine.js');
   const food=await saveLocalLibrary('food',{name:'Offline oats',grams:100,nutrients:{calories:100}});
   const recipe=await saveLocalLibrary('recipe',{name:'Offline recipe',servings:2,ingredients:[{foodId:food.item.id,amount:2}]});
   const meal=await saveLocalLibrary('meal',{name:'Offline meal',items:[{recipeId:recipe.item.id,amount:1}]});
   await queueCommand(undefined,'entry.add',{mealId:meal.item.id,date,amount:1});
   await saveLocalLibrary('food',{id:food.item.id,name:'Edited oats',nutrientEdits:[{kind:'manual',values:{calories:200}}]});
   const preview=await previewLocalLibrary({kind:'meal',draft:{id:meal.item.id},date});
   return {food:food.item.id,recipe:recipe.item.id,meal:meal.item.id,preview:preview.nutrition.totals.calories,item:await localLibraryItem(meal.item),list:await localLibraryView()};
  },date);
  assert.equal(local.preview,200);assert.equal(local.item.facts.nutrients.calories,200);assert.equal(local.list.items.length,3);assert.equal(fixture.state().foods.length,0);
  await flush();assert.equal(fixture.state().foods.length,1);assert.equal(fixture.state().recipes.length,0);
  await page.reload();await initialize();await flush();
  assert.equal(fixture.state().foods.length,1);assert.equal(fixture.state().recipes.length,1);assert.equal(fixture.state().meals.length,1);assert.equal(fixture.state().entries.length,1);
  assert.equal(fixture.state().foods[0].name,'Edited oats');assert.equal(fixture.state().foods[0].nutrients.calories,200);
  const after=await page.evaluate(async local=>{
   const {localLibraryItem}=await import('/local-engine.js'),{readWriteCopy}=await import('/offline-store.js');
   return {item:await localLibraryItem({kind:'meal',id:local.meal}),pending:(await readWriteCopy()).pending};
  },local);
  assert.equal(after.item.resource.id,fixture.state().meals[0].id);assert.equal(after.item.facts.nutrients.calories,200);assert.deepEqual(after.pending,[]);
  const attempts=sent.filter(row=>row.body.type==='food.save');assert.equal(attempts.length,2);assert.deepEqual(attempts[0].body,attempts[1].body);
  assert.equal(fixture.state().recipes[0].ingredients[0].foodId,fixture.state().foods[0].id);
  assert.equal(fixture.state().entries[0].mealId,fixture.state().meals[0].id);
 },{losePath:'/api/library/command',loseType:'food.save'});
});

test('offline meal expansion follows a pending meal and parent across restart and a lost expansion reply',async()=>{
 const state=initialState();
 state.foods=[{id:'rice',name:'Rice',grams:100,nutrients:{calories:100}}];
 await realQueueFixture(state,async({page,fixture,initialize,flush,sent,date})=>{
  const pending=await page.evaluate(async date=>{
   const {saveLocalLibrary}=await import('/library-local.js');
   const {queueCommand}=await import('/diary-api.js');
   const {prepareLocalDiaryReview}=await import('/diary-preparation.js');
   const meal=await saveLocalLibrary('meal',{name:'Offline meal',items:[{foodId:'rice',amount:2}]});
   const parent=await queueCommand(undefined,'entry.add',{mealId:meal.item.id,date,amount:3,group:'Lunch'});
   const review=await prepareLocalDiaryReview({operation:'expand',id:parent.requestId,date},'a'.repeat(64));
   const child=await queueCommand(undefined,'entry.expand',{date,id:review.id,fingerprint:review.fingerprint,confirmed:true},{projection:{entries:review.items,diaryReview:review.localReview}});
   return {parent:parent.requestId,child:child.requestId+'-0'};
  },date);
  await page.reload();await initialize();
  const entries=await page.evaluate(async()=>(await (await import('/local-engine.js')).localWorkspaceState()).entries);
  assert.equal(entries.length,1);assert.equal(entries[0].id,pending.child);
  assert.equal(entries[0].expandedFrom.id,pending.parent);assert.equal(entries[0].amount,6);
  assert.equal(fixture.state().entries.length,0);
  await flush();
  const saved=structuredClone(fixture.state().entries);
  assert.equal(saved.length,1);assert.equal(saved[0].amount,6);
  assert.equal(saved[0].expandedFrom.parent.mealId,fixture.state().meals[0].id);
  assert.notEqual(saved[0].expandedFrom.id,pending.parent);
  await page.reload();await initialize();await flush();
  const attempts=sent.filter(row=>row.body.type==='entry.expand');
  assert.equal(attempts.length,2);assert.deepEqual(attempts[0].body,attempts[1].body);
  assert.deepEqual(fixture.state().entries,saved);
  const copy=await page.evaluate(async()=>(await import('/offline-store.js')).readWriteCopy());
  assert.deepEqual(copy.pending,[]);assert.equal(copy.recordIds[pending.child],saved[0].id);
 },{losePath:'/api/workspace/command',loseType:'entry.expand'});
});

for(const lost of ['chart.save','fasting.schedule.save'])test('offline chart and fasting editors reconcile after restart and a lost '+lost+' reply',async()=>{
 await realQueueFixture(initialState(),async({page,fixture,flush,initialize,sent,date})=>{
  await page.clock.setFixedTime(new Date(date+'T12:00:00Z'));
  async function mount(surface){
   await page.evaluate(async({surface,date})=>{
    window.surface?.dispose();document.body.innerHTML='<main></main><dialog><div></div></dialog>';
    const page=document.querySelector('main'),sheet=document.querySelector('dialog'),content=sheet.firstChild;
    const ui={page,date:()=>date,content,header:title=>'<h2>'+title+'</h2>',show:html=>{content.innerHTML=html;sheet.showModal();},close:()=>{sheet.close();content.replaceChildren();}};
    window.surface=surface==='fasting'?(await import('/fasting.js')).mountFasting(ui):(await import('/charts.js')).mountCharts(ui);
   },{surface,date});
  }
  const pending=()=>page.evaluate(async()=>(await(await import('/offline-store.js')).readWriteCopy()).pending);
  await mount('fasting');await page.locator('.dc-fast-footer button').click();
  await page.locator('.fasting-editor [name=label]').fill('Evening fast');
  await page.locator('.fasting-editor [type=submit]').click();
  await page.locator('.fasting-editor').waitFor({state:'detached'});
  await page.locator('[data-fast-section=scheduled] summary').click();
  await page.getByText('Evening fast',{exact:true}).waitFor();
  await mount('charts');
  for(const name of ['Morning weight','Evening weight']){
   await page.locator('[data-create]').click();await page.getByLabel('Chart Name',{exact:true}).fill(name);
   await page.locator('[data-mce-save]').click();await page.locator('.mobile-chart-editor').waitFor({state:'detached'});
  }
  const queued=await pending();assert.equal(queued.length,3);assert.equal(sent.length,0);
  const chartIds=queued.slice(1).map(row=>row.command.payload.id);assert.equal(new Set(chartIds).size,2);
  await page.reload();await initialize();
  await page.route('**/api/charts?**',route=>route.abort());await page.route('**/api/fasting?**',route=>route.abort());
  await mount('charts');for(const id of chartIds)await page.locator('[data-chart-open="custom:'+id+'"]').waitFor();
  await mount('fasting');await page.locator('[data-fast-section=scheduled] summary').click();
  await page.getByText('Evening fast',{exact:true}).waitFor();await page.locator('[data-schedule-time=start][datetime="'+date+'T12:02:00Z"]').waitFor();
  assert.equal(await page.locator('.dc-scheduled-times > div').count(),2);
  await flush();assert.equal((await pending()).length,lost==='chart.save'?2:3);assert.equal(fixture.state().fastingPlan.schedules.length,1);
  await page.reload();await initialize();await flush();assert.equal((await pending()).length,0);
  assert.equal(fixture.state().fastingPlan.schedules.length,1);const attempts=sent.filter(item=>item.body.type===lost);assert.deepEqual(attempts[0],attempts[1]);
  assert.deepEqual(fixture.state().charts.map(chart=>chart.id),chartIds);
  const cached=await page.evaluate(async date=>{
   const {request}=await import('/diary-api.js'),{localWorkspaceState}=await import('/local-engine.js');
   return {fast:(await request('/api/fasting?limit=25')).schedules,charts:(await request('/api/charts?to='+date)).saved,stateCharts:(await localWorkspaceState()).charts};
  },date);
  const schedule=fixture.state().fastingPlan.schedules[0];
  assert.deepEqual(cached.fast,[{...schedule,nextStart:date+'T12:02:00Z'}]);
  assert.deepEqual(cached.charts,fixture.state().charts);assert.deepEqual(cached.stateCharts,fixture.state().charts);
 },{losePath:'/api/workspace/command',loseType:lost});
});

test('custom chart deletion and visibility survive an offline restart, account switch and lost deletion receipt',async()=>{
 const state=initialState(),hidden={version:2,id:'kept',name:'Kept chart',primary:{kind:'biometric',type:'weight',unit:'kg'},secondary:null,days:7,visible:true,cycleOverlay:false};
 state.charts=[hidden];
 await realQueueFixture(state,async({page,fixture,flush,initialize,sent,date})=>{
  const mount=()=>page.evaluate(async date=>{
   window.surface?.dispose();document.body.innerHTML='<main></main><dialog><div></div></dialog>';
   const page=document.querySelector('main'),sheet=document.querySelector('dialog'),content=sheet.firstChild;
   window.surface=(await import('/charts.js')).mountCharts({page,date:()=>date,content,header:title=>'<h2>'+title+'</h2>',show:html=>{content.innerHTML=html;sheet.showModal();},close:()=>{sheet.close();content.replaceChildren();}});
  },date);
  const queued=()=>page.evaluate(async()=>(await(await import('/offline-store.js')).readWriteCopy()).pending);
  const current=()=>page.evaluate(async date=>{
   const {localWorkspaceState}=await import('/local-engine.js'),{request}=await import('/diary-api.js');
   const lists=await Promise.all([date,'2026-11-19'].map(to=>request('/api/charts?to='+to)));
   return {charts:(await localWorkspaceState()).charts,lists:lists.map(view=>({saved:view.saved.map(row=>[row.id,row.visible]),cards:view.cards.filter(row=>row.kind==='custom').map(row=>row.id),catalog:view.catalog.filter(row=>row.kind==='custom').map(row=>[row.id,row.settings.visible])}))};
  },date);
  await mount();await current();await page.route('**/api/charts?**',route=>route.abort());
  await page.route('**/api/workspace/command',route=>route.abort());
  await page.locator('[data-create]').click();await page.getByLabel('Chart Name',{exact:true}).fill('Temporary chart');
  await page.locator('[data-mce-save]').click();await page.locator('.mobile-chart-editor').waitFor({state:'detached'});
  const id=(await queued())[0].command.payload.id;
  await page.locator('[data-manage]').click();await page.locator('[data-manage-chart="custom:'+id+'"]').click();
  await page.getByLabel('Chart Name',{exact:true}).fill('Edited offline');await page.locator('[data-mce-save]').click();
  await page.locator('.mobile-chart-editor').waitFor({state:'detached'});
  await page.locator('[data-chart-open="custom:'+id+'"]').click();await page.locator('[data-chart-delete]').click();
  await page.locator('[data-mcp-confirm]').click();
  await page.waitForFunction(()=>!document.querySelector('dialog').open,null,{timeout:3500});
  assert.deepEqual((await queued()).map(row=>row.command.type),['chart.save','chart.save','chart.delete']);
  await page.locator('[data-manage]').click();await page.locator('[data-chart-visible="custom:kept"]').uncheck();
  await page.waitForFunction(()=>!document.querySelector('[data-chart-open="custom:kept"]'));
  await page.locator('[data-manage-chart="custom:kept"]').click();await page.locator('[data-mce-delete]').click();await page.locator('[data-mcp-cancel]').click();
  assert.equal(await page.locator('[data-mce-delete]').isVisible(),true);assert.equal((await queued()).length,4);
  const assertCached=async()=>{
   const cached=await current();assert.deepEqual(cached.charts,[{...hidden,visible:false}]);
   for(const view of cached.lists)assert.deepEqual(view,{saved:[['kept',false]],cards:[],catalog:[['custom:kept',false]]});
  };
  await assertCached();
  await page.reload();await initialize();await mount();await page.locator('[data-manage]').click();
  assert.equal(await page.locator('[data-chart-visible="custom:kept"]').isChecked(),false);assert.equal(await page.locator('[data-manage-chart="custom:'+id+'"]').count(),0);
  await page.locator('[data-manage-chart="custom:kept"]').click();await page.locator('[data-mce-delete]').click();
  await page.evaluate(async()=>{await(await import('/device-cache.js')).initializeDeviceCache('owner-b');});
  await page.locator('[data-mcp-confirm]').click();await page.locator('[data-mce-error]').filter({hasText:/./}).waitFor();
  assert.equal(await page.evaluate(async()=>(await(await import('/offline-store.js')).readWriteCopy())?.pending.length??0),0);
  await page.reload();await initialize();assert.equal((await queued()).length,4);assert.equal(sent.length,0);
  await page.unroute('**/api/charts?**');await current();await page.route('**/api/charts?**',route=>route.abort());
  await page.unroute('**/api/workspace/command');await flush();assert.equal((await queued()).length,2);
  await page.reload();await initialize();await flush();
  assert.deepEqual(await queued(),[]);assert.deepEqual(fixture.state().charts,[{...hidden,visible:false}]);await assertCached();
  const attempts=sent.filter(row=>row.body.type==='chart.delete');assert.equal(attempts.length,2);assert.deepEqual(attempts[0],attempts[1]);
  assert.deepEqual((await page.evaluate(async()=>(await(await import('/local-engine.js')).localWorkspaceState()).charts)),fixture.state().charts);
 },{losePath:'/api/workspace/command',loseType:'chart.delete'});
});

test('fasting history, starts and stops persist from the visible offline controls',async()=>{
 const state=initialState(),original={id:'original',label:'Original',start:'2026-11-17T10:00:00Z',end:'2026-11-18T02:00:00Z',goalHours:16};
 state.fasts=[original];
 await realQueueFixture(state,async({page,fixture,initialize,flush,sent,date})=>{
  const noon=date+'T12:01:00.000Z',before=date+'T12:00:00.000Z';
  await page.clock.setFixedTime(new Date(before));page.setDefaultTimeout(5500);
  const mount=async(initialAction)=>page.evaluate(async initialAction=>{
   window.surface?.dispose();document.body.innerHTML='<main></main>';window.surface=(await import('/fasting.js')).mountFasting({page:document.querySelector('main'),initialAction});
  },initialAction);
  const open=section=>page.locator('[data-fast-section='+section+'] summary').click();
  const action=name=>page.locator('[data-discover='+name+']').click();
  const editor=page.locator('.fasting-editor'),quick=page.locator('.fasting-quick');
  const save=async()=>{await editor.locator('[type=submit]').click();await editor.waitFor({state:'detached'});};
  const confirm=async()=>{await quick.locator('[data-confirm-fast]').click();await quick.waitFor({state:'detached'});};
  const pending=()=>page.evaluate(async()=>(await(await import('/offline-store.js')).readWriteCopy()).pending);
  await mount();await open('history');await action('past-fast');await editor.locator('[name=label]').fill('Lunch');await save();
  const lunch=page.locator('[data-fast-history-row]').filter({hasText:'Lunch'});await lunch.locator('[data-discover=history-edit]').click();await editor.locator('[name=label]').fill('Updated lunch');await save();
  await mount('new');await quick.locator('input').check();assert.equal(await quick.locator('select').isDisabled(),true);await confirm();
  await page.clock.setFixedTime(new Date(noon));await mount('end');await confirm();await open('history');
  assert.equal(await page.locator('[data-fast-history-row]').count(),3);
  await page.route('**/api/fasting?**',route=>route.abort());
  await page.reload();await initialize();await mount();await open('history');await lunch.getByText('Updated lunch',{exact:true}).waitFor();
  await lunch.locator('[data-fh-list-delete]').click();await page.locator('[data-fast-delete=cancel]').click();await lunch.locator('[data-fh-list-select]').check();await page.locator('[data-fh-list-delete-selected]').click();await page.locator('[data-fast-delete=confirm]').click();await lunch.waitFor({state:'detached'});
  await open('scheduled');await page.locator('.dc-fast-footer [data-discover=schedule-fast]').click();await editor.locator('[name=label]').fill('Evening');await save();
  const schedule=page.locator('.dc-scheduled-item').filter({hasText:'Evening'});await schedule.locator('[data-discover=edit-schedule]').first().click();await editor.locator('[name=label]').fill('Evening edited');await editor.locator('[name=note]').fill('Evening note');await save();await schedule.locator('[data-discover=start-scheduled]').click();await confirm();
  await mount('end');await confirm();await open('scheduled');await schedule.locator('[data-discover=edit-schedule]').first().click();await editor.locator('[data-delete-fast]').click();await page.locator('[data-fast-delete=confirm]').click();await schedule.waitFor({state:'detached'});
  assert.equal((await pending()).length,10);assert.deepEqual(fixture.state().fasts,[original]);
  await page.evaluate(async()=>{const {initializeDeviceCache}=await import('/device-cache.js');await initializeDeviceCache('owner-b');});
  assert.equal(await page.evaluate(async()=>(await(await import('/offline-store.js')).readWriteCopy())?.pending.length??0),0);
  await mount();await page.locator('[data-fasting-status]').waitFor();assert.equal(await page.locator('[data-fast-history-row]').count(),0);
  await initialize();await mount();await open('history');
  assert.equal(await page.locator('[data-fast-history-row]').count(),3);
  await flush();assert.equal((await pending()).length,10);await page.reload();await initialize();await flush();
  assert.equal((await pending()).length,0);const attempts=sent.filter(row=>row.body.type==='fast.record');assert.deepEqual(attempts[0],attempts[1]);
  const canonical=fixture.state();assert.equal(canonical.fastingPlan.schedules.length,0);assert.equal(canonical.fasts.length,3);assert.deepEqual(canonical.fasts[0],original);
  assert.deepEqual(canonical.fasts.slice(1).map(row=>[row.start,row.end,row.goalHours]),[[before,noon,null],[noon.replace('.000',''),noon,16]]);
  assert.equal(canonical.fasts.at(-1).scheduled.label,'Evening edited');assert.equal(canonical.fasts.at(-1).note,'Evening note');
  assert.deepEqual(await page.evaluate(async()=>(await(await import('/offline-store.js')).readWriteCopy()).snapshot.state.fasts),canonical.fasts);
 },{losePath:'/api/workspace/command',loseType:'fast.record',commandTime:'2026-11-20T12:01:00Z'});
});

test('device-reviewed Multi-Add survives restart and applies dependent changes to canonical records after a lost reply',async()=>{
 const state=initialState(),date='2026-11-20',owner='owner-a';
 const foodId=act(state,'food.save',{name:'Rice',serving:'100 g',grams:100,nutrients:{calories:100}}).id;
 const rows=[1,2].map(amount=>({id:crypto.randomUUID(),selection:{kind:'foods',id:foodId},entry:{date,time:'',group:'Lunch',amount}}));
 const reviews=['diary','recipe'].map(kind=>{
  const destination=kind==='diary'?{kind}:{kind,name:'Two portions',servings:2},input={rows,destination};
  return {input,id:crypto.randomUUID()};
 });
 await realQueueFixture(state,async({page,fixture,flush,initialize,sent})=>{
  await page.evaluate(async reviews=>{
   const {queueCommand}=await import('/diary-api.js');
   const {multiReviewer}=await import('/food-picker.js'),review=multiReviewer('owner-a');
   let revision;
   for(const {input,id} of reviews){
    const result=await review(input);
    revision=result.revision;
    await queueCommand(revision,'food.multi.add',{...input,reviewToken:result.reviewToken,confirmed:true},{projection:result.projection,requestId:id});
   }
   await queueCommand(revision,'entry.delete',{id:reviews[0].id+'-0'});
  },reviews);
  await page.reload();await initialize();
  const local=await page.evaluate(async()=>(await import('/local-engine.js')).localWorkspaceState());
  assert.equal(local.entries.length,1);assert.equal(local.entries[0].amount,2);
  assert.equal(local.recipes[0].id,reviews[1].id);assert.equal(fixture.state().entries.length,0);
  await flush();assert.equal(fixture.state().entries.length,2);await flush();
  assert.deepEqual(sent[0].body,sent[1].body);assert.equal(fixture.state().recipes.length,1);
  assert.equal(fixture.state().entries.length,1);assert.equal(fixture.state().entries[0].amount,2);
  const copy=await page.evaluate(async()=>(await import('/offline-store.js')).readWriteCopy());
  assert.deepEqual(copy.pending,[]);assert.deepEqual(copy.snapshot.state.recipes,fixture.state().recipes);
  assert.deepEqual(copy.snapshot.state.entries,fixture.state().entries);
 },{losePath:'/api/workspace/command',loseType:'food.multi.add'});
});

test('device multi-add requires canonical source identities and holds its opening account',async()=>{
 const state=initialState(),foodId=act(state,'food.save',{name:'Rice',grams:100,nutrients:{calories:100}}).id;
 await realQueueFixture(state,async({page,flush,date,fixture})=>{
  const result=await page.evaluate(async({date,foodId})=>{
   const {multiReviewer}=await import('/food-picker.js'),review=multiReviewer('owner-a');
   const {saveLocalLibrary}=await import('/library-local.js'),{queueCommand}=await import('/diary-api.js');
   const cache=await import('/device-cache.js');
   const selection=(id,kind='foods')=>({destination:{kind:'diary'},rows:[{id:crypto.randomUUID(),selection:{kind,id},entry:{date,time:'',group:'Lunch',amount:1}}]});
   const rejection=async input=>{try{await review(input);return null;}catch(error){return error.message;}};
   const temporary=await saveLocalLibrary('food',{name:'New oats',grams:100,nutrients:{calories:120}});
   const newFood=await rejection(selection(temporary.item.id)),catalog=await rejection(selection(foodId,'catalog'));
   await saveLocalLibrary('food',{id:foodId,name:'Edited rice',nutrientEdits:[{kind:'manual',values:{calories:130}}]});
   const input=selection(foodId),result=await review(input);
   await queueCommand(result.revision,'food.multi.add',{...input,reviewToken:result.reviewToken,confirmed:true},{projection:result.projection});
   await cache.initializeDeviceCache('owner-b');
   const owner=await rejection(input);
   await cache.initializeDeviceCache('owner-a');
   const epoch=await rejection(input);
   return {newFood,catalog,owner,epoch,calories:result.totals.calories};
  },{date,foodId});
  assert.match(result.newFood,/once its new library item has been saved/i);assert.match(result.catalog,/connect to look up/i);
  assert.match(result.owner,/current account/i);assert.equal(result.epoch,result.owner);
  assert.equal(result.calories,130);
  await flush();
  assert.equal(fixture.state().entries.length,1);assert.equal(fixture.state().entries[0].foodId,foodId);
  assert.equal(fixture.state().foods.find(row=>row.id===foodId).nutrients.calories,130);
 });
});
