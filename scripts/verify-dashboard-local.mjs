// Real HTTP routing/CSP and production mobile shell; disposable in-memory data.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
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
const service={current:async()=>{requireAccount();return {id:'fixture'};},login:async()=>{authenticated=true;return {secret:'fixture',expire:new Date(Date.now()+3600000).toISOString()};},searchCatalog:async()=>({items:[],nextOffset:null}),fasting:async()=>fastingView(state,clock),readDiary:async(_,day)=>{requireAccount();return {date:day,theme:'dark',revision:digest(state),groups:state.settings.groups,completed:false,entries:state.entries.filter(r=>r.date===day).map(r=>({...r,facts:entryFacts(state,r)})),notes:[],biometrics:state.biometrics.filter(r=>r.date===day),summary:calculateSummary(state,day)};},
 dashboard:async(_,day)=>({...dashboardView(state,{date:day},clock),news:{version:1,items:[{id:'fixture-news',title:'Fixture news',body:'Synthetic notice for visibility testing.'}]}}),nutritionReport:async(_,options)=>reportView(state,options,clock),
 workspaceCommand:async(_,input)=>{parseCommand(input);if(input.revision!==digest(state))throw Object.assign(Error('Refresh and try again.'),{code:409});const item=applyWorkspaceCommand(state,{type:input.type,payload:input.payload},clock);return {revision:digest(state),item};}};
const assets=new Map();for(const name of readdirSync('public',{recursive:true}))if(/\.(html|js|mjs|css|svg|woff2)$/.test(name)){const key=name.replaceAll('\\','/');assets.set('/'+key,{body:readFileSync('public/'+name),type:/\.m?js$/.test(name)?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':name.endsWith('.woff2')?'font/woff2':'text/html'});}assets.set('/diary',assets.get('/diary.html'));
assets.set('/',assets.get('/index.html'));
let handler,browser,page;const server=createServer((req,res)=>{
 // Match Appwrite/Astro static-index precedence. Root widget navigation must execute in the client.
 if(new URL(req.url,'http://fixture.local').pathname==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end(assets.get('/').body);return;}
 handler(req,res);
});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;handler=createHandler({config:{origin},service,assets});
try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});await context.setExtraHTTPHeaders({Cookie:'__Host-nourishing_session=fixture'});page=await context.newPage();page.setDefaultTimeout(15000);const errors=[],blocked=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')blocked.push(m.text());});
 const response=await page.goto(origin+'/diary');assert.match(response.headers()['content-security-policy'],/script-src 'self'; style-src 'self'/);
 await page.locator('.calorie-summary').waitFor();await page.getByLabel('Diary date',{exact:true}).fill(date);await page.getByRole('button',{name:'Discover',exact:true}).click();await page.getByRole('button',{name:'VIEW FULL REPORT',exact:true}).waitFor();await page.waitForFunction(()=>Object.keys(window.Chart?.instances??{}).length===2);
 assert.equal(await page.locator('[data-news-id=fixture-news]').count(),1);await page.getByRole('button',{name:'Dashboard Settings',exact:true}).click();await page.getByRole('switch',{name:'Show News',exact:true}).uncheck();await page.waitForFunction(()=>document.querySelector('[data-pref=newsVisible]')?.checked===false&&!document.querySelector('[data-news-id]'));
 assert.equal(await page.getByRole('switch',{name:/Show Coach/}).isDisabled(),true);await page.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:'Newsfeed',exact:true}).click();await page.locator('#sheet [data-news-id=fixture-news]').waitFor();await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.getByRole('button',{name:'Streaks',exact:true}).click();await page.getByLabel('Reset streak to',{exact:true}).fill('9');await page.getByRole('button',{name:'Reset Streak',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.dc-streak strong')?.textContent==='9');await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.getByRole('button',{name:'EDIT',exact:true}).click();await page.getByLabel('Widget',{exact:true}).selectOption('Macro Targets');await page.getByLabel('Date Range',{exact:true}).selectOption('custom');await page.getByLabel('From',{exact:true}).fill('2026-11-13');await page.getByLabel('To',{exact:true}).fill(date);await page.getByRole('button',{name:'Save',exact:true}).click();await page.locator('#sheet').waitFor({state:'hidden'});assert.equal(state.settings.discover.reportWidget,'Macro Targets');assert.equal(state.settings.discover.customFrom,'2026-11-13');
 await page.getByRole('button',{name:'VIEW FULL REPORT',exact:true}).click();await page.getByRole('button',{name:'Update report',exact:true}).waitFor();await page.getByRole('button',{name:'Dashboard',exact:true}).click();await page.locator('.dc-chart canvas').first().waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'.local/dashboard-mobile.png'});assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);assert.equal(state.settings.discover.newsVisible,false);
 await page.goto(origin+'/?widget=food');await page.getByRole('heading',{name:'Add Food',exact:true}).waitFor();await page.getByLabel('Search foods',{exact:true}).waitFor();assert.equal(new URL(page.url()).pathname,'/diary');assert.equal(new URL(page.url()).search,'');
 await page.goto(origin+'/?widget=fasting');await page.getByRole('heading',{name:'Fasting',exact:true}).waitFor();await page.getByRole('button',{name:'New Fast',exact:true}).waitFor();
 await page.goto(origin+'/?widget=diary');await page.locator('.calorie-summary').waitFor();assert.equal(await page.locator('#sheet[open]').count(),0);
 authenticated=false;await page.goto(origin+'/?widget=food');await page.getByRole('heading',{name:'Sign in',exact:true}).waitFor();assert.equal(new URL(page.url()).search,'?widget=food');await page.getByLabel('Email',{exact:true}).fill('fixture@example.com');await page.getByLabel('Password',{exact:true}).fill('FixtureOnly123!');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('heading',{name:'Add Food',exact:true}).waitFor();assert.equal(new URL(page.url()).pathname,'/diary');assert.deepEqual(errors,[]);assert.deepEqual(blocked.filter(message=>!message.includes('401')),[]);
 writeFileSync('.local/dashboard-local-verification.json',JSON.stringify({status:'passed',checks:['production HTTP and strict CSP','real mobile Diary to Discover navigation','source Chart.js energy/weight renders','Show News hides dashboard cards only','source settings and streak reset persist','custom date range and summary mode','View Full Report navigation','no overflow or script/CSP errors','native widget food/fasting/diary deep links','expired session keeps food destination through sign-in']},null,2));console.log('Dashboard production HTTP/mobile fixture passed.');
}catch(error){writeFileSync('.local/dashboard-local-verification.json',JSON.stringify({status:'failed',error:error.message},null,2));throw error;}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
