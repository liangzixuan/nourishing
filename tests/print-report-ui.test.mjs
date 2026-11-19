import {CHROME_EXECUTABLE} from './_chrome.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright-core';
import {createWebHandler} from '../server/http.mjs';
import {initialState,act} from '../server/domain/workspace.mjs';
import {printReportOptions,previewPrintReport} from '../server/print-report.mjs';

test('mobile report reviews immutable captures under production CSP and clears after edits, close or account change',async()=>{
 const date='2026-11-14',clock={now:new Date('2026-11-15T15:00:00Z'),timeZone:'America/Chicago'},state=initialState();let accountId='print-fixture',origin,handler;
 state.foods.push({id:'food',name:'Rice <script>bad()</script>',serving:'100 g',grams:100,nutrients:{calories:200,protein:4}});act(state,'entry.add',{date,foodId:'food',amount:1,group:'Lunch'});act(state,'note.add',{date,text:'Captured note <img src=x onerror=bad()>'});
 state.charts=[{version:2,id:'chart',name:'Calories',primary:{kind:'nutrient',id:'calories'},secondary:null,days:7,visible:true,cycleOverlay:false}];
 const service={current:async()=>({id:accountId}),printReportOptions:async()=>({...printReportOptions(state),accountId}),previewPrintReport:async(secret,input)=>({...previewPrintReport(state,input,clock),accountId})};
 const html='<!doctype html><html><head><link rel="icon" href="/favicon.svg"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/mobile-theme.css"><link rel="stylesheet" href="/diary.css"><link rel="stylesheet" href="/print-report.css"></head><body class="discover-mobile dark"><main id="page"><button data-open>Print Report</button></main><dialog id="sheet"><div id="sheet-content"></div></dialog><script type="module" src="/fixture.js"></script></body></html>';
 const script=`import {openPrintReport} from '/print-report.js';const sheet=document.querySelector('#sheet'),content=document.querySelector('#sheet-content');document.querySelector('[data-open]').onclick=()=>openPrintReport({initialOptions:{from:'${date}',to:'${date}',dayFilter:'all',includeToday:true,includeSupplements:true},show:html=>{content.innerHTML=html;sheet.showModal();},header:title=>'<header class="sheet-header"><button type="button" data-close>Close</button><h2>'+title+'</h2></header>',content});content.onclick=e=>{if(e.target.hasAttribute('data-close')){sheet.close();content.replaceChildren();}};`;
 const server=createServer(async(req,res)=>{try{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const headers=new Headers(req.headers);headers.set('Cookie','__Host-nourishing_session=fixture');
  const response=await handler(new Request(origin+req.url,{method:req.method,headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
 const assets=new Map([['/',{body:html,type:'text/html'}],['/fixture.js',{body:script,type:'text/javascript'}]]);
 const publicRoot=resolve('public');
 const fileAssets={get(path){if(assets.has(path))return assets.get(path);const file=resolve(publicRoot,'.'+path);if(!file.startsWith(publicRoot+'/')&&!file.startsWith(publicRoot+'\\'))return;const extension=extname(file);if(!['.js','.mjs','.css','.svg','.woff2'].includes(extension)||!existsSync(file))return;return {body:readFileSync(file),type:['.js','.mjs'].includes(extension)?'text/javascript':extension==='.css'?'text/css':'application/octet-stream'};}};
 handler=createWebHandler({config:{origin},service,assets:fileAssets});let browser;
 try{
  browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});const page=await browser.newPage({viewport:{width:412,height:915}});page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});await page.goto(origin);
  await page.getByRole('button',{name:'Print Report',exact:true}).click();await page.locator('[name=diary]').check();await page.locator('[name=notes]').check();await page.getByText('Diary column & charts',{exact:true}).click();await page.locator('[name="chart:chart"]').check();await page.getByRole('button',{name:'Preview',exact:true}).click();const print=page.locator('[data-print]');await print.waitFor();try{await page.waitForFunction(()=>!document.querySelector('[data-print]').disabled);}catch{throw Error(JSON.stringify({status:await page.locator('[role=status]').textContent(),errors}));}
  const frame=page.frameLocator('[data-print-frame]');assert.match(await frame.locator('body').textContent(),/Captured note <img/);assert.equal(await frame.locator('script,[style],style').count(),0);assert.equal(await frame.locator('link[rel=stylesheet]').getAttribute('href'),'/report-source/print-en.css');assert.equal(await frame.locator('h1').evaluate(el=>getComputedStyle(el).fontSize),'28px');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
  await page.locator('[data-print-frame]').evaluate(el=>{el.contentWindow.print=()=>{window.printed=el.contentDocument.body.textContent;};});state.notes[0].text='Changed after capture';await print.click();await page.waitForFunction(()=>typeof window.printed==='string');assert.match(await page.evaluate(()=>window.printed),/Captured note/);assert.doesNotMatch(await page.evaluate(()=>window.printed),/Changed after capture/);
  mkdirSync('.local',{recursive:true});await page.screenshot({path:'.local/print-report-mobile.png'});
  await page.getByRole('button',{name:'Change options',exact:true}).click();await page.locator('[name=notes]').uncheck();assert.equal(await page.locator('[data-print-frame]').count(),0);assert.equal(await print.isDisabled(),true);
  state.settings.appLanguage='fr';state.settings.energyUnit='kJ';await page.getByRole('button',{name:'Preview',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[data-print]').disabled);assert.equal(await frame.locator('html').getAttribute('lang'),'fr');assert.match(await frame.locator('body').textContent(),/kJ/);assert.equal(await frame.locator('h1').evaluate(el=>getComputedStyle(el).fontSize),'28px');
  accountId='other-account';await print.click();await page.getByText('Your account changed. Reopen the report.',{exact:true}).waitFor();assert.equal(await page.locator('[data-print-frame]').count(),0);assert.equal(await print.isDisabled(),true);
  await page.getByRole('button',{name:'Close',exact:true}).click();assert.equal(await page.locator('#sheet-content').textContent(),'');assert.deepEqual(errors,[]);
  writeFileSync('.local/print-report-ui.json',JSON.stringify({status:'passed',checks:['source capture immutable','production CSP styles loaded','English/French kJ','escaped text','option invalidation','account change clears capture','close clears capture','no horizontal overflow or browser errors']},null,2));
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
