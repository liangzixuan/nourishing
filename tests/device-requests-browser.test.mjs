import {CHROME_EXECUTABLE} from './_chrome.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright-core';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
async function fixture(){
 const root=resolve('public'),routes=new Map(),requests=[],gates=[];
 const route=(path,value,status=200)=>{const row={value,status};routes.set(path,row);return row;};
 const hold=(path,value,status=200)=>{let release,entered;const row={value,status,wait:new Promise(r=>release=r)},seen=new Promise(r=>entered=r);row.entered=entered;routes.set(path,row);gates.push(release);return {release,entered:seen};};
 route('/api/account',{id:'alice'});
 const server=createServer(async(req,res)=>{try{const path=req.url;if(path.startsWith('/api/')){requests.push({path,method:req.method});const row=routes.get(path)??{status:404,value:{error:'Missing fixture'}};row.entered?.();await row.wait;res.writeHead(row.status,{'Content-Type':Buffer.isBuffer(row.value)?'image/png':'application/json'});res.end(Buffer.isBuffer(row.value)?row.value:JSON.stringify(row.value));return;}if(path==='/'||path==='/login'){res.writeHead(200,{'Content-Type':'text/html','Content-Security-Policy':"default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' blob:; style-src 'self'"});res.end('<!doctype html><title>Request fixture</title><main id="page"></main><div id="sheet-content"></div>');return;}const file=resolve(root,'.'+new URL(path,'http://localhost').pathname);if((!file.startsWith(root+'/')&&!file.startsWith(root+'\\'))||!['.js','.mjs'].includes(extname(file))||!existsSync(file)){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'text/javascript'});res.end(readFileSync(file));}catch{res.writeHead(500).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true}),page=await browser.newPage(),origin='http://127.0.0.1:'+server.address().port;page.setDefaultTimeout(8000);await page.goto(origin);
 const imports=()=>page.evaluate(async()=>{window.api=await import('/diary-api.js');window.cache=await import('/device-cache.js');window.session=await import('/offline-session.js');});
 const authenticate=async()=>{await imports();await page.evaluate(async()=>session.rememberOfflineAccount(await api.request('/api/account')));};
 return {page,origin,route,hold,requests,imports,authenticate,close:async()=>{gates.forEach(r=>r());await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
const reached=async gate=>{let timer;try{await Promise.race([gate.entered,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Expected network request did not reach its gate')),8000);})]);}finally{clearTimeout(timer);}};

test('real request cache needs authentication, returns persisted screens immediately and refreshes stale screens once',async()=>{
 const f=await fixture();try{const {page}=f;f.route('/api/diary',{version:1});await f.authenticate();assert.deepEqual(await page.evaluate(()=>api.request('/api/diary')),{version:1});
  const unused=f.hold('/api/diary',{version:2});assert.deepEqual(await page.evaluate(()=>api.request('/api/diary')),{version:1});assert.equal(f.requests.filter(r=>r.path==='/api/diary').length,1);
  await page.reload();await f.imports();await page.evaluate(()=>{window.boot=api.request('/api/diary').then(value=>window.bootResult=value);});await reached(unused);assert.equal(await page.evaluate(()=>window.bootResult),undefined);unused.release();await page.waitForFunction(()=>window.bootResult?.version===2);
  await f.authenticate();assert.deepEqual(await page.evaluate(()=>api.request('/api/diary')),{version:1});
  await page.evaluate(()=>{window.realNow=Date.now;Date.now=()=>realNow()+31000;window.refreshed=[];});const refresh=f.hold('/api/diary',{version:3});
  assert.deepEqual(await page.evaluate(()=>Promise.all([api.request('/api/diary',null,null,{onRefresh:value=>refreshed.push(value)}),api.request('/api/diary',null,null,{onRefresh:value=>refreshed.push(value)})])),[{version:1},{version:1}]);await reached(refresh);assert.deepEqual(await page.evaluate(()=>refreshed),[]);assert.equal(f.requests.filter(r=>r.path==='/api/diary').length,3);refresh.release();await page.waitForFunction(()=>window.refreshed.length===2);assert.deepEqual(await page.evaluate(()=>refreshed),[{version:3},{version:3}]);
  const abort=f.hold('/api/dashboard',{version:4});await page.evaluate(()=>{window.cancel=new AbortController();window.cancelled=api.request('/api/dashboard',null,cancel.signal).then(()=> 'resolved',error=>error.name);cancel.abort();});assert.equal(await page.evaluate(()=>cancelled),'AbortError');abort.release();
  await page.evaluate(()=>{Date.now=realNow;});
 }finally{await f.close();}
});

test('concurrent reads deduplicate, caller abort suppresses refresh, and a lost mutation reply rejects old reads',async()=>{
 const f=await fixture();try{const {page}=f;await f.authenticate();const concurrent=f.hold('/api/charts',{version:1});await page.evaluate(()=>{window.reads=Promise.all([api.request('/api/charts'),api.request('/api/charts')]);});await reached(concurrent);assert.equal(f.requests.filter(r=>r.path==='/api/charts').length,1);concurrent.release();assert.deepEqual(await page.evaluate(()=>reads),[{version:1},{version:1}]);
  await page.evaluate(()=>{window.realNow=Date.now;Date.now=()=>realNow()+31000;window.refreshes=[];window.cancel=new AbortController();});const cancelled=f.hold('/api/charts',{version:2});assert.deepEqual(await page.evaluate(()=>api.request('/api/charts',null,cancel.signal,{onRefresh:value=>refreshes.push(value)})),{version:1});await reached(cancelled);await page.evaluate(()=>cancel.abort());cancelled.release();await page.waitForFunction(async()=> (await cache.readDeviceCache('/api/charts')).value?.version===2);assert.deepEqual(await page.evaluate(()=>refreshes),[]);
  const stale=f.hold('/api/library',{version:1});await page.evaluate(()=>{window.old=api.request('/api/library').then(value=>({value}),error=>({error:error.name}));});await reached(stale);f.route('/api/workspace/command',{error:'Lost successful reply'},503);assert.equal(await page.evaluate(async()=>{try{await api.request('/api/workspace/command',{requestId:'one'});}catch(error){return error.status;}}),503);stale.release();assert.deepEqual(await page.evaluate(()=>old),{error:'AbortError'});assert.equal(await page.evaluate(async()=>(await cache.readDeviceCache('/api/library')).value),undefined);assert.equal(await page.evaluate(async()=>(await cache.readDeviceCache('/api/charts')).value),undefined);
 }finally{await f.close();}
});

test('unauthorized refresh clears private screens and cached responses before opening sign-in',async()=>{
 const f=await fixture();try{const {page}=f;await f.authenticate();f.route('/api/diary',{private:'Alice'});await page.evaluate(async()=>{await api.request('/api/diary');document.querySelector('#page').textContent='Alice private';document.querySelector('#sheet-content').textContent='Private sheet';window.beforeLogin=[];window.addEventListener('pagehide',()=>sessionStorage.setItem('private-before-login',JSON.stringify({page:document.querySelector('#page').textContent,sheet:document.querySelector('#sheet-content').textContent})));});f.route('/api/diary',{error:'Sign in'},401);await page.evaluate(()=>{void api.request('/api/diary',null,null,{fresh:true}).catch(()=>{});});await page.waitForURL('**/login');assert.deepEqual(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('private-before-login'))),{page:'',sheet:''});await f.imports();await page.evaluate(()=>cache.initializeDeviceCache('alice'));assert.equal(await page.evaluate(async()=>(await cache.readDeviceCache('/api/diary')).value),undefined);
 }finally{await f.close();}
});

test('private image thumbnails use persisted Blob data on remount and release object URLs',async()=>{
 const f=await fixture();try{const {page}=f;await f.authenticate();f.route('/api/media?namespace=notes&id=photo',png);await page.evaluate(async()=>{window.revoked=[];const revoke=URL.revokeObjectURL.bind(URL);URL.revokeObjectURL=url=>{revoked.push(url);revoke(url);};await import('/private-images.js');const img=document.createElement('img');img.dataset.privateSrc='/api/media?namespace=notes&id=photo';document.querySelector('#page').append(img);});await page.waitForFunction(()=>document.querySelector('img')?.naturalWidth===1);const first=await page.locator('img').getAttribute('src');assert.match(first,/^blob:/);await page.evaluate(()=>document.querySelector('img').remove());await page.waitForFunction(()=>window.revoked.length===1);await page.evaluate(()=>{const img=document.createElement('img');img.dataset.privateSrc='/api/media?namespace=notes&id=photo';document.querySelector('#page').append(img);});await page.waitForFunction(()=>document.querySelector('img')?.naturalWidth===1);assert.equal(f.requests.filter(r=>r.path.startsWith('/api/media')).length,1);assert.notEqual(await page.locator('img').getAttribute('src'),first);
 }finally{await f.close();}
});


test('a late unauthorized response from the previous account cannot lock or clear the newly verified account',async()=>{
 const f=await fixture();try{const {page}=f;await f.authenticate();const old=f.hold('/api/diary',{error:'Old session expired'},401);await page.evaluate(()=>{window.previous=api.request('/api/diary').then(()=> 'resolved',error=>error.name);});await reached(old);
 f.route('/api/account',{id:'bob'});await f.authenticate();f.route('/api/dashboard',{private:'Bob'});await page.evaluate(async()=>{await api.request('/api/dashboard');document.querySelector('#page').textContent='Bob private';});old.release();assert.equal(await page.evaluate(()=>previous),'AbortError');assert.equal(new URL(page.url()).pathname,'/');assert.equal(await page.locator('#page').textContent(),'Bob private');assert.deepEqual(await page.evaluate(async()=>(await cache.readDeviceCache('/api/dashboard')).value),{private:'Bob'});
 }finally{await f.close();}
});
