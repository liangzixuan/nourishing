import {CHROME_EXECUTABLE} from './_chrome.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {createHandler} from '../server/http.mjs';
import {initialState,act} from '../server/domain/workspace.mjs';
import {csvReport} from '../server/chart-view.mjs';

test('CSV panel downloads grouped account-unit reports and cancels without a late download',async()=>{
 const state=initialState(),day='2026-11-16';state.settings.energyUnit='kJ';const food=act(state,'food.save',{name:'Oats',grams:100,serving:'100 g',nutrients:{calories:100}});act(state,'entry.add',{date:day,foodId:food.id,amount:1,group:'Breakfast'});
 const assets=new Map();for(const name of readdirSync('public',{recursive:true}))if(/\.(html|js|mjs|css|svg|woff2)$/.test(name)&&statSync('public/'+name).isFile())assets.set('/'+name.replaceAll('\\','/'),{body:readFileSync('public/'+name),type:/\.m?js$/.test(name)?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':name.endsWith('.woff2')?'font/woff2':'text/html'});
 assets.set('/',{body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/diary.css"><dialog id="sheet"><div id="content"></div></dialog><script type="module" src="/fixture.js"></script>',type:'text/html'});
 assets.set('/fixture.js',{body:`import {openExport} from '/charts.js';const sheet=document.querySelector('#sheet'),content=document.querySelector('#content');window.csp=[];document.addEventListener('securitypolicyviolation',e=>window.csp.push(e.violatedDirective));window.openPanel=()=>openExport({date:()=>'${day}',content,header:title=>'<h2>'+title+'</h2>',show:html=>{content.innerHTML=html;sheet.showModal()}});window.openPanel();`,type:'text/javascript'});
 let handler,browser,release,delay=false;const inputs=[];const service={exportReport:async(_,input)=>{inputs.push(input);if(delay)await new Promise(r=>release=r);return csvReport(state,input);}};
 const server=createServer((req,res)=>handler(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;handler=createHandler({config:{origin},service,assets});
 try{browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});const context=await browser.newContext({viewport:{width:412,height:915},extraHTTPHeaders:{Cookie:'__Host-nourishing_session=fixture'}}),page=await context.newPage(),errors=[],downloads=[];page.on('pageerror',e=>errors.push(e.message));page.on('download',d=>downloads.push(d));page.setDefaultTimeout(10000);await page.goto(origin);
  await page.getByLabel('Include diary groups').check();const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download CSV'}).click();const file=await download;await page.getByText('CSV ready.',{exact:true}).waitFor();const bytes=readFileSync(await file.path(),'utf8');assert.match(bytes,/calories \[kJ\]/);assert.match(bytes,/,group,Breakfast,/);assert.equal(inputs[0].includeGroups,true);
  await page.getByLabel('Export report').selectOption('notes');assert.equal(await page.getByLabel('Include diary groups').isVisible(),false);delay=true;await page.getByRole('button',{name:'Download CSV'}).click();await page.getByText('Preparing CSV…',{exact:true}).waitFor();await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByText('Cancelled.',{exact:true}).waitFor();assert.equal(Object.hasOwn(inputs[1],'includeGroups'),false);release();
  delay=false;const third=page.waitForEvent('download');await page.getByRole('button',{name:'Download CSV'}).click();await third;await page.getByText('CSV ready.',{exact:true}).waitFor();assert.equal(downloads.length,2);
  delay=true;await page.getByRole('button',{name:'Download CSV'}).click();await page.getByText('Preparing CSV…',{exact:true}).waitFor();await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#sheet').open);release();await page.evaluate(()=>window.openPanel());assert.equal(await page.locator('[role=status]').textContent(),'');assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.csp),[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }finally{release?.();await browser?.close();await new Promise(r=>server.close(r));}
});
