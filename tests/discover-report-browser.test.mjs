import {CHROME_EXECUTABLE} from './_chrome.mjs';
import {barcodeAssets} from '../scripts/package-barcode-assets.mjs';
const packagedAssets=new Map((await barcodeAssets()).map(asset=>['/'+asset.path,asset]));
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {initialState} from '../server/domain/workspace.mjs';
import {reportView} from '../server/nutrition-views.mjs';
import {chartSurfaceView} from '../server/dashboard-pinned-charts.mjs';
import {dashboardView,applyDashboardCommand} from '../server/dashboard-view.mjs';

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
 const state=initialState(),requests=[];let reportWait=null,releaseReport,failNextReport=false;
 applyDashboardCommand(state,{type:'dashboard.preferences',payload:{patch:{newsVisible:false}}},clock);
 state.foods=[{id:'oats',name:'Fixture oats',serving:'100 g',grams:100,nutrients:{calories:389,protein:16.9,carbs:66.3,fat:6.9,omega6:2,omega3:1}}];
 state.entries=[{id:'entry',foodId:'oats',date,time:'12:00',amount:1,group:'Lunch',kind:'food'}];
 const server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://fixture'),path=url.pathname;
   res.setHeader('Content-Type','application/json');
  if(packagedAssets.has(path)){const asset=packagedAssets.get(path);res.setHeader('Content-Type',asset.type);return res.end(asset.body);}
   if(path==='/api/nutrition-report'){const options=Object.fromEntries(url.searchParams);options.includeToday=options.includeToday==='true';options.includeSupplements=options.includeSupplements==='true';requests.push(options);if(reportWait)await reportWait;if(failNextReport){failNextReport=false;res.statusCode=503;return res.end(JSON.stringify({error:'Report unavailable. Try again.'}));}return res.end(JSON.stringify(reportView(state,options,clock)));}
   if(path==='/api/workspace/command'){let body='';for await(const chunk of req)body+=chunk;const input=JSON.parse(body);applyDashboardCommand(state,input,clock);return res.end(JSON.stringify({ok:true}));}
   if(path==='/api/dashboard')return res.end(JSON.stringify({...dashboardView(state,{date},clock),news:{version:1,items:[{id:'fixture-news',title:'Fixture News',body:'Header action test.'}]}}));
   if(path==='/api/charts')return res.end(JSON.stringify(chartSurfaceView(state,Object.fromEntries(url.searchParams),clock)));
   if(path==='/api/snapshots')return res.end(JSON.stringify({items:[],revision:'fixture'}));
   if(path==='/'){
    res.setHeader('Content-Type','text/html');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'");
    return res.end('<link rel="stylesheet" href="/mobile-theme.css"><link rel="stylesheet" href="/diary.css"><link rel="stylesheet" href="/dashboard.css"><link rel="stylesheet" href="/app-shell.css"><link rel="stylesheet" href="/report-mobile.css"><link rel="stylesheet" href="/charts.css"><body class="discover-mobile dark discover-home"><div class="app-shell"><header id="header" class="app-header topbar"></header><main id="page"></main></div><dialog id="sheet"><div></div></dialog><script type="module" src="/fixture.js"></script>');
   }
   if(path==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(`import {mountNutrition} from '/nutrition.js';const sheet=document.querySelector('#sheet'),content=sheet.querySelector('div');const close=()=>{sheet.close();content.replaceChildren()};sheet.addEventListener('click',event=>{if(event.target.closest('[data-close]'))close()});window.panel=mountNutrition({page:document.querySelector('main'),headerRoot:document.querySelector('#header'),mode:'discover',initialTab:'dashboard',date:()=>'${date}',header:title=>'<h2>'+title+'</h2><button type="button" data-close>Close</button>',show:html=>{content.innerHTML=html;if(!sheet.open)sheet.showModal()},close,content,onChange:async()=>{}});`);}
   if(!/^\/[a-zA-Z0-9/_.-]+\.(?:js|mjs|css|svg|woff2)$/.test(path)||path.includes('..'))return res.writeHead(404).end();
   res.setHeader('Content-Type',/\.m?js$/.test(path)?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'font/woff2');res.end(readFileSync(new URL('../public'+path,import.meta.url)));
  }catch(error){res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:error.message}));}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});const page=await browser.newPage({viewport:{width:412,height:915}}),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',error=>{errors.push(error.message);console.error(error.message)});page.on('console',message=>{if(message.text().includes('Content Security Policy'))errors.push(message.text());});
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('.cloud-dashboard').waitFor();
  const summary=page.locator('.dc-summary'),switchMode=summary.locator('[data-discover=switch-report]'),period=summary.locator('[data-discover=report-period]');
  const macros=summary.locator('.dc-summary-macros'),saveSummary=page.locator('#sheet .primary');
  async function snapshotSummary(name){
   assert.equal(await summary.evaluate(node=>node.scrollWidth<=node.clientWidth),true);
   await page.screenshot({path:'.local/dashboard-summary-'+name+'.png'});
  }
  await macros.waitFor();assert.deepEqual(await macros.locator('strong').allTextContents(),['Protein','Carbs','Fat']);
  assert.deepEqual(await macros.locator('span').allTextContents(),['16.9 g','66.3 g','6.9 g']);
  assert.equal(await summary.locator('.dc-summary-number').innerText(),'389.0 kcal');
  await snapshotSummary('populated');await period.click();assert.equal(await page.locator('#sheet [name=widget]').count(),0);
  await page.locator('#sheet [name=range]').selectOption('today');await page.getByRole('button',{name:'Close',exact:true}).click();
  assert.equal(state.settings.discover.reportRange,'7');await period.click();assert.equal(await page.locator('#sheet [name=range]').inputValue(),'7');
  await page.locator('#sheet [name=range]').selectOption('custom');
  await page.getByLabel('From',{exact:true}).fill('2026-11-01');await page.getByLabel('To',{exact:true}).fill('2026-11-07');await saveSummary.click();
  await period.filter({hasText:'2026-11-01 - 2026-11-07'}).waitFor();assert.equal(await summary.locator('.dc-summary-number').innerText(),'No Data Yet');
  assert.deepEqual(await macros.locator('span').allTextContents(),Array(3).fill('Added when logged'));
  await snapshotSummary('empty');await page.setViewportSize({width:320,height:720});
  assert.equal(await summary.evaluate(node=>node.scrollWidth<=node.clientWidth),true);
  await page.setViewportSize({width:412,height:915});
  await page.route('**/api/workspace/command',route=>route.fulfill({status:503,json:{error:'Summary unavailable. Try again.'}}),{times:1});
  await switchMode.click();await page.getByRole('alert').filter({hasText:'Summary unavailable'}).waitFor();assert.equal(await macros.count(),1);
  state.settings.completedDays=['2026-11-05'];
  for(const widget of ['Remaining','Consumed']){
   const saved=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/workspace/command');
   await switchMode.click();
   await summary.locator('.dc-summary-caption').filter({hasText:widget+' average'}).waitFor();
   await saved;
   assert.equal(state.settings.discover.reportWidget,widget);assert.equal(state.settings.discover.reportRange,'custom');
  }
  await page.evaluate(()=>window.panel.reload());await summary.locator('.dc-summary-number').filter({hasText:'0.0 kcal'}).waitFor();
  assert.equal(await summary.locator('.dc-summary-number').innerText(),'0.0 kcal');
  assert.deepEqual(await macros.locator('span').allTextContents(),Array(3).fill('Added when logged - 0.0 g'));
  await snapshotSummary('known-zero');state.settings.completedDays=[];
  await period.click();await page.locator('#sheet [name=range]').selectOption('7');await saveSummary.click();
  await period.filter({hasText:'2026-11-09 - 2026-11-15'}).waitFor();
  assert.equal(requests.length,0,'Dashboard does not load the full Report');
  await page.getByRole('button',{name:'Dashboard',exact:true}).click();assert.equal(requests.length,0);
  await page.getByRole('button',{name:'Charts',exact:true}).click();await page.locator('[data-manage]').waitFor();assert.equal(requests.length,0,'Charts does not load the full Report');
  state.settings.energyPolicy={version:1,resting:{mode:'custom',kcal:1600},baseline:{mode:'multiplier',factor:.2},activity:{mode:'manual'},thermicEffect:false,target:{mode:'calculated',adjustmentKcal:0,includeAboveBaseline:true},display:'balance'};
  reportWait=new Promise(resolve=>releaseReport=resolve);const started=page.waitForRequest(r=>new URL(r.url()).pathname==='/api/nutrition-report');
  await page.getByRole('button',{name:'Report',exact:true}).click();await started;
  const cancelled=page.waitForEvent('requestfailed',{predicate:r=>new URL(r.url()).pathname==='/api/nutrition-report'});
  await page.getByRole('button',{name:'Charts',exact:true}).click();await cancelled;releaseReport();reportWait=null;await page.locator('[data-manage]').waitFor();assert.equal(await page.locator('.mobile-report-toolbar').count(),0);
  failNextReport=true;await page.getByRole('button',{name:'Report',exact:true}).click();await page.locator('[data-retry]').waitFor();await page.locator('[data-retry]').click();await page.locator('.mobile-report-toolbar').waitFor();assert.equal(requests.length,3);await page.waitForFunction(()=>Object.keys(window.Chart?.instances??{}).length===2);
  assert.equal(await page.locator('[data-report-energy-kind=consumed]').count(),1);assert.equal(await page.locator('[data-report-energy-kind=expenditure]').count(),1);assert.ok(await page.locator('[data-mobile-category]').count()>3);assert.equal(await page.locator('.report-filters').count(),0);
  assert.equal(await page.locator('[data-report-energy-kind=consumed] .report-energy-center strong').textContent(),'389');
  const budget=page.locator('[data-report-energy-kind=balance]');
  assert.equal(await budget.locator('h2').textContent(),'Deficit');
  assert.deepEqual(await budget.locator('dd').allTextContents(),['1,920 kcal','-389 kcal','1,531 kcal']);
  assert.match(await page.locator('[data-report-energy-kind=expenditure] [data-energy-slice=exercise]').innerText(),/0 kcal/);

  assert.equal(await page.locator('[data-report-section=macros] [data-report-nutrient]').count(),4);
  assert.equal(await page.locator('[data-report-section=highlights] [data-report-nutrient]').count(),8);
  assert.equal(await page.locator('[data-report-score]').count(),8);
  assert.equal(await page.locator('[data-report-balance]').count(),7);assert.equal(await page.locator('.report-balance-grid [data-report-balance]').count(),5);assert.equal(await page.locator('.report-balance-extras [data-report-balance]').count(),2);assert.equal(await page.locator('[data-report-balance=calcium-oxalate]').evaluate(node=>getComputedStyle(node).gridColumn),'1 / -1');
  assert.equal(await page.locator('[data-report-balance="zinc-copper"] [data-balance-value]').textContent(),'—');
  assert.equal(await page.locator('[data-report-balance="zinc-copper"] .report-gauge-needle').count(),0);
  assert.equal(await page.locator('[data-report-balance="omega6-omega3"] [data-balance-value]').textContent(),'2.000');assert.equal(await page.locator('[data-report-balance="omega6-omega3"] .report-gauge-needle').count(),1);
  for(const selector of ['[data-report-section=macros] [data-mobile-nutrient]','.report-highlight-column [data-mobile-nutrient]','[data-mobile-category=Vitamins] [data-mobile-nutrient]']){
   const [first,second]=await page.locator(selector).evaluateAll(nodes=>nodes.slice(0,2).map(node=>node.getBoundingClientRect().top));
   assert.ok(Math.abs(second-first-47)<1,selector+' row pitch was '+(second-first));
  }
  const gauges=page.locator('.report-balance-grid');
  assert.ok((await gauges.boundingBox()).height<410,'Five balance gauges fit in one report viewport');
  assert.ok(await page.getByRole('button',{name:'Zinc : Copper: No data',exact:true}).isVisible());
  assert.deepEqual(await page.locator('[data-mobile-category]').evaluateAll(nodes=>nodes.slice(0,3).map(node=>node.dataset.mobileCategory)),['General','Vitamins','Minerals']);
  const categoryRows=await page.locator('[data-mobile-category]').evaluateAll(groups=>groups.map(group=>Array.from(group.querySelectorAll('[data-report-nutrient]'),button=>button.dataset.reportNutrient)));
  assert.deepEqual(categoryRows,[
   ['calories','alcohol','caffeine','oxalate','phytate','water'],
   ['thiamin','riboflavin','niacin','pantothenicAcid','vitaminB6','vitaminB12','folate','vitaminA','vitaminC','vitaminD','vitaminE','vitaminK'],
   ['calcium','copper','iron','magnesium','manganese','phosphorus','potassium','selenium','sodium','zinc'],
   ['carbs','fiber','insolubleFiber','solubleFiber','starch','sugar','addedSugar'],
   ['fat','monounsaturatedFat','polyunsaturatedFat','omega3','ala','dha','epa','omega6','arachidonicAcid','linoleicAcid','saturatedFat','transFat','cholesterol'],
   ['protein','cystine','histidine','isoleucine','leucine','lysine','methionine','phenylalanine','threonine','tryptophan','tyrosine','valine'],
  ]);
  assert.deepEqual(await page.locator('.report-highlight-column').evaluateAll(cols=>cols.map(col=>Array.from(col.querySelectorAll('button'),b=>b.dataset.reportNutrient))),[['addedSugar','fiber','calcium','vitaminA'],['vitaminC','vitaminB12','folate','potassium']]);
  const additional=page.locator('[data-report-section=additional]');
  assert.equal(await additional.getAttribute('open'),null);
  await additional.locator('summary').click();
  assert.equal(await additional.locator('[data-report-nutrient=vitaminDFrida]').isVisible(),true);
  await additional.locator('summary').click();
  const general=page.locator('[data-mobile-category=General]');
  await general.evaluate(node=>{node.scrollIntoView({block:'start'});window.scrollBy(0,-document.querySelector('#header').getBoundingClientRect().height);});
  await page.screenshot({path:'.local/report-nutrient-groups.png'});
  assert.equal(await page.locator('[data-mobile-category="Vitamins"]').getAttribute('open'),'');
  await page.locator('[data-report-section=macros]').scrollIntoViewIfNeeded();await page.screenshot({path:'.local/report-targets.png'});await page.locator('[data-report-section=balances]').scrollIntoViewIfNeeded();await page.screenshot({path:'.local/report-balances.png'});
  const body=page.locator('.mobile-report-body'),dateButton=page.locator('.mobile-report-toolbar button');
  const scrollTop=await body.evaluate(node=>node.scrollTop);assert.ok(scrollTop>500);
  const headerBox=await page.locator('.app-header').boundingBox(),dateBox=await dateButton.boundingBox();
  assert.ok(headerBox.y>=0&&dateBox.y>=headerBox.y+headerBox.height-1&&dateBox.y+dateBox.height<250);
  await dateButton.focus();await page.keyboard.press('Enter');
  const dateDialog=page.getByRole('dialog',{name:'Date Range',exact:true});await dateDialog.waitFor();
  await page.evaluate(()=>history.back());await dateDialog.waitFor({state:'detached'});
  assert.equal(await body.evaluate(node=>node.scrollTop),scrollTop);
  assert.ok(await dateButton.evaluate(node=>node===document.activeElement));
  await page.locator('[data-report-section=macros] > summary').click();
  await page.screenshot({path:'.local/report-source-with-data.png',fullPage:true});
  await page.getByRole('button',{name:'Report Settings',exact:true}).click();await page.getByRole('dialog',{name:'Report Settings',exact:true}).waitFor();
  await page.route('**/api/nutrition-report?*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Report unavailable. Try again.'})}),{times:1});
  await page.getByRole('switch',{name:'Include Supplements'}).click();await page.getByRole('alert').filter({hasText:'Report unavailable'}).waitFor();assert.equal(await page.getByRole('switch',{name:'Include Supplements'}).isChecked(),true);assert.equal(await page.locator('[data-report-energy-kind=consumed] .report-energy-center strong').textContent(),'389');
  const settings=page.getByRole('dialog',{name:'Report Settings',exact:true});
  const dates=page.getByRole('dialog',{name:'Date Range',exact:true});
  const days=page.getByRole('dialog',{name:'Days Displayed',exact:true});
  const openDays=()=>settings.getByRole('button',{name:/^Days Displayed/}).click();
  const openDates=()=>settings.getByRole('button',{name:/^Date Range/}).click();
  const choice=(dialog,name)=>dialog.getByRole('button',{name,exact:true});
  const captureFilter=async(name,dialog)=>{
   assert.equal(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth),true);
   await page.screenshot({path:'.local/report-filter-'+name+'.png'});
  };
  await openDays();
  assert.deepEqual(await days.locator('[data-choice] strong').allTextContents(),['All','Non Empty','Completed']);
  assert.equal(await choice(days,'Non Empty').getAttribute('aria-pressed'),'true');
  const beforeCancel=requests.length;
  await page.evaluate(()=>history.back());await days.waitFor({state:'detached'});
  assert.equal(await settings.isVisible(),true);assert.equal(requests.length,beforeCancel);
  await openDays();await choice(days,'All').click();await days.waitFor({state:'detached'});assert.equal(requests.at(-1).dayFilter,'all');
  await openDays();await captureFilter('days',days);
  assert.equal(await choice(days,'All').getAttribute('aria-pressed'),'true');
  await page.route('**/api/nutrition-report?*',route=>route.fulfill({status:503,json:{error:'Report unavailable. Try again.'}}),{times:1});
  await choice(days,'Completed').click();await days.getByRole('alert').filter({hasText:'Report unavailable'}).waitFor();
  assert.equal(await choice(days,'All').getAttribute('aria-pressed'),'true');
  const energy=page.locator('[data-report-energy-kind=consumed] .report-energy-center strong'),appliedEnergy=await energy.textContent();
  reportWait=new Promise(resolve=>releaseReport=resolve);const pending=page.waitForRequest(r=>new URL(r.url()).pathname==='/api/nutrition-report');
  await choice(days,'Completed').click();await pending;await page.keyboard.press('Escape');
  await days.waitFor({state:'detached'});releaseReport();reportWait=null;
  assert.match(await settings.getByRole('button',{name:/Days Displayed/}).innerText(),/All/);
  assert.equal(await energy.textContent(),appliedEnergy);
  await openDates();assert.equal(await choice(dates,'Last 7 Days').getAttribute('aria-pressed'),'true');
  await choice(dates,'Today').click();await dates.waitFor({state:'detached'});assert.equal(requests.at(-1).from,date);
  await openDates();await choice(dates,'All Time').click();await dates.waitFor({state:'detached'});
  await openDates();assert.equal(await choice(dates,'All Time').getAttribute('aria-pressed'),'true');
  await choice(dates,'Custom Range').click();
  const start=dates.getByLabel('Custom Start Date'),end=dates.getByLabel('Custom End Date');
  const prior=requests.length;await start.fill('2026-11-19');await choice(dates,'Apply').click();
  await dates.getByRole('alert').filter({hasText:'Choose a valid date range'}).waitFor();assert.equal(requests.length,prior);
  await page.keyboard.press('Escape');await dates.waitFor({state:'detached'});await openDates();
  assert.equal(await choice(dates,'All Time').getAttribute('aria-pressed'),'true');
  await choice(dates,'Custom Range').click();assert.equal(await start.inputValue(),date);
  await start.fill('2026-11-01');await end.fill('2026-11-07');await choice(dates,'Apply').click();
  await dates.waitFor({state:'detached'});assert.equal(requests.at(-1).from,'2026-11-01');assert.equal(requests.at(-1).to,'2026-11-07');
  assert.equal(await settings.getByRole('alert',{includeHidden:true}).textContent(),'');
  const reportRange=dateButton.locator('span').first();
  assert.match(await reportRange.textContent(),/^Daily Average for Nov 1\s*[–-]\s*7, 2026$/);
  const unlogged=page.locator('[data-report-energy-kind=consumed] .report-unlogged-macro');
  assert.deepEqual(await unlogged.locator('b').allTextContents(),['Protein','Carbs','Fat']);
  assert.deepEqual(await unlogged.locator('small').allTextContents(),Array(3).fill('Added when logged'));
  assert.equal(await energy.textContent(),'—');
  await captureFilter('settings',settings);await openDates();
  assert.equal(await choice(dates,'Custom Range').getAttribute('aria-pressed'),'true');
  assert.equal(await start.inputValue(),'2026-11-01');assert.equal(await end.inputValue(),'2026-11-07');
  await captureFilter('dates',dates);
  await start.fill('2026-11-03');await page.route('**/api/nutrition-report?*',route=>route.fulfill({status:503,json:{error:'Report unavailable. Try again.'}}),{times:1});
  await choice(dates,'Apply').click();await dates.getByRole('alert').filter({hasText:'Report unavailable'}).waitFor();
  await choice(dates,'Close').click();await openDates();assert.equal(await start.inputValue(),'2026-11-01');
  await page.setViewportSize({width:320,height:720});
  assert.equal(await dates.evaluate(node=>node.scrollWidth<=node.clientWidth),true);
  await page.setViewportSize({width:412,height:915});await choice(dates,'Close').click();
  await openDays();await choice(days,'Completed').click();await days.waitFor({state:'detached'});assert.equal(requests.at(-1).dayFilter,'complete');
  await settings.getByRole('switch',{name:'Include Supplements'}).uncheck();
  await page.waitForFunction(()=>!document.querySelector('[name=includeSupplements]').disabled);assert.equal(requests.at(-1).includeSupplements,false);
  await openDates();await choice(dates,'Today').click();await dates.waitFor({state:'detached'});
  await page.keyboard.press('Escape');await page.locator('[data-mobile-report=settings]').waitFor({state:'detached'});
  assert.equal(await page.locator('[data-report-section=macros]').getAttribute('open'),null,'range changes preserve collapsed sections');
  await page.locator('[data-report-score]').first().click();await page.locator('[data-mobile-report=score]').waitFor();assert.ok(await page.locator('[data-mobile-report=score]').textContent().then(text=>text.includes('Known days')));await page.keyboard.press('Escape');
  await page.locator('[data-report-balance="omega6-omega3"]').click();await page.locator('[data-mobile-report=balance]').waitFor();assert.equal(await page.locator('[data-mobile-report=balance] [data-nutrient-ratio="omega6-omega3"]').count(),1);await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Newsfeed',exact:true}).click();await page.getByText('Fixture News',{exact:true}).waitFor();await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:'Charts',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[aria-label="Manage Charts"]').disabled);await page.getByRole('button',{name:'Manage Charts',exact:true}).first().click();await page.getByRole('heading',{name:'Manage Charts',exact:true}).waitFor();await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('button',{name:'Newsfeed',exact:true}).click();await page.getByText('Fixture News',{exact:true}).waitFor();await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:'Snapshots',exact:true}).click();assert.equal(await page.locator('#header [data-discover=shell-settings]').count(),0);assert.equal(await page.getByRole('button',{name:'Newsfeed',exact:true}).count(),1);
  await page.getByRole('button',{name:'Report',exact:true}).click();await page.locator('.mobile-report-toolbar').waitFor();await page.waitForFunction(()=>Object.keys(window.Chart?.instances??{}).length===2);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));state.settings.energyUnit='kJ';state.settings.completedDays=[date];await page.getByRole('button',{name:'More options',exact:true}).click();await page.locator('[data-report-action=refresh]').click();await page.waitForFunction(()=>document.querySelector('[data-report-section=macros] [data-mobile-nutrient=calories]')?.textContent.includes('kJ'));await page.keyboard.press('Escape');assert.match(await page.locator('[data-report-section=macros] [data-mobile-nutrient=calories]').textContent(),/1,627.6 kJ/);assert.deepEqual(errors,[]);await page.screenshot({path:'.local/report-source-restored.png',fullPage:true});
 }finally{releaseReport?.();await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
