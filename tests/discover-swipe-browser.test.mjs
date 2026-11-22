import {CHROME_EXECUTABLE} from './_chrome.mjs';
import {barcodeAssets} from '../scripts/package-barcode-assets.mjs';
const packagedAssets=new Map((await barcodeAssets()).map(asset=>['/'+asset.path,asset]));
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {initialState} from '../server/domain/workspace.mjs';
import {reportView} from '../server/nutrition-views.mjs';
import {chartSurfaceView} from '../server/dashboard-pinned-charts.mjs';
import {dashboardView} from '../server/dashboard-view.mjs';

const date='2026-11-15',clock={now:new Date(date+'T18:00:00Z'),timeZone:'UTC'};
test('Discover touch swipes navigate bounded tabs while preserving scrolling, controls, dialogs and cleanup',async()=>{
 const state=initialState();
 state.foods=[{id:'oats',name:'Fixture oats',serving:'100 g',grams:100,nutrients:{calories:389,protein:16.9,carbs:66.3,fat:6.9}}];
 state.entries=[{id:'entry',foodId:'oats',date,time:'12:00',amount:1,group:'Lunch',kind:'food'}];
 const server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://fixture'),path=url.pathname;
   res.setHeader('Content-Type','application/json');
  if(packagedAssets.has(path)){const asset=packagedAssets.get(path);res.setHeader('Content-Type',asset.type);return res.end(asset.body);}
   if(path==='/swipe-fixture.css'){res.setHeader('Content-Type','text/css');return res.end('#horizontal-gesture-fixture{width:100px;overflow-x:auto}#horizontal-gesture-fixture>div{width:600px}#gesture-pad{height:1400px}');}
   if(path==='/api/nutrition-report'){const options=Object.fromEntries(url.searchParams);options.includeToday=options.includeToday==='true';options.includeSupplements=options.includeSupplements==='true';return res.end(JSON.stringify(reportView(state,options,clock)));}
   if(path==='/api/dashboard')return res.end(JSON.stringify({...dashboardView(state,{date},clock),news:{version:1,items:[{id:'fixture-news',title:'Fixture News',body:'Header action test.'}]}}));
   if(path==='/api/charts')return res.end(JSON.stringify(chartSurfaceView(state,Object.fromEntries(url.searchParams),clock)));
   if(path==='/api/snapshots')return res.end(JSON.stringify({items:[],revision:'fixture'}));
   if(path==='/'){
    res.setHeader('Content-Type','text/html');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'");
    return res.end('<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/mobile-theme.css"><link rel="stylesheet" href="/diary.css"><link rel="stylesheet" href="/shell-source/discover.css"><link rel="stylesheet" href="/app-shell.css"><link rel="stylesheet" href="/report-mobile.css"><link rel="stylesheet" href="/charts.css"><link rel="stylesheet" href="/swipe-fixture.css"><body class="discover-mobile dark discover-home"><header id="header" class="app-header topbar"></header><main></main><dialog id="sheet"><div></div></dialog><script type="module" src="/fixture.js"></script>');
   }
   if(path==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(`import {mountNutrition} from '/nutrition.js';const sheet=document.querySelector('#sheet'),content=sheet.querySelector('div');const close=()=>{sheet.close();content.replaceChildren()};sheet.addEventListener('click',event=>{if(event.target.closest('[data-close]'))close()});window.panel=mountNutrition({page:document.querySelector('main'),headerRoot:document.querySelector('#header'),mode:'discover',initialTab:'dashboard',date:()=>'${date}',header:title=>'<h2>'+title+'</h2><button type="button" data-close>Close</button>',show:html=>{content.innerHTML=html;if(!sheet.open)sheet.showModal()},close,content,onChange:async()=>{}});`);}
   if(!/^\/[a-zA-Z0-9/_.-]+\.(?:js|mjs|css|svg|woff2)$/.test(path)||path.includes('..'))return res.writeHead(404).end();
   res.setHeader('Content-Type',/\.m?js$/.test(path)?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'font/woff2');res.end(readFileSync(new URL('../public'+path,import.meta.url)));
  }catch(error){res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:error.message}));}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;

 try{
  browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});
  const page=await browser.newPage({viewport:{width:412,height:915},hasTouch:true,isMobile:true}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('.cloud-dashboard').waitFor();
  const tab=name=>page.waitForFunction(expected=>{
   const current=document.querySelector('[data-tab][aria-current="page"]');
   return current?.dataset.tab===expected&&!document.documentElement.classList.contains('discover-transition');
  },name);
  async function swipe({selector='.report-content',dx=-150,dy=2,cancel=false,multi=false}={}){
   return page.evaluate(({selector,dx,dy,cancel,multi})=>{
    const target=document.querySelector(selector),points=[new Touch({identifier:1,target,clientX:230,clientY:240}),...(multi?[new Touch({identifier:2,target,clientX:250,clientY:240})]:[])];
    const send=(type,touches,changed)=>{const event=new TouchEvent(type,{bubbles:true,cancelable:true,touches,targetTouches:touches,changedTouches:changed});target.dispatchEvent(event);return event.defaultPrevented;};
    send('touchstart',points,points);
    const finish=[new Touch({identifier:1,target,clientX:230+dx,clientY:240+dy})];
    const prevented=send('touchmove',finish,finish);send(cancel?'touchcancel':'touchend',[],finish);return prevented;
   },{selector,dx,dy,cancel,multi});
  }
  await tab('dashboard');await swipe({dx:160});await tab('dashboard');
  assert.equal(await swipe({dx:3,dy:180}),false);await tab('dashboard');
  await swipe({dx:-25});await tab('dashboard');await swipe({multi:true});await tab('dashboard');await swipe({cancel:true});await tab('dashboard');
  await page.locator('.cloud-dashboard').waitFor();
  const dashboardTop=await page.evaluate(()=>{window.scrollTo(0,320);return window.scrollY;});
  assert.ok(dashboardTop>0);
  await swipe({selector:'[data-discover=edit-report]'});await tab('charts');
  await page.locator('[data-tab=dashboard]').click();await tab('dashboard');
  await page.locator('.cloud-dashboard').waitFor();
  assert.equal(await page.evaluate(()=>window.scrollY),dashboardTop);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.getByRole('button',{name:'Newsfeed',exact:true}).click();await page.locator('#sheet').getByText('Fixture News',{exact:true}).waitFor();await swipe();await tab('dashboard');await page.getByRole('button',{name:'Back',exact:true}).click();
  assert.equal(await swipe(),true);await tab('charts');await page.locator('[data-manage]').waitFor();
  const plot=page.locator('canvas').first();await plot.waitFor();await swipe({selector:'canvas'});await tab('report');
  await page.locator('[data-tab=charts]').click();await tab('charts');await swipe({selector:'.mcl-plot'});await tab('report');
  await page.locator('[data-tab=charts]').click();await tab('charts');
  await page.evaluate(()=>{const scroller=document.createElement('div');scroller.id='horizontal-gesture-fixture';scroller.innerHTML='<div>Scrollable control</div>';document.querySelector('.report-content').append(scroller);});
  await swipe({selector:'#horizontal-gesture-fixture div'});await tab('charts');
  await page.evaluate(()=>{const input=document.createElement('input');input.id='gesture-input';document.querySelector('.report-content').append(input);});await swipe({selector:'#gesture-input'});await tab('charts');
  await swipe();await tab('report');await page.locator('.mobile-report-toolbar').waitFor();
  await swipe({selector:'summary'});await tab('snapshots');await page.locator('[data-tab=report]').click();await tab('report');
  await page.getByRole('button',{name:'Report Settings',exact:true}).click();await page.getByRole('dialog',{name:'Report Settings',exact:true}).waitFor();await swipe();await tab('report');await page.keyboard.press('Escape');
  await swipe();await tab('snapshots');await swipe();await tab('snapshots');await swipe({dx:150});await tab('report');await page.locator('.mobile-report-toolbar').waitFor();
  await swipe({dx:150});await tab('charts');await page.locator('[data-manage]').waitFor();await swipe({dx:150});await tab('dashboard');await page.locator('.cloud-dashboard').waitFor();
  // Real Chromium touch input proves scroll remains native while horizontal intent navigates.
  const client=await page.context().newCDPSession(page);
  await page.evaluate(()=>{const pad=document.createElement('div');pad.id='gesture-pad';document.querySelector('.report-content').prepend(pad);window.scrollTo(0,0);});
  async function realTouch(from,to){await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from.x,y:from.y}]});for(let i=1;i<=5;i++)await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*i/5,y:from.y+(to.y-from.y)*i/5}]});await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  await realTouch({x:210,y:650},{x:210,y:350});await page.waitForFunction(()=>scrollY>0);await tab('dashboard');
  await page.evaluate(()=>scrollTo(0,0));await realTouch({x:280,y:450},{x:100,y:450});await tab('charts');
  // A swipe on an actionable card must not synthesize its tap action.
  await page.locator('[data-tab=dashboard]').click();await tab('dashboard');const action=page.locator('[data-discover=edit-report]');await action.click({trial:true});const box=await action.boundingBox();await realTouch({x:box.x+box.width/2,y:box.y+box.height/2},{x:box.x+box.width/2-160,y:box.y+box.height/2});await tab('charts');assert.equal(await page.locator('dialog[open]').count(),0);
  // The screen follows the finger before commit; cancellation settles in place.
  await page.evaluate(()=>{
   const target=document.querySelector('.report-content'),touch=x=>new Touch({identifier:7,target,clientX:x,clientY:240});
   target.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[touch(280)],changedTouches:[touch(280)]}));
   target.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,cancelable:true,touches:[touch(200)],changedTouches:[touch(200)]}));
  });
  assert.equal(await page.locator('.nutrition-page').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m41),-80);
  await page.evaluate(()=>document.querySelector('.report-content').dispatchEvent(new TouchEvent('touchcancel',{bubbles:true,touches:[],changedTouches:[]})));
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.nutrition-page')).transform==='none');await tab('charts');
  // Empty tabs must own the blank viewport below their short content too.
  await page.evaluate(()=>{const shell=document.createElement('div');shell.className='app-shell';document.body.prepend(shell);shell.append(document.querySelector('#header'),document.querySelector('main'));document.querySelector('main').id='page';});
  await page.locator('[data-tab=snapshots]').click();await page.locator('.snapshot-list [data-snapshot-add]').waitFor();await tab('snapshots');
  await page.evaluate(()=>scrollTo(0,0));
  assert.equal(await page.evaluate(()=>document.elementFromPoint(120,650)?.closest('.nutrition-page')!==null),true);
  // A second gesture must work while native snapshots intercept hit-testing.
  await page.evaluate(()=>{window.rapidStarts=[];document.addEventListener('touchstart',event=>{window.rapidStarts.push({inRoot:!!event.target.closest('.nutrition-page'),transition:document.documentElement.classList.contains('discover-transition')});},{capture:true});});
  await realTouch({x:120,y:650},{x:300,y:650});
  await realTouch({x:120,y:650},{x:300,y:650});
  await tab('charts');
  assert.equal(await page.evaluate(()=>window.rapidStarts.some(start=>start.transition&&!start.inRoot)),true,'regression must exercise snapshot hit-testing');
  await page.locator('[data-tab=report]').click();await tab('report');await page.locator('.mobile-report-toolbar').waitFor();
  // Reverse direction immediately, without waiting for the forward slide.
  await realTouch({x:300,y:650},{x:120,y:650});
  await realTouch({x:120,y:650},{x:300,y:650});
  await tab('report');
  // Native snapshots animate only after the destination rendered, in the
  // requested direction. No duplicate DOM/canvas snapshots are retained.
  await page.locator('[data-tab=charts]').click();
  await page.waitForFunction(()=>document.getAnimations().some(a=>a.effect?.pseudoElement==='::view-transition-new(discover-content)'));
  assert.equal(await page.locator('[data-manage]').count(),1);
  const animation=await page.evaluate(()=>{const a=document.getAnimations().find(a=>a.effect?.pseudoElement==='::view-transition-new(discover-content)');return {duration:a.effect.getTiming().duration,first:a.effect.getKeyframes()[0].transform,last:a.effect.getKeyframes().at(-1).transform};});
  assert.equal(animation.duration,230);assert.match(animation.first,/translateX\(-/);assert.equal(animation.last,'translateX(0px)');await tab('charts');
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-tab=report]').click();await page.locator('.mobile-report-toolbar').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('discover-transition')),false);await tab('report');
  await page.emulateMedia({reducedMotion:'no-preference'});
  let releaseSlow;const slow=new Promise(resolve=>{releaseSlow=resolve;});
  await page.route('**/api/charts?*',async route=>{await slow;await route.continue();},{times:1});
  await page.locator('[data-tab=charts]').click();await tab('charts');
  assert.equal(await page.locator('[data-manage]').count(),0);
  assert.equal(await page.evaluate(()=>document.getAnimations().filter(a=>a.effect?.pseudoElement?.includes('discover-content')).length),0);
  await page.locator('[data-tab=dashboard]').click();await page.locator('.cloud-dashboard').waitFor();await tab('dashboard');releaseSlow();
  await page.evaluate(()=>{window.nativeTransition=document.startViewTransition;document.startViewTransition=undefined;});
  await page.locator('[data-tab=report]').click();await page.locator('.mobile-report-toolbar').waitFor();await tab('report');
  await page.evaluate(()=>{document.startViewTransition=window.nativeTransition;delete window.nativeTransition;});
  await page.setViewportSize({width:320,height:700});
  await page.evaluate(async()=>{(await import('/font-presentation.js')).applyFontPreferences({fontScale:1.5});});
  await page.locator('[data-tab=snapshots]').click();await tab('snapshots');await page.locator('.ms-root').waitFor();
  const selected=await page.locator('.dc-tabs [aria-current=page]').boundingBox();
  assert.ok(selected.x>=-1&&selected.x+selected.width<=321,'the selected tab stays visible after the header remounts');

  await page.locator('[data-tab=charts]').click();await page.locator('[data-manage]').waitFor();
  await page.evaluate(()=>window.panel.dispose());await swipe();await tab('charts');
  assert.equal(await page.evaluate(()=>document.getAnimations().filter(a=>a.effect?.pseudoElement?.includes('discover-content')).length),0);assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
