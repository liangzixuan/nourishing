import {buildLocalCharts} from '../scripts/package-local-charts.mjs';
await buildLocalCharts();
import {CHROME_EXECUTABLE} from './_chrome.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {initialState,act} from '../server/domain/workspace.mjs';
import {dashboardView} from '../server/dashboard-view.mjs';
import {chartSurfaceView} from '../server/dashboard-pinned-charts.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';
import {createWebHandler} from '../server/http.mjs';

test('source chart details share plots, immediate controls, child cancellation and safe retries across Charts and Dashboard',async()=>{
 const to='2026-11-15',clock={now:new Date(to+'T18:00:00Z'),timeZone:'UTC'},seed=initialState();
 seed.charts=[{version:2,id:'weight',name:'Archived weight',primary:{kind:'biometric',type:'weight',unit:'kg'},secondary:null,days:7,visible:true,cycleOverlay:true}];
 seed.biometrics=[{id:'w1',date:to,time:'10:00',type:'weight',value:70,unit:'kg'}];
 seed.biometrics.push({id:'legacy-stage',date:to,type:'Sleep Deep',unit:'h',value:9});
 const fixture=diaryStoreFixture(seed),store=createWorkspaceStore(fixture.db,'fixture'),state=()=>fixture.state(),context={owner:'fixture',asOf:clock.now.toISOString(),timeZone:'UTC'},attempts=[];
 let commandWait=null,releaseCommand,lost=false,reject=false,failLoad=true,handler,base,delayedDashboard,releaseDashboard;
 const assets=new Map();function visit(dir,prefix=''){for(const entry of readdirSync(dir,{withFileTypes:true})){if(entry.isDirectory())visit(dir+'/'+entry.name,prefix+'/'+entry.name);else assets.set(prefix+'/'+entry.name,{body:readFileSync(dir+'/'+entry.name),type:entry.name.endsWith('.css')?'text/css':/\.m?js$/.test(entry.name)?'text/javascript':entry.name.endsWith('.woff2')?'font/woff2':entry.name.endsWith('.svg')?'image/svg+xml':'application/octet-stream'});}}visit('public');
 assets.set('/',{type:'text/html',body:'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/mobile-theme.css"><link rel="stylesheet" href="/mobile-diary.css"><link rel="stylesheet" href="/diary.css"><link rel="stylesheet" href="/health-controls.css"><link rel="stylesheet" href="/charts.css"><link rel="stylesheet" href="/shell-source/discover.css"><link rel="stylesheet" href="/app-shell.css"></head><body class="discover-mobile dark diary-mobile"><main id="page"></main><dialog id="sheet"><div id="sheet-content"></div></dialog><script type="module" src="/fixture.js"></script></body></html>'});
 assets.set('/fixture.js',{type:'text/javascript',body:`import {mountCharts} from '/charts.js';import {mountDashboard} from '/dashboard.js';const content=document.querySelector('#sheet-content'),sheet=document.querySelector('#sheet');window.csp=[];document.addEventListener('securitypolicyviolation',event=>window.csp.push(event.violatedDirective));const ui={page:document.querySelector('#page'),date:()=>${JSON.stringify(to)},content,header:title=>'<header><h1>'+title+'</h1></header>',show:html=>{content.innerHTML=html;if(!sheet.open)sheet.showModal()},close:()=>{sheet.close();content.replaceChildren()},onChange:()=>{}};window.charts=mountCharts(ui);window.openDashboard=()=>{window.charts.dispose();window.dashboard=mountDashboard({...ui,root:ui.page})};sheet.addEventListener('cancel',event=>{event.preventDefault();sheet.close();content.replaceChildren()});`});
 const server=createServer(async(req,res)=>{if(req.url==='/api/account'||req.url==='/api/offline'||req.url.startsWith('/api/diary')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(req.url==='/api/account'?{id:'fixture'}:req.url==='/api/offline'?{version:1,identity:{ownerId:'fixture',generation:'fixture'},state:state()}:chartSurfaceView(state(),{to},clock)));}const response=await handler(new Request(base+req.url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:req,duplex:'half'})}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
 handler=createWebHandler({config:{origin:base},assets,service:{dashboard:async(_,date)=>{if(delayedDashboard)await delayedDashboard;return dashboardView(state(),{date},clock);},charts:async(_,input)=>{if(failLoad){failLoad=false;throw {code:503,publicMessage:'Try loading again'};}return chartSurfaceView(state(),input,clock);},workspaceCommand:async(_,input)=>{if(commandWait)await commandWait;attempts.push(input);if(reject){reject=false;throw {code:409,publicMessage:'Your data changed'};}const result=await store.command(input,async()=>null,context);if(lost){lost=false;throw {code:503,publicMessage:'Connection interrupted'};}return result;}}});
 let browser;
 try{
  browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});const page=await browser.newPage({viewport:{width:412,height:915},extraHTTPHeaders:{Cookie:'__Host-nourishing_session=fixture'}}),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));await page.goto(base);await page.evaluate(async state=>{const ticket=await(await import('/device-cache.js')).initializeDeviceCache('fixture');await(await import('/offline-store.js')).saveOfflineSnapshot({version:1,identity:{ownerId:'fixture',generation:'fixture'},state},ticket);},state());
  await page.getByRole('button',{name:'Try again',exact:true}).click();await page.locator('[data-chart-open=metric]').waitFor();
  const energyPlot=page.locator('canvas[data-chart-plot=energy]');
  await page.waitForFunction(()=>window.Chart?.getChart(document.querySelector('canvas[data-chart-plot=energy]')));
  const overview=await energyPlot.evaluate(canvas=>{
   const chart=window.Chart.getChart(canvas);
   return {dates:chart.scales.x.ticks.map(t=>t.label),energy:chart.scales.y.ticks.map(t=>t.value),
    empty:chart.data.datasets.every(s=>s.data.every(p=>p.y===null))};
  });
  assert.deepEqual(overview,{dates:['Nov 9','Nov 12','Nov 15'],energy:[0,2,4,6,8,10],empty:true});
  await energyPlot.click({position:{x:35,y:30}});assert.equal(await page.locator('.chart-detail').count(),0);
  const flushWrites=()=>page.evaluate(async()=>await(await import('/background-writes.js')).flushBackgroundWrites());
  const ready=async()=>{await page.locator('.chart-detail[data-chart-busy=false]').waitFor();await flushWrites();await page.waitForFunction(()=>document.querySelector('.chart-page')?.getAttribute('aria-busy')!=='true');};
  const pick=async(key,value)=>{await page.locator('[data-chart-pick="'+key+'"]').click();await page.locator('.mcp-picker [data-mcp-choice]').filter({hasText:value}).click();await ready();};
  const back=async()=>{await page.locator('[data-chart-back]').click();await page.waitForFunction(()=>!document.querySelector('#sheet').open);};
  await page.locator('[data-chart-open="custom:weight"]').click();await ready();
  await page.waitForFunction(()=>Object.values(window.Chart?.instances??{}).some(chart=>chart.canvas.closest('.chart-detail')));
  // The detail can redraw on refresh. Read layout and selection from the same mounted navigation.
  const navigation=await page.evaluate(()=>{
   const nav=document.querySelector('.chart-detail .dc-bottom');
   return {buttons:nav.querySelectorAll('button').length,display:getComputedStyle(nav).display,
    selected:nav.querySelector('[aria-current=page]').getAttribute('aria-label')};
  });
  assert.deepEqual(navigation,{buttons:5,display:'grid',selected:'Discover'});
  assert.equal(await page.locator('.chart-detail .mcl-card-title').count(),0);assert.equal(await page.getByRole('button',{name:'Save',exact:true}).count(),0);
  let before=attempts.length;await page.locator('[data-chart-pick=primary]').click();await page.getByRole('searchbox').fill('weight');await page.keyboard.press('Tab');await page.keyboard.press('Escape');await page.locator('.mcp-picker').waitFor({state:'detached'});assert.equal(attempts.length,before);
  await page.locator('[data-chart-pick=range]').click();await page.mouse.click(2,2);await page.locator('.mcp-picker').waitFor({state:'detached'});assert.equal(attempts.length,before);
  commandWait=new Promise(resolve=>releaseCommand=resolve);const started=Date.now();await page.getByRole('switch',{name:'Show on Dashboard',exact:true}).check();await page.locator('.chart-detail[data-chart-busy=false]').waitFor();assert.ok(Date.now()-started<1000,'chart preference is locally saved while the command is delayed');assert.equal(await page.getByRole('switch',{name:'Show on Dashboard',exact:true}).isChecked(),true);assert.equal(await page.locator('[data-chart-pick=range]').isDisabled(),false);releaseCommand();commandWait=null;await ready();assert.equal(state().settings.mobileCharts.custom.weight.showOnDashboard,true);assert.equal(state().charts[0].visible,true);
  await pick('range','Custom Range');assert.equal(await page.getByRole('switch',{name:'Include Today',exact:true}).count(),0);
  before=attempts.length;await page.locator('[data-chart-pick=from]').click();await page.locator('[data-mdc-date="2026-11-10"]').click();await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(attempts.length,before);
  await page.locator('[data-chart-pick=from]').click();await page.locator('[data-mdc-date="2026-11-10"]').click();await page.locator('[data-mdc-apply]').click();await ready();assert.equal(state().settings.mobileCharts.custom.weight.from,'2026-11-10');
  lost=true;await pick('primaryUnit','lbs');assert.equal(await page.getByRole('switch',{name:'Show on Dashboard',exact:true}).isDisabled(),false);
  const failed=attempts.at(-1);await ready();assert.deepEqual(attempts.at(-1),failed);assert.deepEqual(state().charts[0].primary,{kind:'biometric',type:'weight',unit:'kg'});
  await page.waitForFunction(()=>Object.values(window.Chart.instances).some(chart=>chart.canvas.closest('.chart-detail')&&chart.data.datasets[0].label.includes('lbs')));
  assert.ok(await page.evaluate(()=>Object.values(window.Chart.instances).find(chart=>chart.canvas.closest('.chart-detail')).data.datasets[0].data.some(point=>point.y>150&&point.y<160)));
  await page.locator('[data-chart-pick=primary]').click();await page.locator('.mcp-picker').getByRole('button',{name:'Weight (lbs)',exact:true}).click();await ready();assert.deepEqual(state().charts[0].primary,{kind:'biometric',type:'weight',unit:'lbs'});assert.equal(state().charts[0].visible,true);assert.equal(state().settings.mobileCharts.custom.weight.from,'2026-11-10');
  await page.getByRole('switch',{name:'Cycle Phases',exact:true}).uncheck();await ready();assert.equal(state().charts[0].cycleOverlay,false);
  await page.getByRole('button',{name:'Edit Chart',exact:true}).click();await page.getByLabel('Chart Name',{exact:true}).fill('Unsaved');await page.locator('[data-mce-back]').click();await ready();assert.equal(state().charts[0].name,'Archived weight');
  await page.getByRole('button',{name:'Delete Chart',exact:true}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(state().charts.length,1);
  reject=true;await page.getByRole('switch',{name:'Show on Dashboard',exact:true}).click();await ready();assert.equal(await page.locator('[data-chart-pick=range]').isDisabled(),false);assert.equal(await page.getByRole('switch',{name:'Show on Dashboard',exact:true}).isChecked(),false);
  await page.getByRole('switch',{name:'Show on Dashboard',exact:true}).check();await ready();
  mkdirSync('.local/chart-detail',{recursive:true});await page.screenshot({path:'.local/chart-detail/custom.png'});await back();
  await page.getByRole('button',{name:'Manage Charts',exact:true}).click();await page.locator('[data-chart-visible="custom:weight"]').uncheck();await page.waitForFunction(()=>!document.querySelector('[data-chart-open="custom:weight"]'));await page.locator('[data-chart-visible=metric]').uncheck();await page.waitForFunction(()=>!document.querySelector('#page [data-chart-open=metric]'));await page.locator('[data-chart-manager] input:not([disabled])').first().waitFor();await page.locator('[data-chart-visible=metric]').check();await page.waitForFunction(()=>!!document.querySelector('#page [data-chart-open=metric]'));await page.locator('[data-chart-manager] input:not([disabled])').first().waitFor();await page.keyboard.press('Escape');
  await page.locator('[data-chart-open=energy]').click();await ready();assert.equal(await page.locator('[data-chart-setting=zoom],[data-chart-setting=includeToday],[data-chart-setting=showFasting],[data-chart-setting=targetLine],[data-chart-setting=showCycle]').count(),0);await page.locator('.chart-detail [data-discover=shell-dashboard]').click();await page.waitForFunction(()=>!document.querySelector('#sheet').open);
  await page.locator('[data-chart-open=metric]').click();await ready();
  assert.equal(await page.locator('[data-chart-setting=showCycle]').count(),0);
  const menu=page.locator('.mcp-chart-control'),metricButton=page.locator('[data-chart-pick=primary]');
  before=attempts.length;await metricButton.click();
  assert.equal(await menu.getByRole('button',{name:'Weight',exact:true}).count(),1);
  for(const name of ['Systolic Blood Pressure','Diastolic Blood Pressure']){
   assert.deepEqual(JSON.parse(await menu.getByRole('button',{name,exact:true}).getAttribute('data-mcp-choice')),['biometric',name.toLowerCase()]);
  }
  const assertMenuFits=()=>page.waitForFunction(()=>{
   const rect=document.querySelector('.mcp-chart-control').getBoundingClientRect();
   const detail=document.querySelector('.chart-detail');
   return rect.top>=detail.querySelector('header').getBoundingClientRect().bottom-1 &&
    rect.bottom<=detail.querySelector('nav').getBoundingClientRect().top+1 && Math.abs(rect.right-innerWidth)<=1;
  },undefined,{timeout:3000});
  await assertMenuFits();
  const lines=await menu.getByRole('button',{name:'Systolic Blood Pressure',exact:true}).evaluate(el=>{
   const text=document.createRange();text.selectNodeContents(el);return text.getClientRects().length;
  });
  assert.equal(lines,1);
  await page.setViewportSize({width:780,height:412});
  await page.waitForFunction(()=>innerHeight===412);await assertMenuFits();
  await page.setViewportSize({width:412,height:915});
  await page.waitForFunction(()=>innerWidth===412);await assertMenuFits();
  const wrist=menu.getByRole('button',{name:'Wrist Size',exact:true});
  assert.ok(await wrist.evaluate(node=>node.getBoundingClientRect().bottom<=node.closest('dialog').getBoundingClientRect().bottom+1));
  assert.equal(await menu.locator('[aria-current=true]').evaluate(node=>node.matches(':focus')&&node.getBoundingClientRect().bottom<=node.closest('dialog').getBoundingClientRect().bottom+1),true);
  await menu.getByRole('button',{name:'Weight',exact:true}).click();await menu.getByRole('button',{name:'Weight (lbs)',exact:true}).waitFor();
  await page.evaluate(()=>window.dispatchEvent(new Event('nourishing-back',{cancelable:true})));await menu.waitFor({state:'detached'});assert.equal(await metricButton.isVisible(),true);assert.equal(attempts.length,before);
  const unitControl=page.locator('[data-chart-pick=primaryUnit]');
  await unitControl.click();
  const unitRow=await unitControl.boundingBox(),unitMenu=await menu.boundingBox();
  assert.ok(Math.abs(unitMenu.y-(unitRow.y+unitRow.height-16))<1,'short menus open under the control');
  const kg=await menu.getByRole('button',{name:'kg',exact:true}).boundingBox();
  assert.equal(kg.width,unitMenu.width);assert.equal(kg.height,48);
  await page.keyboard.press('Escape');await menu.waitFor({state:'detached'});
  await metricButton.click();const touch=await page.context().newCDPSession(page);
  for(const [type,y] of [['touchStart',515],['touchMove',470],['touchMove',380],['touchEnd',null]]){
   await touch.send('Input.dispatchTouchEvent',{type,touchPoints:y===null?[]:[{x:16,y}]});
  }
  await menu.waitFor({state:'detached'});await touch.detach();assert.equal(await metricButton.isVisible(),true);assert.equal(attempts.length,before);
  const xBounds=()=>page.evaluate(()=>{const {min,max}=Object.values(window.Chart.instances).find(chart=>chart.canvas.closest('.chart-detail')).scales.x;return [min,max];});
  const fullBounds=await xBounds();await page.getByRole('switch',{name:'Zoom to Fit',exact:true}).check();await ready();
  const zoomBounds=await xBounds();assert.ok(zoomBounds[0]>fullBounds[0]);assert.equal(zoomBounds[1],fullBounds[1]);assert.equal(state().settings.mobileCharts.charts.metric.zoom,true);
  await page.getByRole('switch',{name:'Zoom to Fit',exact:true}).uncheck();await ready();assert.deepEqual(await xBounds(),fullBounds);
  await pick('primaryUnit','lbs');assert.equal(state().settings.mobileCharts.charts.metric.primaryUnit,'lbs');assert.equal(state().settings.mobileCharts.charts.metric.primary,undefined);
  await metricButton.click();await menu.getByRole('button',{name:'Weight',exact:true}).click();await menu.getByRole('button',{name:'Weight (lbs)',exact:true}).click();await ready();
  assert.deepEqual(state().settings.mobileCharts.charts.metric.primary,{kind:'biometric',type:'weight',unit:'lbs'});
  for(const [stage,name] of [['deep','Sleep Deep'],['light','Sleep Light'],['rem','Sleep REM']]){
   await metricButton.click();
   assert.equal(await menu.getByRole('button',{name,exact:true}).count(),1);
   await menu.getByRole('button',{name,exact:true}).click();await ready();
   assert.deepEqual(state().settings.mobileCharts.charts.metric.primary,{kind:'sleep-stage',stage});
   assert.equal(state().settings.mobileCharts.charts.metric.primaryUnit,undefined);
   await page.waitForFunction(name=>document.querySelector('.chart-detail h2')?.textContent===name,name);
  }
  await metricButton.click();
  const stageRows=menu.getByRole('button',{name:/^Sleep (Deep|Light|REM)$/});
  const labels=await stageRows.allTextContents();assert.equal(labels.length,3);
  mkdirSync('.local/stages-113',{recursive:true});
  await page.screenshot({path:'.local/stages-113/314-picker.png'});
  writeFileSync('.local/stages-113/314-picker.json',JSON.stringify({reference:314,fixture:'synthetic',viewport:page.viewportSize(),labels,selected:state().settings.mobileCharts.charts.metric.primary},null,2));
  await menu.getByRole('button',{name:'Sleep Deep (h)',exact:true}).click();await ready();
  assert.deepEqual(state().settings.mobileCharts.charts.metric.primary,{kind:'biometric',type:'Sleep Deep',unit:'h'});await back();
  await page.locator('[data-chart-open=nutrient]').click();await ready();assert.equal(await page.locator('[data-chart-setting=targetLine]').count(),1);await pick('grouping','Hour');assert.equal(state().settings.mobileCharts.charts.nutrient.grouping,'hour');await page.locator('[data-chart-pick=primary]').click();await page.getByRole('searchbox').fill('Protein');await page.locator('.mcp-picker').getByRole('button',{name:'Protein',exact:true}).click();await ready();assert.equal(state().settings.mobileCharts.charts.nutrient.primary.id,'protein');await page.waitForFunction(()=>Object.values(window.Chart.instances).some(chart=>chart.canvas.closest('.chart-detail')));assert.equal(await page.evaluate(()=>Object.values(window.Chart.instances).filter(chart=>chart.canvas.closest('.chart-detail')).every(chart=>chart.data.datasets[0].data.every(point=>point.y===null))),true);await back();
  await page.evaluate(()=>window.openDashboard());await page.locator('[data-chart-open="custom:weight"]').click();await ready();await page.waitForFunction(()=>Object.values(window.Chart.instances).some(chart=>chart.canvas.closest('.chart-detail')));assert.equal(await page.locator('.chart-detail canvas').count(),1);
  await pick('dayFilter','Completed');assert.equal(state().settings.mobileCharts.custom.weight.dayFilter,'complete');
  await page.getByRole('button',{name:'Edit Chart',exact:true}).click();await page.getByLabel('Chart Name',{exact:true}).fill('My weight');delayedDashboard=new Promise(resolve=>releaseDashboard=resolve);await page.getByRole('button',{name:'Save Chart',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#sheet').open);assert.equal(await page.evaluate(async()=>(await(await import('/local-engine.js')).localWorkspaceState()).charts.find(chart=>chart.id==='weight').name),'My weight');
  await flushWrites();assert.equal(state().charts[0].name,'My weight');assert.equal(state().charts[0].visible,false);
  await page.locator('[data-chart-open="custom:weight"]').click();await ready();await page.waitForFunction(()=>document.querySelector('.chart-detail h2')?.textContent==='My weight');releaseDashboard();delayedDashboard=null;await page.getByRole('button',{name:'Delete Chart',exact:true}).click();await page.locator('[data-mcp-confirm]').click();await page.waitForFunction(()=>!document.querySelector('#sheet').open);await flushWrites();assert.equal(state().charts.length,0);
  await page.waitForFunction(()=>Object.values(window.Chart?.instances??{}).every(chart=>chart.canvas.isConnected));await page.evaluate(()=>window.dashboard.dispose());await page.waitForFunction(()=>Object.keys(window.Chart?.instances??{}).length===0);
  assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.csp),[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }finally{releaseCommand?.();releaseDashboard?.();await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
