import {CHROME_EXECUTABLE} from './_chrome.mjs';
import {diaryCalendarView} from '../server/diary-calendar-view.mjs';
import {recordOptions,exerciseCatalogView} from '../server/record-views.mjs';
import {chooseDiaryDate} from '../scripts/diary-test-navigation.mjs';
import {barcodeAssets} from '../scripts/package-barcode-assets.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright-core';
import {initialState,act} from '../server/domain/workspace.mjs';
import {createDataRepository} from '../server/data-repository.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {pauseLifeView} from '../server/pause-life-settings.mjs';
import {displayView} from '../server/display-settings.mjs';
import {createWebHandler} from '../server/http.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';


test('Pause Life source settings persist, recover saves and update the canonical Diary page',async()=>{
 const date=new Date().toLocaleDateString('en-CA'),seed=initialState();seed.foods=[{id:'rice',name:'Rice',grams:100,nutrients:{calories:133,protein:3,carbs:28,fat:1}},{id:'chicken',name:'Chicken',grams:100,nutrients:{calories:165,protein:30,carbs:0,fat:5}}];
 for(const foodId of ['rice','chicken'])act(seed,'entry.add',{foodId,date,group:'Lunch',amount:1});
 const fixture=diaryStoreFixture(seed),store=createWorkspaceStore(fixture.db,'fixture'),repository=createDataRepository(fixture.db,'fixture'),clock={now:new Date(),timeZone:'UTC'},writes=[],before=fixture.state();let reject=false,lose=false,conflict=false,base,handler,browser,page;
 const service={current:async()=>({id:'fixture',email:'fixture@example.com',name:'Fixture'}),readDiary:async(_,day)=>repository.diary(day,clock),display:async()=>displayView(fixture.state()),pauseLife:async()=>pauseLifeView(fixture.state()),workspaceCommand:async(_,input)=>{writes.push(structuredClone(input));if(conflict){conflict=false;throw {code:409,publicMessage:'Settings changed'};}if(reject){reject=false;throw {code:400,publicMessage:'Setting could not be saved'};}const result=await store.command(input);if(lose){lose=false;throw {code:503,publicMessage:'Save reply interrupted'};}return result;}};
 const vendor=new Map((await barcodeAssets()).map(asset=>['/'+asset.path,asset]));
 const assets={get(path){if(vendor.has(path))return vendor.get(path);const relative=path==='/diary'?'/diary.html':path;for(const root of ['public']){const file=resolve(root,'.'+relative);if(!file.startsWith(resolve(root)+'\\')&&!file.startsWith(resolve(root)+'/'))continue;const ext=extname(file);if(existsSync(file)&&['.html','.js','.mjs','.css','.svg','.woff2'].includes(ext))return {body:readFileSync(file),type:ext==='.html'?'text/html':ext==='.css'?'text/css':ext==='.svg'?'image/svg+xml':ext==='.woff2'?'font/woff2':'text/javascript'};}}};
 const server=createServer(async(req,res)=>{const response=await handler(new Request(base+req.url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:req,duplex:'half'})}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));});await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;handler=createWebHandler({config:{origin:base},service,assets});

 try{
  browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});page=await browser.newPage({viewport:{width:412,height:915},colorScheme:'dark',extraHTTPHeaders:{Cookie:'__Host-nourishing_session=fixture'}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{window.csp=[];document.addEventListener('securitypolicyviolation',e=>window.csp.push(e.violatedDirective));});await page.goto(base+'/diary');await page.locator('.md-diary').waitFor();
  const open=async()=>{await page.locator('#settings-tab').click();await page.getByRole('button',{name:'Display',exact:true}).click();await page.locator('[data-display-open=pauseLife]').click();await page.locator('[data-pause-settings]').waitFor();},ready=()=>page.waitForFunction(()=>document.querySelector('.pause-life')?.getAttribute('aria-busy')==='false'),diary=async()=>{await page.locator('#diary-tab').click();await page.locator('.md-diary').waitFor();};
  await open();assert.equal(await page.locator('[data-pause-program]:enabled').count(),0);const writesBefore=writes.length;await page.getByRole('button',{name:'Back',exact:true}).click();await page.locator('[data-display-open=pauseLife]').waitFor();assert.equal(writes.length,writesBefore);await page.locator('[data-display-open=pauseLife]').click();await page.locator('[data-pause-enabled]').check();await ready();assert.equal(fixture.state().settings.pauseLife.enabled,true);
  await diary();await page.locator('[data-md-page-id=pauseLife]').waitFor();assert.equal(await page.locator('[data-md-page-id]').first().getAttribute('data-md-page-id'),'pauseLife');assert.equal(await page.locator('[data-md-page-id=pauseLife] .md-target').count(),4);await page.waitForFunction(()=>window.Chart?.getChart(document.querySelector('[data-pause-ring]'))?.data.datasets[0].data.reduce((a,b)=>a+b,0)===298);
  mkdirSync('.local/pause-life',{recursive:true});await page.screenshot({path:'.local/pause-life/diary.png'});await open();await page.locator('[data-pause-program][value="bfb-ps"]').check();await ready();await page.reload();await page.locator('.md-diary').waitFor();await open();assert.equal(await page.locator('[data-pause-program][value="bfb-ps"]').isChecked(),true);await page.locator('[data-pause-enabled]').uncheck();await ready();await diary();assert.equal(await page.locator('[data-md-page-id=pauseLife]').count(),0);await open();await page.locator('[data-pause-enabled]').check();await ready();assert.equal(await page.locator('[data-pause-program][value="bfb-ps"]').isChecked(),true);
  reject=true;await page.locator('[data-pause-enabled]').click();await page.getByText('Setting could not be saved',{exact:true}).waitFor();await ready();assert.equal(await page.locator('[data-pause-enabled]').isChecked(),true);assert.equal(await page.locator('[data-pause-enabled]').isEnabled(),true);
  lose=true;await page.locator('[data-pause-enabled]').click();await page.getByText('Save reply interrupted',{exact:false}).waitFor();assert.equal(await page.locator('[data-pause-enabled]').isDisabled(),true);const pending=writes.at(-1);await page.getByRole('button',{name:'Try again',exact:true}).click();await ready();assert.deepEqual(writes.at(-1),pending);assert.equal(await page.locator('[data-pause-enabled]').isChecked(),false);
  conflict=true;await page.locator('[data-pause-enabled]').click();await page.getByText('Settings changed',{exact:false}).waitFor();assert.equal(await page.locator('[data-pause-enabled]').isDisabled(),true);await page.getByRole('button',{name:'Reload settings',exact:true}).click();await ready();assert.equal(await page.locator('[data-pause-enabled]').isChecked(),false);
  await page.setViewportSize({width:320,height:700});await page.screenshot({path:'.local/pause-life/settings.png'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.getByRole('button',{name:'Back',exact:true}).click();await page.locator('[data-display-open=pauseLife]').waitFor();assert.deepEqual(fixture.state().entries,before.entries);assert.deepEqual(fixture.state().settings.targets,before.settings.targets);assert.deepEqual(fixture.state().foods,before.foods);assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.csp),[]);
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
