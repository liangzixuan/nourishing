import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {initialState} from '../server/domain/workspace.mjs';
import {createDashboardView} from '../server/domain/dashboard.mjs';
import {projectDashboardSettings} from '../server/domain/dashboard-settings.mjs';
import {projectDashboardHealthCards} from '../server/dashboard-health-cards.mjs';

test('mobile health cards open read-only details, page readings and navigate to the recorded diary date',async()=>{
 const state=initialState(),settings=projectDashboardSettings();state.settings.dashboard={...settings,widgets:{...settings.widgets,glucose:true,cycle:true}};state.settings.glucoseTimeline={version:1,glucose:{type:'Glucose'},insulin:null,displayUnit:'mg/dL',range:null};
 state.biometrics=Array.from({length:51},(_,i)=>({id:'r'+i,date:'2026-11-14',time:`${String(Math.floor(i/60)).padStart(2,'0')}:${String(i%60).padStart(2,'0')}`,type:'Glucose',value:90+i,unit:'mg/dL',source:{provider:'Test meter'}}));
 const health=projectDashboardHealthCards(createDashboardView(state,{from:'2026-11-01',to:'2026-11-15'},{now:new Date('2026-11-15T12:00:00Z'),timeZone:'UTC'})),requests=[];
 const server=createServer((req,res)=>{requests.push(req.method+' '+req.url);const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/'){res.setHeader('Content-Type','text/html');return res.end(`<link rel="stylesheet" href="/dashboard-health-cards.css"><main></main><div id="sheet"></div><script type="module">import {dashboardHealthCardsMarkup,openDashboardHealthCard} from '/dashboard-health-cards.js';const health=${JSON.stringify(health)},root=document.querySelector('main'),content=document.querySelector('#sheet');root.innerHTML=dashboardHealthCardsMarkup(health);root.onclick=event=>{const action=event.target.closest('[data-discover]')?.dataset.discover;if(action)openDashboardHealthCard(action.replace('health-',''),health,{show:html=>content.innerHTML=html,header:title=>'<h1>'+title+'</h1>',content,close:()=>content.innerHTML='',onDiary:date=>document.body.dataset.diaryDate=date});};</script>`);}
  if(!['/dashboard-health-cards.js','/dashboard-health-cards.css','/html.js'].includes(path))return res.writeHead(404).end();res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':'text/css');res.end(readFileSync(new URL('../public'+path,import.meta.url)));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage({viewport:{width:412,height:915}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('[data-discover=health-glucose]').click();assert.equal(await page.locator('#sheet .dc-health-readings li').count(),50);await page.getByRole('button',{name:'Next',exact:true}).click();assert.equal(await page.locator('#sheet .dc-health-readings li').count(),1);await page.getByRole('button',{name:'Previous',exact:true}).click();assert.equal(await page.locator('#sheet .dc-health-readings li').count(),50);
  await page.locator('#sheet [data-health-date]').first().click();assert.equal(await page.locator('body').getAttribute('data-diary-date'),'2026-11-14');assert.equal(await page.locator('#sheet').textContent(),'');
  await page.locator('[data-discover=health-cycle]').click();await page.locator('#sheet').getByText('No cycle observations',{exact:true}).waitFor();assert.deepEqual(errors,[]);assert.equal(requests.some(row=>!row.startsWith('GET ')),false);assert.equal(requests.some(row=>row.includes('/api/')),false);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
