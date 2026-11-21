import {waitForOutboxIdle} from './fixtures/browser-outbox.mjs';
import {CHROME_EXECUTABLE} from './_chrome.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright-core';
import sharp from 'sharp';
import {initialState} from '../server/domain/workspace.mjs';
import {prepareSnapshot,snapshotsView,applySnapshotCommand} from '../server/snapshots.mjs';
import {validateStoredPhoto} from '../server/domain/photo-images.mjs';
const day='2026-11-16',asOf=day+'T12:00:00.000Z';
const bytes=await sharp({create:{width:100,height:160,channels:3,background:'#4a796b'}}).png().toBuffer();
const dataUrl='data:image/png;base64,'+bytes.toString('base64');

test('source snapshot dialogs retain metadata, handle retry, cancel, back and camera cleanup under production CSP',async()=>{
 const state=initialState(),vitals={weight:{value:70,unit:'kg'},height:{value:175,unit:'cm'},age:30,bodyFat:20};
 const originalReady=await prepareSnapshot(state,{dataUrl,date:day,time:'08:30',title:'Saved title',note:'Original caption',vitals},{asOf}),photo=await validateStoredPhoto(originalReady.photo);
 applySnapshotCommand(state,{type:'snapshot.add',payload:{photoId:photo.id,...originalReady.metadata}},{photo,asOf});const original=structuredClone(state.progressSnapshots[0]);
 let failMutation=false,failUpload=false,prepares=0,latency=0;const saved=new Map(),requests=[],media=new Map([[photo.id,photo.bytes]]);
 const server=createServer(async(req,res)=>{const path=new URL(req.url,'http://localhost').pathname;const json=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  try{
   if(path==='/api/account')return json(200,{id:'snapshot-test'});
   if(path==='/api/offline')return json(200,{version:1,identity:{ownerId:'snapshot-test',generation:'fixture'},state});
   if(path==='/api/diary')return json(200,{revision:snapshotsView(state).revision});
   if(path==='/api/snapshots')return json(200,snapshotsView(state));
   if(path==='/api/media'){const id=new URL(req.url,'http://localhost').searchParams.get('id');res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'private, no-store'});return res.end(media.get(id));}
   if(req.method==='POST'){
    let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);requests.push({path,body});
    if(path==='/api/snapshots/prepare'){prepares++;return json(200,await prepareSnapshot(state,body,{asOf}));}
    if(path==='/api/snapshots/save'){
     if(!saved.has(body.requestId)){const photo=await validateStoredPhoto(body.photo);media.set(photo.id,photo.bytes);const {requestId,revision,photo:unused,...metadata}=body;const result=applySnapshotCommand(state,{type:'snapshot.add',payload:{photoId:photo.id,...metadata}},{photo,asOf});saved.set(requestId,result);}
     if(failUpload){failUpload=false;return json(503,{error:'Upload reply lost'});}return json(200,saved.get(body.requestId));
    }
    if(path==='/api/workspace/command'){if(latency)await new Promise(resolve=>setTimeout(resolve,latency));if(failMutation===true){failMutation=false;return json(503,{error:'Temporary save failure'});}if(!saved.has(body.requestId))saved.set(body.requestId,applySnapshotCommand(state,{type:body.type,payload:body.payload}));if(failMutation==='after'){failMutation=false;return json(503,{error:'Temporary save failure'});}return json(200,saved.get(body.requestId));}
   }
   if(path==='/fixture.js'){res.writeHead(200,{'Content-Type':'text/javascript'});return res.end(`import {mountSnapshots} from '/snapshots.js';import {initializeDeviceCache} from '/device-cache.js';await initializeDeviceCache('snapshot-test');window.changed=0;window.view=mountSnapshots({root:document.querySelector('main'),date:'${day}',onChange:async()=>{window.changed++}});document.querySelector('.app-nav button').onclick=()=>window.navigation=true;`);}
   if(path==='/fixture.css'){res.writeHead(200,{'Content-Type':'text/css'});return res.end('html{font-size:18px}body{margin:0;background:var(--bg)}main{padding-bottom:90px}');}
   if(path==='/'){res.writeHead(200,{'Content-Type':'text/html','Content-Security-Policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});return res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/mobile-theme.css"><link rel="stylesheet" href="/diary.css"><link rel="stylesheet" href="/dashboard.css"><link rel="stylesheet" href="/app-shell.css"><link rel="stylesheet" href="/snapshots.css"><link rel="stylesheet" href="/fixture.css"><body class="discover-mobile dark"><main></main><nav class="app-nav"><button data-discover="shell-diary">Diary</button></nav><script type="module" src="/fixture.js"></script>');}
   if(!/^\/[\w/.-]+\.(?:js|mjs|css|svg|woff2)$/.test(path)||path.includes('..'))return res.writeHead(404).end();const mime=path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':path.endsWith('.woff2')?'font/woff2':'text/javascript';res.writeHead(200,{'Content-Type':mime});res.end(readFileSync(new URL('../public'+path,import.meta.url)));
  }catch(error){json(error.code??500,{error:error.message});}
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});const page=await browser.newPage({viewport:{width:412,height:915},isMobile:true,hasTouch:true});page.setDefaultTimeout(7000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{window.violations=[];document.addEventListener('securitypolicyviolation',event=>window.violations.push(event.violatedDirective));window.streams=[];const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async options=>{const stream=await original(options);window.streams.push(stream);return stream;};});await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('.snapshot-card').waitFor();
  const flush=()=>page.evaluate(async()=>{await (await import('/background-writes.js')).flushBackgroundWrites();});
  mkdirSync('.local/snapshot-child-ui',{recursive:true});
  await page.getByRole('button',{name:'Add Snapshot',exact:true}).click();assert.deepEqual(await page.locator('.ms-choice strong').allTextContents(),['Camera','Files']);await page.screenshot({path:'.local/snapshot-child-ui/source.png'});await page.mouse.click(2,2);assert.equal(await page.locator('dialog').count(),0);
  await page.getByRole('button',{name:'Snapshot options'}).click();assert.deepEqual(await page.locator('.ms-choice strong').allTextContents(),['Edit Date','Edit Caption','Delete']);await page.screenshot({path:'.local/snapshot-child-ui/options.png'});
  await page.getByRole('button',{name:'Edit Caption',exact:true}).click();await page.getByRole('textbox',{name:'Photo Caption'}).fill('Cancelled');await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(state.progressSnapshots[0].note,'Original caption');
  await page.getByRole('button',{name:'Snapshot options'}).click();await page.getByRole('button',{name:'Edit Caption',exact:true}).click();await page.getByRole('textbox',{name:'Photo Caption'}).fill('Changed caption');await page.screenshot({path:'.local/snapshot-child-ui/caption.png'});failMutation='after';latency=1500;const started=Date.now();await page.getByRole('button',{name:'Save',exact:true}).click();await page.waitForFunction(()=>window.changed===1&&document.querySelectorAll('dialog').length===0);assert.equal(await page.locator('.ms-caption').textContent(),'Saved titleChanged caption');assert.ok(Date.now()-started<800,'caption closes before delayed network save');await flush();latency=0;assert.equal(state.progressSnapshots[0].note,'Changed caption');await flush();
  assert.deepEqual(state.progressSnapshots[0],{...original,note:'Changed caption'});const captionWrites=requests.filter(row=>row.path==='/api/workspace/command');assert.equal(captionWrites.length,2);assert.deepEqual(captionWrites[0].body,captionWrites[1].body);
  await page.getByRole('button',{name:'Snapshot options'}).click();await page.getByRole('button',{name:'Edit Date',exact:true}).click();await page.locator('[data-mdc-date="2026-11-15"]').click();await page.screenshot({path:'.local/snapshot-child-ui/date.png'});await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(state.progressSnapshots[0].date,day);
  await page.getByRole('button',{name:'Snapshot options'}).click();await page.getByRole('button',{name:'Edit Date',exact:true}).click();await page.locator('[data-mdc-date="2026-11-15"]').click();failMutation=true;await page.getByRole('button',{name:'OK',exact:true}).click();await page.waitForFunction(()=>window.changed===2);assert.match(await page.locator('.snapshot-card h2').textContent(),/Nov 15/);await flush();await flush();await waitForOutboxIdle(page,()=>state.progressSnapshots[0].date==='2026-11-15');assert.deepEqual(state.progressSnapshots[0],{...original,note:'Changed caption',date:'2026-11-15'});
  await page.getByRole('button',{name:'Snapshot options'}).click();await page.getByRole('button',{name:'Edit Caption',exact:true}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(state.progressSnapshots[0].date,'2026-11-15');
  await page.getByRole('button',{name:'View snapshot'}).click();assert.equal(await page.locator('.ms-viewer').isVisible(),true);await page.screenshot({path:'.local/snapshot-child-ui/viewer.png'});await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').count(),0);
  await page.getByRole('button',{name:'Snapshot options'}).click();await page.evaluate(()=>window.dispatchEvent(new Event('nourishing-back',{cancelable:true})));assert.equal(await page.locator('dialog').count(),0);
  await page.getByRole('button',{name:'Snapshot options'}).click();await page.locator('.ms-sheet [data-discover="shell-diary"]').click();assert.equal(await page.evaluate(()=>window.navigation),true);
  const before=state.progressSnapshots.length;failUpload=true;await page.locator('[data-snapshot-gallery]').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:bytes});await page.waitForFunction(()=>window.changed===3);assert.equal(await page.locator('.snapshot-card').count(),before+1);await flush();assert.equal(state.progressSnapshots.length,before+1);await flush();assert.equal(state.progressSnapshots.length,before+1);assert.equal(prepares,1);const saves=requests.filter(row=>row.path==='/api/snapshots/save');assert.equal(saves.length,2);assert.deepEqual(saves[0].body,saves[1].body);

  await page.locator('[data-snapshot-gallery]').setInputFiles([]);assert.equal(state.progressSnapshots.length,before+1);
  await page.getByRole('button',{name:'Add Snapshot',exact:true}).click();await page.getByRole('button',{name:'Camera',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-mpc=shutter]')?.disabled===false);await page.getByRole('button',{name:'Cancel',exact:true}).last().click();assert.equal(await page.evaluate(()=>window.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))),true);assert.equal(state.progressSnapshots.length,before+1);
  await page.getByRole('button',{name:'Add Snapshot',exact:true}).click();await page.getByRole('button',{name:'Camera',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-mpc=shutter]')?.disabled===false);await page.getByRole('button',{name:'Take photo',exact:true}).click();await page.waitForFunction(()=>window.changed===4);await flush();assert.equal(state.progressSnapshots.length,before+2);assert.equal(await page.evaluate(()=>window.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))),true);
  await page.locator(`[data-snapshot-options="${original.id}"]`).click();await page.getByRole('button',{name:'Delete',exact:true}).click();await page.screenshot({path:'.local/snapshot-child-ui/delete.png'});await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.ok(state.progressSnapshots.some(row=>row.id===original.id));await page.locator(`[data-snapshot-options="${original.id}"]`).click();await page.getByRole('button',{name:'Delete',exact:true}).click();await page.locator('[data-snapshot-delete]').click();await page.waitForFunction(()=>window.changed===5);assert.equal(await page.locator(`[data-snapshot-options="${original.id}"]`).count(),0);await flush();assert.equal(state.progressSnapshots.some(row=>row.id===original.id),false);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(await page.evaluate(()=>window.violations),[]);assert.deepEqual(errors,[]);await page.evaluate(()=>window.view.dispose());assert.equal(await page.locator('dialog').count(),0);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
