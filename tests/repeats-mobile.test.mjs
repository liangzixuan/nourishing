import {CHROME_EXECUTABLE} from './_chrome.mjs';
import {barcodeAssets} from '../scripts/package-barcode-assets.mjs';
const packagedAssets=new Map((await barcodeAssets()).map(asset=>['/'+asset.path,asset]));
import {createInsightCatalog} from '../server/food-insights.mjs';
import {searchCloudFoods} from '../server/food-search.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,readdirSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright-core';
import {lookupBarcode,previewBarcode} from '../server/barcode.mjs';
import {favoriteView} from '../server/library-extras.mjs';
import {initialState,previewDiaryItem,act} from '../server/domain/workspace.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';
import {createWebHandler} from '../server/http.mjs';

import {repeatView} from '../server/repeat-view.mjs';
import {libraryItem} from '../server/library-view.mjs';
import {offlineSnapshot} from '../server/offline.mjs';
import {digest} from '../server/data-codec.mjs';
import {setTimeout as delay} from 'node:timers/promises';
async function settled(check){for(let i=0;i<100&&!check();i++)await delay(50);assert.ok(check(),'background command settled');}
test('Repeat list localizes search, count and schedule order',async()=>{
 const {mobileRepeatsMarkup}=await import('../public/repeat-source/mobile-repeats.js');
 const row=name=>({id:name,name,amount:1,days:[1],time:'13:32',group:'Lunch'});
 const rows=[row('Alpha'),row('Zebra')];
 const render=(language,sort='recent')=>mobileRepeatsMarkup({language,sort,rows,name:row=>row.name,quantity:()=>'',icon:()=>''});
 for(const [language,placeholder,count] of [['en','Search…','2 Repeat Items'],['fr','Rechercher…','2 éléments récurrents'],['de','Suchen…','2 wiederholte Einträge'],['pt-BR','Pesquisar…','2 itens recorrentes']]){
  const html=render(language);assert.ok(html.includes('placeholder="'+placeholder+'"'));assert.ok(html.includes(count));assert.ok(html.indexOf('Zebra')<html.indexOf('Alpha'));
 }
 const alphabetical=render('en','alphabetical');assert.ok(alphabetical.indexOf('Alpha')<alphabetical.indexOf('Zebra'));
});
test('source Repeat list/editor preserve schedules, reviewed apply, retries and dismissal',async()=>{
 const date='2026-11-16',seed=initialState();seed.foods.push({id:'oats',name:'Fixture oats',grams:100,serving:'100 g',nutrients:{calories:200,protein:10}});act(seed,'repeat.save',{foodId:'oats',quantity:50,unit:'g',group:'Breakfast',time:'08:00',startDate:date,days:[1],enabled:true});
 const fixture=diaryStoreFixture(seed),store=createWorkspaceStore(fixture.db,'fixture'),state=()=>fixture.state(),context={owner:'fixture',reviewSecret:'synthetic-repeat-barcode-key-over-32-bytes',asOf:date+'T18:00:00Z',timeZone:'UTC'},attempts=[];let handler,base,loseReply=false,rejectApply=false;
 const assets=new Map(packagedAssets);function visit(dir,prefix=''){for(const entry of readdirSync(dir,{withFileTypes:true})){if(entry.isDirectory())visit(dir+'/'+entry.name,prefix+'/'+entry.name);else assets.set(prefix+'/'+entry.name,{body:readFileSync(dir+'/'+entry.name),type:entry.name.endsWith('.css')?'text/css':/\.m?js$/.test(entry.name)?'text/javascript':entry.name.endsWith('.svg')?'image/svg+xml':'application/octet-stream'});}}visit('public');
 assets.set('/',{type:'text/html',body:'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/diary.css"><link rel="stylesheet" href="/mobile-theme.css"><link rel="stylesheet" href="/app-shell.css"><link rel="stylesheet" href="/more.css"><link rel="stylesheet" href="/diary-summary.css"><link rel="stylesheet" href="/diary-bundle.css"><link rel="stylesheet" href="/food-search-source/mobile-food-search.css"><link rel="stylesheet" href="/profile-settings.css"></head><body class="discover-mobile dark"><div class="app-shell"><header class="app-header topbar"></header><main id="page"></main></div><dialog id="sheet"><div id="sheet-content"></div></dialog><script type="module" src="/fixture.js"></script></body></html>'});
 assets.set('/fixture.js',{type:'text/javascript',body:`import {mobileFoodsHome,mobileFoodsHeader} from '/foods-source/mobile-foods-home.js';import {mountRepeats} from '/repeats.js';import {initializeDeviceCache} from '/device-cache.js';import {onBackgroundWriteStatus} from '/background-writes.js';await initializeDeviceCache('fixture');onBackgroundWriteStatus(status=>{if(status.retry){window.backgroundRetry=status.retry;window.backgroundError=status.error?.message;}});const content=document.querySelector('#sheet-content'),sheet=document.querySelector('#sheet');window.csp=[];document.addEventListener('securitypolicyviolation',event=>window.csp.push(event.violatedDirective));const close=()=>{sheet.close();content.replaceChildren()};const page=document.querySelector('#page'),headerRoot=document.querySelector('.app-header');let repeats;function home(){repeats?.dispose();headerRoot.innerHTML=mobileFoodsHeader('en',()=> '');page.innerHTML=mobileFoodsHome('en',()=> '');page.querySelector('[data-view=repeats]').onclick=()=>{repeats=mountRepeats({page,headerRoot,backLabel:'Back',onExit:home,date:()=>${JSON.stringify(date)},content,header:title=>'<header><h1>'+title+'</h1><button type=button data-close aria-label=Close>×</button></header>',show:html=>{content.innerHTML=html;if(!sheet.open)sheet.showModal()},close,onChange:()=>{}});};}home();content.addEventListener('click',event=>{if(event.target.closest('[data-close]'))close()});sheet.addEventListener('cancel',event=>{event.preventDefault();close()});`});
 const server=createServer(async(req,res)=>{const result=await handler(new Request(base+req.url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:req,duplex:'half'})}));res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
 handler=createWebHandler({config:{origin:base},assets,service:{current:async()=>({id:'fixture'}),readDiary:async()=>({revision:digest(state())}),offlineSnapshot:async()=>offlineSnapshot(state(),{ownerId:'fixture',generation:'repeat-fixture'}),favorites:async()=>favoriteView(state()),previewDiary:async(_,payload)=>({...previewDiaryItem(state(),payload),energy:{unit:'kcal'}}),foodSearch:async(_,input)=>searchCloudFoods(state(),createInsightCatalog([]),input),barcodeLookup:(_,input)=>lookupBarcode(state(),input,{...context,fetchImpl:async()=>input.code==='4006381333931'
  ?Response.json({product:{code:input.code,product_name:'Sample cereal',nutrition:{aggregated_set:{per:'100g',preparation:'as_sold',nutrients:{'energy-kcal':{value:100,unit:'kcal',source:'packaging'}}}}}})
  :new Response(null,{status:404})}),
  barcodePreview:(_,input)=>previewBarcode(state(),input,context),
  barcodeSave:(_,body,_signal,delivery)=>store.command(body,async()=>null,{...context,...delivery}),
  repeats:async(_,day)=>repeatView(state(),day),libraryItem:async(_,kind,id)=>libraryItem(state(),kind,state()[kind+'s'].find(row=>row.id===id)),workspaceCommand:async(_,input)=>{attempts.push(input);if(rejectApply&&input.type==='repeat.apply'){rejectApply=false;input={...input,payload:{...input.payload,items:input.payload.items.map(row=>({...row,fingerprint:'a'.repeat(64)}))}};}const result=await store.command(input,async()=>null,context);if(loseReply){loseReply=false;throw {code:503,publicMessage:'Connection interrupted'};}return result;}}});
 const profile=mkdtempSync(join(tmpdir(),'nourishing-repeat-')),errors=[];
 let browser,page;
 const startBrowser=async(disconnected=false)=>{
  browser=await chromium.launchPersistentContext(profile,{executablePath:CHROME_EXECUTABLE,headless:true,
   viewport:{width:412,height:915},extraHTTPHeaders:{Cookie:'__Host-nourishing_session=fixture'}});
  page=browser.pages()[0];page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
  if(disconnected)await page.route('**/api/**',route=>route.abort('internetdisconnected'));
  await page.goto(base);
 };
 try{
  await startBrowser();
  await page.locator('[data-view=repeats]').click();await page.locator('[data-mr-item]').waitFor();const search=page.locator('[data-mr-search]');assert.equal(await search.getAttribute('placeholder'),'Search…');await search.fill('nomatch');assert.equal(await page.locator('[data-mr-no-results]').isVisible(),true);assert.equal(await page.locator('[data-mr-item]').isVisible(),false);await search.fill('oats');
  const edit=async()=>{await page.locator('[data-action=edit-repeat]').click();await page.getByRole('heading',{name:'Set Repeat',exact:true}).waitFor();};await edit();assert.equal(await page.locator('.mr-options').getAttribute('open'),null);assert.equal(await page.locator('[data-mr-summary]').textContent(),'Repeats every Monday');assert.equal(await page.locator('[data-mr-all]').isChecked(),false);
  await page.locator('[data-mr-all]').check();assert.equal(await page.locator('[name=days]:checked').count(),7);assert.equal(await page.locator('[data-mr-summary]').textContent(),'Repeats every day');await page.locator('[data-mr-all]').uncheck();assert.equal(await page.getByRole('button',{name:'Save',exact:true}).isDisabled(),true);await page.getByRole('checkbox',{name:'Friday',exact:true}).check();await page.locator('[data-mr-timestamp]').uncheck();assert.equal(await page.locator('[name=time]').isDisabled(),true);
  await page.getByLabel('Amount',{exact:true}).fill('75');await page.keyboard.press('Escape');assert.equal(state().repeats[0].quantity,50);assert.equal(attempts.length,0);await edit();assert.equal(await page.getByLabel('Amount',{exact:true}).inputValue(),'50');
  await page.locator('[data-mr-menu]').click();await page.getByRole('menu',{name:'Repeat item actions'}).waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('.mr-action-menu').count(),0);assert.equal(await page.locator('.mr-form').count(),1);assert.equal(attempts.length,0);
  await page.locator('[data-mr-menu]').click();await page.mouse.click(10,100);await page.locator('.mr-action-menu').waitFor({state:'detached'});assert.equal(await page.locator('.mr-form').count(),1);
  await page.locator('[data-mr-menu]').click();await page.getByRole('menuitem',{name:'Disable',exact:true}).click();await page.getByText('Schedule has been disabled',{exact:true}).waitFor();await page.evaluate(async()=>{const {flushBackgroundWrites}=await import('/background-writes.js');await flushBackgroundWrites();});assert.equal(state().repeats[0].enabled,false);assert.equal(await page.getByLabel('Amount',{exact:true}).isDisabled(),true);assert.equal(await page.locator('.mr-footer').isVisible(),false);
  mkdirSync('.local/repeats',{recursive:true});await page.screenshot({path:'.local/repeats/disabled.png'});await page.getByRole('button',{name:'Enable Repeat',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[data-mr-fields]')?.disabled);await page.evaluate(async()=>{const {flushBackgroundWrites}=await import('/background-writes.js');await flushBackgroundWrites();});await settled(()=>state().repeats[0].enabled===true);assert.equal(state().repeats[0].enabled,true);
  await page.locator('[data-mr-all]').check();await page.locator('[data-mr-timestamp]').uncheck();await page.getByLabel('Amount',{exact:true}).fill('75');await page.screenshot({path:'.local/repeats/edit.png'});loseReply=true;await page.getByRole('button',{name:'Save',exact:true}).click();await page.locator('.mr-form').waitFor({state:'detached'});await page.waitForFunction(()=>typeof window.backgroundRetry==='function');assert.equal(state().repeats[0].quantity,75);await page.evaluate(()=>window.backgroundRetry());assert.equal(attempts.at(-1).requestId,attempts.at(-2).requestId);assert.deepEqual(state().repeats[0].days,[0,1,2,3,4,5,6]);assert.equal(state().repeats[0].time,'');assert.equal(await search.inputValue(),'oats');
  await page.locator('[data-action=apply-repeats]').click();rejectApply=true;await page.getByRole('button',{name:'Add to diary',exact:true}).click();await page.getByRole('button',{name:'Reload repeats',exact:true}).waitFor();assert.equal(state().entries.length,0);await page.getByRole('button',{name:'Reload repeats',exact:true}).click();await page.locator('[data-action=apply-repeats]').click();loseReply=true;await page.getByRole('button',{name:'Add to diary',exact:true}).click();await page.getByRole('button',{name:'Retry',exact:true}).waitFor();assert.equal(state().entries.length,1);await page.getByRole('button',{name:'Retry',exact:true}).click();await page.locator('.repeat-review').waitFor({state:'detached'});assert.equal(state().entries.length,1);assert.equal(attempts.at(-1).requestId,attempts.at(-2).requestId);assert.equal(await page.locator('[data-action=apply-repeats]').isDisabled(),true);
  await edit();await page.getByLabel('Amount',{exact:true}).fill('90');await page.locator('[data-mr-menu]').click();await page.getByRole('menuitem',{name:'Delete',exact:true}).click();await page.locator('.mr-form').waitFor({state:'detached'});assert.equal(await page.locator('.repeat-delete').count(),0);await page.locator('.mr-empty').waitFor({state:'attached'});await search.fill('');assert.equal(await page.getByRole('heading',{name:'Logging on auto-pilot',exact:true}).isVisible(),true);assert.equal(state().entries.length,1);
  const capture=name=>page.screenshot({path:'.local/repeats/'+name+'.png'});
  let saveButton=page.getByRole('button',{name:'Save',exact:true});
  const flush=()=>page.evaluate(async()=>{await (await import('/background-writes.js')).flushBackgroundWrites();});
  await flush();await settled(()=>state().repeats.length===0);
  await capture('193-empty');
  await page.getByRole('button',{name:'Add Repeat Item',exact:true}).click();
  await page.locator('.mfs-search input').fill('oats');
  const result=page.getByRole('button').filter({hasText:'Fixture oats'}).last();
  await result.waitFor();await capture('194-search');await result.click();
  await page.locator('[data-mf-basis]').filter({hasText:'100 g'}).waitFor();await capture('195-detail');
  await page.locator('.mf-form').getByRole('button',{name:'Back',exact:true}).click();
  assert.equal(await page.locator('.mfs-search input').inputValue(),'oats');await result.click();
  await page.locator('[name=group]').selectOption('Lunch');await page.locator('[name=time]').fill('13:32');
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await page.getByRole('heading',{name:'Set Repeat',exact:true}).waitFor();
  assert.equal(await saveButton.isDisabled(),true);assert.equal(await page.locator('[name=days]:checked').count(),0);
  assert.equal(await page.locator('[name=group]').inputValue(),'Lunch');assert.equal(await page.locator('[name=time]').inputValue(),'13:32');
  await capture('196-schedule');await page.getByRole('checkbox',{name:'Monday',exact:true}).check();
  // Keep the static shell available so a new document can start while all API calls are disconnected.
  await page.route('**/api/**',route=>route.abort('internetdisconnected'));
  await saveButton.click();await page.locator('.mr-form').waitFor({state:'detached'});
  let row=page.locator('[data-mr-item]');
  await row.filter({hasText:'1 serving · Lunch'}).waitFor();assert.match(await row.innerText(),/Mon - 1:32 PM/);
  assert.equal(state().repeats.length,0);await capture('197-monday-local');
  assert.deepEqual(await page.evaluate(()=>window.csp),[]);await browser.close();await startBrowser(true);
  row=page.locator('[data-mr-item]');saveButton=page.getByRole('button',{name:'Save',exact:true});
  await page.locator('[data-view=repeats]').click();
  await row.filter({hasText:'1 serving · Lunch'}).waitFor();assert.equal(state().repeats.length,0);await capture('197-monday-restarted');
  await page.unroute('**/api/**');await flush();await settled(()=>state().repeats.length===1);
  assert.equal(state().repeats[0].foodId,'oats');assert.deepEqual(state().repeats[0].days,[1]);
  await edit();await capture('198-edit-monday');
  await page.getByRole('checkbox',{name:'Monday',exact:true}).uncheck();
  await page.getByRole('checkbox',{name:'Tuesday',exact:true}).check();
  await page.getByLabel('Amount',{exact:true}).fill('2');await saveButton.click();await row.filter({hasText:'2 servings · Lunch'}).waitFor();
  await flush();await settled(()=>state().repeats[0]?.days[0]===2);await capture('199-tuesday');
  await page.getByRole('button',{name:'Most Recent',exact:true}).click();
  await page.getByRole('button',{name:'Alphabetical',exact:true}).click();await edit();
  await page.locator('[data-mr-menu]').click();await page.locator('.mr-action-menu img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));await capture('200-enabled-menu');
  await page.getByRole('menuitem',{name:'Disable',exact:true}).click();
  await page.getByText('Schedule has been disabled',{exact:true}).waitFor();await flush();
  assert.equal(state().repeats[0].enabled,false);await capture('201-disabled');
  await page.locator('[data-mr-menu]').click();assert.deepEqual(await page.getByRole('menuitem').allTextContents(),['Delete']);await capture('202-disabled-menu');
  await page.getByRole('menuitem',{name:'Delete',exact:true}).click();await page.locator('.mr-empty').waitFor();await flush();
  await settled(()=>state().repeats.length===0);await capture('203-deleted');assert.equal(state().entries.length,1);
  await store.command({revision:repeatView(state(),date).revision,requestId:crypto.randomUUID(),type:'repeat.save',payload:{foodId:'oats',amount:1,group:'Lunch',time:'13:32',startDate:date,days:[1]}},async()=>null,context);
  await store.command({revision:repeatView(state(),date).revision,requestId:crypto.randomUUID(),type:'day.complete',payload:{date,completed:true}},async()=>null,context);
  await page.evaluate(async()=>{await (await import('/device-cache.js')).invalidateDeviceCachePaths(path=>path.startsWith('/api/repeats'));});
  await page.getByRole('button',{name:'Back',exact:true}).click();await page.locator('[data-view=repeats]').click();await page.getByRole('button',{name:'Day completed',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Day completed',exact:true}).isDisabled(),true);await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('heading',{name:'Foods',exact:true}).waitFor();assert.equal(await page.locator('.mr-action-menu').count(),0);assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.csp),[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await scanRepeatOnCompletedDay({page,state,date,flush,capture});
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));rmSync(profile,{recursive:true,force:true,maxRetries:4,retryDelay:150});}
});

async function scanRepeatOnCompletedDay({page, state, date, flush, capture}) {
 const before = state();
 await page.evaluate(async () => {
  const {readWriteCopy, saveOfflineSnapshot} = await import('/offline-store.js');
  const snapshot = await (await fetch('/api/offline')).json();
  await saveOfflineSnapshot(snapshot, (await readWriteCopy()).ticket);
 });
 await page.locator('[data-view=repeats]').click();
 await page.getByRole('button',{name:'Add Repeat Item',exact:true}).click();
 const search = page.locator('.mfs-search input'), scan = page.locator('[data-mfs=scan]');
 await search.fill('oats');
 assert.equal(await scan.isVisible(),true,'Scan Food is visible in the Repeat Items picker');
 await capture('194-scan');
 await scan.click();await page.locator('[data-barcode-action=close]').click();
 assert.equal(await search.inputValue(),'oats');
 const enter = async code => {
  await scan.click();
  await page.locator('[data-barcode-action=manual]').click();
  await page.locator('[data-barcode-manual] input').fill(code);
  await page.locator('[data-barcode-manual] input').press('Enter');
 };
 await enter('0000000000000');
 await search.waitFor();assert.equal(await search.inputValue(),'oats');
 await enter('4006381333931');
 await page.locator('.barcode-review').waitFor();
 await page.keyboard.press('Escape');
 await search.waitFor();assert.equal(await search.inputValue(),'oats');
 await enter('4006381333931');
 const review=page.locator('.barcode-review');
 await review.locator('[name=unit]').selectOption('g');
 await review.locator('[name=amount]').fill('75');
 await review.locator('[name=time]').fill('13:32');
 await review.locator('[name=group]').selectOption('Lunch');
 await page.route('**/api/**',route=>route.abort('internetdisconnected'));
 await review.locator('form .primary').click();
 const schedule=page.locator('.mr-form');await schedule.waitFor();
 assert.equal(await schedule.locator('[name=unit]').inputValue(),'g');
 assert.equal(await schedule.locator('[name=amount]').inputValue(),'75');
 assert.equal(await schedule.locator('[name=startDate]').inputValue(),date);
 assert.equal(await schedule.locator('[name=group]').inputValue(),'Lunch');
 assert.equal(await schedule.locator('[name=time]').inputValue(),'13:32');
 await schedule.getByRole('checkbox',{name:'Friday',exact:true}).check();
 await schedule.getByRole('button',{name:'Save',exact:true}).click();
 await schedule.waitFor({state:'detached'});
 const pending=await page.evaluate(async()=>(await (await import('/offline-store.js')).readWriteCopy()).pending);
 assert.deepEqual(pending.map(row=>row.command.type),['barcode.log','repeat.save']);
 assert.equal(pending[0].command.payload.saveOnly,true);
 assert.deepEqual(state().foods,before.foods);assert.deepEqual(state().repeats,before.repeats);
 await page.reload();await page.locator('[data-view=repeats]').click();
 await page.locator('[data-mr-item]').filter({hasText:'Sample cereal'}).waitFor();
 await page.unroute('**/api/**');await flush();await settled(()=>state().repeats.length===before.repeats.length+1);
 const after=state(),food=after.foods.find(item=>item.name==='Sample cereal');
 assert.ok(food);assert.equal(after.foods.length,before.foods.length+1);
 const saved=after.repeats.filter(item=>item.foodId===food.id);
 assert.equal(saved.length,1);assert.equal(saved[0].quantity,75);assert.equal(saved[0].unit,'g');
 assert.deepEqual(saved[0].days,[5]);assert.equal(saved[0].group,'Lunch');assert.equal(saved[0].time,'13:32');
 assert.deepEqual(after.entries,before.entries);assert.ok(after.settings.completedDays.includes(date));
}
