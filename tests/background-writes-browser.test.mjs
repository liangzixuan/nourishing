import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright-core';
import {CHROME_EXECUTABLE} from './_chrome.mjs';
import {initialState,act} from '../server/domain/workspace.mjs';
import {digest} from '../server/data-codec.mjs';
import {offlineSnapshot} from '../server/offline.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';

async function realQueueFixture(state,run,{losePath}={}){
 const owner='owner-a',date='2026-11-20',fixture=diaryStoreFixture(state,owner),store=createWorkspaceStore(fixture.db,owner),sent=[];let lose=Boolean(losePath);
 const server=createServer(async(req,res)=>{try{
  if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end('<main></main>');}
  if(req.url.startsWith('/api/')){
   res.setHeader('Content-Type','application/json');
   if(req.url==='/api/account')return res.end(JSON.stringify({id:owner}));
   if(req.url==='/api/offline')return res.end(JSON.stringify(await store.offlineSnapshot()));
   if(req.url.startsWith('/api/diary'))return res.end(JSON.stringify({revision:digest(fixture.state())}));
   let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);sent.push({path:req.url,body});
   const result=req.url==='/api/offline/commands'?await store.offlineCommand(body):await store.command(body,async()=>null,{owner,asOf:date+'T12:00:00Z',timeZone:'UTC'});
   if(lose&&req.url===losePath){lose=false;throw {code:503,message:'Lost acknowledgement'};}
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

test('calendar markers reflect local visibility changes before and after sync instead of stale responses',async()=>{
 const state=initialState();act(state,'food.save',{name:'Rice',serving:'100 g',grams:100,nutrients:{calories:100}});
 act(state,'entry.add',{foodId:state.foods[0].id,date:'2026-11-20',group:'Lunch',amount:1});
 await realQueueFixture(state,async({page,flush})=>{
  const change=visible=>page.evaluate(async visible=>{
   const {readWriteCopy}=await import('/offline-store.js');
   const {queueCommand}=await import('/diary-api.js');
   const copy=await readWriteCopy();await queueCommand(copy.snapshot.revision,'display.save',{diaryCalendar:{version:1,food:visible,exercise:true,biometric:true,note:true,fast:true}});
  },visible);
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

test('restore generations stay blocked across Retry and a malformed snapshot never authorizes replay',{timeout:30000},async()=>{
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
  const writes=await import('/background-writes.js');writes.onBackgroundWriteStatus(status=>{if(status.retry)window.retryPending=status.retry;});
  return (await(await import('/diary-api.js')).queueCommand('a'.repeat(64),'water.add',{date:'2026-11-20',amount:250})).requestId;
 },snapshot());
 const flush=()=>page.evaluate(async()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});return(await import('/background-writes.js')).flushBackgroundWrites();});
 const pending=()=>page.evaluate(async()=>(await(await import('/offline-store.js')).readWriteCopy()).pending);
 try{
  await page.goto('http://127.0.0.1:'+server.address().port);const id=await queue();generation='restored';await flush();
  let rows=await pending();assert.equal(rows.length,1);assert.equal(rows[0].command.operationId,id);assert.equal(rows[0].command.generation,'original');assert.equal(rows[0].status,'conflict');assert.equal(sent.length,0);
  await page.evaluate(()=>window.retryPending());rows=await pending();assert.equal(rows[0].status,'conflict');assert.equal(rows[0].messageKey,'accountCloud.offlineError.restored');assert.equal(sent.length,0);
  await page.reload();await page.evaluate(async()=>await(await import('/device-cache.js')).initializeDeviceCache('owner-a'));await flush();assert.equal((await pending())[0].command.operationId,id);assert.equal(sent.length,0);
  // A fresh command cannot bypass the version check with an unrecognized response.
  await page.evaluate(async()=>await(await import('/offline-store.js')).clearOfflineAccount({discardPending:true}));await queue();malformed=true;
  await assert.rejects(flush(),/could not be verified/);assert.equal((await pending()).length,1);assert.equal(sent.length,0);
  malformed=false;restoreOnWrite=true;await flush();assert.equal(sent.length,1);rows=await pending();assert.equal(rows[0].status,'conflict');assert.equal(rows[0].command.generation,'restored');
  await page.evaluate(()=>window.retryPending());assert.equal(sent.length,1);assert.equal((await pending())[0].status,'conflict');
 }finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
