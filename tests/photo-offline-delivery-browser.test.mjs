import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {chromium} from 'playwright-core';
import sharp from 'sharp';
import {CHROME_EXECUTABLE} from './_chrome.mjs';
import {pwaFixtureAssets} from './fixtures/pwa-assets.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';
import {initialState,act} from '../server/domain/workspace.mjs';
import {normalizePhoto,validateStoredPhoto} from '../server/domain/photo-images.mjs';
import {signPhotoReview} from '../server/cloud-photo.mjs';
import {stagePhotoMedia} from '../server/photo-storage.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {createWebHandler} from '../server/http.mjs';

const owner='fixture',secret='synthetic-photo-review-key-for-this-test',date='2026-11-20';
const bootstrap=`
 import {mountPhotoLog} from '/photo-log.js';
 import {queuePhoto} from '/diary-api.js';
 import {initializeDeviceCache} from '/device-cache.js';
 import {offlineCopy,saveOfflineSnapshot} from '/offline-store.js';
 import {flushBackgroundWrites} from '/background-writes.js';
 const ticket=await initializeDeviceCache('fixture');
 if(!await offlineCopy())await saveOfflineSnapshot(await(await fetch('/api/offline')).json(),ticket);
 Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});
 window.pending=async()=>(await offlineCopy()).pending;
 window.drain=async()=>{
  Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});
  try{await flushBackgroundWrites();}finally{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});}
 };
 const dialog=document.querySelector('dialog');
 document.querySelector('#open').onclick=()=>mountPhotoLog({
  show:html=>{dialog.innerHTML=html;dialog.showModal();},close:()=>dialog.close(),content:dialog,
  header:title=>'<h2>'+title+'</h2>',date:()=>'2026-11-20',groups:['Lunch'],initialGroup:'Lunch',
  onOptimisticSave:async({payload,rows})=>queuePhoto((await offlineCopy()).snapshot.revision,payload,{entries:rows}),
 });
 window.ready=true;`;
test('Photo Log saves an eligible review offline, restarts, and replays one canonical upload after late delivery',async()=>{
 const image=await sharp({create:{width:24,height:20,channels:3,background:'#aaaaaa'}}).png().toBuffer();
 const state=initialState(),food=act(state,'food.save',{name:'Oats',grams:100,nutrients:{calories:120}});
 const fixture=diaryStoreFixture(state),store=createWorkspaceStore(fixture.db,owner),files=await pwaFixtureAssets();
 let issueAge=0,analyses=0,uploads=0,lose=true,base,handler,storedPhoto;
 const attempts=[];
 const service={
  current:()=>({id:owner}),offlineSnapshot:()=>store.offlineSnapshot(),readDiary:async()=>({revision:(await store.offlineSnapshot()).revision}),
  analyzePhoto:async(_,input)=>{
   analyses++;const photo=await normalizePhoto(input.image);
   const analysis={observations:[{description:'Oats',preparation:'Cooked',uncertainty:'Check portion'}],notes:''};
   const reviewToken=signPhotoReview({owner,photoId:photo.id,analysis},{secret,now:Date.now()-issueAge});
   return {photo:{id:photo.id,dataUrl:photo.dataUrl},reviewToken,suggestions:[{kind:'observation',description:'Oats',observationIndex:0,portionEstimate:{grams:100},selection:{id:food.id,kind:'food'},candidates:[{ref:{id:food.id,kind:'food'},name:'Oats',grams:100}]}]};
  },
  savePhoto:async(_,body,_signal,delivery)=>{
   attempts.push({body:structuredClone(body),savedAt:delivery.reviewSavedAt});
   const {requestId,revision,photo:input,...fields}=body,photo=await validateStoredPhoto(input);
   const storage={
    getFile:async()=>{if(!storedPhoto)throw {code:404};return storedPhoto;},
    createFile:async({fileId,permissions})=>{uploads++;return storedPhoto={name:fileId+'.jpg',$permissions:permissions,sizeOriginal:photo.bytes.length};},
    getFileView:async()=>photo.bytes,
   };
   const result=await store.command({requestId,revision,type:'photo.log',payload:{...fields,photoId:photo.id}},async()=>null,{
    owner,reviewSecret:secret,photo,...delivery,now:Date.now()+3_600_000,
    stageMedia:tx=>stagePhotoMedia({...tx,db:fixture.db,storage,owner,photo}),
   });
   if(lose){lose=false;throw {code:503,publicMessage:'Lost acknowledgement'};}
   return result;
  },
 };
 const assets={get(path){
  if(path==='/')return {type:'text/html',body:'<button id="open">Photo Log</button><dialog></dialog><script type="module" src="/fixture.js"></script>'};
  if(path==='/fixture.js')return {type:'text/javascript',body:bootstrap};
  return files.get(path);
 }};
 const server=createServer(async(req,res)=>{
  const result=await handler(new Request(base+req.url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:req,duplex:'half'})}));
  res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 base='http://127.0.0.1:'+server.address().port;handler=createWebHandler({config:{origin:base},assets,service});
 let browser;
 try{
  browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});
  const page=await browser.newPage({extraHTTPHeaders:{Cookie:'__Host-nourishing_session=fixture'}});
  page.setDefaultTimeout(6000);await page.goto(base);await page.waitForFunction(()=>window.ready);
  async function prepare(){
   await page.locator('#open').click();
   await page.locator('[data-photo-gallery]').setInputFiles({name:'oats.png',mimeType:'image/png',buffer:image});
   await page.locator('[data-save]:enabled').waitFor();
  }
  await prepare();await page.locator('[data-save]').click();await page.locator('dialog').waitFor({state:'hidden'});
  const [queued]=await page.evaluate(()=>window.pending());assert.equal(analyses,1);assert.equal(attempts.length,0);
  await page.reload();await page.waitForFunction(()=>window.ready);await page.evaluate(()=>window.drain());
  assert.equal(fixture.state().entries.length,1);assert.equal((await page.evaluate(()=>window.pending())).length,1);
  await page.reload();await page.waitForFunction(()=>window.ready);await page.evaluate(()=>window.drain());
  assert.deepEqual(await page.evaluate(()=>window.pending()),[]);assert.deepEqual(attempts[1],attempts[0]);
  assert.equal(attempts[0].savedAt,Date.parse(queued.createdAt));assert.equal(attempts[0].body.requestId,queued.command.operationId);
  assert.equal(analyses,1);assert.equal(uploads,1);assert.equal(fixture.table('workspace_media').size,1);
  assert.equal(fixture.table('command_receipts').size,1);assert.equal(fixture.state().entries[0].foodId,food.id);
  issueAge=3_600_000;await prepare();await page.locator('[data-save]').click();
  await page.getByText('This photo review expired or changed. Scan the photo again.',{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.pending()),[]);assert.equal(attempts.length,2);
 }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
