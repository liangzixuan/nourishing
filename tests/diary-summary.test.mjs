import {CHROME_EXECUTABLE} from './_chrome.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {initialState,act} from '../server/domain/workspace.mjs';
import {calculateSummary} from '../server/domain/nutrition.mjs';
import {diarySummaryPresentation} from '../server/diary-summary.mjs';
import {diarySelectionNutrition} from '../server/domain/diary-selection-nutrition.mjs';
import {applyWorkspaceCommand} from '../server/workspace-commands.mjs';

const date='2026-11-15',clock={now:new Date(date+'T18:00:00Z'),timeZone:'UTC'};
const view=state=>{const summary=calculateSummary(state,date);return {date,summary,energyUnit:state.settings.energyUnit??'kcal',presentation:diarySummaryPresentation(state,summary,clock)};};
test('selected energy uses the same full-day target and expenditure for its remaining amount and balance',()=>{
 const state=initialState();
 act(state,'entry.add',{date,amount:1,name:'Breakfast',nutrients:{calories:200}});
 const selected=state.entries.at(-1).id;
 act(state,'entry.add',{date,amount:1,name:'Lunch',nutrients:{calories:500}});
 state.settings.energyPolicy={version:1,resting:{mode:'custom',kcal:1600},baseline:{mode:'custom',kcal:250},activity:{mode:'manual'},thermicEffect:false,target:{mode:'fixed',includeAboveBaseline:false},display:'balance'};
 const read=()=>diarySelectionNutrition(state,{date,scope:'selected',records:[{collection:'entries',id:selected}]}).chartSummary.energy;
 const energy=read();assert.equal(energy.consumed,200);assert.equal(energy.remaining,1800);assert.equal(energy.balance,1650);
 delete state.settings.energyPolicy;assert.equal(read().balance,null);
});
async function checkDiaryHighlights(page){
 const render=(language,rows)=>page.evaluate(async ({language,rows})=>{
  const {mobileDiarySummary}=await import('/diary-summary-source/mobile-diary.js');
  const markup=mobileDiarySummary({summary:{},facts:{diaryDisplay:{policy:{},highlights:rows}},settings:{showEnergy:false,showMacros:false,showScores:false},unit:'kcal',language,icons:{chevron:'',more:'',back:''},labels:{highlights:'Highlights',report:'Report',summary:'Summary',previous:'Previous',next:'Next'},nutrientName:row=>row.name});
  const container=document.createElement('div');container.innerHTML=markup;
  return [...container.querySelectorAll('.md-highlights button')].map(node=>node.getAttribute('aria-label'));
 },{language,rows});
 const row={id:'vitaminB12',name:'Vitamin B12',unit:'µg',target:2.4,active:true};
 const empty={...row,value:0,status:'complete',coverage:{known:0,total:0,complete:true}};
 const known={...row,value:1.16,coverage:{known:1,total:1,complete:true}};
 assert.deepEqual(await render('en',[empty,known,{...known,value:0},{...known,status:'partial',coverage:{known:1,total:2,complete:false}},{...empty,value:null,status:'unknown',coverage:{known:0,total:1,complete:false}}]),[
  'B12 (Cobalamin), No Data, 0%','B12 (Cobalamin), 1.2 of 2.4 µg, 48%','B12 (Cobalamin), 0.0 of 2.4 µg, 0%',
  'B12 (Cobalamin), 1.2 of 2.4 µg, Partial Data, 48%','B12 (Cobalamin), No Data, —'
 ]);
 assert.deepEqual(await render('fr',[empty,known]),['B12 (cobalamine), Aucune donnée, 0%','B12 (cobalamine), 1,2 sur 2,4 µg, 48%']);
 assert.deepEqual(await render('de',[empty]),['B12 (Cobalamin), Keine Daten, 0%']);
 assert.deepEqual(await render('pt-BR',[empty]),['B12 (cobalamina), Sem dados, 0%']);
}
async function checkDiaryBudgets(page){
 const cases=[
  {mode:'balance',intake:0,unit:'kcal',heading:'Balance',label:'Deficit',value:'1,850',detail:'1850',chart:[0,1850]},
  {mode:'balance',intake:2000,unit:'kJ',heading:'Balance',label:'Surplus',value:'628',detail:'627.6',chart:[2000,0]},
  {mode:'balance',intake:1850,unit:'kcal',heading:'Balance',label:'Balance',value:'0',detail:'0',chart:[1850,0]},
  {mode:'balance',intake:100,unknown:true,unit:'kJ',heading:'Balance',label:'Balance',value:'\u2014',detail:'\u2014',chart:[1]},
  {mode:'remaining',intake:2100,unit:'kJ',heading:'Target',label:'Remaining',value:'-418',detail:'-418.4',chart:[2100,0]},
 ];
 for(const {mode,intake,unit,unknown,heading,label,value,detail,chart} of cases){
  const state=initialState();
  state.settings.energyUnit=unit;
  state.settings.energyPolicy={version:1,resting:{mode:'custom',kcal:1600},baseline:{mode:'custom',kcal:250},activity:unknown?{mode:'health-connect',zone:'UTC'}:{mode:'manual'},thermicEffect:false,target:{mode:'fixed',includeAboveBaseline:false},display:mode};
  if(intake)act(state,'entry.add',{date,amount:1,name:'Fixture food',nutrients:{calories:intake}});
  await page.evaluate(async diary=>{
   const {diarySummaryMarkup,mountDiarySummary}=await import('/diary-summary.js');
   const {openDiarySummaryAction}=await import('/diary-summary-actions.js');
   window.disposeDetail?.();window.mounted.dispose();
   const root=document.querySelector('main'),sheet=window.sheet;
   root.innerHTML=diarySummaryMarkup(diary);
   window.mounted=mountDiarySummary({root,diary,onAction:({action})=>{
    window.disposeDetail=openDiarySummaryAction({action,diary,content:sheet,show:html=>sheet.innerHTML=html});
   }});
  },view(state));
  const budget=page.locator('.md-energy-item').last();
  assert.equal(await page.locator('[data-md-page-id=energy] [data-action="edit-day-targets"]').textContent(),heading);
  assert.equal(await budget.getAttribute('data-kind'),mode);
  assert.equal(await budget.locator('canvas').getAttribute('data-md-ring'),mode);
  assert.equal(await budget.locator('canvas').getAttribute('aria-label'),label);
  assert.equal(await budget.locator('.md-ring strong').textContent(),value);
  assert.equal(await budget.locator('small').textContent(),unit);
  await budget.click();
  const card=page.locator('aside [data-budget] .ds-energy-card');
  if(unit==='kcal'&&intake===0){
   const expenditure=page.locator('aside [data-card=expenditure]');
   assert.equal(await expenditure.locator('[data-component=baseline] dt').textContent(),'Baseline Activity');
   assert.equal(await expenditure.locator('[data-component=baseline] dd').last().textContent(),'14%');
   assert.equal(await card.locator('.ds-budget-row').nth(1).locator('dd').textContent(),'- 0 kcal');
  }
  assert.equal(await card.getAttribute('data-card'),mode);
  assert.equal(await card.locator('h3').textContent(),label);
  assert.equal(await card.locator('.ds-energy-ring strong').textContent(),detail);
  await page.waitForFunction(()=>['main .md-energy-item:last-child canvas','aside [data-budget] canvas'].every(selector=>window.Chart.getChart(document.querySelector(selector))));
  const slices=await page.evaluate(()=>['main .md-energy-item:last-child canvas','aside [data-budget] canvas'].map(selector=>window.Chart.getChart(document.querySelector(selector)).data.datasets[0].data));
  assert.deepEqual(slices,[chart,chart]);
 }
}
test('summary settings persist through canonical validators and reject stale or invalid choices',()=>{
 const state=initialState(),base=view(state).presentation.scoreDisplay;
 applyWorkspaceCommand(state,{type:'scoreDisplay.change',payload:{base,change:{kind:'replace',index:0,scoreId:'protein'}}});
 assert.equal(view(state).presentation.scores[0].id,'protein');
 assert.throws(()=>applyWorkspaceCommand(state,{type:'scoreDisplay.change',payload:{base,change:{kind:'replace',index:0,scoreId:'fiber'}}}),{status:409});
 const policy={version:1,highlighted:['protein','fiber'],showHighlights:true,macroDisplay:'remaining'};
 applyWorkspaceCommand(state,{type:'diaryDisplay.save',payload:{diaryDisplay:policy,showWater:false,showEnergy:false,showMacros:true}});
 assert.deepEqual(view(state).summary.diaryDisplay.policy,policy);assert.equal(view(state).presentation.settings.showWater,false);
 for(const payload of [{showWater:'false'},{diaryDisplay:{...policy,highlighted:['fiber','fiber']}},{diaryDisplay:{...policy,highlighted:['madeup']}},{showWater:true,owner:'other'},{}]){
  const before=structuredClone(state);assert.throws(()=>applyWorkspaceCommand(state,{type:'diaryDisplay.save',payload}),error=>(error.status??error.code)===400);assert.deepEqual(state,before);
 }
});
test('diary presentation preserves canonical nutrition, selected scores, hydration and account settings',()=>{
 const state=initialState();state.entries=[];state.biometrics=[];
 const empty=view(state);assert.equal(empty.summary.energy.target,2000);assert.equal(empty.summary.hydration.logged,0);assert.equal(empty.summary.hydration.target,2500);assert.equal(empty.presentation.fasting.status,'none');
 act(state,'entry.add',{date,group:'Lunch',amount:1,name:'Fixture lunch',nutrients:{calories:200,protein:10,carbs:30,fat:4}});
 act(state,'water.add',{date,time:'12:00',amount:500});
 state.settings.scoreSelection=['protein','overall'];state.settings.showWater=false;state.settings.showEnergy=false;state.settings.energyUnit='kJ';
 state.settings.discover={version:1,fastingDiary:false};state.fasts=[{id:'fast',start:date+'T16:30:00Z',end:null,goalHours:16}];
 const before=structuredClone(state),actual=view(state);assert.deepEqual(state,before);
 assert.equal(actual.summary.energy.consumed,200);assert.equal(actual.summary.hydration.logged,500);assert.equal(actual.presentation.settings.showWater,false);assert.equal(actual.presentation.settings.showEnergy,false);assert.deepEqual(actual.presentation.scores.map(row=>row.id),['protein','overall']);
 assert.equal(actual.presentation.fasting.visible,false);assert.equal(actual.presentation.fasting.elapsedSeconds,5400);assert.equal(actual.presentation.fasting.remainingSeconds,52200);
 assert.deepEqual(actual.summary,calculateSummary(state,date));
 state.fasts[0].start=date+'T19:00:00Z';assert.equal(view(state).presentation.fasting.status,'future-start');assert.equal(view(state).presentation.fasting.elapsedSeconds,null);
});

