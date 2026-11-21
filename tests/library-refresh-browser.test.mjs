import {offlineSnapshot} from '../server/offline.mjs';
import {CHROME_EXECUTABLE} from './_chrome.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright-core';
import {createWebHandler} from '../server/http.mjs';
import {initialState,act} from '../server/domain/workspace.mjs';
import {libraryView,libraryItem} from '../server/library-view.mjs';
import {previewLibrary} from '../server/workspace-commands.mjs';
import {favoriteView} from '../server/library-extras.mjs';

// Production source UI, HTTP/CSP and canonical projections; only the item read is delayed.
test('library refresh and editor dismissal retain separate ownership of a pending item read',async t=>{
 const state=initialState(),id=act(state,'food.save',{name:'Refresh fixture',serving:'100 g',grams:100,nutrients:{calories:100,protein:0}}).id;
 let browser,handler,origin,held,previews=0,writes=0;const pending=()=>{let release,arrived;const gate=new Promise(resolve=>release=resolve),ready=new Promise(resolve=>arrived=resolve);return held={gate,release,ready,arrived};};
 const service={current:async()=>({id:'fixture'}),offlineSnapshot:async()=>offlineSnapshot(state,{ownerId:'fixture',generation:'generation'}),library:async()=>libraryView(state),favorites:async()=>favoriteView(state),libraryItem:async(_,kind,itemId)=>{const own=held;own.arrived();await own.gate;return libraryItem(state,kind,state[kind+'s'].find(row=>row.id===itemId));},previewLibrary:async(_,input)=>{previews++;return previewLibrary(state,input);},workspaceCommand:async()=>{writes++;throw Error('This read-only flow must not save');}};
 const html='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/mobile-theme.css"><link rel="stylesheet" href="/diary.css"><link rel="stylesheet" href="/shell-source/discover.css"><link rel="stylesheet" href="/app-shell.css"><link rel="stylesheet" href="/library.css"><body class="discover-mobile dark"><header class="topbar"></header><main id="page"></main><dialog id="sheet"><div id="sheet-content"></div></dialog><script type="module" src="/fixture.js"></script>';
 const bootstrap=`import {initializeDeviceCache} from '/device-cache.js';await initializeDeviceCache('fixture');import {mountLibrary} from '/library.js';const content=document.querySelector('#sheet-content'),sheet=document.querySelector('#sheet'),close=()=>{sheet.close();content.replaceChildren();};content.addEventListener('click',event=>{if(event.target.closest('[data-close]'))close();});sheet.addEventListener('cancel',event=>{event.preventDefault();close();});window.csp=[];document.addEventListener('securitypolicyviolation',event=>window.csp.push(event.violatedDirective));window.library=mountLibrary({page:document.querySelector('#page'),headerRoot:document.querySelector('.topbar'),content,show:html=>{content.innerHTML=html;if(!sheet.open)sheet.showModal();},header:title=>'<header class="sheet-header"><button data-close aria-label="Close">×</button><h2>'+title+'</h2></header>',close,date:()=>'2026-11-16',openEntry:()=>{},onChange:async()=>{}});`;
 const publicRoot=resolve('public'),assets=new Map([['/',{body:html,type:'text/html'}],['/fixture.js',{body:bootstrap,type:'text/javascript'}]]);
 const server=createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);const headers=new Headers(req.headers);headers.set('Cookie','__Host-nourishing_session=fixture');const response=await handler(new Request(origin+req.url,{method:req.method,headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 handler=createWebHandler({config:{origin},service,assets:{get(path){if(assets.has(path))return assets.get(path);const file=resolve(publicRoot,'.'+path),mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'}[extname(file)];if((!file.startsWith(publicRoot+'\\')&&!file.startsWith(publicRoot+'/'))||!mime||!existsSync(file))return;return {body:readFileSync(file),type:mime};}}});
 try{
  browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});const page=await browser.newPage({viewport:{width:412,height:915}}),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);
  await page.goto(origin);await page.locator('[data-tab=foods]').click();await page.locator(`[data-library-item="${id}"]`).waitFor();
  await t.test('background reload does not cancel the pending editor or its canonical preview',async()=>{
   const read=pending();await page.locator(`[data-library-item="${id}"]`).click();await read.ready;await page.getByText('Loading…',{exact:true}).waitFor();await page.evaluate(()=>window.library.reload());assert.equal(await page.getByText('Loading…',{exact:true}).count(),1);read.release();
   await page.getByRole('heading',{name:'Edit Food',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('[data-mfe-submit]')?.disabled===false);assert.equal(await page.getByLabel('Name',{exact:true}).inputValue(),'Refresh fixture');assert.equal(previews,0);assert.equal(writes,0);await page.locator('[data-mfe-close]').click();assert.equal(await page.locator('#sheet').evaluate(node=>node.open),false);
  });
  await t.test('dismissing a pending editor prevents a late item response from reopening or previewing it',async()=>{
   await page.evaluate(async()=>{await(await import('/offline-store.js')).clearOfflineAccount();});await page.reload();await page.locator('[data-tab=foods]').click();const read=pending(),before=previews;await page.locator(`[data-library-item="${id}"]`).click();await read.ready;await page.getByText('Loading…',{exact:true}).waitFor();await page.getByRole('button',{name:'Close',exact:true}).click();assert.equal(await page.locator('#sheet-content').textContent(),'');
   const arrived=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/library/item');read.release();await (await arrived).finished();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   assert.equal(await page.locator('#sheet').evaluate(node=>node.open),false);assert.equal(await page.locator('#sheet-content').textContent(),'');assert.equal(await page.locator('.mobile-food-editor').count(),0);assert.equal(previews,before);assert.equal(writes,0);
  });
  assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.csp),[]);await page.evaluate(()=>window.library.dispose());
 }finally{held?.release();await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
