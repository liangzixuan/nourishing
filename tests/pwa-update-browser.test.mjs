import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {chromium} from 'playwright-core';

const legacyWorker=`importScripts('/offline-assets.js');const {cache:CACHE,files:FILES}=self.NOURISHING_OFFLINE;self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/offline.html']))));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{const p=new URL(e.request.url).pathname;if(e.request.mode==='navigate'){e.respondWith(fetch(e.request));return;}if(FILES.includes(p))e.respondWith((async()=>{const c=await caches.open(CACHE),r=await c.match(p);if(r)return r;const n=await fetch(e.request);await c.put(p,n.clone());return n;})());});`;
test('installed old cache offers an update, reloads once on acceptance and retains private data and other tabs',async()=>{
 let version=0;const served=[];
 const server=createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname;res.setHeader('Cache-Control','no-store');
  if(path==='/'){res.setHeader('Content-Type','text/html');res.setHeader('Content-Security-Policy',"default-src 'self';script-src 'self';style-src 'self'");return res.end(`<html><head>${version>=2?'<script type="module" src="/pwa-update.js"></script><link rel="stylesheet" href="/pwa-update.css">':''}</head><body><input aria-label="Draft"><output id="version"></output><script src="/setup.js"></script><script src="/ui.js"></script></body></html>`);}
  res.setHeader('Content-Type',path.endsWith('.css')?'text/css':path.endsWith('.html')?'text/html':'text/javascript');
  if(path==='/setup.js')return res.end("navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});");
  if(path==='/ui.js'){served.push(version);return res.end(`document.querySelector('#version').textContent='${version}';`);}
  if(path==='/sw.js')return res.end(version>=2?readFileSync('public/sw.js'):legacyWorker);
  if(path==='/offline-assets.js')return res.end('self.NOURISHING_OFFLINE='+JSON.stringify({cache:'nourishing-public-offline-update-test-'+version,files:['/ui.js','/offline.html'],precache:['/offline.html']})+';');
  if(path==='/offline.html')return res.end('Offline');
  if(['/pwa-update.js','/pwa-update.css'].includes(path)&&existsSync('public'+path))return res.end(readFileSync('public'+path));
  res.writeHead(404).end();
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;let browser;
 try{browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(6000);await page.goto(origin);await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();assert.equal(await page.locator('#version').textContent(),'0');
  await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('synthetic-private',1);r.onupgradeneeded=()=>r.result.createObjectStore('records');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('records','readwrite');tx.objectStore('records').put({water:250},'saved');tx.oncomplete=()=>{db.close();resolve();};};}));
  const other=await context.newPage();await other.goto(origin);await other.getByLabel('Draft').fill('Keep this draft');version=1;await page.evaluate(async()=>await(await navigator.serviceWorker.getRegistration()).update());await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);version=2;await page.reload();await page.evaluate(async()=>await(await navigator.serviceWorker.getRegistration()).update());await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);assert.equal(await page.locator('#version').textContent(),'0');
  const reload=page.getByRole('button',{name:'Reload',exact:true});await reload.waitFor();assert.equal(await page.getByText('Update ready',{exact:true}).count(),1);assert.equal(await other.getByLabel('Draft').inputValue(),'Keep this draft');const updatedTab=await context.newPage();await updatedTab.goto(origin);await updatedTab.getByLabel('Draft').fill('Keep updated tab draft');let navigations=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});await reload.click();await page.waitForFunction(()=>document.querySelector('#version')?.textContent==='2');assert.equal(navigations,1);assert.equal(await updatedTab.getByLabel('Draft').inputValue(),'Keep updated tab draft');assert.equal(await updatedTab.locator('#version').textContent(),'0');await updatedTab.getByRole('button',{name:'Reload',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Reload',exact:true}).count(),0);assert.equal(await other.getByLabel('Draft').inputValue(),'Keep this draft');
  const saved=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('synthetic-private');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('records').objectStore('records').get('saved');q.onsuccess=()=>{db.close();resolve(q.result);};};}));assert.deepEqual(saved,{water:250});assert.ok(served.includes(2));
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
