import {CHROME_EXECUTABLE} from './_chrome.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {initialState} from '../server/domain/workspace.mjs';
import {applyWorkspaceCommand} from '../server/workspace-commands.mjs';
import {chartSurfaceView} from '../server/dashboard-pinned-charts.mjs';
import {digest} from '../server/data-codec.mjs';

test('custom chart source editor creates and edits canonical axes, discards drafts and recovers saves without duplicates',async()=>{
 const state=initialState(),to='2026-11-16',clock={now:new Date(to+'T12:00:00Z'),timeZone:'UTC'},commands=[],receipts=new Map();let failure=null;
 state.charts=[{version:2,id:'old',name:'Archived Weight',primary:{kind:'biometric',type:'Weight',unit:'kg'},secondary:null,days:28,visible:false,cycleOverlay:true}];
 const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost'),path=url.pathname;
  try{
   if(path==='/api/charts'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(chartSurfaceView(state,Object.fromEntries(url.searchParams),clock)));}
   if(path==='/api/workspace/command'){
    let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);commands.push(body);res.setHeader('Content-Type','application/json');
    if(receipts.has(body.requestId))return res.end(JSON.stringify(receipts.get(body.requestId)));
    if(failure==='validation'){failure=null;return res.writeHead(400).end(JSON.stringify({error:'Please review the chart name.'}));}
    if(failure==='conflict'){failure=null;return res.writeHead(409).end(JSON.stringify({error:'Your data changed. Reload the latest chart.'}));}
    assert.equal(body.revision,digest(state));applyWorkspaceCommand(state,{type:body.type,payload:body.payload});const result={ok:true,revision:digest(state)};receipts.set(body.requestId,result);
    if(failure==='serverlost'){failure=null;return res.writeHead(503).end(JSON.stringify({error:'Unable to confirm the save. Try again.'}));}return res.end(JSON.stringify(result));
   }
   if(path==='/'){res.setHeader('Content-Type','text/html');return res.end(`<link rel="stylesheet" href="/shell-source/discover.css"><link rel="stylesheet" href="/app-shell.css"><link rel="stylesheet" href="/mobile-theme.css"><link rel="stylesheet" href="/mobile-diary.css"><link rel="stylesheet" href="/diary.css"><link rel="stylesheet" href="/charts.css"><body class="discover-mobile dark"><div class="app-shell"><main id="page"></main><nav class="app-nav dc-bottom"><button id="diary-tab">Diary</button></nav></div><dialog id="sheet" aria-labelledby="sheet-title"><div id="sheet-content"></div></dialog><script type="module">import {mountCharts} from '/charts.js';const content=document.querySelector('#sheet-content'),sheet=document.querySelector('#sheet'),close=()=>{sheet.close();content.replaceChildren()};sheet.addEventListener('cancel',event=>{event.preventDefault();close()});window.navClicks=0;document.querySelector('#diary-tab').onclick=()=>window.navClicks++;window.charts=mountCharts({page:document.querySelector('#page'),date:()=>${JSON.stringify(to)},content,header:title=>'<h2 id="sheet-title">'+title+'</h2>',show:html=>{content.innerHTML=html;if(!sheet.open)sheet.showModal()},close,onChange:()=>{}});</script>`);}
   if(!/^\/[a-zA-Z0-9/_.-]+\.(?:js|mjs|css|woff2|svg)$/.test(path)||path.includes('..'))return res.writeHead(404).end();res.setHeader('Content-Type',path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':path.endsWith('.woff2')?'font/woff2':'text/javascript');res.end(readFileSync(new URL('../public'+path,import.meta.url)));
  }catch(error){res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:error.message}));}
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});const page=await browser.newPage({viewport:{width:412,height:915}}),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));await page.goto(`http://127.0.0.1:${server.address().port}`);let dropReply=false;await page.route('**/api/workspace/command',async route=>{if(!dropReply)return route.continue();dropReply=false;await route.fetch();await route.abort('failed');});
  const axis=name=>page.locator(`[data-mce-axis=${name}]`),pick=async(name,field)=>axis(name).locator(`[data-mce-pick=${field}]`).click(),choose=async(label)=>page.locator('.mce-metric-picker').getByRole('button',{name:label,exact:true}).click();
  await page.locator('[data-create]').click();await page.getByRole('heading',{name:'Create Custom Chart'}).waitFor();assert.equal(await page.getByLabel('Chart Name',{exact:true}).inputValue(),'Weight');assert.equal(await page.getByLabel('Chart days').count(),0);
  await pick('primary','metric');await page.getByRole('searchbox',{name:'Search',exact:true}).fill('no such metric');await page.getByText('No matches',{exact:true}).waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('.mce-metric-picker').count(),0);assert.equal(await page.locator('#sheet').evaluate(node=>node.open),true);
  await axis('primary').getByRole('button',{name:'Nutrient',exact:true}).click();await pick('primary','metric');
  const picker=page.locator('.mce-metric-picker'),choices=picker.locator('[data-mce-choice]');
  const labels=await choices.allTextContents(),center=labels.indexOf('Energy (Consumed)');
  assert.deepEqual(labels.slice(center-8,center+9),['Carbs (Net)','Carbs (Total)','Cholesterol','Choline','Chromium','Copper','Cystine','Delta Tocopherol','Energy (Consumed)','Fat','Fat (Monounsaturated)','Fat (Polyunsaturated)','Fat (Saturated)','Fat (Trans)','Fiber','Fiber (Insoluble)','Fiber (Soluble)']);
  assert.equal(await picker.getByRole('button',{name:'Energy (Consumed)',pressed:true}).count(),1);
  await picker.getByRole('searchbox').fill('food-data completeness');assert.ok(await choices.count()>1);
  await picker.getByRole('searchbox').fill('');await choose('Carbs (Net)');
  assert.deepEqual(JSON.parse(await page.locator('[name=primary]').inputValue()),{kind:'carbohydrate',mode:'net'});
  await axis('primary').getByRole('button',{name:'Score',exact:true}).click();await pick('primary','metric');
  assert.deepEqual(await choices.allTextContents(),['All Targets','Vitamins','Minerals','Electrolytes','Antioxidants','Immune Support','Metabolism','Bone Health','Blood Health','Oral Health','Data Quality','Ketogenic Score','Plant-Based Diet',"Women's Health","Men's Health"]);
  await picker.getByRole('button',{name:'More metrics'}).click();assert.ok(await choices.count()>15);
  assert.ok(await picker.evaluate(el=>el.getBoundingClientRect().bottom<=document.querySelector('.mobile-chart-editor .app-nav').getBoundingClientRect().top+1));
  await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  assert.deepEqual(JSON.parse(await page.locator('[name=primary]').inputValue()),{kind:'score',id:'vitamins'});
  assert.equal(await axis('primary').locator('[data-mce-pick=metric]').evaluate(el=>el===document.activeElement),true);
  await axis('primary').getByRole('button',{name:'Biometric',exact:true}).click();
  assert.deepEqual(JSON.parse(await page.locator('[name=primary]').inputValue()),{kind:'biometric',type:'weight',unit:'kg'});
  await pick('primary','unit');assert.deepEqual(await choices.allTextContents(),['kg','lbs','st']);await choose('lbs');await page.getByRole('button',{name:'Add Right Y-Axis',exact:true}).click();
  await axis('secondary').getByRole('button',{name:'Score',exact:true}).click();assert.equal(await axis('secondary').locator('[data-mce-pick=unit]').count(),0);await pick('secondary','metric');await page.locator('.mce-picker-choices button').first().click();
  await page.getByLabel('Chart Name',{exact:true}).fill('My custom chart');await axis('secondary').getByRole('button',{name:'Nutrient',exact:true}).click();await pick('secondary','metric');await page.getByRole('searchbox',{name:'Search',exact:true}).fill('Protein');await choose('Protein');assert.equal(await page.getByLabel('Chart Name',{exact:true}).inputValue(),'My custom chart');
  await page.getByRole('button',{name:'Remove right axis',exact:true}).click();assert.equal(await axis('secondary').count(),0);await page.getByRole('button',{name:'Add Right Y-Axis',exact:true}).click();await pick('secondary','metric');await page.getByRole('searchbox',{name:'Search',exact:true}).fill('Heart Rate');await choose('Heart Rate');
  mkdirSync('.local/custom-chart',{recursive:true});await page.screenshot({path:'.local/custom-chart/dual-axis.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  failure='validation';await page.getByRole('button',{name:'Save Chart',exact:true}).click();await page.getByRole('alert').filter({hasText:'review the chart name'}).waitFor();assert.equal(state.charts.length,1);assert.equal(await page.getByLabel('Chart Name',{exact:true}).inputValue(),'My custom chart');assert.equal(await page.getByLabel('Chart Name',{exact:true}).isEnabled(),true);
  dropReply=true;await page.getByRole('button',{name:'Save Chart',exact:true}).click();await page.getByRole('button',{name:'Try again',exact:true}).waitFor();assert.equal(state.charts.length,2);assert.equal(await page.getByLabel('Chart Name',{exact:true}).isDisabled(),true);await page.getByRole('button',{name:'Try again',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#sheet').open);assert.equal(state.charts.length,2);assert.deepEqual(commands.at(-1),commands.at(-2));const saved=state.charts[1];assert.deepEqual(saved.primary,{kind:'biometric',type:'weight',unit:'lbs'});assert.deepEqual(saved.secondary,{kind:'biometric',type:'heart rate',unit:'bpm'});assert.equal(saved.days,7);assert.equal(saved.name,'My custom chart');
  await page.locator('[data-chart-open="custom:'+saved.id+'"]').click();await page.getByRole('button',{name:'Edit Chart',exact:true}).click();await page.getByLabel('Chart Name',{exact:true}).fill('Renamed after save');failure='serverlost';await page.getByRole('button',{name:'Save Chart',exact:true}).click();await page.getByRole('button',{name:'Try again',exact:true}).waitFor();assert.equal(state.charts[1].name,'Renamed after save');assert.equal(await page.getByLabel('Chart Name',{exact:true}).isDisabled(),true);await page.getByRole('button',{name:'Try again',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#sheet').open);assert.deepEqual(commands.at(-1),commands.at(-2));assert.equal(state.charts.length,2);
  // Cancelling or navigating never persists the transient new chart.
  const count=commands.length;await page.locator('[data-create]').click();await page.getByLabel('Chart Name',{exact:true}).fill('Discard');await page.getByRole('button',{name:'Back',exact:true}).click();assert.equal(commands.length,count);
  await page.getByRole('button',{name:'Manage Charts',exact:true}).click();await page.locator('[data-create-chart]').click();await page.getByRole('button',{name:'Back',exact:true}).click();await page.locator('[data-chart-manager]').waitFor();
  // Editing preserves exact historical source, hidden visibility and cycle preferences.
  await page.locator('[data-manage-chart="custom:old"]').click();assert.equal(await page.locator('input[name=primary]').inputValue(),JSON.stringify(state.charts[0].primary));await page.getByLabel('Chart Name',{exact:true}).fill('Edited archive');await pick('primary','unit');await page.mouse.click(1,1);assert.equal(await page.locator('.mce-metric-picker').count(),0);
  failure='conflict';await page.getByRole('button',{name:'Save Chart',exact:true}).click();await page.getByRole('button',{name:'Reload latest chart',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Save Chart',exact:true}).isDisabled(),true);await page.getByRole('button',{name:'Reload latest chart',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[name=name]')?.value==='Archived Weight');await page.getByLabel('Chart Name',{exact:true}).fill('Edited archive');await page.getByRole('button',{name:'Save Chart',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#sheet').open);assert.deepEqual(state.charts[0],{version:2,id:'old',name:'Edited archive',primary:{kind:'biometric',type:'Weight',unit:'kg'},secondary:null,days:28,visible:false,cycleOverlay:true});
  await page.getByRole('button',{name:'Manage Charts',exact:true}).click();const managed=page.locator('[data-manage-chart="custom:old"]');await page.setViewportSize({width:412,height:700});await page.locator('#sheet').evaluate(el=>{el.scrollTop=el.scrollHeight;});
  const depth=await page.locator('#sheet').evaluate(el=>el.scrollTop);assert.ok(depth>0);
  await managed.click();await page.getByRole('button',{name:'Back',exact:true}).click();
  assert.equal(await page.locator('#sheet').evaluate(el=>el.scrollTop),depth);assert.equal(await managed.evaluate(el=>el===document.activeElement),true);
  await managed.click();
  await page.getByRole('button',{name:'Delete Chart',exact:true}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(state.charts.length,2);await page.getByRole('button',{name:'Delete Chart',exact:true}).click();await page.getByRole('dialog',{name:'Delete Chart',exact:true}).getByRole('button',{name:'Yes',exact:true}).click();await page.locator('[data-chart-manager]').waitFor();assert.equal(await page.locator('[data-manage-chart="custom:old"]').count(),0);assert.equal(state.charts.length,1);await page.keyboard.press('Escape');
  await page.locator('[data-create]').click();await page.locator('.mobile-chart-editor [data-mce-nav]').click();assert.equal(await page.evaluate(()=>window.navClicks),1);assert.equal(await page.locator('#sheet').evaluate(node=>node.open),false);
  await page.locator('[data-create]').click();await pick('primary','metric');await page.evaluate(()=>window.charts.dispose());assert.equal(await page.locator('.mce-metric-picker').count(),0);assert.deepEqual(errors,[]);
 }catch(error){console.error('Editor failure:',await browser?.contexts()[0]?.pages()[0]?.evaluate(()=>document.querySelector('[data-mce-error]')?.textContent));console.error('Commands:',JSON.stringify(commands));throw error;}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
