import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {chromium} from 'playwright-core';
import sharp from 'sharp';
import {initialState,act} from '../server/domain/workspace.mjs';
import {normalizePhoto,validateStoredPhoto} from '../server/domain/photo-images.mjs';
import {calculateSummary} from '../server/domain/nutrition.mjs';
import {applyFastingCommand} from '../server/fasting.mjs';
import {digest} from '../server/data-codec.mjs';
import {backupManifest,backupReferences,validateBackupManifest,inspectBackup,validateBackupMedia,prepareBackupRestore,BACKUP_INSPECT_MAX_BYTES} from '../server/backup.mjs';
const date='2026-11-14',asOf='2026-11-14T12:00:00.000Z',ownerId='synthetic-account';
const png=await sharp({create:{width:20,height:24,channels:3,background:'#92a883'}}).png().toBuffer(),normalized=await normalizePhoto('data:image/png;base64,'+png.toString('base64')),photo=await validateStoredPhoto(normalized),storedPhoto={id:normalized.id,dataUrl:normalized.dataUrl};
const descriptor=namespace=>({namespace,id:photo.id,bytes:photo.bytes.length,width:photo.width,height:photo.height});
const seal=manifest=>{const {digest:ignored,...body}=manifest;return {...body,digest:digest(body)};};
function fixture(){
 const state=initialState();act(state,'food.save',{name:'Synthetic food',grams:100,serving:'100 g',nutrients:{calories:200,protein:10}});
 act(state,'entry.add',{date,foodId:state.foods[0].id,amount:0.5,group:'Lunch',time:'12:00'});
 state.entries[0].photo={id:photo.id,description:'Synthetic meal',provider:'Manual review',analysis:null};
 act(state,'note.add',{date,time:'12:00',text:'Synthetic note'});state.notes[0].imageId=photo.id;
 state.progressSnapshots.push({id:randomUUID(),imageId:photo.id,createdAt:asOf,date,title:'Synthetic snapshot',note:'Fixture',vitals:{weight:{value:70,unit:'kg'}}});
 return state;
}
const descriptors=state=>backupReferences(state).map(row=>descriptor(row.namespace));
const reviewFor=(current,manifest)=>inspectBackup(current,{manifest,revision:digest(current)},{ownerId});
const restoreInput=review=>({requestId:randomUUID(),reviewToken:review.token,confirmation:'replace'});

test('portable backup preserves source records, nutrition and all independent image namespaces',async()=>{
 const state=fixture(),before=structuredClone(state),manifest=backupManifest(state,descriptors(state),{asOf});
 assert.deepEqual(state,before);assert.equal('capabilities'in manifest.workspace,false);assert.deepEqual(manifest.media.map(row=>row.namespace),['meal_photos','note_photos','progress_photos']);
 const current=initialState(),{review,summary}=reviewFor(current,manifest),input=restoreInput(review),seen=[];
 assert.equal(summary.photos,3);assert.equal(summary.counts.entries,1);assert.equal(summary.current.counts.entries,0);assert.deepEqual(summary.range,{from:date,to:date});
 const prepared=await prepareBackupRestore(current,manifest,input,{ownerId,review,readMedia:async(namespace,id)=>{seen.push(namespace);assert.equal(id,photo.id);return storedPhoto;}});
 assert.deepEqual(prepared.state,manifest.workspace);assert.deepEqual(calculateSummary(prepared.state,date),calculateSummary(state,date));assert.deepEqual(current,initialState());assert.equal(seen.length,3);
 assert.equal(prepared.state.entries[0].id,state.entries[0].id);assert.deepEqual(prepared.state.entries[0].photo,state.entries[0].photo);
});

test('missing, duplicate, substituted and unreferenced photos cannot produce a full backup',async()=>{
 const state=fixture(),all=descriptors(state);assert.throws(()=>backupManifest(state,all.slice(1)),/every referenced/);
 assert.throws(()=>backupManifest(state,[all[0],all[0],all[2]]),/duplicate/);
 const manifest=backupManifest(state,all,{asOf});
 await assert.rejects(()=>validateBackupMedia(manifest,{namespace:'meal_photos',photo:{...storedPhoto,id:'f'.repeat(64)}}),/not part/);
 await assert.rejects(()=>validateBackupMedia(manifest,{namespace:'meal_photos',photo:{...storedPhoto,dataUrl:'data:image/jpeg;base64,eA=='}}));
 const current=initialState(),{review}=reviewFor(current,manifest),before=structuredClone(current);
 await assert.rejects(()=>prepareBackupRestore(current,manifest,restoreInput(review),{ownerId,review,readMedia:async(namespace)=>namespace==='note_photos'?null:storedPhoto}));assert.deepEqual(current,before);
});

