import {CHROME_EXECUTABLE} from './_chrome.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright-core';
test('sign-out preserves pending edits on cancel and explicitly discards all account copies across tabs',async()=>{
 const root=resolve('public'),server=createServer((req,res)=>{try{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/'){res.setHeader('Content-Type','text/html');return res.end('<main id="app"></main>');}
  const file=resolve(root,'.'+path);if(!file.startsWith(root+'/')&&!file.startsWith(root+'\\'))throw Error('Outside fixture');
  res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':'text/plain');res.end(readFileSync(file));
 }catch{res.statusCode=404;res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});const context=await browser.newContext(),page=await context.newPage(),other=await context.newPage(),origin='http://127.0.0.1:'+server.address().port;await page.goto(origin);await other.goto(origin);
  await other.evaluate(async()=>{const m=await import('/offline-store.js');window.cleared=false;m.onOfflineChange(async()=>{if(!await m.offlineCopy())window.cleared=true;});});
  await page.evaluate(async()=>{const m=await import('/offline-store.js');for(const ownerId of ['earlier','current']){const ticket=await m.activateOfflineAccount(ownerId);const copy=await m.saveOfflineSnapshot({version:1,identity:{ownerId,generation:'gen'},state:{}},ticket);await m.queueOffline(copy,'note.add',{text:'Pending'},{});}const {leaveOfflineAccount}=await import('/offline-session.js');window.leave=()=>{window.result=undefined;leaveOfflineAccount(document.querySelector('#app')).then(value=>window.result=value);};window.leave();});
  await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.waitForFunction(()=>window.result===false);
  assert.equal(await page.evaluate(async()=>(await(await import('/offline-store.js')).offlineCopy()).pending.length),1);
  await page.evaluate(()=>window.leave());await page.getByRole('button',{name:'Discard changes'}).click();await page.waitForFunction(()=>window.result===true);await other.waitForFunction(()=>window.cleared);
  assert.equal(await page.evaluate(async()=>{const m=await import('/offline-store.js');await m.activateOfflineAccount('earlier');return await m.offlineCopy();}),null);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
