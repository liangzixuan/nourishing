// Production snapshot UI/domain in a disposable in-memory fixture; Appwrite is checked separately.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {chromium} from 'playwright-core';
import sharp from 'sharp';
import {initialState} from '../server/domain/workspace.mjs';
import {validateStoredPhoto} from '../server/domain/photo-images.mjs';
import {digest} from '../server/data-codec.mjs';
import {prepareSnapshot,snapshotsView,applySnapshotCommand} from '../server/snapshots.mjs';
const state=initialState(),receipts=new Map(),photos=new Map();let loseResponse=true,saveRequests=[];
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/mobile-theme.css"><link rel="stylesheet" href="/diary.css"><link rel="stylesheet" href="/snapshots.css"></head><body class="discover-mobile dark"><main id="page"></main><dialog id="sheet"><div id="sheet-content"></div></dialog><script type="module">
import {mountSnapshots} from '/snapshots.js';const sheet=document.querySelector('#sheet'),content=document.querySelector('#sheet-content'),root=document.querySelector('#page'),header=title=>'<header class="sheet-header"><button type="button" data-close>Close</button><h2>'+title+'</h2></header>',show=html=>{content.innerHTML=html;if(!sheet.open)sheet.showModal();},close=()=>{sheet.close();content.replaceChildren();};content.onclick=e=>{if(e.target.hasAttribute('data-close'))close();};mountSnapshots({root,show,close,header,content,date:'2026-11-14'});</script></body></html>`;
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');let value;
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html');return res.end(html);}
 if(url.pathname==='/api/snapshots')value=snapshotsView(state);
 else if(url.pathname==='/api/media'){const photo=photos.get(url.searchParams.get('id'));assert.ok(state.progressSnapshots.some(row=>row.imageId===photo?.id));res.setHeader('Content-Type','image/jpeg');return res.end(photo.bytes);}
 else if(req.method==='POST'){
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const input=JSON.parse(Buffer.concat(chunks));
  if(url.pathname==='/api/snapshots/prepare')value=await prepareSnapshot(state,input);
  else{
   const snapshot=url.pathname==='/api/snapshots/save';if(snapshot)saveRequests.push(input);
   if(receipts.has(input.requestId))value=receipts.get(input.requestId);
   else{
    assert.equal(input.revision,digest(state));let action=input,photo;
    if(snapshot){const {requestId,revision,photo:raw,...metadata}=input;photo=await validateStoredPhoto(raw);action={type:'snapshot.add',payload:{photoId:photo.id,...metadata}};}
    const result=applySnapshotCommand(state,action,{photo});assert.ok(result.handled);if(photo)photos.set(photo.id,photo);value={ok:true,revision:digest(state)};receipts.set(input.requestId,value);
   }
   if(snapshot&&loseResponse){loseResponse=false;res.writeHead(503,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'Connection lost. Try again.'}));}
  }
 }else{
  const name=url.pathname.slice(1);if(name.includes('..')||!/^[\w./-]+\.(js|css|svg|woff2)$/.test(name)||!existsSync('public/'+name)){res.writeHead(404).end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':'application/octet-stream');return res.end(readFileSync('public/'+name));
 }
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));
}catch(error){res.writeHead(error.code??error.status??500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage({viewport:{width:412,height:915}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
 const button=name=>page.getByRole('button',{name,exact:true}),field=name=>page.getByLabel(name,{exact:true});
 await page.getByText('No snaps yet!',{exact:true}).waitFor();assert.ok(await page.locator('.snapshot-empty').evaluate(el=>el.getBoundingClientRect().height<150));await page.screenshot({path:'.local/snapshots-empty-restored.png'});await button('Add Snapshot').click();await button('Choose photo').waitFor();
 const png=await sharp({create:{width:80,height:120,channels:3,background:'#92a883'}}).png().toBuffer();
 await page.locator('[data-snapshot-gallery]').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:png});
 await button('Try again').waitFor();assert.equal(state.progressSnapshots.length,1);assert.ok(await button('Add Snapshot').isDisabled());await button('Try again').click();await page.locator('.snapshot-card').waitFor();assert.equal(state.progressSnapshots.length,1);assert.equal(saveRequests.length,2);assert.deepEqual(saveRequests[0],saveRequests[1]);
 await button('Snapshot options').click();assert.ok((await page.getByRole('link',{name:'Download photo'}).getAttribute('href')).includes('namespace=progress_photos'));await button('Edit details').click();await field('Date').fill('2026-11-13');await field('Title').fill('Progress');await field('Caption').fill('Fixture caption');await page.getByText('Measurements',{exact:true}).click();await field('Weight').fill('70');await field('Height').fill('175');await button('Save changes').click();await page.locator('#sheet').waitFor({state:'hidden'});await page.getByText('Fixture caption',{exact:true}).waitFor();assert.equal(state.progressSnapshots[0].vitals.weight.value,70);await page.locator('.snapshot-facts').filter({hasText:'22.9'}).waitFor();
 await page.screenshot({path:'.local/snapshots-populated-restored.png'});await button('View snapshot').click();await page.locator('.snapshot-viewer img').waitFor();await button('Close').click();await button('Snapshot options').click();await button('Delete snapshot').click();await button('Keep photo').click();assert.equal(state.progressSnapshots.length,1);await button('Snapshot options').click();await button('Delete snapshot').click();await button('Delete snapshot').click();await page.getByText('No snaps yet!',{exact:true}).waitFor();assert.equal(state.progressSnapshots.length,0);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);console.log('PASS: automatic photo save, unchanged retry after committed response loss, date/caption/measurements edit, BMI, full photo, download link, delete/cancel, mobile layout');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
