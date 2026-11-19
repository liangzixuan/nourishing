import {CHROME_EXECUTABLE} from './_chrome.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,readdirSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {initialState,act} from '../server/domain/workspace.mjs';
import {dashboardView} from '../server/dashboard-view.mjs';
import {chartSurfaceView} from '../server/dashboard-pinned-charts.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';
import {createWebHandler} from '../server/http.mjs';

test('source CGM detail renders comparison, settings children, retry and disposal under production CSP',async()=>{
 const to='2026-11-15',clock={now:new Date(to+'T18:00:00Z'),timeZone:'UTC'},seed=initialState();
 seed.settings.glucoseTimeline={version:1,glucose:{type:'Meter'},insulin:{type:'Insulin',unit:'U'},displayUnit:'mg/dL',range:null};
 seed.settings.mobileCharts={version:1,charts:{cgm:{visible:true,showOnDashboard:true,compare:{kind:'exercise',id:'duration'}}}};
 seed.biometrics=[{id:'g1',date:to,time:'10:00',type:'Meter',value:90,unit:'mg/dL'},{id:'g2',date:to,time:'12:00',type:'Meter',value:100,unit:'mg/dL'},{id:'i1',date:to,time:'11:00',type:'Insulin',value:2,unit:'U'}];
 act(seed,'exercise.add',{date:to,time:'11:00',group:'Lunch',name:'Walk',duration:30,calories:90});
 const fixture=diaryStoreFixture(seed),store=createWorkspaceStore(fixture.db,'fixture'),state=()=>fixture.state(),context={owner:'fixture',asOf:clock.now.toISOString(),timeZone:'UTC'},attempts=[];
 let loseHoursReply=true,handler,base;
 const assets=new Map();function visit(dir,prefix=''){for(const entry of readdirSync(dir,{withFileTypes:true})){if(entry.isDirectory())visit(dir+'/'+entry.name,prefix+'/'+entry.name);else assets.set(prefix+'/'+entry.name,{body:readFileSync(dir+'/'+entry.name),type:entry.name.endsWith('.css')?'text/css':/\.m?js$/.test(entry.name)?'text/javascript':entry.name.endsWith('.woff2')?'font/woff2':entry.name.endsWith('.svg')?'image/svg+xml':'application/octet-stream'});}}visit('public');
 assets.set('/',{type:'text/html',body:'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/mobile-theme.css"><link rel="stylesheet" href="/mobile-diary.css"><link rel="stylesheet" href="/diary.css"><link rel="stylesheet" href="/health-controls.css"><link rel="stylesheet" href="/charts.css"><link rel="stylesheet" href="/app-shell.css"></head><body class="discover-mobile dark diary-mobile"><main id="page"></main><dialog id="sheet"><div id="sheet-content"></div></dialog><script type="module" src="/fixture.js"></script></body></html>'});
 assets.set('/fixture.js',{type:'text/javascript',body:`import {mountCharts} from '/charts.js';const content=document.querySelector('#sheet-content'),sheet=document.querySelector('#sheet');window.csp=[];document.addEventListener('securitypolicyviolation',event=>window.csp.push(event.violatedDirective));window.charts=mountCharts({page:document.querySelector('#page'),date:()=>${JSON.stringify(to)},content,header:title=>'<header><h1>'+title+'</h1></header>',show:html=>{content.innerHTML=html;if(!sheet.open)sheet.showModal()},close:()=>{sheet.close();content.replaceChildren()},onChange:()=>{}});sheet.addEventListener('cancel',event=>{event.preventDefault();sheet.close();content.replaceChildren()});`});
 const server=createServer(async(req,res)=>{const response=await handler(new Request(base+req.url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:req,duplex:'half'})}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
 handler=createWebHandler({config:{origin:base},assets,service:{dashboard:async(_,date)=>dashboardView(state(),{date},clock),charts:async(_,input)=>chartSurfaceView(state(),input,clock),workspaceCommand:async(_,input)=>{attempts.push(input);const result=await store.command(input,async()=>null,context);if(loseHoursReply&&input.payload.patch.hours===48){loseHoursReply=false;throw {code:503,publicMessage:'Connection interrupted'};}return result;}}});
 let browser;
 try{
  browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});const page=await browser.newPage({viewport:{width:412,height:915},extraHTTPHeaders:{Cookie:'__Host-nourishing_session=fixture'}}),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));await page.goto(base);
  await page.locator('[data-chart-open=cgm]').click();await page.locator('[data-chart-plot=cgm-comparison]').waitFor();
  const ready=()=>page.waitForFunction(()=>document.querySelector('.cgm-detail')?.dataset.cgmBusy==='false'&&!document.querySelector('[data-cgm-retry]'));
  const plots=()=>page.evaluate(()=>Object.values(window.Chart.instances).filter(chart=>chart.canvas.closest('.cgm-detail')).map(chart=>({id:chart.canvas.dataset.chartPlot,min:chart.options.scales.x.min,max:chart.options.scales.x.max,data:chart.data.datasets.map(set=>({label:set.label,values:set.data.map(point=>point.y)}))})));
  await page.waitForFunction(()=>Object.values(window.Chart?.instances??{}).filter(chart=>chart.canvas.closest('.cgm-detail')).length===2);
  let rendered=await plots();assert.equal(rendered[0].min,rendered[1].min);assert.equal(rendered[0].max,rendered[1].max);assert.deepEqual(rendered[1].data[0].values,[30]);assert.match(rendered[1].data[0].label,/min/);assert.deepEqual(rendered[0].data[0].values,[90,100]);
  await page.locator('[data-cgm-hours="48"]').click();await page.getByRole('alert').filter({hasText:'Connection interrupted'}).waitFor();assert.equal(state().settings.mobileCharts.charts.cgm.hours,48);await page.getByRole('button',{name:'Retry',exact:true}).click();await ready();assert.equal(attempts[0].requestId,attempts[1].requestId);assert.equal(await page.locator('[data-cgm-hours="48"]').getAttribute('aria-pressed'),'true');
  await page.locator('.cgm-detail [data-mcl-stat-card=mean]>summary').click();
  await page.locator('[data-cgm-settings]').click();assert.equal(await page.locator('[data-cgm-screen=settings]').count(),1);
  mkdirSync('.local/cgm-detail',{recursive:true});await page.screenshot({path:'.local/cgm-detail/settings.png'});
  await page.locator('[data-cgm-pick=primaryUnit]').click();const before=attempts.length;await page.keyboard.press('Escape');assert.equal(await page.locator('.mcp-picker').count(),0);assert.equal(attempts.length,before);
  await page.locator('[data-cgm-pick=primaryUnit]').click();await page.getByRole('button',{name:'mmol/L',exact:true}).click();await ready();assert.equal(state().settings.mobileCharts.charts.cgm.primaryUnit,'mmol/L');
  await page.locator('[data-cgm-target]').click();await page.getByRole('radio',{name:'Custom Range',exact:true}).check();await ready();
  const low=page.locator('[data-mcl-range-value=low]');await low.evaluate(input=>{input.value='4.5';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});await ready();assert.equal(state().settings.mobileCharts.charts.cgm.targetRange.custom.low,4.5);
  assert.equal(state().settings.mobileCharts.charts.cgm.targetRange.custom.unit,'mmol/L');assert.equal(await page.locator('[data-mcl-target-screen] [style]').count(),1); // CSS properties set by DOM, never an inline HTML style.
  await page.evaluate(()=>document.querySelector('#sheet').scrollTop=0);await page.screenshot({path:'.local/cgm-detail/target.png'});
  await page.locator('[data-mcl-target-hint]').click();await ready();assert.equal(state().settings.mobileCharts.charts.cgm.showTargetHint,false);
  await page.keyboard.press('Escape');assert.equal(await page.locator('[data-cgm-screen=settings]').count(),1);await page.keyboard.press('Escape');await page.locator('[data-cgm-screen=detail]').waitFor();assert.equal(await page.locator('.cgm-detail [data-mcl-stat-card=mean]').getAttribute('open'),'');
  await page.locator('[data-cgm-help]').click();await page.locator('.mcl-help-chart').waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('.mcp-picker').count(),0);
  await page.locator('[data-cgm-pick=compare]').click();await page.getByRole('searchbox').fill('Energy');await page.getByRole('button',{name:/Exercise.*Energy/i}).click();await ready();await page.waitForFunction(()=>Object.values(window.Chart.instances).some(chart=>chart.canvas.dataset.chartPlot==='cgm-comparison'&&chart.data.datasets[0].data[0]?.y===90));
  rendered=await plots();assert.match(rendered.find(chart=>chart.id==='cgm-comparison').data[0].label,/kcal/);
  mkdirSync('.local/cgm-detail',{recursive:true});await page.evaluate(()=>document.querySelector('#sheet').scrollTop=0);await page.screenshot({path:'.local/cgm-detail/populated.png'});
  await page.locator('[data-cgm-settings]').click();await page.locator('[data-cgm-setting=showCompare]').uncheck();await ready();await page.locator('[data-cgm-back]').click();assert.equal(await page.locator('[data-chart-plot=cgm-comparison]').count(),0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(await page.evaluate(()=>window.csp),[]);assert.deepEqual(errors,[]);
  await page.locator('[data-cgm-back]').click();await page.locator('#sheet').waitFor({state:'hidden'});await page.waitForFunction(()=>Object.values(window.Chart.instances).every(chart=>chart.canvas.isConnected));
  // A later captured clock supplies a real empty state without changing stored measurements.
  clock.now=new Date('2026-11-20T18:00:00Z');await page.evaluate(()=>window.charts.reload());await page.locator('[data-chart-open=cgm]').click();await page.locator('.cgm-detail .mcl-cgm-empty').waitFor();assert.equal(await page.locator('.cgm-detail [data-chart-plot=cgm-comparison]').count(),0);assert.equal(await page.locator('.cgm-detail [data-mcl-stat=mean]').first().getAttribute('data-empty'),'true');await page.locator('[data-cgm-settings]').click();await page.locator('[data-cgm-back]').click();await page.locator('[data-cgm-back]').click();
  await page.evaluate(()=>{window.charts.dispose();document.querySelector('#page').replaceChildren()});await page.waitForFunction(()=>Object.keys(window.Chart.instances).length===0);
  clock.now=new Date(to+'T18:00:00Z');
  await page.evaluate(async day=>{const {mountDashboard}=await import('/dashboard.js');const content=document.querySelector('#sheet-content'),sheet=document.querySelector('#sheet');window.dashboard=mountDashboard({root:document.querySelector('#page'),date:()=>day,content,show:html=>{content.innerHTML=html;if(!sheet.open)sheet.showModal()},close:()=>{sheet.close();content.replaceChildren()},header:title=>'<header><h1>'+title+'</h1></header>'});},to);
  await page.locator('[data-chart-open=cgm]').click();await page.locator('.cgm-detail [data-cgm-settings]').waitFor();await page.locator('[data-cgm-hours="72"]').click();await ready();assert.equal(state().settings.mobileCharts.charts.cgm.hours,72);
  await page.locator('[data-cgm-back]').click();await page.locator('#sheet').waitFor({state:'hidden'});await page.waitForFunction(()=>Object.values(window.Chart.instances).every(chart=>chart.canvas.isConnected));
  await page.evaluate(()=>window.dashboard.dispose());await page.waitForFunction(()=>Object.keys(window.Chart.instances).length===0);assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.csp),[]);
  assert.deepEqual(state().biometrics,seed.biometrics);assert.deepEqual(state().entries,seed.entries);
 }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
