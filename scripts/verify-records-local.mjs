// Production record editor + source domain; this in-memory fixture does not validate Appwrite.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {initialState,act} from '../server/domain/workspace.mjs';
import {digest} from '../server/data-codec.mjs';
import {applyRecordCommand} from '../server/record-commands.mjs';
import {applyNotePhotoCommand} from '../server/note-photos.mjs';
import {recordOptions,recordView,exerciseSearch,exerciseEstimateView} from '../server/record-views.mjs';
const date='2026-11-14',state=initialState();state.profile.weight=80;state.biometrics.push({id:'imported',date,time:'08:00',type:'Weight',unit:'kg',value:80,source:{kind:'health-connect'}});
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/mobile-theme.css"><link rel="stylesheet" href="/diary.css"><link rel="stylesheet" href="/records.css"><link rel="stylesheet" href="/note-photos.css"></head><body class="discover-mobile dark"><button id="add">Add</button><main id="page"></main><dialog id="sheet"><div id="sheet-content"></div></dialog><script type="module">
import {mountRecordMenu,mountRecordEditor} from '/records.js';const sheet=document.querySelector('#sheet'),content=document.querySelector('#sheet-content'),page=document.querySelector('#page'),header=title=>'<header class="sheet-header"><button type="button" data-close>Close</button><h2>'+title+'</h2></header>',show=html=>{content.innerHTML=html;if(!sheet.open)sheet.showModal();},close=()=>{sheet.close();content.replaceChildren();};content.onclick=e=>{if(e.target.hasAttribute('data-close'))close();};
const open=(kind,record)=>mountRecordEditor({kind,record,date:'${date}',show,close,header,content,onChange:load});document.querySelector('#add').onclick=()=>mountRecordMenu({show,header,content,onPick:open});
async function load(){const data=await(await fetch('/fixture')).json();page.replaceChildren();for(const [kind,rows]of [['exercise',data.entries],['biometric',data.biometrics],['note',data.notes]])for(const record of rows){const button=document.createElement('button');button.textContent=record.name??record.type??record.text;button.dataset.recordId=record.id;button.onclick=()=>open(kind,record);page.append(button);}}load();</script></body></html>`;
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),q=Object.fromEntries(url.searchParams);let value;
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html');return res.end(html);}
 if(url.pathname==='/fixture')value=state;
 else if(url.pathname==='/api/records/options')value=recordOptions(state,q.date);
 else if(url.pathname==='/api/records/item')value=recordView(state,q);
 else if(url.pathname==='/api/records/exercises')value=exerciseSearch({...q,offset:Number(q.offset??0)});
 else if(url.pathname==='/api/records/exercise-estimate')value=exerciseEstimateView(state,{...q,minutes:Number(q.minutes)});
 else if(url.pathname==='/api/note-photos/save'){const chunks=[];for await(const chunk of req)chunks.push(chunk);const input=JSON.parse(Buffer.concat(chunks));assert.equal(input.revision,digest(state));const {requestId,revision,...payload}=input;applyNotePhotoCommand(state,{type:'note.photo.save',payload});value={revision:digest(state)};}
 else if(url.pathname==='/api/workspace/command'){const chunks=[];for await(const chunk of req)chunks.push(chunk);const input=JSON.parse(Buffer.concat(chunks));assert.equal(input.revision,digest(state));const handled=applyRecordCommand(state,input);if(!handled.handled)act(state,input.type,input.payload);value={revision:digest(state)};}
 else{const name=url.pathname.slice(1);if(!/^[\w.-]+\.(js|css|svg|woff2)$/.test(name)||!existsSync('public/'+name)){res.writeHead(404).end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'application/octet-stream');return res.end(readFileSync('public/'+name));}
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));
 }catch(error){res.writeHead(error.status??500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage({viewport:{width:412,height:915}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
 const button=name=>page.getByRole('button',{name,exact:true}),field=name=>page.getByLabel(name,{exact:true}),add=async kind=>{await button('Add').click();await button(kind).click();},save=async label=>{await button(label).click();await page.locator('#sheet').waitFor({state:'hidden'});};
 await add('Exercise');await button('Custom exercise').click();await field('Exercise').fill('Fixture walk');await field('Minutes').fill('30');await field('Calories (kcal)').fill('150');await save('Add to diary');assert.equal(state.entries[0].caloriesBurned,150);
 await button('Fixture walk').click();await field('Minutes').fill('45');await field('Calories (kcal)').fill('200');await save('Save changes');assert.equal(state.entries[0].duration,45);
 const activity=exerciseSearch({q:'walking'}).items.find(row=>!row.conflict);await add('Exercise');await field('Search exercises').fill(activity.description);await button(activity.description).click();await page.locator('.record-estimate strong').waitFor();await save('Add to diary');assert.ok(state.entries[1].exerciseBasis);
 await add('Biometric');await field('Biometric').selectOption('catalog:blood-pressure');await field('Systolic').fill('120');await field('Diastolic').fill('80');await save('Add to diary');assert.equal(state.biometrics.length,3);
 await add('Biometric');await field('Biometric').selectOption('__new__');await field('Name').fill('Recovery check');await field('Value').fill('4');await field('Unit').fill('points');await save('Add to diary');assert.deepEqual(state.settings.customBiometrics,[{name:'Recovery check',unit:'points'}]);
 await button('Recovery check').click();await field('Value').fill('7');await save('Save changes');assert.equal(state.biometrics.at(-1).value,7);
 await button('Recovery check').click();await button('Delete').click();await save('Delete record');assert.equal(state.biometrics.length,3);
 await button('Weight').click();await page.locator('.record-disabled').filter({hasText:'source app'}).waitFor();assert.equal(await button('Save changes').count(),0);await button('Close').click();
 await add('Note');await field('Note').fill('Before');await save('Save');await button('Before').click();await field('Note').fill('After');await save('Save');assert.equal(state.notes[0].text,'After');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);console.log('PASS: exercise manual/catalog/edit, paired/custom biometric add/edit/delete, source-linked read-only, note correction, mobile layout');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
