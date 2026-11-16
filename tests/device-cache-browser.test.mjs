import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright-core';

async function fixture(){
 const base=resolve('public'),server=createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname;if(path==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Device cache test</title>');return;}const file=resolve(base,'.'+path);if(!file.startsWith(base+'/')&&!file.startsWith(base+'\\')||!['.js','.mjs'].includes(extname(file))||!existsSync(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type','text/javascript');res.end(readFileSync(file));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),context=await browser.newContext(),origin='http://127.0.0.1:'+server.address().port;
 const page=async()=>{const p=await context.newPage();await p.goto(origin);return p;};
 return {page,close:async()=>{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}};
}

test('device responses persist after fresh authentication, upgrade without losing queued edits, and isolate account epochs across tabs',async()=>{
 const f=await fixture();try{
  const a=await f.page();await a.evaluate(async()=>{await new Promise((resolve,reject)=>{const r=indexedDB.open('nourishing-private-offline',1);r.onupgradeneeded=()=>{r.result.createObjectStore('accounts',{keyPath:'ownerId'});r.result.createObjectStore('meta');};r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction(['accounts','meta'],'readwrite');tx.objectStore('meta').put({ownerId:'alice',epoch:'legacy'},'active');tx.objectStore('accounts').put({ownerId:'alice',snapshot:{version:1,identity:{ownerId:'alice',generation:'old'}},pending:[{command:{operationId:'pending'},status:'pending'}],revision:1,locked:false});tx.oncomplete=()=>{db.close();resolve();};};});});
  assert.deepEqual(await a.evaluate(async()=>{window.cache=await import('/device-cache.js');window.store=await import('/offline-store.js');const before=await cache.readDeviceCache('/api/diary?date=2026-11-16');window.ticket=await cache.initializeDeviceCache('alice');const data={notes:['private Alice']},saving=cache.writeDeviceCache('/api/diary?date=2026-11-16',data,ticket);data.notes.push('changed while saving');await saving;const read=await cache.readDeviceCache('/api/diary?date=2026-11-16');read.value.notes.push('local mutation');return {before:before.ticket,pending:(await store.offlineCopy()).pending.length,value:(await cache.readDeviceCache('/api/diary?date=2026-11-16')).value,savedAt:Number.isFinite(read.savedAt)};}),{before:null,pending:1,value:{notes:['private Alice']},savedAt:true});
  await a.reload();assert.deepEqual(await a.evaluate(async()=>{window.cache=await import('/device-cache.js');window.store=await import('/offline-store.js');const before=await cache.readDeviceCache('/api/diary?date=2026-11-16');window.ticket=await cache.initializeDeviceCache('alice');return {before:before.ticket,value:(await cache.readDeviceCache('/api/diary?date=2026-11-16')).value};}),{before:null,value:{notes:['private Alice']}});
  const b=await f.page();await b.evaluate(async()=>{window.cache=await import('/device-cache.js');window.store=await import('/offline-store.js');window.ticket=await cache.initializeDeviceCache('bob');await cache.writeDeviceCache('/api/diary',{notes:['private Bob']},ticket);});
  assert.deepEqual(await a.evaluate(async()=>({read:(await cache.readDeviceCache('/api/diary')).ticket,wrote:await cache.writeDeviceCache('/api/diary',{notes:['late Alice']},ticket),invalidated:await cache.invalidateDeviceCache(ticket),current:await cache.hasCurrentDeviceCache(ticket)})),{read:null,wrote:false,invalidated:null,current:false});
  assert.deepEqual(await b.evaluate(async()=>(await cache.readDeviceCache('/api/diary')).value),{notes:['private Bob']});
  assert.deepEqual(await b.evaluate(async()=>{await store.lockOfflineAccount();const locked=await cache.readDeviceCache('/api/diary'),wrote=await cache.writeDeviceCache('/api/diary',{notes:['late Bob']},ticket);await cache.initializeDeviceCache('bob');return {locked:locked.ticket,wrote,value:(await cache.readDeviceCache('/api/diary')).value??null,copy:await store.offlineCopy()};}),{locked:null,wrote:false,value:null,copy:null});
  assert.equal(await a.evaluate(async()=>{await cache.initializeDeviceCache('alice');return (await store.offlineCopy()).pending.length;}),1);
  await a.evaluate(async()=>{await store.clearOfflineAccount({discardPending:true});});assert.equal(await b.evaluate(async()=>(await cache.readDeviceCache('/api/diary')).ticket),null);
 }finally{await f.close();}
});

test('response invalidation rejects stale requests while metadata-only LRU bounds JSON and photo storage',async()=>{
 const f=await fixture();try{const page=await f.page();const result=await page.evaluate(async()=>{
  const cache=await import('/device-cache.js'),store=await import('/offline-store.js');const ticket=await cache.initializeDeviceCache('alice');await store.saveOfflineSnapshot({version:1,identity:{ownerId:'alice',generation:'one'}},ticket);let copy=await store.offlineCopy();await store.queueOffline(copy,'note.add',{text:'pending'},{});
  await cache.writeDeviceCache('/api/diary',{value:1},ticket);const next=await cache.invalidateDeviceCache(ticket),stale=await cache.writeDeviceCache('/api/diary',{value:2},ticket),current=await cache.hasCurrentDeviceCache(ticket),latest=await cache.hasCurrentDeviceCache(next);
  const blocked=[];for(const path of ['/api/account','/api/auth/login','/api/backup/export','/api/offline','https://other.example/api/diary'])blocked.push(await cache.writeDeviceCache(path,{secret:'never'},next));
  const bytes=new Uint8Array(8*1024*1024),photo=new Blob([bytes],{type:'image/jpeg'});await cache.writeDeviceCache('/api/media?id=a',photo,next);await cache.writeDeviceCache('/api/media?id=b',photo,next);const photoA=await cache.readDeviceCache('/api/media?id=a');await cache.writeDeviceCache('/api/media?id=c',photo,next);const evicted=(await cache.readDeviceCache('/api/media?id=b')).value===undefined,preserved=(await cache.readDeviceCache('/api/media?id=a')).value?.size===photo.size;
  const oversize=await cache.writeDeviceCache('/api/media?id=big',new Blob([bytes,new Uint8Array(1)]),next),jsonSize=await cache.writeDeviceCache('/api/diary',{text:'a'.repeat(2*1024*1024)},next);
  const fresh=await cache.invalidateDeviceCache(next);for(let i=0;i<128;i++)await cache.writeDeviceCache('/api/library?id='+i,{i},fresh);await cache.readDeviceCache('/api/library?id=0');await cache.writeDeviceCache('/api/library?id=128',{i:128},fresh);
  return {stale,current,latest,blocked,photoType:photoA.value.type,evicted,preserved,oversize,jsonSize,oldest:(await cache.readDeviceCache('/api/library?id=1')).value??null,recent:(await cache.readDeviceCache('/api/library?id=0')).value,pending:(await store.offlineCopy()).pending.length};
 });assert.deepEqual(result,{stale:false,current:false,latest:true,blocked:[false,false,false,false,false],photoType:'image/jpeg',evicted:true,preserved:true,oversize:false,jsonSize:false,oldest:null,recent:{i:0},pending:1});}finally{await f.close();}
});
