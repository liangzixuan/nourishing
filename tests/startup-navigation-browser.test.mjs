import {CHROME_EXECUTABLE} from './_chrome.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {chromium} from 'playwright-core';
import sharp from 'sharp';
import {buildOfflineAssets} from '../scripts/package-offline-assets.mjs';
import {pwaFixtureAssets} from './fixtures/pwa-assets.mjs';
import {createWebHandler} from '../server/http.mjs';
import {initialState} from '../server/domain/workspace.mjs';
import {createDataRepository} from '../server/data-repository.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';
import {dashboardView} from '../server/dashboard-view.mjs';
import {chartSurfaceView} from '../server/dashboard-pinned-charts.mjs';
import {reportView} from '../server/nutrition-views.mjs';

async function fixture({updates=false}={}){
 const manifest=updates?await buildOfflineAssets():null;let releaseVersion=0,assetHold=null,releaseAsset,assetHits=0;
 const state=initialState(),data=diaryStoreFixture(state),repository=createDataRepository(data.db,'fixture'),clock={now:new Date(),timeZone:'UTC'};
 let hold=null,denied=false,omitDocumentCookie=false,base,handle;
 const names={alice:'Alice Example',bob:'Bob Example'},identity=id=>({id,name:names[id],email:id+'@example.com',emailVerified:true,profile:{timeZone:'UTC',units:'metric'}});
 const service={current:async secret=>{await hold;if(denied)throw {code:401};return identity(secret);},display:async()=>({settings:{theme:'dark'}}),updateAccount:async(id,input)=>{names[id]=input.name;return {ok:true,account:identity(id)};},readDiary:async(_,day)=>repository.diary(day,clock),dashboard:async(_,date)=>dashboardView(state,{date},clock),charts:async(_,input)=>chartSurfaceView(state,input,clock),nutritionReport:async(_,input)=>reportView(state,input,clock),snapshots:async()=>({items:[]})};
 const assets=await pwaFixtureAssets();
 const server=createServer(async(req,res)=>{if(updates&&req.url==='/offline-assets.js'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});return res.end('self.NOURISHING_OFFLINE='+JSON.stringify({...manifest,cache:manifest.cache+'-test-'+releaseVersion})+';');}if(updates&&req.url==='/diary-bundle.js'){assetHits++;await assetHold;}const requestHeaders={...req.headers};if(omitDocumentCookie&&req.url==='/diary')delete requestHeaders.cookie;const response=await handle(new Request(base+req.url,{method:req.method,headers:requestHeaders,...(req.method==='GET'?{}:{body:req,duplex:'half'})}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));});await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;handle=createWebHandler({config:{origin:base},service,assets});
 const browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true}),context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true,extraHTTPHeaders:{Cookie:'__Host-nourishing_session=alice'}}),page=await context.newPage();page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let release;return {page,context,base,errors,manifest,update(){releaseVersion++;},holdAsset(){assetHold=new Promise(r=>releaseAsset=r);},releaseAsset(){releaseAsset?.();assetHold=null;},assetHits:()=>assetHits,omitDocumentCookie(){omitDocumentCookie=true;},hold(){hold=new Promise(r=>release=r);},release(){release?.();hold=null;},deny(){denied=true;},close:async()=>{releaseAsset?.();release?.();await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}};
}