test('source diary carousel, rings, water, actions and disposal work on a phone viewport',async()=>{
 const state=initialState();state.entries=[];state.biometrics=[];const diary=view(state);
 const server=createServer(async(req,res)=>{const path=new URL(req.url,'http://localhost').pathname;
  try{
   if(path==='/fixture.css'){res.setHeader('Content-Type','text/css');return res.end('html{font-size:18px}body{margin:0}main{width:100%}');}
   if(path==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(`import {diarySummaryMarkup,mountDiarySummary} from '/diary-summary.js';window.actions=[];window.diary=${JSON.stringify(diary)};const root=document.querySelector('main');root.innerHTML=diarySummaryMarkup(window.diary);window.mounted=mountDiarySummary({root,diary:window.diary,onAction:action=>window.actions.push(action)});`);}
   if(path==='/'){res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");res.setHeader('Content-Type','text/html');return res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/mobile-theme.css"><link rel="stylesheet" href="/mobile-diary.css"><link rel="stylesheet" href="/diary-summary.css"><link rel="stylesheet" href="/fixture.css"><body class="discover-mobile dark diary-mobile"><main></main><script type="module" src="/fixture.js"></script>');}
   if(!/^\/[a-zA-Z0-9/_.-]+\.(?:js|mjs|css|woff2)$/.test(path)||path.includes('..'))return res.writeHead(404).end();res.setHeader('Content-Type',path.endsWith('.css')?'text/css':path.endsWith('.woff2')?'font/woff2':'text/javascript');res.end(readFileSync(new URL('../public'+path,import.meta.url)));
  }catch{res.writeHead(404).end();}
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});const page=await browser.newPage({viewport:{width:412,height:915},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.addInitScript(()=>{window.cspViolations=[];document.addEventListener('securitypolicyviolation',event=>window.cspViolations.push({directive:event.violatedDirective,uri:event.blockedURI}));});await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('[data-md-summary]').waitFor();await page.waitForFunction(()=>Object.keys(window.Chart?.instances??{}).length===3);
  assert.deepEqual(await page.locator('.md-energy-item strong').allTextContents(),['0','Consumed','—','Expenditure','2,000','Remaining']);
  await page.getByRole('button',{name:'Remaining',exact:false}).first().click();assert.equal((await page.evaluate(()=>window.actions.at(-1))).kind,'remaining');
  await page.getByRole('button',{name:'Target',exact:true}).click();assert.equal((await page.evaluate(()=>window.actions.at(-1))).action,'edit-day-targets');
  await page.locator('[data-md-dot="1"]').click();assert.equal(await page.locator('[data-md-page-id=macros]').isVisible(),true);const consumed=await page.locator('[data-md-page-id=macros] .md-target').first().textContent();
  await page.getByRole('button',{name:'Consumed',exact:true}).click();const remaining=await page.locator('[data-md-page-id=macros] .md-target').first().textContent();assert.notEqual(consumed,remaining);assert.match(remaining,/2,000/);
  await page.locator('[data-md-page-id=macros] [data-id=protein]').click();assert.equal((await page.evaluate(()=>window.actions.at(-1))).id,'protein');
  await page.locator('[data-md-dot="2"]').click();assert.equal(await page.locator('[data-md-page-id=highlights]').isVisible(),true);
  await page.locator('[data-md-dot="3"]').click();assert.equal(await page.locator('[data-md-page-id=scores]').isVisible(),true);await page.locator('[data-md-page-id=scores] [data-action=score-details]').first().click();assert.equal((await page.evaluate(()=>window.actions.at(-1))).action,'score-details');
  await page.locator('[data-action=water-menu]').click();assert.equal((await page.evaluate(()=>window.actions.at(-1))).action,'water-menu');assert.equal(await page.locator('.md-water').getAttribute('open'),null);
  await page.locator('.md-water summary').click();await page.locator('.water-glasses [data-action=water]').first().click();assert.equal((await page.evaluate(()=>window.actions.at(-1))).amount,236.5882365);
  await page.locator('.md-fasting summary').click();await page.getByRole('button',{name:'Open Fasting'}).click();assert.equal((await page.evaluate(()=>window.actions.at(-1))).action,'open-fasting');
  await page.locator('[data-md-dot="0"]').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  mkdirSync('.local/ui-parity',{recursive:true});await page.screenshot({path:'.local/ui-parity/diary-summary-restored.png'});
  const count=await page.evaluate(()=>{window.mounted.dispose();return window.actions.length;});assert.equal(await page.evaluate(()=>Object.keys(window.Chart.instances).length),0);await page.getByRole('button',{name:'Target',exact:true}).click();assert.equal(await page.evaluate(()=>window.actions.length),count);assert.deepEqual(errors,[]);
  await page.evaluate(async()=>{const {openDiarySummaryAction}=await import('/diary-summary-actions.js');const sheet=document.createElement('aside');document.body.append(sheet);window.sheet=sheet;window.reports=[];window.openSummary=(action,id)=>openDiarySummaryAction({action,id,diary:window.diary,show:html=>sheet.innerHTML=html,close:()=>sheet.replaceChildren(),header:title=>`<h2>${title}</h2>`,content:sheet,onReport:date=>window.reports.push(date)});});
  await page.evaluate(()=>window.openSummary('score-details','overall'));assert.match(await page.locator('aside').textContent(),/All Targets: 0%/);await page.getByRole('button',{name:'View Daily Report'}).click();assert.deepEqual(await page.evaluate(()=>window.reports),[date]);assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.cspViolations),[]);
  await checkDiaryHighlights(page);
  await checkDiaryBudgets(page);assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
