import {CHROME_EXECUTABLE} from './_chrome.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright-core';
import sharp from 'sharp';
import {initialState} from '../server/domain/workspace.mjs';
import {recordOptions} from '../server/record-views.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';
import {prepareNotePhoto} from '../server/note-photos.mjs';
import {validateStoredPhoto} from '../server/domain/photo-images.mjs';
import {digest} from '../server/data-codec.mjs';

test('prepared note photo persists before dismissal and survives restart with exact receipt retry',async()=>{
 const fixture=diaryStoreFixture(initialState()),store=createWorkspaceStore(fixture.db,'fixture'),day='2026-11-20',sent=[];let lost=true;
 const bytes=await sharp({create:{width:20,height:20,channels:3,background:'#739985'}}).png().toBuffer();
 const script=`import {mountNoteEditor} from '/note-photos.js';import {localWorkspaceState} from '/local-engine.js';window.localWorkspaceState=localWorkspaceState;import {initializeDeviceCache,writeDeviceCache} from '/device-cache.js';import {saveOfflineSnapshot} from '/offline-store.js';const ticket=await initializeDeviceCache('fixture');await saveOfflineSnapshot(await(await fetch('/api/offline')).json(),ticket);await writeDeviceCache('/api/records/options?date=${day}',await(await fetch('/api/records/options?date=${day}')).json(),ticket);const sheet=document.querySelector('dialog'),content=sheet.firstElementChild;window.openNote=record=>mountNoteEditor({record,date:'${day}',content,show:html=>{content.innerHTML=html;if(!sheet.open)sheet.showModal()},close:()=>{sheet.close();content.replaceChildren()},header:title=>'<h2>'+title+'</h2>',onChange:()=>new Promise(()=>{})});document.querySelector('#open').onclick=()=>openNote();window.ready=true;`;
 const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://fixture'),path=url.pathname;let body;if(req.method==='POST'){let raw='';for await(const chunk of req)raw+=chunk;body=JSON.parse(raw);}res.setHeader('Content-Type','application/json');
  if(path==='/api/account')return res.end(JSON.stringify({id:'fixture'}));if(path==='/api/offline')return res.end(JSON.stringify(await store.offlineSnapshot()));if(path==='/api/diary')return res.end(JSON.stringify({revision:digest(fixture.state())}));
  if(path==='/api/records/options')return res.end(JSON.stringify(recordOptions(fixture.state(),day)));
  if(path==='/api/note-photos/prepare')return res.end(JSON.stringify(await prepareNotePhoto(body)));
  if(path==='/api/note-photos/save'){sent.push(body);const photo=body.photo.mode==='replace'?await validateStoredPhoto(body.photo):undefined,result=await store.command({requestId:body.requestId,revision:body.revision,type:'note.photo.save',payload:{id:body.id,fields:body.fields,photo:{mode:body.photo.mode,...(body.photo.mode==='replace'?{id:body.photo.id}:{})}}},async()=>null,{photo});if(lost){lost=false;res.writeHead(503);return res.end(JSON.stringify({error:'Lost reply'}));}return res.end(JSON.stringify(result));}
  if(path==='/'){res.setHeader('Content-Type','text/html');return res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/diary.css"><body><button id="open">Note</button><dialog><div></div></dialog><script type="module" src="/fixture.js"></script>');}
  if(path==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(script);}
  if(!/^\/[a-zA-Z0-9/_.-]+\.(?:m?js|css|svg|woff2)$/.test(path)||path.includes('..'))return res.writeHead(404).end();res.setHeader('Content-Type',path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':path.endsWith('.woff2')?'font/woff2':'text/javascript');res.end(readFileSync(new URL('../public'+path,import.meta.url)));
 }catch(error){res.writeHead(error.code??error.status??500,{'Content-Type':'application/json'}).end(JSON.stringify({error:error.message}));}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(5000);const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.ready);await page.locator('#open').click();await page.getByRole('textbox',{name:'Note',exact:true}).fill('Photo saved offline');await page.locator('[data-note-gallery]').setInputFiles({name:'note.png',mimeType:'image/png',buffer:bytes});await page.locator('.note-photo-preview img').waitFor();await context.setOffline(true);await page.locator('.note-editor [type=submit]').click();await page.locator('dialog').waitFor({state:'hidden',timeout:800});
  const pending=await page.evaluate(async()=>(await(await import('/offline-store.js')).readWriteCopy()).pending);assert.equal(pending.length,1);assert.equal(pending[0].command.type,'note.photo.save');assert.match(pending[0].transport.body.photo.dataUrl,/^data:image\/jpeg;base64,/);assert.equal(pending[0].projection.notes[0].text,'Photo saved offline');assert.equal(sent.length,0);
  await page.evaluate(async()=>openNote((await localWorkspaceState()).notes[0]));
  await page.getByRole('textbox',{name:'Note',exact:true}).fill('Photo edited offline');await page.locator('.note-editor [type=submit]').click();await page.locator('dialog').waitFor({state:'hidden'});
  await page.evaluate(async()=>openNote((await localWorkspaceState()).notes[0]));
  await page.getByRole('textbox',{name:'Note',exact:true}).fill('Photo final text');await page.locator('.note-editor [type=submit]').click();await page.locator('dialog').waitFor({state:'hidden'});
  await context.setOffline(false);await page.reload();await page.waitForFunction(()=>window.ready);const restarted=await page.evaluate(async()=>(await(await import('/offline-store.js')).readWriteCopy()).pending);assert.deepEqual(restarted[0].transport,pending[0].transport);
  await page.evaluate(async()=>{const {flushBackgroundWrites}=await import('/background-writes.js');await flushBackgroundWrites();await flushBackgroundWrites();});assert.equal(sent.length,4);assert.deepEqual(sent[0],sent[1]);assert.equal(fixture.state().notes.length,1);assert.equal(fixture.state().notes[0].text,'Photo final text');assert.equal(sent[2].id,fixture.state().notes[0].id);assert.equal(sent[3].id,fixture.state().notes[0].id);assert.equal(fixture.state().notes[0].imageId,pending[0].transport.body.photo.id);const copy=await page.evaluate(async()=>(await(await import('/offline-store.js')).readWriteCopy()));assert.equal(copy.pending.length,0);assert.equal(copy.snapshot.state.notes[0].id,fixture.state().notes[0].id);assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
