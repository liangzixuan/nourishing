import {favoriteView} from '../server/library-extras.mjs';
import {diarySummaryPresentation} from '../server/diary-summary.mjs';
import {diaryToolsPresentation} from '../server/diary-tools.mjs';
import {libraryView} from '../server/library-view.mjs';
import {targetView} from '../server/nutrition-views.mjs';
import {barcodeAssets} from './package-barcode-assets.mjs';
// Real HTTP routing/CSP and production mobile shell; disposable in-memory data.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,readdirSync,writeFileSync,statSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {createHandler} from '../server/http.mjs';
import {initialState} from '../server/domain/workspace.mjs';
import {calculateSummary,entryFacts} from '../server/domain/nutrition.mjs';
import {dashboardView} from '../server/dashboard-view.mjs';
import {reportView} from '../server/nutrition-views.mjs';
import {applyWorkspaceCommand,parseCommand} from '../server/workspace-commands.mjs';
import {digest} from '../server/data-codec.mjs';
import {fastingView} from '../server/fasting.mjs';
const state=initialState(),date='2026-11-15',clock={now:new Date(date+'T12:00:00Z'),timeZone:'UTC'};
let authenticated=true;
const requireAccount=()=>{if(!authenticated)throw Object.assign(Error('Please sign in.'),{code:401});};
state.biometrics.push({id:'weight',date,type:'weight',value:76,unit:'kg'});
const service={favorites:async()=>favoriteView(state),library:async()=>libraryView(state),targets:async(_,day)=>targetView(state,day),current:async()=>{requireAccount();return {id:'fixture'};},login:async()=>{authenticated=true;return {secret:'fixture',expire:new Date(Date.now()+3600000).toISOString()};},searchCatalog:async()=>({items:[],nextOffset:null}),fasting:async()=>fastingView(state,clock),readDiary:async(_,day)=>{requireAccount();return diaryToolsPresentation(state,{presentation:diarySummaryPresentation(state,calculateSummary(state,day),clock),date:day,theme:state.settings.theme,revision:digest(state),groups:state.settings.groups,completed:false,entries:state.entries.filter(r=>r.date===day).map(r=>({...r,facts:entryFacts(state,r)})),notes:[],biometrics:state.biometrics.filter(r=>r.date===day),summary:calculateSummary(state,day)});},
 dashboard:async(_,day)=>({...dashboardView(state,{date:day},clock),news:{version:1,items:[{id:'fixture-news',title:'Fixture news',body:'Synthetic notice for visibility testing.'}]}}),nutritionReport:async(_,options)=>reportView(state,options,clock),
 workspaceCommand:async(_,input)=>{parseCommand(input);if(input.revision!==digest(state))throw Object.assign(Error('Refresh and try again.'),{code:409});const item=applyWorkspaceCommand(state,{type:input.type,payload:input.payload},clock);return {revision:digest(state),item};}};