test('saved diary renders before delayed session revalidation, while changed and revoked sessions cannot retain it',async()=>{
 const f=await fixture();try{const {page}=f;await page.goto(f.base+'/diary');await page.locator('.md-diary').waitFor();
  f.hold();await page.reload({waitUntil:'domcontentloaded'});await page.locator('.md-diary').waitFor({timeout:1500});await page.locator('#settings-tab').click();assert.equal(await page.locator('.mm-identity').textContent(),'Alice Example');await page.locator('#diary-tab').click();f.release();
  f.omitDocumentCookie();f.hold();await page.reload({waitUntil:'domcontentloaded'});await page.locator('.md-diary').waitFor({timeout:1500});assert.equal(await page.locator('meta[name="nourishing-session"]').getAttribute('content'),'');f.release();
  await f.context.setExtraHTTPHeaders({Cookie:'__Host-nourishing_session=bob'});f.hold();await page.reload({waitUntil:'domcontentloaded'});assert.equal(await page.locator('.md-diary').count(),0);f.release();await page.locator('.md-diary').waitFor();await page.locator('#settings-tab').click();assert.equal(await page.locator('.mm-identity').textContent(),'Bob Example');await page.locator('#diary-tab').click();
  const context=await page.evaluate(async()=> (await(await fetch('/api/account/session-context')).json()).sessionContext);f.hold();f.deny();await page.reload({waitUntil:'domcontentloaded'});await page.locator('.md-diary').waitFor({timeout:1500});f.release();await page.waitForURL('**/login');assert.equal(await page.evaluate(async context=>{const m=await import('/offline-store.js');return (await m.resumePrivateResponses(context))??null;},context),null);
  assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});

test('first center swipe works in both directions after Diary to Discover remounts',async()=>{
 const f=await fixture();try{const {page}=f;await page.goto(f.base+'/diary');await page.locator('.md-diary').waitFor();const cdp=await page.context().newCDPSession(page);
  for(const [from,to,direction] of [['dashboard','charts',-1],['charts','report',-1],['report','snapshots',-1],['snapshots','report',1],['report','charts',1],['charts','dashboard',1]]){
   await page.locator('#diary-tab').click();await page.locator('#discover-tab').click();if(from!=='dashboard')await page.locator('[data-tab='+from+']').click();await page.waitForFunction(()=>!document.documentElement.classList.contains('discover-transition'));await page.evaluate(()=>scrollTo(0,0));
   const y=457,x=direction<0?300:110;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=5;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+direction*190*i/5,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForFunction(()=>!document.documentElement.classList.contains('discover-transition'));assert.equal(await page.locator('[data-tab='+to+']').getAttribute('aria-current'),'page',from+' -> '+to);
  }assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});


test('both edges step back once, respect an editor saving and leave tab roots to the host',async()=>{
 const f=await fixture();let finishSave;
 try{
  const {page}=f;await page.goto(f.base+'/diary');await page.locator('.md-diary').waitFor();
  const cdp=await page.context().newCDPSession(page);
  async function drag(from,to){
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[from]});
   for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*i/6,y:from.y+(to.y-from.y)*i/6}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
  const left=()=>drag({x:4,y:430},{x:160,y:434});
  const right=()=>drag({x:407,y:430},{x:240,y:434});
  await page.evaluate(()=>{
   window.backMotion=[];
   const animate=Element.prototype.animate;
   Element.prototype.animate=function(...args){
    const animation=animate.apply(this,args);
    if(animation.id==='nourishing-back-reveal'){
     const {duration,easing}=animation.effect.getTiming();
     window.backMotion.push({duration,easing,frames:animation.effect.getKeyframes().map(({translate,opacity})=>({translate,opacity}))});
    }
    return animation;
   };
  });
  await page.locator('#discover-tab').click();
  for(const control of ['shell-newsfeed','shell-settings']){
   for(const swipe of [left,right]){
    await page.locator('[data-discover="'+control+'"]:enabled').click();
    await page.locator('#sheet[open]').waitFor();await swipe();await page.locator('#sheet').waitFor({state:'hidden'});
    await page.locator('.cloud-dashboard').waitFor();
   }
  }
  const reference=await page.evaluate(()=>window.backMotion.slice());
  assert.equal(reference.length,4);assert.ok(reference.every(effect=>JSON.stringify(effect)===JSON.stringify(reference[0])));
  await page.locator('[data-tab=charts]').click();
  await page.waitForFunction(()=>!document.documentElement.classList.contains('discover-transition'));
  await right();await left();
  assert.equal(await page.locator('[data-tab=charts]').getAttribute('aria-current'),'page');
  await page.locator('#settings-tab').click();await page.locator('[data-more-open=support]').click();
  await page.locator('[data-more-open=manual]').click();
  await drag({x:406,y:430},{x:377,y:431});assert.ok(await page.locator('.mm-manual-topic').count());
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:406,y:430}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:265,y:431}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert.ok(await page.locator('.mm-manual-topic').count());
  await drag({x:407,y:540},{x:388,y:360});assert.ok(await page.locator('.mm-manual-topic').count());
  await right();await page.locator('[data-more-open=manual]').waitFor();
  assert.deepEqual(await page.evaluate(()=>window.backMotion.at(-1)),reference[0]);
  await page.locator('[data-more-open=manual]').click();await left();await page.locator('[data-more-open=manual]').waitFor();
  await right();await page.locator('[data-more-open=support]').waitFor();
  await page.locator('#settings-tab').click();await page.locator('[data-more-open=account]').click();
  await page.locator('[data-account-edit=name]').click();
  const editor=page.locator('.account-edit-dialog');
  await editor.getByLabel('Name',{exact:true}).fill('Unsaved');
  await right();await editor.waitFor({state:'detached'});
  await page.locator('[data-account-edit=name]').filter({hasText:'Alice Example'}).click();
  await editor.getByLabel('Name',{exact:true}).fill('Saved');
  const saving=new Promise(resolve=>page.route('**/api/account/update',async route=>{
   await new Promise(done=>{finishSave=done;resolve();});await route.continue();
  }));
  await editor.getByRole('button',{name:'Save',exact:true}).click();await saving;
  await left();assert.equal(await editor.isVisible(),true);
  finishSave();await editor.waitFor({state:'detached'});await page.locator('[data-account-edit=name]').filter({hasText:'Saved'}).waitFor();
  await page.locator('[data-account-edit=name]').click();await left();await editor.waitFor({state:'detached'});await page.locator('[data-account-edit=name]').waitFor();
  await left();await page.locator('[data-more-open=account]').waitFor();
  await page.locator('#settings-tab').click();await page.locator('#add-food').click();
  await page.locator('[data-am=edit]').click();await right();await page.locator('[data-am=edit]').waitFor();
  await page.locator('[data-am=edit]').click();await left();await page.locator('[data-am=edit]').waitFor();await right();await page.locator('dialog[open]').waitFor({state:'detached'});
  await page.locator('#diary-tab').click();
  await page.locator('[data-md-calendar]').click();await page.locator('[data-mdc-legend]').click();
  await right();await page.locator('.mdc-legend').waitFor({state:'detached'});assert.equal(await page.locator('.mdc-dialog').isVisible(),true);
  await page.locator('[data-mdc-legend]').click();await left();await page.locator('.mdc-legend').waitFor({state:'detached'});await right();await page.locator('.mdc-dialog').waitFor({state:'detached'});
  await page.locator('#settings-tab').click();await page.locator('#add-food').click();await page.locator('[data-am=select][data-id=food]').click();
  await page.locator('[data-mfs=options]').click();await right();await page.locator('.mfs-overlay').waitFor({state:'hidden'});
  assert.equal(await page.locator('#food-search').isVisible(),true);
  const foodSearch=page.locator('#food-search');await foodSearch.focus();
  assert.deepEqual(await foodSearch.evaluate(input=>{
   const style=getComputedStyle(input), add=getComputedStyle(document.body).getPropertyValue('--mobile-add-color');
   const swatch=document.createElement('span');swatch.style.color=add;document.body.append(swatch);
   const expected=getComputedStyle(swatch).color;swatch.remove();
   return [style.outlineStyle,style.boxShadow,style.caretColor===expected];
  }),['none','none',true]);
  await page.locator('[data-mfs=options]').click();await left();await page.locator('.mfs-overlay').waitFor({state:'hidden'});assert.equal(await page.locator('#food-search').isVisible(),true);
  await right();await page.locator('#sheet').waitFor({state:'hidden'});
  await page.locator('#settings-tab').click();await page.locator('[data-more-open=support]').click();
  await page.evaluate(()=>history.back());await page.locator('[data-more-open=support]').waitFor();
  await right();await left();await page.locator('.mm-primary').waitFor();
  await page.locator('#diary-tab').click();await left();await right();await page.locator('.md-diary').waitFor();
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('#settings-tab').click();await page.locator('[data-more-open=support]').click();
  const before=await page.evaluate(()=>window.backMotion.length);await left();
  await page.locator('[data-more-open=support]').waitFor();assert.equal(await page.evaluate(()=>window.backMotion.length),before);
  assert.equal(await page.locator('dialog[open]').count(),0);assert.deepEqual(f.errors,[]);
 }finally{finishSave?.();await f.close();}
});

