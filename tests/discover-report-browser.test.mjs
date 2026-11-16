import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {initialState} from '../server/domain/workspace.mjs';
import {reportView} from '../server/nutrition-views.mjs';
import {chartSurfaceView} from '../server/dashboard-pinned-charts.mjs';
import {dashboardView} from '../server/dashboard-view.mjs';

const date='2026-11-15',clock={now:new Date(date+'T18:00:00Z'),timeZone:'UTC'};
test('Report All Time uses source record dates and the canonical 3660-day bound',()=>{
 const state=initialState(),options={from:date,to:date,dayFilter:'all',includeToday:true,includeSupplements:true};
 assert.deepEqual(reportView(state,options,clock).availableRange,{from:date,to:date});
 state.notes.push({id:'old',date:'2026-01-10',text:'Fixture'});
 state.water=[{id:'future',date:'2027-01-10',amount:250}];
 assert.deepEqual(reportView(state,options,clock).availableRange,{from:'2026-01-10',to:date});
 state.notes[0].date='2000-01-01';
 const range=reportView(state,options,clock).availableRange;
 assert.equal((Date.parse(range.to)-Date.parse(range.from))/86400000+1,3660);
});

test('Discover headers route Newsfeed and settings per tab; source Report renders and applies options',async()=>{
 const state=initialState(),requests=[];
 state.foods=[{id:'oats',name:'Fixture oats',serving:'100 g',grams:100,nutrients:{calories:389,protein:16.9,carbs:66.3,fat:6.9}}];
 state.entries=[{id:'entry',foodId:'oats',date,time:'12:00',amount:1,group:'Lunch',kind:'food'}];
 const server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://fixture'),path=url.pathname;
   res.setHeader('Content-Type','application/json');
   if(path==='/api/nutrition-report'){const options=Object.fromEntries(url.searchParams);options.includeToday=options.includeToday==='true';options.includeSupplements=options.includeSupplements==='true';requests.push(options);return res.end(JSON.stringify(reportView(state,options,clock)));}
   if(path==='/api/dashboard')return res.end(JSON.stringify({...dashboardView(state,{date},clock),news:{version:1,items:[{id:'fixture-news',title:'Fixture News',body:'Header action test.'}]}}));
   if(path==='/api/charts')return res.end(JSON.stringify(chartSurfaceView(state,Object.fromEntries(url.searchParams),clock)));
   if(path==='/api/snapshots')return res.end(JSON.stringify({items:[],revision:'fixture'}));
   if(path==='/'){
    res.setHeader('Content-Type','text/html');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'");
    return res.end('<link rel="stylesheet" href="/mobile-theme.css"><link rel="stylesheet" href="/diary.css"><link rel="stylesheet" href="/shell-source/discover.css"><link rel="stylesheet" href="/app-shell.css"><link rel="stylesheet" href="/report-mobile.css"><link rel="stylesheet" href="/charts.css"><body class="discover-mobile dark discover-home"><header id="header" class="app-header topbar"></header><main></main><dialog id="sheet"><div></div></dialog><script type="module" src="/fixture.js"></script>');
   }
   if(path==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(`import {mountNutrition} from '/nutrition.js';const sheet=document.querySelector('#sheet'),content=sheet.querySelector('div');const close=()=>{sheet.close();content.replaceChildren()};sheet.addEventListener('click',event=>{if(event.target.closest('[data-close]'))close()});window.panel=mountNutrition({page:document.querySelector('main'),headerRoot:document.querySelector('#header'),mode:'discover',initialTab:'report',date:()=>'${date}',header:title=>'<h2>'+title+'</h2><button type="button" data-close>Close</button>',show:html=>{content.innerHTML=html;if(!sheet.open)sheet.showModal()},close,content,onChange:async()=>{}});`);}
   if(!/^\/[a-zA-Z0-9/_.-]+\.(?:js|mjs|css|svg|woff2)$/.test(path)||path.includes('..'))return res.writeHead(404).end();
   res.setHeader('Content-Type',/\.m?js$/.test(path)?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'font/woff2');res.end(readFileSync(new URL('../public'+path,import.meta.url)));
  }catch(error){res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:error.message}));}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage({viewport:{width:412,height:915}}),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',error=>{errors.push(error.message);console.error(error.message)});page.on('console',message=>{if(message.text().includes('Content Security Policy'))errors.push(message.text());});
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('.mobile-report-toolbar').waitFor();await page.waitForFunction(()=>Object.keys(window.Chart?.instances??{}).length===2);
  assert.equal(await page.locator('[data-report-energy-kind=consumed]').count(),1);assert.equal(await page.locator('[data-report-energy-kind=expenditure]').count(),1);assert.ok(await page.locator('[data-mobile-category]').count()>3);assert.equal(await page.locator('.report-filters').count(),0);
  assert.equal(await page.locator('[data-report-energy-kind=consumed] .report-energy-center strong').textContent(),'389');
  await page.screenshot({path:'.local/report-source-with-data.png',fullPage:true});
  await page.getByRole('button',{name:'Report Settings',exact:true}).click();await page.getByRole('dialog',{name:'Report Settings',exact:true}).waitFor();
  await page.route('**/api/nutrition-report?*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Report unavailable. Try again.'})}),{times:1});
  await page.getByRole('switch',{name:'Include Supplements'}).click();await page.getByRole('alert').filter({hasText:'Report unavailable'}).waitFor();assert.equal(await page.getByRole('switch',{name:'Include Supplements'}).isChecked(),true);assert.equal(await page.locator('[data-report-energy-kind=consumed] .report-energy-center strong').textContent(),'389');
  await page.getByRole('combobox',{name:'Days Displayed'}).selectOption('complete');await page.waitForFunction(()=>!document.querySelector('[name=dayFilter]').disabled);assert.equal(requests.at(-1).dayFilter,'complete');
  await page.getByRole('switch',{name:'Include Supplements'}).uncheck();await page.waitForFunction(()=>!document.querySelector('[name=includeSupplements]').disabled);assert.equal(requests.at(-1).includeSupplements,false);
  await page.locator('[data-report-action=dates]').last().click();await page.getByRole('button',{name:'Today',exact:true}).click();await page.locator('[data-mobile-report=dates]').waitFor({state:'detached'});assert.equal(requests.at(-1).from,date);
  await page.locator('[data-report-action=dates]').last().click();await page.getByRole('button',{name:'Custom Range',exact:true}).click();await page.getByLabel('From',{exact:true}).fill('2026-11-13');await page.getByLabel('To',{exact:true}).fill(date);await page.getByRole('button',{name:'Apply',exact:true}).click();await page.locator('[data-mobile-report=custom]').waitFor({state:'detached'});assert.equal(requests.at(-1).from,'2026-11-13');
  await page.keyboard.press('Escape');await page.locator('[data-mobile-report=settings]').waitFor({state:'detached'});
  await page.getByRole('button',{name:'Newsfeed',exact:true}).click();await page.getByText('Fixture News',{exact:true}).waitFor();await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:'Charts',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[aria-label="Manage Charts"]').disabled);await page.getByRole('button',{name:'Manage Charts',exact:true}).first().click();await page.getByRole('heading',{name:'Manage Charts',exact:true}).waitFor();await page.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:'Newsfeed',exact:true}).click();await page.getByText('Fixture News',{exact:true}).waitFor();await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:'Snapshots',exact:true}).click();assert.equal(await page.locator('#header [data-discover=shell-settings]').count(),0);assert.equal(await page.getByRole('button',{name:'Newsfeed',exact:true}).count(),1);
  await page.getByRole('button',{name:'Report',exact:true}).click();await page.locator('.mobile-report-toolbar').waitFor();await page.waitForFunction(()=>Object.keys(window.Chart?.instances??{}).length===2);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await page.screenshot({path:'.local/report-source-restored.png',fullPage:true});
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