test('digest, owner, revision and explicit confirmation bind restoration to the reviewed content',async()=>{
 const state=fixture(),manifest=backupManifest(state,descriptors(state),{asOf}),current=initialState(),{review}=reviewFor(current,manifest),input=restoreInput(review),context={ownerId,review,readMedia:async()=>storedPhoto};
 const tampered=structuredClone(manifest);tampered.workspace.notes[0].text='Changed';assert.throws(()=>validateBackupManifest(tampered),/digest/);
 await assert.rejects(()=>prepareBackupRestore(current,manifest,input,{...context,ownerId:'other-account'}),{code:409});
 await assert.rejects(()=>prepareBackupRestore(current,manifest,{...input,confirmation:'merge'},context),{code:400});
 const changed=structuredClone(current);changed.profile.name='Changed';await assert.rejects(()=>prepareBackupRestore(changed,manifest,input,context),{code:409});
 await assert.rejects(()=>prepareBackupRestore(current,seal(tampered),input,context),{code:409});
 assert.throws(()=>inspectBackup(changed,{manifest,revision:digest(current)},{ownerId}),{code:409});
});

test('account authority and unknown schemas cannot enter a restored workspace',()=>{
 const manifest=backupManifest(initialState(),[],{asOf});
 for(const [field,value]of [['ownerId','other-account'],['generation','other-generation'],['session',{secret:'synthetic'}]]){
  assert.throws(()=>validateBackupManifest(seal({...manifest,[field]:value})),{code:400});
  assert.throws(()=>validateBackupManifest(seal({...manifest,workspace:{...manifest.workspace,[field]:value}})),{code:400});
 }
 for(const field of ['profile','settings'])assert.throws(()=>validateBackupManifest(seal({...manifest,workspace:{...manifest.workspace,[field]:{...manifest.workspace[field],session:'synthetic'}}})),{code:400});
 const injected=fixture();injected.entries[0].ownerId='other-account';assert.throws(()=>backupManifest(injected,descriptors(injected)),/account or authentication/);
 const state=fixture();state.entries.push(structuredClone(state.entries[0]));assert.throws(()=>backupManifest(state,descriptors(state)),/duplicate/);
});

test('restoration reports and pauses source fasting schedules while preserving original backup',async()=>{
 const state=initialState();applyFastingCommand(state,{type:'fasting.schedule.save',payload:{id:randomUUID(),revision:0,label:'Evening',startDate:date,time:'20:00',recurrence:'daily',interval:1,days:[],untilDate:null,goalHours:16,enabled:true}},{now:new Date(asOf),timeZone:'UTC'});
 const manifest=backupManifest(state,[],{asOf}),before=structuredClone(manifest),current=initialState(),{review,summary}=reviewFor(current,manifest);
 assert.deepEqual(summary.changes,[{code:'fasting-schedules-paused',count:1}]);
 const prepared=await prepareBackupRestore(current,manifest,restoreInput(review),{ownerId,review,readMedia:async()=>{throw Error('No images expected');}});
 assert.equal(prepared.state.fastingPlan.schedules[0].enabled,false);assert.equal(prepared.state.fastingPlan.schedules[0].id,state.fastingPlan.schedules[0].id);assert.deepEqual(manifest,before);assert.equal(state.fastingPlan.schedules[0].enabled,true);
});

test('legacy normalization cannot silently change current-cloud backup records',()=>{
 const state=initialState();state.settings.bodyComposition={version:1,weightMetric:null,bodyFatMetric:null,useForResting:false,useForKeto:false};
 assert.throws(()=>backupManifest(state,[]),/source-format migration/);
});

test('a migrated workspace may omit optional snapshots without silently adding the field',async()=>{
 const state=initialState();delete state.progressSnapshots;const manifest=backupManifest(state,[],{asOf}),{review,summary}=reviewFor(state,manifest);
 assert.equal(summary.counts.progressSnapshots,0);assert.equal('progressSnapshots'in manifest.workspace,false);
 const prepared=await prepareBackupRestore(state,manifest,restoreInput(review),{ownerId,review,readMedia:async()=>{throw Error('No images');}});assert.equal('progressSnapshots'in prepared.state,false);
});

test('inspection limits the complete metadata envelope before source parsing',()=>{
 const manifest={format:'nourishing-workspace',version:1,createdAt:asOf,workspace:{padding:'x'.repeat(BACKUP_INSPECT_MAX_BYTES-200)},media:[],digest:'a'.repeat(64)};
 assert.ok(Buffer.byteLength(JSON.stringify(manifest.workspace))<BACKUP_INSPECT_MAX_BYTES);
 assert.ok(Buffer.byteLength(JSON.stringify({manifest,revision:'a'.repeat(64)}))>BACKUP_INSPECT_MAX_BYTES);
 assert.throws(()=>validateBackupManifest(manifest),{code:413});
});

