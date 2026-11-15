// Production HTTP policy, note editor and source domain; disposable in-memory data only.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,readdirSync} from 'node:fs';
import {chromium} from 'playwright-core';
import sharp from 'sharp';
import {initialState,act} from '../server/domain/workspace.mjs';
import {recordOptions,recordView} from '../server/record-views.mjs';
import {applyNotePhotoCommand,prepareNotePhoto} from '../server/note-photos.mjs';
import {validateStoredPhoto} from '../server/domain/photo-images.mjs';
import {digest} from '../server/data-codec.mjs';
import {createWebHandler} from '../server/http.mjs';
const date='2026-11-15',state=initialState(),photos=new Map(),receipts=new Map(),saves=[];let loseReply=true,refresh=0;
const assets=new Map();for(const name of readdirSync('public'))if(/\.(js|css|woff2|svg)$/.test(name))assets.set('/'+name,{body:readFileSync('public/'+name),type:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':'font/woff2'});
assets.set('/',{type:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/mobile-theme.css"><link rel="stylesheet" href="/diary.css"><link rel="stylesheet" href="/records.css"><link rel="stylesheet" href="/note-photos.css"></head><body class="discover-mobile dark"><button id="add">Add Note</button><button id="edit">Edit Note</button><output id="saved"></output><dialog id="sheet"><div id="sheet-content"></div></dialog><script type="module" src="/fixture.js"></script></body></html>'});
assets.set('/fixture.js',{type:'text/javascript',body:`import {mountRecordEditor} from '/records.js';
const sheet=document.querySelector('#sheet'),content=document.querySelector('#sheet-content');
const header=title=>'<header class="sheet-header"><button type="button" data-close>Close</button><h2>'+title+'</h2></header>',show=html=>{content.innerHTML=html;if(!sheet.open)sheet.showModal();},close=()=>{sheet.close();content.replaceChildren();};content.onclick=event=>{if(event.target.closest('[data-close]'))close();};sheet.oncancel=()=>close();
function open(record){return mountRecordEditor({kind:'note',record,date:'${date}',show,close,header,content,onChange:async()=>{document.querySelector('#saved').textContent=String(++window.saved);}});}window.saved=0;
document.querySelector('#add').onclick=()=>open();document.querySelector('#edit').onclick=async()=>open((await(await fetch('/api/diary?date=${date}')).json()).notes[0]);`});
const fail=(code,message)=>{throw Object.assign(Error(message),{code,publicMessage:message});};
const service={
 current:async()=>({$id:'fixture'}),recordOptions:async(_,day)=>recordOptions(state,day),recordItem:async(_,query)=>recordView(state,query),readDiary:async()=>({notes:state.notes}),
 prepareNotePhoto:async(_,input)=>prepareNotePhoto(input),
 saveNotePhoto:async(_,input)=>{
  saves.push(structuredClone(input));if(receipts.has(input.requestId))return receipts.get(input.requestId);
  if(input.revision!==digest(state))fail(409,'The note changed. Reload it.');
  const photo=input.photo.mode==='replace'?await validateStoredPhoto({id:input.photo.id,dataUrl:input.photo.dataUrl}):null;
  const result=applyNotePhotoCommand(state,{type:'note.photo.save',payload:{id:input.id,recordRevision:input.recordRevision,fields:input.fields,photo:photo?{mode:'replace',id:photo.id}:input.photo}},{photo});
  if(photo)photos.set(photo.id,photo);const response={ok:true,revision:digest(state),item:result.result};receipts.set(input.requestId,response);refresh++;
  if(loseReply){loseReply=false;fail(503,'Connection lost. Try again.');}return response;
 },
 workspaceCommand:async(_,input)=>{assert.equal(input.revision,digest(state));act(state,input.type,input.payload);return {ok:true,revision:digest(state)};},
 readMedia:async(_,namespace,id)=>{if(namespace!=='note_photos'||!state.notes.some(row=>row.imageId===id)||!photos.has(id))fail(404,'Photo not found.');return photos.get(id).bytes;}
};
let handle;const server=createServer(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);const response=await handle(new Request(origin+req.url,{method:req.method,headers:{...req.headers,cookie:'__Host-nourishing_session=fixture'},...(['POST','PUT'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;handle=createWebHandler({config:{origin},service,assets});let browser;
try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage({viewport:{width:412,height:915}});page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error'&&message.text().includes('Content Security Policy'))errors.push(message.text());});await page.goto(origin);
 const button=name=>page.getByRole('button',{name,exact:true}),field=name=>page.getByLabel(name,{exact:true}),image=await sharp({create:{width:50,height:70,channels:3,background:'#93aa86'}}).png().toBuffer();
 await button('Add Note').click();await field('Note').fill('A meal note');await button('Attach photo').click();await button('Choose photo').waitFor();await page.locator('.sheet-header h2').click();await button('Choose photo').waitFor({state:'hidden'});await button('Attach photo').click();await page.locator('[data-note-gallery]').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:image});await page.locator('.note-photo-preview img').waitFor();await button('Save').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('.note-editor [type=submit]').disabled);
 await button('Enlarge note photo').click();assert.ok(await page.locator('.note-photo-preview').evaluate(node=>node.classList.contains('expanded')));await button('Reduce note photo').click();await field('Group').selectOption('Lunch');await field('Include time').uncheck();await button('Save').click();await button('Try again').waitFor();assert.equal(state.notes.length,1);assert.equal(state.notes[0].time,'');assert.ok(await field('Note').isDisabled());await button('Try again').click();await page.locator('#sheet').waitFor({state:'hidden'});assert.equal(state.notes.length,1);assert.deepEqual(saves[0],saves[1]);assert.equal(refresh,1);const oldImage=state.notes[0].imageId;
 await button('Edit Note').click();await page.locator('.note-photo-preview img').waitFor();await page.waitForFunction(()=>document.querySelector('.note-photo-preview img')?.naturalWidth>0);await button('Remove photo').click();await button('Keep original photo').click();await page.locator('.note-photo-preview img').waitFor();await button('Remove photo').click();await field('Note').fill('Updated text');await button('Save').click();await page.locator('#sheet').waitFor({state:'hidden'});assert.equal(state.notes[0].text,'Updated text');assert.equal(state.notes[0].imageId,undefined);assert.equal((await fetch(origin+'/api/media?namespace=note_photos&id='+oldImage)).status,404);assert.ok(photos.has(oldImage),'Removed blob retained privately');
 await button('Edit Note').click();await button('Attach photo').click();await page.locator('[data-note-camera]').setInputFiles({name:'camera.png',mimeType:'image/png',buffer:image});await page.locator('.note-photo-preview img').waitFor();await page.waitForFunction(()=>!document.querySelector('.note-editor [type=submit]').disabled);await button('Close').click();await button('Edit Note').click();assert.equal(await page.locator('.note-photo-preview img').count(),0);await button('Close').click();
 const current=structuredClone(state.notes[0]);current.text='Concurrent update';await button('Edit Note').click();await field('Note').fill('Stale edit');state.notes[0]=current;await button('Save').click();await button('Reload note').waitFor();assert.ok(await button('Save').isDisabled());await button('Reload note').click();await field('Note').waitFor();assert.equal(await field('Note').inputValue(),'Concurrent update');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await button('Close').click();
 assert.deepEqual(errors,[]);console.log('PASS: production CSP, camera/gallery normalized preview, light-dismiss choices, time/group, exact save retry, image removal/revert/private read guard, discard draft, stale note reload, mobile layout');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
