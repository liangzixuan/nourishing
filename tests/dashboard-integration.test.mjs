import {CHROME_EXECUTABLE} from './_chrome.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {initialState} from '../server/domain/workspace.mjs';
import {dashboardView,applyDashboardCommand} from '../server/dashboard-view.mjs';

test('dashboard exposes saved health widgets, opens details and follows diary dates',async()=>{
 const state=initialState(),date='2026-11-15',context={now:new Date(date+'T18:00:00Z'),timeZone:'UTC'},writes=[];
 applyDashboardCommand(state,{type:'dashboard.widgets',payload:{patch:{energy:false,weight:false,glucose:true,cycle:true}}},context);
 state.settings.glucoseTimeline={version:1,glucose:{type:'Glucose'},insulin:null,displayUnit:'mg/dL',range:null};
 state.biometrics=[{id:'reading',date,time:'08:00',type:'Glucose',value:95,unit:'mg/dL'}];
 const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/api/dashboard'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(dashboardView(state,{date},context)));}
  if(path==='/api/workspace/command'){
   let raw='';for await(const chunk of req)raw+=chunk;const input=JSON.parse(raw);writes.push(input);
   applyDashboardCommand(state,input,context);res.setHeader('Content-Type','application/json');return res.end('{}');
  }
  if(path==='/'){res.setHeader('Content-Type','text/html');return res.end(`<link rel="stylesheet" href="/dashboard.css"><link rel="stylesheet" href="/dashboard-health-cards.css"><div class="app-shell"><header></header><main></main><nav class="app-nav" aria-label="Main navigation"><button id="diary-tab">Diary</button></nav></div><div id="sheet"></div><script type="module">import {mountDashboard} from '/dashboard.js';import {discoverHeader} from '/app-shell.js';const content=document.querySelector('#sheet');document.querySelector('#diary-tab').onclick=()=>document.body.dataset.visited='diary';let dashboard;dashboard=mountDashboard({onReady:()=>discoverHeader({root:document.querySelector('header'),tab:'dashboard',onTab:()=>{},onNews:()=>dashboard.openNews(),onSettings:()=>dashboard.openSettings()}),root:document.querySelector('main'),date:()=>'${date}',show:html=>content.innerHTML=html,close:()=>content.innerHTML='',header:title=>'<h1>'+title+'</h1>',content,onCoach:()=>document.body.dataset.coach='opened',onDiary:date=>document.body.dataset.diaryDate=date});</script>`);}
  if(!/^\/[a-zA-Z0-9_./-]+\.(?:m?js|css|json|woff2|svg)$/.test(path)||path.includes('..'))return res.writeHead(404).end();
  try{res.setHeader('Content-Type',/\.m?js$/.test(path)?'text/javascript':path.endsWith('.svg')?'image/svg+xml':path.endsWith('.json')?'application/json':path.endsWith('.woff2')?'font/woff2':'text/css');res.end(readFileSync(new URL('../public'+path,import.meta.url)));}catch{res.writeHead(404).end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});
  const page=await browser.newPage({viewport:{width:412,height:915}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.status()>=400&&!response.url().endsWith('favicon.ico'))errors.push(response.status()+' '+response.url());});
  await page.goto(`http://127.0.0.1:${server.address().port}`);try{await page.locator('[data-health-card=glucose]').waitFor();}catch(error){throw Error(JSON.stringify({errors,body:await page.locator('body').innerText()}),{cause:error});}
  await page.locator('[data-discover=streak-stats]').click();await page.getByRole('heading',{name:'All-Time Stats',exact:true}).last().waitFor();
  assert.deepEqual(await page.locator('.dc-stats dd').allTextContents(),['0','0','1','0']);await page.locator('.dc-stats summary').click();await page.locator('.dc-stats details[open]').waitFor();
  const statsNav=page.locator('#sheet nav');
  assert.equal(await statsNav.getByRole('button',{name:'Diary'}).count(),1);
  assert.equal(await statsNav.locator('[id]').count(),0);
  await statsNav.getByRole('button',{name:'Diary'}).click();
  assert.equal(await page.locator('.dc-stats').count(),0);
  assert.equal(await page.locator('body').getAttribute('data-visited'),'diary');
  await page.locator('[data-discover=health-glucose]').click();await page.locator('[data-health-date]').click();assert.equal(await page.locator('body').getAttribute('data-diary-date'),date);
  await page.locator('[data-discover=coach]').click();assert.equal(await page.locator('body').getAttribute('data-coach'),'opened');
  await page.getByRole('button',{name:'Dashboard Settings',exact:true}).click();await page.getByRole('switch',{name:'Show Glucose',exact:true}).uncheck();await page.locator('[data-health-card=glucose]').waitFor({state:'detached'});
  assert.equal(writes.length,1);assert.equal(writes[0].type,'dashboard.widgets');assert.deepEqual(writes[0].payload,{patch:{glucose:false}});
  await page.getByRole('switch',{name:'Show Glucose',exact:true}).check();await page.locator('[data-health-card=glucose]').waitFor();assert.equal(writes.length,2);
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
