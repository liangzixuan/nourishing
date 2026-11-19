import {CHROME_EXECUTABLE} from './_chrome.mjs';
import {barcodeAssets} from '../scripts/package-barcode-assets.mjs';
const packagedAssets=new Map((await barcodeAssets()).map(asset=>['/'+asset.path,asset]));
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {initialState} from '../server/domain/workspace.mjs';
import {dashboardView} from '../server/dashboard-view.mjs';
import {reportView} from '../server/nutrition-views.mjs';
import {coachView,coachAnswer} from '../server/coach-view.mjs';

test('Discover opens Coach and follows its selected date into Report and Suggest Food',async()=>{
 const state=initialState(),day='2026-11-15',selected='2026-11-14',context={now:new Date(day+'T18:00:00Z'),timeZone:'UTC'},requests=[],reportRanges=[];
 const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost'),path=url.pathname;
  if(packagedAssets.has(path)){const asset=packagedAssets.get(path);res.setHeader('Content-Type',asset.type);return res.end(asset.body);}
  if(path==='/'){res.setHeader('Content-Type','text/html');return res.end(`<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/dashboard.css"><link rel="stylesheet" href="/coach.css"><main></main><aside></aside><script type="module">import {mountNutrition} from '/nutrition.js';const content=document.querySelector('aside');window.mount=mountNutrition({page:document.querySelector('main'),mode:'discover',date:()=>'${day}',show:html=>content.innerHTML=html,close:()=>content.replaceChildren(),header:title=>'<h1>'+title+'</h1>',content,onChange:async()=>{},onSuggest:date=>document.body.dataset.suggest=date});</script>`);}
  if(path.startsWith('/api/')){
   requests.push(path);res.setHeader('Content-Type','application/json');
   if(path==='/api/dashboard')return res.end(JSON.stringify(dashboardView(state,{date:day},context)));
   if(path==='/api/nutrition-report'){const options=Object.fromEntries(url.searchParams);reportRanges.push({from:options.from,to:options.to});for(const key of ['includeToday','includeSupplements'])options[key]=options[key]==='true';return res.end(JSON.stringify(reportView(state,options,context)));}
   if(path==='/api/coach/preferences')return res.end(JSON.stringify(coachView(state)));
   if(path==='/api/coach/answer'){let raw='';for await(const chunk of req)raw+=chunk;return res.end(JSON.stringify(coachAnswer(state,JSON.parse(raw))));}
   throw Error('Unexpected API '+path);
  }
  if(!/^\/[a-zA-Z0-9_./-]+\.(?:m?js|css|json|woff2)$/.test(path)||path.includes('..'))return res.writeHead(404).end();
  res.setHeader('Content-Type',/\.m?js$/.test(path)?'text/javascript':path.endsWith('.json')?'application/json':path.endsWith('.woff2')?'font/woff2':'text/css');res.end(readFileSync(new URL('../public'+path,import.meta.url)));
 }catch(error){res.writeHead(500).end(JSON.stringify({error:error.message}));}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});const page=await browser.newPage({viewport:{width:412,height:915}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('[data-discover=coach]').click();await page.getByRole('heading',{name:'Energy balance'}).waitFor();
  await page.locator('aside input[type=date]').fill(selected);await page.getByRole('button',{name:'Show records',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[data-coach-report]').disabled);await page.getByRole('button',{name:'View full report',exact:true}).click();
  await page.locator('[data-tab=report][aria-current=page]').waitFor();await page.locator('.mobile-report-toolbar').waitFor();assert.deepEqual(reportRanges.at(-1),{from:selected,to:selected});assert.equal(await page.locator('aside').textContent(),'');
  await page.locator('[data-tab=dashboard]').click();await page.locator('[data-discover=coach]').click();await page.getByRole('heading',{name:'Energy balance'}).waitFor();await page.locator('aside input[type=date]').fill(selected);await page.getByRole('button',{name:'Show records',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[data-coach-suggest]').disabled);await page.getByRole('button',{name:'Suggest food',exact:true}).click();
  assert.equal(await page.locator('body').getAttribute('data-suggest'),selected);assert.equal(await page.locator('aside').textContent(),'');assert.deepEqual(errors,[]);assert.ok(requests.every(path=>['/api/dashboard','/api/nutrition-report','/api/coach/preferences','/api/coach/answer'].includes(path)));await page.evaluate(()=>window.mount.dispose());
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
