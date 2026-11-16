import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,readdirSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {createWebHandler} from '../server/http.mjs';
import {initialState,act} from '../server/domain/workspace.mjs';
import {displayView} from '../server/display-settings.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {createDataRepository} from '../server/data-repository.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';
import {diaryToolsReview} from '../server/diary-tools.mjs';
import {uiMessages} from '../public/report-source/public/locales/index.js';
import {coreText} from '../public/core-cloud-messages.js';
import {barcodeAssets} from '../scripts/package-barcode-assets.mjs';

test('Diary language follows the account through Add menu, selection and Display save/cancel/retry/reload',async()=>{
 const date=new Date().toLocaleDateString('en-CA'),seed=initialState();seed.settings.appLanguage='fr';const food=act(seed,'food.save',{name:'Original Food',grams:100,nutrients:{calories:120,protein:0}});act(seed,'entry.add',{date,foodId:food.id,amount:1,group:'Lunch'});
 const fixture=diaryStoreFixture(seed),store=createWorkspaceStore(fixture.db,'fixture'),repo=createDataRepository(fixture.db,'fixture'),before=fixture.state(),writes=[];let lost=false,base,handler,browser,page,releaseInitial;
 const initialRead=new Promise(resolve=>releaseInitial=resolve);
 const service={current:async()=>({id:'fixture',name:'Original Name',email:'fixture@example.com'}),readDiary:async(_,day)=>{await initialRead;return repo.diary(day,{now:new Date(),timeZone:'UTC'});},display:async()=>displayView(fixture.state()),diaryToolsReview:async(_,input)=>diaryToolsReview(fixture.state(),input),workspaceCommand:async(_,input)=>{writes.push(structuredClone(input));const result=await store.command(input);if(lost){lost=false;throw {code:503,publicMessage:'Lost save reply'};}return result;}};
 const assets=new Map();function visit(dir,prefix=''){for(const entry of readdirSync(dir,{withFileTypes:true})){if(entry.isDirectory())visit(dir+'/'+entry.name,prefix+'/'+entry.name);else assets.set(prefix+'/'+entry.name,{body:readFileSync(dir+'/'+entry.name),type:entry.name.endsWith('.css')?'text/css':/\.m?js$/.test(entry.name)?'text/javascript':entry.name.endsWith('.html')?'text/html':entry.name.endsWith('.svg')?'image/svg+xml':entry.name.endsWith('.woff2')?'font/woff2':'application/octet-stream'});}}visit('public');assets.set('/diary',assets.get('/diary.html'));for(const asset of await barcodeAssets())assets.set('/'+asset.path,asset);
 const server=createServer(async(req,res)=>{const result=await handler(new Request(base+req.url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:req,duplex:'half'})}));res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));});await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;handler=createWebHandler({config:{origin:base},service,assets});
 try{
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});page=await browser.newPage({locale:'pt-BR',viewport:{width:320,height:915},colorScheme:'dark',extraHTTPHeaders:{Cookie:'__Host-nourishing_session=fixture'}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.addInitScript(()=>{window.csp=[];document.addEventListener('securitypolicyviolation',e=>window.csp.push(e.violatedDirective));});
  await page.goto(base+'/diary');await page.locator('#settings-tab').click();releaseInitial();await page.locator('[data-more-open=display]').waitFor();assert.equal(await page.locator('html').getAttribute('lang'),'fr');assert.equal(await page.locator('[data-more-open=display] span').first().textContent(),uiMessages.fr['mobileMore.display']);await page.locator('#diary-tab').click();await page.locator('.md-diary').waitFor();
  const openDisplay=async()=>{await page.locator('#settings-tab').click();await page.locator('[data-more-open=display]').click();await page.locator('[data-display-open=appLanguage]').waitFor();};
  for(const [language,next]of [['fr','de'],['de','pt-BR'],['pt-BR','en']]){
   assert.equal(await page.locator('#diary-tab').innerText(),uiMessages[language]['discover.nav.diary']);assert.equal(await page.locator('[data-diary-record]').filter({hasText:'Original Food'}).count(),1);
   await page.locator('#add-food').click();await page.locator('.am-sheet').waitFor();assert.equal(await page.locator('.am-sheet h2').textContent(),coreText('add.title',{},language));assert.equal(await page.locator('[data-am=select][data-id=photo]').getAttribute('aria-label'),coreText('add.photo',{},language));await page.locator('[data-am=edit]').click();await page.locator('[data-am=color][data-id=photo]').click();await page.locator('[data-am=pick]').first().click();await page.keyboard.press('Escape');await page.keyboard.press('Escape');assert.equal(writes.length,language==='fr'?0:language==='de'?2:3);
   await page.locator('[data-diary-menu]').click();await page.locator('[data-diary-tool=select]').click();await page.locator('[data-tool-select]').first().check();assert.equal(await page.locator('.diary-selection-tools strong').textContent(),coreText('tools.selected',{count:1},language));await page.locator('[data-diary-tool=done]').click();
   await openDisplay();const count=writes.length;await page.locator('[data-display-open=appLanguage]').click();await page.locator('input[name=choice][value="'+next+'"]').check();await page.keyboard.press('Escape');assert.equal(writes.length,count);assert.equal(fixture.state().settings.appLanguage,language);
   await page.locator('[data-display-open=appLanguage]').click();await page.locator('input[name=choice][value="'+next+'"]').check();if(language==='fr')lost=true;
   await page.locator('[data-display-apply]').click();
   if(language==='fr'){await page.locator('[data-display-retry]').waitFor();assert.equal(fixture.state().settings.appLanguage,next);assert.equal(await page.locator('html').getAttribute('lang'),language);await page.locator('[data-display-retry]').click();}
   await page.waitForFunction(language=>document.documentElement.lang===language,next);await page.locator('[data-display-open=appLanguage]').waitFor();assert.equal(await page.locator('.mm-child-header h1').textContent(),uiMessages[next]['mobileDisplay.title']);if(language==='fr')assert.deepEqual(writes.at(-1),writes.at(-2));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);mkdirSync('.local/diary-language',{recursive:true});await page.screenshot({path:'.local/diary-language/'+next+'-display.png'});
   await page.evaluate(async()=>{const {applyFontPreferences}=await import('/font-presentation.js');applyFontPreferences({fontScale:2});});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'.local/diary-language/'+next+'-display-200.png'});await page.evaluate(async()=>{const {applyFontPreferences}=await import('/font-presentation.js');applyFontPreferences({fontScale:1});});
   await page.locator('#diary-tab').click();await page.locator('.md-diary').waitFor();await page.reload();await page.locator('.md-diary').waitFor();assert.equal(await page.locator('html').getAttribute('lang'),next);
  }
  const after=fixture.state();for(const key of ['foods','entries','notes','biometrics','recipes','meals'])assert.deepEqual(after[key],before[key]);const expected=structuredClone(before.settings);expected.appLanguage='en';assert.deepEqual(after.settings,expected);assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.csp),[]);
 }finally{releaseInitial();await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
