import {CHROME_EXECUTABLE} from './_chrome.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright-core';
import sharp from 'sharp';
import {stagePhotoMedia} from '../server/photo-storage.mjs';
import {recordOptions} from '../server/record-views.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {transactionFixture} from './fixtures/note-media.mjs';
import {prepareNotePhoto} from '../server/note-photos.mjs';
import {validateStoredPhoto} from '../server/domain/photo-images.mjs';
import {digest} from '../server/data-codec.mjs';

test('offline note photo selection survives cancel, restart, queued edits, account switch and a lost receipt',async()=>{
 const fixture=transactionFixture(),store=createWorkspaceStore(fixture.db,'fixture'),day='2026-11-20',sent=[],prepared=[];let lost=true;await store.create();
 const bytes=await sharp({create:{width:20,height:20,channels:3,background:'#739985'}}).withMetadata({exif:{IFD0:{Artist:'Fixture'}}}).png().toBuffer();
 const script=`import {mountNoteEditor} from '/note-photos.js';import {localWorkspaceState} from '/local-engine.js';window.localWorkspaceState=localWorkspaceState;import {initializeDeviceCache,writeDeviceCache} from '/device-cache.js';import {saveOfflineSnapshot} from '/offline-store.js';if(navigator.onLine){const ticket=await initializeDeviceCache('fixture',{sessionContext:'a'.repeat(64)});await saveOfflineSnapshot(await(await fetch('/api/offline')).json(),ticket);await writeDeviceCache('/api/records/options?date=${day}',await(await fetch('/api/records/options?date=${day}')).json(),ticket);}else{await (await import('/device-cache.js')).resumeOfflineDeviceCache();}const sheet=document.querySelector('dialog'),content=sheet.firstElementChild;const close=()=>{sheet.close();content.replaceChildren()};window.openNote=record=>mountNoteEditor({record,date:'${day}',content,show:html=>{content.innerHTML=html;if(!sheet.open)sheet.showModal()},close,header:title=>'<h2>'+title+'</h2>',onChange:()=>new Promise(()=>{})});sheet.addEventListener('cancel',event=>{event.preventDefault();close()});document.querySelector('#open').onclick=()=>openNote();window.ready=true;`;
 const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://fixture'),path=url.pathname;let body;if(req.method==='POST'){let raw='';for await(const chunk of req)raw+=chunk;body=JSON.parse(raw);}res.setHeader('Content-Type','application/json');
  if(path==='/api/account')return res.end(JSON.stringify({id:'fixture'}));if(path==='/api/offline')return res.end(JSON.stringify(await store.offlineSnapshot()));if(path==='/api/diary')return res.end(JSON.stringify({revision:digest(fixture.state('fixture'))}));
  if(path==='/api/records/options')return res.end(JSON.stringify(recordOptions(fixture.state('fixture'),day)));
  if(path==='/api/note-photos/prepare'){prepared.push(body);return res.end(JSON.stringify(await prepareNotePhoto(body)));}
  if(path==='/api/note-photos/save'){sent.push(body);const photo=body.photo.mode==='replace'?await validateStoredPhoto(body.photo):undefined,result=await store.command({requestId:body.requestId,revision:body.revision,type:'note.photo.save',payload:{id:body.id,fields:body.fields,photo:{mode:body.photo.mode,...(body.photo.mode==='replace'?{id:body.photo.id}:{})}}},async()=>null,photo?{photo,stageMedia:tx=>stagePhotoMedia({...tx,db:fixture.db,storage:fixture.storage,owner:'fixture',photo,namespace:'note_photos'})}:{});if(lost){lost=false;res.writeHead(503);return res.end(JSON.stringify({error:'Lost reply'}));}return res.end(JSON.stringify(result));}
  if(path==='/'){res.setHeader('Content-Type','text/html');return res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/diary.css"><body><button id="open">Note</button><dialog><div></div></dialog><script type="module" src="/fixture.js"></script>');}
  if(path==='/fixture-sw.js'){res.setHeader('Content-Type','text/javascript');return res.end("self.addEventListener('activate',event=>event.waitUntil(clients.claim()));self.addEventListener('fetch',event=>{if(!new URL(event.request.url).pathname.startsWith('/api/'))event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request)));});");}
  if(path==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(script);}
  if(!/^\/[a-zA-Z0-9/_.-]+\.(?:m?js|css|svg|woff2)$/.test(path)||path.includes('..'))return res.writeHead(404).end();res.setHeader('Content-Type',path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':path.endsWith('.woff2')?'font/woff2':'text/javascript');res.end(readFileSync(new URL('../public'+path,import.meta.url)));
 }catch(error){res.writeHead(error.code??error.status??500,{'Content-Type':'application/json'}).end(JSON.stringify({error:error.message}));}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(5000);const errors=[];page.on('pageerror',error=>errors.push(error.message));const shell=new Set();page.on('response',response=>{if(response.ok()&&!new URL(response.url()).pathname.startsWith('/api/'))shell.add(response.url());});
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.ready);
  const open=()=>page.locator('#open').click(),text=page.getByRole('textbox',{name:'Note',exact:true}),save=page.locator('.note-editor [type=submit]');
  const choose=async()=>{await page.locator('[data-note-gallery]').setInputFiles({name:'note.png',mimeType:'image/png',buffer:bytes});await page.waitForFunction(()=>document.querySelector('.note-photo-preview img')?.naturalWidth===20);};
  await page.evaluate(async()=>{(await import('/app-language.js')).applyAppLanguage('fr');});await open();
  const group=page.locator('.note-editor select[name=group]');await group.waitFor();
  assert.deepEqual(await group.locator('option').allTextContents(),fixture.state('fixture').settings.groups);
  await page.getByRole('heading',{name:'Ajouter une note'}).waitFor();
  const frenchText=page.locator('.note-editor textarea');await frenchText.fill('abc');
  assert.equal(await page.locator('[data-note-count]').getAttribute('aria-label'),'3 caractères utilisés sur 1024');
  await page.keyboard.press('Escape');await page.evaluate(async()=>{(await import('/app-language.js')).applyAppLanguage('en');});
  await open();await text.waitFor();assert.equal(await save.isDisabled(),true);assert.equal(await page.locator('.note-editor input[type=date]').count(),0);
  const attach=page.getByRole('button',{name:'Attach photo'}),sources=page.locator('.note-photo-choices');
  await text.fill('Draft with photo');
  for(const back of ['Escape','browser']){
   await attach.click();await sources.waitFor();
   if(back==='Escape')await page.keyboard.press('Escape');
   else assert.equal(await page.evaluate(()=>window.dispatchEvent(new CustomEvent('nourishing-back',{cancelable:true}))),false);
   assert.ok(await text.isVisible());assert.equal(await text.inputValue(),'Draft with photo');
   assert.equal(await sources.isVisible(),false);assert.equal(await attach.evaluate(el=>el===document.activeElement),true);
  }
  await page.evaluate(async urls=>{const cache=await caches.open('note-test-shell');await cache.addAll(urls);await navigator.serviceWorker.register('/fixture-sw.js');await navigator.serviceWorker.ready;},[...shell]);
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await context.setOffline(true);await choose();await page.keyboard.press('Escape');
  const queue=()=>page.evaluate(async()=>(await(await import('/offline-store.js')).readWriteCopy())?.pending??[]);
  assert.deepEqual(await queue(),[]);assert.equal(prepared.length,0);
  await open();await text.fill('Photo saved offline');await choose();
  await save.click();await page.locator('dialog').waitFor({state:'hidden'});
  const pending=await queue();assert.equal(pending.length,1);assert.equal(pending[0].command.type,'note.photo.save');assert.equal(sent.length,0);
  await page.reload();await page.waitForFunction(()=>window.ready);
  await page.evaluate(async()=>openNote((await localWorkspaceState()).notes[0]));
  await page.waitForFunction(()=>document.querySelector('.note-photo-preview img')?.naturalWidth===20);await page.keyboard.press('Escape');
  await open();await text.fill('Account-owned draft');
  await page.evaluate(async()=>{await (await import('/device-cache.js')).initializeDeviceCache('other');});
  await save.click();await page.getByRole('status').filter({hasText:'account changed'}).waitFor();
  assert.equal(await text.inputValue(),'Account-owned draft');await page.keyboard.press('Escape');
  assert.deepEqual(await queue(),[]);assert.equal(await page.evaluate(()=>localWorkspaceState()),null);
  await page.evaluate(async()=>{await (await import('/device-cache.js')).initializeDeviceCache('fixture',{sessionContext:'a'.repeat(64)});});
  await page.evaluate(async()=>openNote((await localWorkspaceState()).notes[0]));
  await page.getByRole('textbox',{name:'Note',exact:true}).fill('Photo edited offline');await page.locator('.note-editor [type=submit]').click();await page.locator('dialog').waitFor({state:'hidden'});
  await page.evaluate(async()=>openNote((await localWorkspaceState()).notes[0]));
  await page.getByRole('textbox',{name:'Note',exact:true}).fill('Photo final text');await page.locator('.note-editor [type=submit]').click();await page.locator('dialog').waitFor({state:'hidden'});
  await page.reload();await page.waitForFunction(()=>window.ready);const restarted=await page.evaluate(async()=>(await(await import('/offline-store.js')).readWriteCopy()).pending);assert.deepEqual(restarted[0].transport,pending[0].transport);
  await context.setOffline(false);await page.evaluate(async()=>{const {flushBackgroundWrites}=await import('/background-writes.js');await flushBackgroundWrites();await flushBackgroundWrites();});assert.equal(sent.length,4);assert.deepEqual(sent[0],sent[1]);assert.equal(fixture.state('fixture').notes.length,1);assert.equal(fixture.state('fixture').notes[0].text,'Photo final text');assert.equal(sent[2].id,fixture.state('fixture').notes[0].id);assert.equal(sent[3].id,fixture.state('fixture').notes[0].id);assert.equal(fixture.uploads(),1);assert.equal(fixture.table('workspace_media').size,1);assert.equal(prepared.length,1);assert.equal(prepared[0].dataUrl,'data:image/png;base64,'+bytes.toString('base64'));const photo=await validateStoredPhoto(sent[0].photo);assert.equal(fixture.state('fixture').notes[0].imageId,photo.id);assert.equal((await sharp(photo.bytes).metadata()).exif,undefined);const copy=await page.evaluate(async()=>(await(await import('/offline-store.js')).readWriteCopy()));assert.equal(copy.pending.length,0);assert.equal(copy.snapshot.state.notes[0].id,fixture.state('fixture').notes[0].id);assert.deepEqual(copy.snapshot.state.notes,fixture.state('fixture').notes);
  await context.setOffline(true);await open();await text.fill('Invalid source');
  await page.locator('[data-note-gallery]').setInputFiles({name:'wrong.jpg',mimeType:'image/jpeg',buffer:bytes});
  await page.waitForFunction(()=>document.querySelector('.note-photo-preview img')?.naturalWidth===20);
  await save.click();await page.locator('dialog').waitFor({state:'hidden'});
  await context.setOffline(false);await page.evaluate(async()=>{await(await import('/background-writes.js')).flushBackgroundWrites();});
  assert.deepEqual(await queue(),[]);assert.equal(prepared.length,2);assert.equal(sent.length,4);assert.equal(fixture.uploads(),1);
  assert.equal(fixture.state('fixture').notes.length,1);assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