test('More reflects a saved account name immediately and after reopening from cache',async()=>{
 const f=await fixture();try{const {page}=f;await page.goto(f.base+'/diary');await page.locator('.md-diary').waitFor();await page.locator('#settings-tab').click();
  assert.equal(await page.locator('.mm-identity').textContent(),'Alice Example');
  await page.locator('[data-more-open=account]').click();await page.locator('[data-account-edit=name]').click();
  const dialog=page.locator('.account-edit-dialog');await dialog.getByLabel('Name',{exact:true}).fill('Alice Updated');await dialog.getByRole('button',{name:'Save',exact:true}).click();await dialog.waitFor({state:'detached'});
  await page.locator('[data-account-edit=name]').filter({hasText:'Alice Updated'}).waitFor();await page.locator('[data-more-back]').click();assert.equal(await page.locator('.mm-identity').textContent(),'Alice Updated');
  await page.locator('#diary-tab').click();await page.locator('.md-diary').waitFor();f.hold();await page.reload({waitUntil:'domcontentloaded'});await page.locator('.md-diary').waitFor({timeout:1500});await page.locator('#settings-tab').click();assert.equal(await page.locator('.mm-identity').textContent(),'Alice Updated');f.release();
  assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});


test('scrolling immediately before a Discover swipe keeps fixed navigation visually stable',async()=>{
 const f=await fixture();try{const {page}=f;await page.goto(f.base+'/diary');await page.locator('.md-diary').waitFor();await page.locator('#discover-tab').click();await page.locator('.cloud-dashboard').waitFor();const cdp=await page.context().newCDPSession(page);
  async function touch(from,to){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[from]});for(let i=1;i<=5;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*i/5,y:from.y+(to.y-from.y)*i/5}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  for(const [from,to,dx] of [['dashboard','charts',-180],['charts','dashboard',180]]){
   await page.waitForFunction(()=>!document.documentElement.classList.contains('discover-transition'));assert.equal(await page.locator('[data-tab='+from+']').getAttribute('aria-current'),'page');await page.evaluate(()=>scrollTo(0,0));
   await page.evaluate(()=>{window.heldSwipe=false;function hold(){const animations=document.getAnimations().filter(a=>a.effect?.pseudoElement?.includes('discover-content'));if(animations.length){animations.forEach(a=>{a.pause();a.currentTime=100;});window.heldSwipe=true;}else requestAnimationFrame(hold);}requestAnimationFrame(hold);});
   await touch({x:200,y:650},{x:200,y:480});await touch({x:dx<0?280:100,y:450},{x:dx<0?100:280,y:450});await page.waitForFunction(()=>window.heldSwipe);assert.ok(await page.evaluate(()=>scrollY>0));
   const clips=await page.evaluate(()=>['.app-header','.app-nav'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x+12,y:r.y+8,width:r.width-24,height:r.height-16};}));
   const during=await Promise.all(clips.map(clip=>page.screenshot({clip})));
   await page.evaluate(()=>document.getAnimations().forEach(a=>a.play()));await page.waitForFunction(()=>!document.documentElement.classList.contains('discover-transition'));assert.equal(await page.locator('[data-tab='+to+']').getAttribute('aria-current'),'page');
   for(let i=0;i<clips.length;i++){
    const actual=await sharp(during[i]).removeAlpha().raw().toBuffer(),expected=await sharp(await page.screenshot({clip:clips[i]})).removeAlpha().raw().toBuffer();assert.equal(actual.length,expected.length);let changed=0;for(let p=0;p<actual.length;p++)if(Math.abs(actual[p]-expected[p])>20)changed++;assert.ok(changed/actual.length<.01,(i?'bottom navigation':'header')+' changed during scrolled '+from+' -> '+to+' swipe: '+changed/actual.length);
   }
  }assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});