const assets=new Map();for(const name of readdirSync('public',{recursive:true}))if(statSync('public/'+name).isFile()&&/\.(html|js|mjs|css|svg|woff2)$/.test(name)){const key=name.replaceAll('\\','/');assets.set('/'+key,{body:readFileSync('public/'+name),type:/\.m?js$/.test(name)?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':name.endsWith('.woff2')?'font/woff2':'text/html'});}assets.set('/diary',assets.get('/diary.html'));
assets.set('/',assets.get('/index.html'));
for(const asset of await barcodeAssets())assets.set('/'+asset.path,asset);
let handler,browser,page;const server=createServer((req,res)=>{
 // Match Appwrite/Astro static-index precedence. Root widget navigation must execute in the client.
 if(new URL(req.url,'http://fixture.local').pathname==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end(assets.get('/').body);return;}
 handler(req,res);
});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;handler=createHandler({config:{origin},service,assets});
try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true,colorScheme:'dark'});await context.setExtraHTTPHeaders({Cookie:'__Host-nourishing_session=fixture'});page=await context.newPage();page.on('response',r=>{if(r.status()>=400)console.error(r.status(),r.url());});page.setDefaultTimeout(15000);const errors=[],blocked=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('console',m=>{if(m.type()==='error'){blocked.push(m.text());console.error(m.text());}});
 const response=await page.goto(origin+'/diary');assert.match(response.headers()['content-security-policy'],/script-src 'self' 'wasm-unsafe-eval'; style-src 'self'/);
 await page.locator('.md-summary').waitFor();await page.getByLabel('Diary date',{exact:true}).fill(date);
 await page.locator('#add-food').click();await page.locator('.am-sheet').waitFor({timeout:3000});
 assert.equal(await page.locator('.am-tile').count(),4);assert.equal(await page.locator('.am-row').count(),5);
 await page.screenshot({path:'.local/ui-restored-add-menu.png'});
 assert.ok(await page.locator('.am-sheet').evaluate(el=>el.getBoundingClientRect().top>200));
 await page.getByRole('button',{name:'EDIT MENU',exact:true}).click();
 await page.getByRole('button',{name:'Color for Search Food',exact:true}).click();await page.getByRole('button',{name:'Color #ff9377',exact:true}).click();
 await page.getByRole('button',{name:'Hide Voice Log',exact:true}).click();await page.getByRole('button',{name:'SWAP TOP & BOTTOM SECTIONS',exact:true}).click();await page.getByRole('button',{name:'DONE',exact:true}).click();
 await page.getByRole('button',{name:'EDIT MENU',exact:true}).waitFor();assert.deepEqual(state.settings.addMenu.hidden,['voice']);assert.equal(state.settings.addMenu.colors.food,'#ff9377');assert.equal(state.settings.addMenu.swapped,true);
 await page.keyboard.press('Escape');await page.locator('.am-sheet').waitFor({state:'detached'});
 await page.reload();await page.locator('.md-summary').waitFor();await page.locator('#add-food').click();assert.equal(await page.locator('[data-am=select][data-id=voice]').count(),0);assert.equal(await page.locator('[data-id=food] .am-icon').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 147, 119)');
 await page.getByRole('button',{name:'EDIT MENU',exact:true}).click();await page.getByRole('button',{name:'Hide Search Food',exact:true}).click();await page.keyboard.press('Escape');await page.getByRole('button',{name:'Search Food',exact:true}).waitFor();assert.deepEqual(state.settings.addMenu.hidden,['voice']);
 await page.mouse.click(10,20);await page.locator('.am-sheet').waitFor({state:'detached'});
 await page.locator('#add-food').click();await page.getByRole('button',{name:'Search Food',exact:true}).click();await page.getByRole('heading',{name:'Add Food',exact:true}).waitFor();assert.equal(await page.locator('.am-sheet').count(),0);await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.evaluate(()=>Promise.all([...document.images].map(img=>img.decode().catch(()=>{}))));await page.screenshot({path:'.local/ui-restored-diary.png'});
 await page.getByRole('button',{name:'Add water',exact:true}).click();await page.locator('input[name=amount]').fill('250');await page.getByRole('button',{name:'Add to Diary',exact:true}).click();await page.locator('#sheet').waitFor({state:'hidden'});assert.equal(calculateSummary(state,date).hydration.logged,250);await page.locator('.md-water>summary').click();await page.getByRole('button',{name:'Add 250 mL',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.md-water small')?.textContent.startsWith('0.5'));assert.equal(calculateSummary(state,date).hydration.logged,500);

 await page.getByRole('button',{name:'Diary actions',exact:true}).click();await page.getByRole('button',{name:'Diary Display',exact:true}).click();await page.getByRole('switch',{name:'Water',exact:true}).uncheck();await page.getByRole('button',{name:'Save',exact:true}).click();await page.locator('#sheet').waitFor({state:'hidden'});assert.equal(state.settings.showWater,false);assert.equal(await page.locator('.md-water').count(),0);
 await page.getByRole('button',{name:'Foods',exact:true}).click();await page.locator('.mfh-home').waitFor();await page.waitForFunction(()=>!document.querySelector('[data-action="new-food"]').disabled);await page.evaluate(()=>Promise.all([...document.images].map(img=>img.decode().catch(()=>{}))));await page.screenshot({path:'.local/ui-restored-foods.png'});assert.equal(await page.locator('.app-header .mfh-header').count(),1);assert.equal(await page.locator('.mfh-card').count(),6);
 await page.locator('[data-tab=foods]').click();await page.getByRole('heading',{name:'Custom Foods',exact:true}).waitFor();await page.locator('[data-action=foods-home]').click();assert.equal(await page.locator('input:focus').count(),0);
 await page.getByRole('button',{name:'More',exact:true}).click();await page.locator('.mm-home-header').waitFor();await page.evaluate(()=>Promise.all([...document.images].map(img=>img.decode().catch(()=>{}))));await page.screenshot({path:'.local/ui-restored-more.png'});await page.getByRole('button',{name:'Display',exact:true}).click();await page.getByRole('combobox',{name:'Theme',exact:true}).selectOption('system');await page.waitForFunction(()=>!document.querySelector('[aria-label=Theme]').disabled);assert.equal(state.settings.theme,'system');await page.getByRole('button',{name:'Back',exact:true}).click();assert.equal(await page.locator('input:focus').count(),0);
 await page.getByRole('button',{name:'Diary',exact:true}).click();await page.locator('.md-summary').waitFor();await page.getByRole('button',{name:'Diary actions',exact:true}).click();await page.getByRole('button',{name:'Diary Display',exact:true}).click();await page.getByRole('switch',{name:'Water',exact:true}).check();await page.getByRole('button',{name:'Save',exact:true}).click();await page.locator('.md-water').waitFor();await page.locator('#sheet').waitFor({state:'hidden'});
 await page.getByRole('button',{name:'Discover',exact:true}).click();await page.getByRole('button',{name:'VIEW FULL REPORT',exact:true}).waitFor();await page.waitForFunction(()=>Object.keys(window.Chart?.instances??{}).length===2);
 assert.equal(await page.locator('[data-news-id=fixture-news]').count(),1);await page.getByRole('button',{name:'Dashboard Settings',exact:true}).click();await page.getByRole('switch',{name:'Show News',exact:true}).uncheck();await page.waitForFunction(()=>document.querySelector('[data-pref=newsVisible]')?.checked===false&&!document.querySelector('[data-news-id]'));
 assert.equal(await page.getByRole('switch',{name:/Show Nourishing Coach/}).isDisabled(),false);await page.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:'Newsfeed',exact:true}).click();await page.locator('#sheet [data-news-id=fixture-news]').waitFor();await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.getByRole('button',{name:'Your Streaks',exact:true}).click();await page.getByLabel('Reset streak to',{exact:true}).fill('9');await page.getByRole('button',{name:'Reset Streak',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.dc-streak strong')?.textContent==='9');await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.getByRole('button',{name:'EDIT',exact:true}).click();await page.getByLabel('Widget',{exact:true}).selectOption('Macro Targets');await page.getByLabel('Date Range',{exact:true}).selectOption('custom');await page.getByLabel('From',{exact:true}).fill('2026-11-13');await page.getByLabel('To',{exact:true}).fill(date);await page.getByRole('button',{name:'Save',exact:true}).click();await page.locator('#sheet').waitFor({state:'hidden'});assert.equal(state.settings.discover.reportWidget,'Macro Targets');assert.equal(state.settings.discover.customFrom,'2026-11-13');
 await page.getByRole('button',{name:'VIEW FULL REPORT',exact:true}).click();await page.locator('.mobile-report-toolbar').waitFor();await page.getByRole('button',{name:'Dashboard',exact:true}).click();await page.locator('.dc-chart canvas').first().waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.evaluate(()=>Promise.all([...document.images].map(img=>img.decode().catch(()=>{}))));await page.screenshot({path:'.local/dashboard-mobile.png'});assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);assert.equal(state.settings.discover.newsVisible,false);
 writeFileSync('.local/dashboard-local-verification.json',JSON.stringify({status:'passed',checks:['production HTTP and strict CSP','real mobile Diary to Discover navigation','source Chart.js energy/weight renders','Show News hides dashboard cards only','source settings and streak reset persist','custom date range and summary mode','View Full Report navigation','no overflow or script/CSP errors']},null,2));console.log('Dashboard production HTTP/mobile fixture passed.');
}catch(error){console.error(await page?.locator('body').innerText());writeFileSync('.local/dashboard-local-verification.json',JSON.stringify({status:'failed',error:error.message},null,2));throw error;}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
