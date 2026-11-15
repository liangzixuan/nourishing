import {dashboardView} from '../server/dashboard-view.mjs';
// Runs the real HTTP routes and browser modules against disposable in-memory data.
// Live Appwrite permissions and transactions are checked separately.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {createHandler} from '../server/http.mjs';
import {initialState,previewDiaryItem} from '../server/domain/workspace.mjs';
import {applyWorkspaceCommand,parseCommand} from '../server/workspace-commands.mjs';
import {calculateSummary,entryFacts} from '../server/domain/nutrition.mjs';
import {digest} from '../server/data-codec.mjs';
import {targetView,reportView} from '../server/nutrition-views.mjs';
import {chartView,csvReport} from '../server/chart-view.mjs';
import {repeatView} from '../server/repeat-view.mjs';
import {recordOptions,recordView,exerciseSearch,exerciseEstimateView} from '../server/record-views.mjs';
import {targetPolicyView} from '../server/target-policy-view.mjs';
import {libraryView,libraryItem} from '../server/library-view.mjs';
let state=initialState();const date='2026-11-14',context={today:date};
state.profile.weight=80;state.foods.push({id:'fixture',name:'Fixture oats',grams:100,serving:'100 g',nutrients:{calories:200,protein:10,carbs:30,fat:4}});
const service={dashboard:async(_,date)=>dashboardView(state,{date},{now:new Date(),timeZone:'UTC'}),
 current:async()=>({id:'fixture'}),
 readDiary:async(_,day)=>({date:day,theme:state.settings.theme,revision:digest(state),groups:state.settings.groups,completed:state.settings.completedDays?.includes(day)??false,entries:state.entries.filter(r=>r.date===day).map(r=>({...r,facts:entryFacts(state,r)})),notes:state.notes.filter(r=>r.date===day),biometrics:state.biometrics.filter(r=>r.date===day),summary:calculateSummary(state,day)}),
 targets:async(_,day)=>targetView(state,day),nutritionReport:async(_,options)=>reportView(state,options),targetPolicies:async(_,day)=>targetPolicyView(state,day,context),
 charts:async(_,range)=>chartView(state,range),exportReport:async(_,input)=>csvReport(state,input),repeats:async(_,day)=>repeatView(state,day),
 recordOptions:async(_,day)=>recordOptions(state,day),recordItem:async(_,input)=>recordView(state,input),exercises:async(_,input)=>exerciseSearch(input),exerciseEstimate:async(_,input)=>exerciseEstimateView(state,input),
 library:async()=>libraryView(state),libraryItem:async(_,kind,id)=>libraryItem(state,kind,state[kind+'s'].find(r=>r.id===id)),searchCatalog:async()=>({items:state.foods,total:1,nextOffset:null}),previewDiary:async(_,input)=>previewDiaryItem(state,input),
 workspaceCommand:async(_,input)=>{parseCommand(input);if(input.revision!==digest(state))throw Object.assign(Error('Refresh and try again.'),{code:409});const next=structuredClone(state);const saved=applyWorkspaceCommand(next,{type:input.type,payload:input.payload},context);state=next;return {revision:digest(state),item:saved};}
};
const assets=new Map();for(const name of readdirSync('public',{recursive:true}))if(/\.(html|js|mjs|css|svg|woff2)$/.test(name))assets.set('/'+name.replaceAll('\\','/'),{body:readFileSync('public/'+name),type:/\.m?js$/.test(name)?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':name.endsWith('.woff2')?'font/woff2':'text/html'});assets.set('/diary',assets.get('/diary.html'));
let handler;const server=createServer((req,res)=>handler(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;handler=createHandler({config:{origin},service,assets});let browser;
try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const browserContext=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});await browserContext.setExtraHTTPHeaders({Cookie:'__Host-nourishing_session=fixture'});const page=await browserContext.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));const failures=[];page.on('response',r=>{if(r.url().includes('/api/')&&r.status()>=400)failures.push([r.status(),new URL(r.url()).pathname]);});
 await page.goto(origin+'/diary');await page.getByLabel('Diary date').fill(date);await page.getByRole('heading',{name:'Notes',exact:true}).waitFor();
 const button=name=>page.getByRole('button',{name,exact:true}),field=name=>page.getByLabel(name,{exact:true}),add=async kind=>{await button('Add entry').click();await button(kind).click();},saved=async label=>{await button(label).click();await page.locator('#sheet').waitFor({state:'hidden'});};
 await add('Note');await field('Note').fill('Integration note');await saved('Add to diary');await page.locator('[data-record-kind=note][data-record-id]').click();await field('Note').fill('Edited note');await saved('Save changes');assert.equal(state.notes[0].text,'Edited note');
 await add('Exercise');await button('Custom exercise').click();await field('Exercise').fill('Integration walk');await field('Minutes').fill('30');await field('Calories (kcal)').fill('150');await saved('Add to diary');await page.locator('[data-action=edit-entry]').filter({hasText:'Integration walk'}).click();await field('Minutes').fill('45');await saved('Save changes');assert.equal(state.entries[0].duration,45);
 await add('Biometric');await field('Biometric').selectOption('catalog:blood-pressure');await field('Systolic').fill('120');await field('Diastolic').fill('80');await saved('Add to diary');assert.equal(state.biometrics.length,2);
 await page.locator('#foods-tab').click();await button('Repeat Items').click();await button('＋ New').click();await page.locator('[data-item]').click();await page.locator('[name=amount]').fill('50');await field('Serving').selectOption('g');await saved('Save');await button('Review 1 due').click();await saved('Add to diary');assert.equal(state.repeats.length,1);assert.equal(state.entries.length,2);
 await page.locator('#discover-tab').click();await button('Charts').click();await button('＋ Create').click();await field('Chart name').fill('Protein trend');await field('Primary').selectOption({label:'Protein · g'});await saved('Save');await page.getByRole('heading',{name:'Protein trend'}).waitFor();assert.equal(state.charts.length,1);
 await page.screenshot({path:'.local/integrated-charts.png',fullPage:true});
 await page.locator('#settings-tab').click();await button('Macro & Energy Targets').click();await page.getByRole('heading',{name:'Macro & Energy Targets',exact:true}).waitFor();await button('Close').click();await button('Export data').click();const downloaded=page.waitForEvent('download');await button('Download CSV').click();const download=await downloaded;assert.ok(download.suggestedFilename().endsWith('.csv'));await button('Close').click();
 await add('Photo Log');await page.locator('.photo-log').waitFor();await button('Close').click();assert.equal(await page.locator('.photo-log').count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));writeFileSync('.local/integrated-local-result.json',JSON.stringify({passed:true,provider:'in-memory fixture',checks:['note correction','exercise correction','paired biometrics','repeat review/apply','custom chart','target controls','CSV download','photo dismissal','no API/script errors or overflow']},null,2));console.log('PASS integrated cloud browser fixture');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