test('Reload waits for the full diary release and starts from cache when startup downloads stall',{timeout:30000},async()=>{
 const f=await fixture({updates:true});try{
  assert.ok(f.manifest.precache.includes('/diary-bundle.js'),'Diary startup bundle must be prepared before offering Reload');
  const {page}=f;await page.goto(f.base+'/diary');await page.locator('.md-diary').waitFor();
  await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration())?.active,{},{timeout:10000});await page.reload();await page.locator('.md-diary').waitFor();
  f.holdAsset();const before=f.assetHits();f.update();await page.evaluate(async()=>{void(await navigator.serviceWorker.getRegistration()).update();});
  for(let i=0;i<200&&f.assetHits()===before;i++)await new Promise(r=>setTimeout(r,50));
  assert.ok(f.assetHits()>before,'Update downloads the main app dependency before readiness');
  assert.equal(await page.getByRole('button',{name:'Reload',exact:true}).count(),0);
  assert.equal(await page.locator('.md-diary').count(),1,'Current diary remains usable while update downloads');
  f.releaseAsset();await page.getByRole('button',{name:'Reload',exact:true}).waitFor();
  f.holdAsset();const downloaded=f.assetHits();await page.getByRole('button',{name:'Reload',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.pwa-update'));await page.locator('.md-diary').waitFor({timeout:2000});
  assert.equal(f.assetHits(),downloaded,'Reload must not download an uncached startup dependency');
  await page.locator('#settings-tab').click();assert.equal(await page.locator('.mm-identity').textContent(),'Alice Example');
  assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});
