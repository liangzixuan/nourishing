import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdirSync,readFileSync,existsSync} from 'node:fs';
import {extname,resolve} from 'node:path';
import {chromium} from 'playwright-core';
import {CHROME_EXECUTABLE} from './_chrome.mjs';
import {waitForOutboxIdle} from './fixtures/browser-outbox.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';
import {barcodeAssets} from '../scripts/package-barcode-assets.mjs';
import {chooseDiaryDate} from '../scripts/diary-test-navigation.mjs';
import {checkSwitchedDateRead} from './fixtures/diary-switched-read.mjs';
import {checkColdDateRecovery} from './fixtures/diary-date-recovery.mjs';
import {initialState,act} from '../server/domain/workspace.mjs';
import {createDataRepository} from '../server/data-repository.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {diaryToolsReview} from '../server/diary-tools.mjs';
import {diaryCalendarView} from '../server/diary-calendar-view.mjs';
import {libraryView} from '../server/library-view.mjs';
import {reportView} from '../server/nutrition-views.mjs';
import {createWebHandler} from '../server/http.mjs';

test('Diary day actions use the chosen calendar date and preserve other days',async()=>{
 const day='2026-11-20',previous='2026-11-19',next='2026-11-21';
 const clock={now:new Date(day+'T15:00:00Z'),timeZone:'America/Chicago'},seed=initialState();
 for(const [id,name] of [['one','Evening fixture'],['two','Morning fixture']]){
  seed.foods.push({id,name,grams:100,nutrients:{calories:80,protein:5,carbs:10,fat:2}});
 }
 for(const [foodId,time] of [['one','19:00'],['two','07:30']])act(seed,'entry.add',{foodId,date:day,group:'Lunch',amount:1,time});
 act(seed,'note.add',{date:previous,group:'Lunch',text:'Previous-day fixture'});
 const older='2026-11-18',olderMarker='Older-day fixture';
 act(seed,'note.add',{date:older,group:'Lunch',text:olderMarker});
 seed.settings.completedDays=[previous];
 const fixture=diaryStoreFixture(seed),store=createWorkspaceStore(fixture.db,'fixture'),repo=createDataRepository(fixture.db,'fixture');
 const service={current:async()=>({id:'fixture',email:'fixture@example.com'}),offlineSnapshot:()=>store.offlineSnapshot(),
  library:async()=>libraryView(fixture.state()),
  readDiary:(_,date)=>repo.diary(date,clock),diaryCalendar:(_,input)=>diaryCalendarView(fixture.state(),input,clock),
  nutritionReport:(_,input)=>reportView(fixture.state(),input,clock),diaryToolsReview:(_,input)=>diaryToolsReview(fixture.state(),input),
  workspaceCommand:(_,input)=>store.command(input,async()=>null,clock),offlineCommand:(_,input)=>store.offlineCommand(input,clock)};
 const packaged=new Map((await barcodeAssets()).map(asset=>['/'+asset.path,asset]));
 const assets={get(path){
  if(packaged.has(path))return packaged.get(path);
  if(path==='/diary')path='/diary.html';
  if(!/^\/[\w./-]+$/.test(path)||path.includes('..'))return;
  const file=resolve('public','.'+path),type={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'}[extname(file)];
  if(type&&existsSync(file))return {type,body:readFileSync(file)};
 }};
 let origin,handler,browser;
 const server=createServer(async(req,res)=>{const response=await handler(new Request(origin+req.url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:req,duplex:'half'})}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 handler=createWebHandler({config:{origin},service,assets});
 try{
  browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});
  for(const scenario of ['recover','newer','leave','switch','switch-response','lock','unavailable']){
   const cold=await browser.newContext({timezoneId:'UTC',viewport:{width:448,height:907},serviceWorkers:'block',extraHTTPHeaders:{Cookie:'__Host-nourishing_session=fixture'}});
   try{
    const p=await cold.newPage();
    await p.clock.setFixedTime(new Date(day+'T12:00:00Z'));p.setDefaultTimeout(10000);
    if(scenario.startsWith('switch'))await checkSwitchedDateRead(p,{origin,from:day,to:older,marker:olderMarker,ownerId:'fixture',source:scenario==='switch'?'snapshot':'canonical'});
    else await checkColdDateRecovery(p,{origin,from:day,to:previous,marker:'Previous-day fixture',scenario});
   }catch(error){throw new Error('Cold date '+scenario+' failed',{cause:error});}
   finally{await cold.close();}
  }
  const networkOnly=await browser.newContext({timezoneId:'UTC',serviceWorkers:'block',extraHTTPHeaders:{Cookie:'__Host-nourishing_session=fixture'}});
  try{
   await networkOnly.addInitScript(()=>Object.defineProperty(window,'indexedDB',{value:undefined}));
   const p=await networkOnly.newPage();p.setDefaultTimeout(10000);await p.clock.setFixedTime(new Date(day+'T12:00:00Z'));
   await p.goto(origin+'/diary');await chooseDiaryDate(p,older);
   await p.locator('[data-diary-record]').getByText(olderMarker,{exact:true}).waitFor();
   let releaseMarkers;
   const held=new Promise(resolve=>{releaseMarkers=resolve;});
   await p.route('**/api/diary/calendar?month=2026-12',async route=>{await held;await route.continue();});
   await p.locator('[data-md-calendar]').click();
   await p.locator('[data-mdc-month="1"]').click();
   const selected=p.locator('[data-mdc-date="2026-12-17"]');
   await selected.click();
   assert.ok(await selected.evaluate(el=>el===document.activeElement));
   releaseMarkers();
   await p.locator('.mdc-status:empty').waitFor({state:'attached'});
   assert.ok(await selected.evaluate(el=>el===document.activeElement),'a month response preserves the selected day’s keyboard focus');
   await p.keyboard.press('Escape');
  }finally{await networkOnly.close();}
  const page=await browser.newPage({viewport:{width:412,height:915},colorScheme:'dark',extraHTTPHeaders:{Cookie:'__Host-nourishing_session=fixture'}});
  page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/diary');await page.locator('.md-diary').waitFor();await chooseDiaryDate(page,day);
  await waitForOutboxIdle(page);
  const menu=()=>page.getByRole('button',{name:'Diary actions',exact:true}).click();
  const action=async id=>{await menu();await page.locator('[data-diary-tool="'+id+'"]').click()};
  const calendar=page.locator('.mdc-dialog'),cell=date=>calendar.locator('[data-mdc-date="'+date+'"]');
  const shot=async id=>{mkdirSync('.local/day-actions',{recursive:true});await page.screenshot({path:'.local/day-actions/'+id+'.png'})};
  const idle=check=>waitForOutboxIdle(page,()=>check(fixture.state()));
  const saved=()=>fixture.state();
  const count=(rows,date)=>rows.filter(row=>row.date===date).length;
  const confirm=page.locator('[data-confirm]'),sheet=page.locator('#sheet');
  await menu();assert.equal(await page.locator('.diary-day-menu button img').count(),9);await shot('menu');
  await page.locator('.diary-menu-navigation [data-discover=shell-diary]').click();await sheet.waitFor({state:'hidden'});await menu();
  await page.keyboard.press('Escape');await sheet.waitFor({state:'hidden'});
  await page.locator('[data-md-calendar]').click();await cell(day).locator('.mdc-food').waitFor();
  assert.equal(await cell(day).getAttribute('aria-current'),'date');assert.equal(await cell(previous).getAttribute('class'),'is-complete');
  assert.equal(await cell(day).evaluate(n=>n.classList.contains('is-logged')),true);
  await shot('calendar');await calendar.locator('[data-mdc-legend]').click();await calendar.getByRole('dialog',{name:'Legend'}).waitFor();
  assert.deepEqual(await calendar.locator('.mdc-legend p').allTextContents(),['Food','Exercise','Biometric','Note','Fast','Today','Selected Day','Logged Day','Completed Day']);await shot('legend');
  await page.mouse.click(3,3);await calendar.locator('.mdc-legend').waitFor({state:'detached'});await calendar.locator('[data-mdc-legend]').click();
  await page.evaluate(()=>history.back());await calendar.locator('.mdc-legend').waitFor({state:'detached'});
  await calendar.locator('[data-mdc-month="-1"]').click();await cell('2026-10-31').waitFor();await cell('2026-10-31').click();
  await page.evaluate(()=>history.back());await calendar.waitFor({state:'detached'});
  assert.equal(await page.locator('#diary-date').getAttribute('data-date'),day);
  await page.locator('[data-md-calendar]').click();await calendar.locator('[data-mdc-month="1"]').click();await cell('2026-12-31').click();
  await calendar.locator('[data-mdc-cancel]').click();assert.equal(await page.locator('#diary-date').getAttribute('data-date'),day);
  await action('complete');await idle(s=>s.settings.completedDays.includes(day));
  await menu();assert.match(await page.locator('[data-diary-tool=complete]').textContent(),/Reopen/i);for(const id of ['clear','delete','copy-previous'])assert.equal(await page.locator('[data-diary-tool='+id+']').isDisabled(),true);await page.locator('[data-diary-tool=complete]').click();await idle(s=>!s.settings.completedDays.includes(day));
  await action('report');await page.locator('.mobile-report-toolbar').getByText(/Nov 20, 2026/).waitFor();await shot('daily-report');
  await page.locator('#diary-tab').click();await page.locator('.md-diary').waitFor();
  await action('sort-all');await idle(s=>s.settings.diarySort==='time');
  assert.deepEqual(await page.locator('[data-diary-record] .food-name').allTextContents(),['Morning fixture','Evening fixture']);
  await action('select');await page.getByRole('heading',{name:'Multi Select Mode'}).waitFor();await page.getByRole('button',{name:'Back',exact:true}).click();
  await action('copy');await sheet.waitFor({state:'hidden'});await action('paste');await page.locator('.diary-tools-sheet input[name=date]').fill(next);
  await page.locator('.diary-tools-sheet button.primary').click();await confirm.waitFor();await page.keyboard.press('Escape');assert.equal(count(saved().entries,next),0);
  await action('paste');await page.locator('.diary-tools-sheet input[name=date]').fill(next);await page.locator('.diary-tools-sheet button.primary').click();await confirm.click();await idle(s=>count(s.entries,next)===2);
  await action('copy-previous');await idle(s=>count(s.notes,day)===1);assert.equal(count(saved().notes,previous),1);
  await action('clear');await confirm.waitFor();await page.keyboard.press('Escape');assert.ok(saved().entries.filter(r=>r.date===day).every(r=>r.amount===1));
  await action('clear');await confirm.click();await idle(s=>s.entries.filter(r=>r.date===day).every(r=>r.amount===0));
  await action('delete');await confirm.waitFor();await page.keyboard.press('Escape');assert.equal(count(saved().entries,day),2);
  await action('delete');await confirm.click();await idle(s=>count(s.entries,day)===0&&count(s.notes,day)===0);
  await chooseDiaryDate(page,next);await page.getByText('Morning fixture',{exact:true}).waitFor();
  assert.ok(saved().entries.filter(r=>r.date===next).every(r=>r.amount===1));
  assert.equal(count(saved().notes,previous),1);assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
