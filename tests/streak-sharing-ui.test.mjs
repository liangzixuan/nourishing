import {CHROME_EXECUTABLE} from './_chrome.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright-core';
import sharp from 'sharp';
import {createWebHandler} from '../server/http.mjs';
import {initialState} from '../server/domain/workspace.mjs';
import {dashboardView} from '../server/dashboard-view.mjs';

test('streak image source and bundled fonts retain recorded provenance',()=>{
 const manifest=JSON.parse(readFileSync('docs/streak-share-source.json'));
 for(const row of manifest.files)assert.equal(createHash('sha256').update(readFileSync(row.target)).digest('hex'),row.sha256,row.target);
 assert.ok(!readFileSync('public/streak-source/discover-share.js','utf8').includes('NourishingNative'));
});

test('Dashboard streak image downloads and shares under production CSP, with cancellation and close cleanup',async()=>{
 const stats={current:2,longest:7,savedCounts:{food:12,exercise:3,metric:4,fast:1}},state=initialState();
 const data=dashboardView(state,{date:'2026-11-15'},{now:new Date('2026-11-15T12:00:00.000Z'),timeZone:'America/Chicago'});
 data.capture.cards.streaks=stats;
 let origin,handler,browser;
 const html='<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/diary.css"><link rel="stylesheet" href="/dashboard.css"><link rel="stylesheet" href="/streak-sharing.css"><main id="page"></main><dialog id="sheet"><div id="sheet-content"></div></dialog><script type="module" src="/fixture.js"></script>';
 const script="import {mountDashboard} from '/dashboard.js';const content=document.querySelector('#sheet-content'),sheet=document.querySelector('#sheet');mountDashboard({root:document.querySelector('#page'),content,show:html=>{content.innerHTML=html;if(!sheet.open)sheet.showModal();},header:title=>'<h1>'+title+'</h1>',close:()=>{sheet.close();content.replaceChildren();},date:()=> '2026-11-15'});";
 const assets=new Map([['/',{body:html,type:'text/html'}],['/fixture.js',{body:script,type:'text/javascript'}]]),publicRoot=resolve('public');
 const fileAssets={get(path){if(assets.has(path))return assets.get(path);const file=resolve(publicRoot,'.'+path),mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.woff2':'font/woff2'}[extname(file)];if(!file.startsWith(publicRoot+'/')&&!file.startsWith(publicRoot+'\\')||!mime||!existsSync(file))return;return {body:readFileSync(file),type:mime};}};
 const server=createServer(async(req,res)=>{try{const headers=new Headers(req.headers);headers.set('cookie','__Host-nourishing_session=fixture');const result=await handler(new Request(origin+req.url,{headers}));res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));}catch(error){res.writeHead(500).end(error.message);}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;handler=createWebHandler({config:{origin},service:{dashboard:async()=>data},assets:fileAssets});
 try{
  browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});
  const page=await browser.newPage({viewport:{width:412,height:915},isMobile:true,hasTouch:true});page.setDefaultTimeout(7000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{const revoke=URL.revokeObjectURL.bind(URL);window.revoked=[];URL.revokeObjectURL=url=>{window.revoked.push(url);revoke(url);};Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false});});
  await page.goto(origin);await page.getByRole('button',{name:'Share streak',exact:true}).click();
  const image=page.locator('.dc-streak-image');await image.waitFor();assert.match(await image.getAttribute('alt'),/7/);
  const pending=page.waitForEvent('download');await page.locator('.dc-share-actions button').click();const download=await pending;assert.equal(download.suggestedFilename(),'nourishing-streak.png');
  const metadata=await sharp(await download.path()).metadata();assert.equal(metadata.width,900);assert.equal(metadata.height,890);
  mkdirSync('.local',{recursive:true});await download.saveAs('.local/streak-share-preview.png');await page.screenshot({path:'.local/streak-share-mobile.png'});
  assert.ok(await page.evaluate(()=>document.fonts.check('44px "Material Symbols Rounded"')));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const previewUrl=await image.getAttribute('src');await page.locator('#sheet').evaluate(dialog=>dialog.close());await page.waitForFunction(url=>window.revoked.includes(url),previewUrl);
  await page.evaluate(()=>{window.shareCalls=[];window.shareMode='cancel';Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async input=>{window.shareCalls.push({name:input.files[0].name,type:input.files[0].type,active:navigator.userActivation.isActive});if(window.shareMode==='cancel')throw new DOMException('Cancelled','AbortError');if(window.shareMode==='unavailable')throw new DOMException('Unavailable','NotAllowedError');}});});
  await page.getByRole('button',{name:'Share streak',exact:true}).click();await image.waitFor();const share=page.locator('.dc-share-actions button');await share.click();await page.waitForFunction(()=>window.shareCalls.length===1);assert.deepEqual(await page.evaluate(()=>window.shareCalls[0]),{name:'nourishing-streak.png',type:'image/png',active:true});assert.equal(await page.locator('.dc-share [role=status]').textContent(),'');assert.equal(await share.isDisabled(),false);
  await page.evaluate(()=>{window.shareMode='unavailable';});const shareLabel=await share.textContent();await share.click();await page.waitForFunction(label=>document.querySelector('.dc-share-actions button').textContent!==label,shareLabel);
  const fallback=page.waitForEvent('download');await share.click();assert.equal((await fallback).suggestedFilename(),'nourishing-streak.png');assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