test('mobile backup review precedes writes and restore retry keeps one committed replacement',async()=>{
 let current=initialState(),activeReview=null,activeManifest=null,loseResponse=true,commits=0;const staged=new Map(),receipts=new Map(),restoreRequests=[];
 const incoming=fixture(),manifest=backupManifest(incoming,descriptors(incoming),{asOf}),bundle={...manifest,media:manifest.media.map(row=>({...row,dataUrl:storedPhoto.dataUrl}))};
 const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/mobile-theme.css"><link rel="stylesheet" href="/diary.css"><link rel="stylesheet" href="/backup.css"></head><body class="discover-mobile dark"><main id="page"></main><dialog id="sheet"><div id="sheet-content"></div></dialog><script type="module">import {mountBackup} from '/backup.js';const sheet=document.querySelector('#sheet'),content=document.querySelector('#sheet-content');const close=()=>{sheet.close();content.replaceChildren();};content.onclick=e=>{if(e.target.hasAttribute('data-close'))close();};mountBackup({root:document.querySelector('#page'),content,close,header:title=>'<header class="sheet-header"><button type="button" data-close>Close</button><h2>'+title+'</h2></header>',show:html=>{content.innerHTML=html;sheet.showModal();}});</script></body></html>`;
 const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');let value;
  if(url.pathname==='/'){res.setHeader('Content-Type','text/html');return res.end(html);}
  if(url.pathname==='/api/backup/export')value={revision:digest(current),manifest:backupManifest(current,descriptors(current),{asOf})};
  else if(url.pathname==='/api/media'){assert.ok(backupReferences(current).some(row=>row.namespace===url.searchParams.get('namespace')&&row.id===url.searchParams.get('id')));res.setHeader('Content-Type','image/jpeg');return res.end(photo.bytes);}
  else if(req.method==='POST'){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const input=JSON.parse(Buffer.concat(chunks));
   if(url.pathname==='/api/backup/inspect'){const inspected=inspectBackup(current,input,{ownerId});activeReview=inspected.review;activeManifest=inspected.manifest;value={reviewToken:activeReview.token,summary:inspected.summary};}
   else if(url.pathname==='/api/backup/media'){assert.equal(input.reviewToken,activeReview.token);await validateBackupMedia(activeManifest,{namespace:input.namespace,photo:input.photo});staged.set(input.namespace+':'+input.photo.id,input.photo);value={ok:true};}
   else if(url.pathname==='/api/backup/restore'){
    restoreRequests.push(input);
    if(receipts.has(input.requestId))value=receipts.get(input.requestId);
    else{const prepared=await prepareBackupRestore(current,activeManifest,input,{ownerId,review:activeReview,readMedia:async(namespace,id)=>staged.get(namespace+':'+id)});current=prepared.state;commits++;value={ok:true,revision:digest(current)};receipts.set(input.requestId,value);}
    if(loseResponse){loseResponse=false;res.writeHead(503,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'Connection lost. Try again.'}));}
   }else throw Error('Unexpected route');
  }else{const name=url.pathname.slice(1),path=new URL('../public/'+name,import.meta.url);if(!/^[\w./-]+\.(m?js|css|svg|woff2)$/.test(name)||!existsSync(path)){res.writeHead(404).end();return;}res.setHeader('Content-Type',/\.m?js$/.test(name)?'text/javascript':name.endsWith('.css')?'text/css':'application/octet-stream');return res.end(readFileSync(path));}
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));
 }catch(error){res.writeHead(error.code??error.status??500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage({viewport:{width:412,height:915},acceptDownloads:true});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('[data-backup-file]').setInputFiles({name:'synthetic-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bundle))});
  const replace=page.getByRole('button',{name:'Replace workspace',exact:true});await replace.waitFor();assert.equal(staged.size,0);assert.equal(commits,0);assert.equal(current.entries.length,0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await replace.click();await page.getByRole('button',{name:'Try restore again',exact:true}).waitFor();assert.equal(commits,1);assert.equal(staged.size,3);
  await page.getByRole('button',{name:'Try restore again',exact:true}).click();await page.getByText('Backup restored.',{exact:true}).waitFor();assert.equal(commits,1);assert.deepEqual(restoreRequests[0],restoreRequests[1]);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download backup',exact:true}).click();const file=await download,saved=JSON.parse(readFileSync(await file.path(),'utf8'));
  assert.equal(saved.media.length,3);assert.ok(saved.media.every(row=>row.dataUrl===storedPhoto.dataUrl));const clean={...saved,media:saved.media.map(({dataUrl,...row})=>row)};assert.deepEqual(validateBackupManifest(clean).workspace,current);assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
