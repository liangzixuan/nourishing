import {CHROME_EXECUTABLE} from './_chrome.mjs';
import {barcodeAssets} from '../scripts/package-barcode-assets.mjs';
const packagedAssets=new Map((await barcodeAssets()).map(asset=>['/'+asset.path,asset]));
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright-core';
import {createWebHandler} from '../server/http.mjs';
import {initialState} from '../server/domain/workspace.mjs';
import {applyFastingCommand,fastingView} from '../server/fasting.mjs';
import {dashboardView} from '../server/dashboard-view.mjs';
import {digest} from '../server/data-codec.mjs';

test('source fasting settings, schedule/date/repeat, history and retry through nutrition under production CSP',async()=>{
 const state=initialState(),clock={now:new Date('2026-11-14T18:00:00Z'),asOf:'2026-11-14T18:00:00Z',timeZone:'America/Chicago',schedulerReady:true},writes=[],receipts=new Map();let lose=false,conflict=false,bad=false,readAfterWrite,nextRead,heldRead,origin,handler,browser;
 applyFastingCommand(state,{type:'fast.record',payload:{start:'2026-11-13T12:00',end:'2026-11-14T04:00',goalHours:20,label:'Recorded fast'}},clock);
 const fail=(code,message)=>{throw Object.assign(Error(message),{code,publicMessage:message});};
 // Bind each controlled GET to its acknowledged mutation. Dialog dismissal
 // happens before the parent view has necessarily received its new revision.
 function holdRefresh(type){
  const started=Promise.withResolvers(),finish=Promise.withResolvers();
  readAfterWrite={type,read:async()=>{started.resolve();if(!await finish.promise)fail(503,'Read unavailable');}};
  return {started:started.promise,finish:finish.resolve};
 }
 const service={current:async()=>({id:'fasting-fixture',emailVerification:true}),nutritionReport:async()=>({}),dashboard:async(_,date)=>dashboardView(state,{date},clock),fasting:async(_,query)=>{if(heldRead)await heldRead;if(nextRead){const read=nextRead;nextRead=null;await read();}return fastingView(state,clock,query);},workspaceCommand:async(_,input)=>{writes.push(input);if(bad){bad=false;fail(400,'Choose another name');}if(conflict){conflict=false;state.settings.askToStopFast=true;fail(409,'Fasts changed');}if(!receipts.has(input.requestId)){assert.equal(input.revision,digest(state));applyFastingCommand(state,input,clock);receipts.set(input.requestId,{revision:digest(state)});}if(lose){lose=false;fail(503,'Reply lost');}if(readAfterWrite?.type===input.type){nextRead=readAfterWrite.read;readAfterWrite=null;}return receipts.get(input.requestId);}};
 const links=readFileSync('public/diary.html','utf8').match(/<link rel="stylesheet"[^>]+>/g).join('');
 const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${links}</head><body class="discover-mobile dark diary-mobile"><div class="app-shell"><div id="heading"></div><main id="page"></main></div><dialog id="sheet"><div id="sheet-content"></div></dialog><script type="module" src="/fixture.js"></script></body></html>`;
 const js=`import {mountNutrition} from '/nutrition.js';import {mountMore} from '/more.js';window.mountMore=()=>{window.app?.dispose();window.app=mountMore({page:document.querySelector('#page'),headerRoot:document.querySelector('#heading'),date:()=> '2026-11-14',onChange:async()=>{}});};window.mount=(tab='fasting')=>{window.app?.dispose();window.app=mountNutrition({page:document.querySelector('#page'),headerRoot:document.querySelector('#heading'),date:()=> '2026-11-14',content:document.querySelector('#sheet-content'),show:html=>{document.querySelector('#sheet-content').innerHTML=html;document.querySelector('#sheet').showModal();},close:()=>document.querySelector('#sheet').close(),header:title=>'<h2>'+title+'</h2>',onChange:async()=>{},initialTab:tab});};window.mount();`;
 const server=createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const headers=new Headers(req.headers);headers.set('Cookie','__Host-nourishing_session=fixture');const response=await handler(new Request(origin+req.url,{method:req.method,headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch(error){res.writeHead(500).end(String(error));}});
 await new Promise(done=>server.listen(0,'127.0.0.1',done));origin=`http://127.0.0.1:${server.address().port}`;const publicRoot=resolve('public');handler=createWebHandler({config:{origin},service,assets:{get(path){if(packagedAssets.has(path))return packagedAssets.get(path);if(path==='/')return {body:html,type:'text/html'};if(path==='/fixture.js')return {body:js,type:'text/javascript'};const file=resolve(publicRoot,'.'+path),type={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'}[extname(file)];if(!file.startsWith(publicRoot)||!type||!existsSync(file))return;return {body:readFileSync(file),type};}}});
 try{
 browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});const page=await browser.newPage({viewport:{width:412,height:915},isMobile:true,hasTouch:true,timezoneId:'Asia/Tokyo',serviceWorkers:'block'});page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.addInitScript(()=>{window.violations=[];document.addEventListener('securitypolicyviolation',e=>window.violations.push(e.violatedDirective));});
 await page.goto(origin);await page.locator('.fasting-heading h1').waitFor();assert.equal(await page.locator('.fasting-heading h1').textContent(),'Fasting');await page.locator('[data-fast-section=stats] summary').click();assert.match(await page.locator('[data-fast-stat=total]').textContent(),/16/);
 mkdirSync('.local/fasting-ui',{recursive:true});await page.screenshot({path:'.local/fasting-ui/settings.png'});
 await page.locator('.dc-fast-footer [data-discover=schedule-fast]').click();await page.locator('.fasting-editor').waitFor();assert.equal(await page.locator('[name=start]').inputValue(),'2026-11-14T12:02');assert.equal(await page.locator('[name=end]').inputValue(),'2026-11-15T04:02:00');await page.locator('.fasting-editor [name=hours]').fill('18');assert.equal(await page.locator('[name=end]').inputValue(),'2026-11-15T06:02:00');
 await page.locator('.dc-row').filter({has:page.locator('[data-datetime-field=end]')}).click({position:{x:15,y:21}});await page.locator('[data-time-wheel=hour]').press('ArrowDown');await page.locator('[data-time-apply]').click();assert.equal(await page.locator('.fasting-editor [name=hours]').inputValue(),'19');
 await page.locator('.dc-row').filter({has:page.locator('[data-repeat-picker]')}).click({position:{x:15,y:21}});
 const repeatRows=page.locator('.dc-repeat-presets [role=menuitemradio]');assert.equal(await repeatRows.count(),9);
 await page.locator('[data-menu-command=custom]').click();await page.locator('[data-repeat-choice=interval]').click();assert.equal(await page.locator('[data-menu-command]').count(),7);await page.locator('[data-menu-command="2"]').click();await page.screenshot({path:'.local/fasting-ui/recurrence.png'});await page.locator('[data-repeat-close]').click();assert.match(await page.locator('[data-repeat-picker]').textContent(),/Does Not Repeat/);
 await page.locator('[data-repeat-picker]').click();await page.locator('[data-menu-command=biweekly]').click();await page.locator('.fasting-editor [name=label]').fill('Evening');await page.screenshot({path:'.local/fasting-ui/editor.png'});await page.locator('.fasting-editor [type=submit]').click();await page.locator('.fasting-editor').waitFor({state:'detached'});await page.locator('[data-fast-section=scheduled] summary').click();await page.locator('.dc-scheduled-item').waitFor();assert.equal(state.fastingPlan.schedules[0].timeZone,'America/Chicago');assert.equal(state.fastingPlan.schedules[0].goalHours,19);assert.equal(state.fastingPlan.schedules[0].interval,2);
 // Save retry keeps one immutable command and one schedule even after a lost response.
 await page.locator('[data-discover=edit-schedule]').first().click();await page.locator('.fasting-editor [name=label]').fill('Renamed');lose=true;await page.locator('.fasting-editor [type=submit]').click();await page.getByText('Reply lost',{exact:true}).waitFor();assert.equal(await page.locator('.fasting-editor [name=label]').isDisabled(),true);await page.getByRole('button',{name:'Try again',exact:true}).click();await page.locator('.fasting-editor').waitFor({state:'detached'});assert.deepEqual(writes.at(-1),writes.at(-2));assert.equal(state.fastingPlan.schedules.length,1);
 // A definite rejection is editable; conflict provides reload without replay.
 await page.locator('[data-discover=edit-schedule]').first().click();bad=true;await page.locator('.fasting-editor [type=submit]').click();await page.getByText('Choose another name',{exact:true}).waitFor();assert.equal(await page.locator('.fasting-editor [name=label]').isDisabled(),false);await page.locator('.fasting-editor [name=label]').fill('Reviewed');conflict=true;await page.locator('.fasting-editor [type=submit]').click();await page.getByText('Fasts changed',{exact:true}).waitFor();await page.getByRole('button',{name:'Reload latest',exact:true}).click();await page.locator('.fasting-editor [name=label]').waitFor();await page.waitForFunction(()=>document.querySelector('.fasting-editor [name=label]')?.disabled===false);assert.equal(await page.locator('.fasting-editor [name=label]').inputValue(),'Renamed');await page.keyboard.press('Escape');
 await page.locator('[data-fast-section=history] summary').click();await page.locator('[data-discover=history-edit]').click();await page.locator('.fasting-editor [name=hours]').fill('18');await page.locator('[data-repeat-picker]').click();await page.locator('[data-menu-command=daily]').click();await page.locator('.fasting-editor [type=submit]').click();await page.locator('.fasting-editor').waitFor({state:'detached'});assert.equal(state.fasts[0].goalHours,20);assert.equal(Date.parse(state.fasts[0].end)-Date.parse(state.fasts[0].start),18*3600000);assert.equal(state.fasts[0].repeat.recurrence,'daily');assert.equal(state.fastingPlan.schedules.length,1);
 await page.locator('[data-discover=history-edit]').click();await page.getByLabel('Notes',{exact:true}).fill('Retain on cancel');await page.locator('[data-delete-fast]').click();await page.locator('[data-fast-delete=cancel]').click();assert.equal(await page.getByLabel('Notes',{exact:true}).inputValue(),'Retain on cancel');await page.keyboard.press('Escape');assert.equal(state.fasts[0].note??'','');
 await page.locator('[data-fh-list-all]').check();await page.locator('[data-fh-list-delete-selected]').click();
 assert.equal(await page.locator('[data-fast-delete-confirm] h2').textContent(),'Delete Fast(s)');
 assert.equal(await page.locator('[data-fast-delete-confirm] p').first().textContent(),'Are you sure you want to delete this fast?');
 await page.locator('[data-fast-delete=confirm]').click();await page.locator('[data-fast-delete-confirm]').waitFor({state:'detached'});await page.waitForFunction(()=>!document.querySelector('[data-fast-history-row]'));assert.equal(state.fasts.length,0);
 await page.locator('[data-fasting-back]').click();await page.locator('[data-discover=new-fast]').waitFor();await page.locator('[data-discover=new-fast]').click();
 const quickWheel=page.locator('[data-duration-wheel]');await quickWheel.press('ArrowDown');
 await page.locator('.fasting-quick [role=switch]').check();assert.equal(await quickWheel.evaluate(el=>el.inert),true);
 await page.locator('.fasting-quick [data-confirm-fast]').click();await page.locator('.fasting-quick').waitFor({state:'detached'});assert.equal(state.fasts.length,1);assert.equal(state.fasts[0].start,clock.now.toISOString());
 assert.equal(state.fasts[0].goalHours,null);await page.locator('[data-discover=edit-fast-start]').waitFor();
 assert.equal(await page.locator('[data-discover=edit-fast-goal]').count(),0);assert.equal(await page.locator('[data-fast-progress]').count(),0);
 await page.locator('[data-discover=end-fast]').click();await page.locator('.fasting-quick [data-confirm-fast]').click();await page.locator('.fasting-quick').waitFor({state:'detached'});assert.equal(state.fasts[0].end,clock.now.toISOString());
 await page.locator('[data-discover=fasting]').first().click();
 // Start Now consumes the selected scheduled occurrence, using server time.
 await page.locator('[data-fast-section=scheduled] summary').click();await page.locator('[data-discover=start-scheduled]').click();await page.locator('.fasting-quick [data-confirm-fast]').click();await page.locator('.fasting-quick').waitFor({state:'detached'});assert.equal(state.fasts.length,2);assert.equal(state.fasts.at(-1).scheduled.scheduleId,state.fastingPlan.schedules[0].id);
 // Child dismissal preserves the parent draft and an open-ended save retains disabled duration controls after a validation rejection.
 await page.locator('[data-discover=edit-schedule]').first().click();await page.locator('.fasting-editor [name=open]').check();bad=true;await page.locator('.fasting-editor [type=submit]').click();await page.getByText('Choose another name',{exact:true}).waitFor();assert.equal(await page.locator('.fasting-editor [name=hours]').isDisabled(),true);await page.locator('.fasting-editor [name=open]').uncheck();await page.locator('[data-datetime-field=start]').click();await page.locator('[data-time-wheel=minute]').press('ArrowDown');await page.screenshot({path:'.local/fasting-ui/time.png'});await page.mouse.click(1,1);assert.equal(await page.locator('[data-datetime-picker]').count(),0);
 await page.locator('[data-repeat-picker]').click();await page.locator('[data-menu-command=custom]').click();await page.locator('[data-repeat-choice=frequency]').click();await page.locator('[data-menu-command=weekly]').click();await page.locator('[data-repeat-choice=interval]').click();assert.equal(await page.locator('[data-menu-command]').count(),52);await page.keyboard.press('Escape');await page.evaluate(()=>window.dispatchEvent(new Event('nourishing-back',{cancelable:true})));assert.equal(await page.locator('[data-recurrence-editor]').count(),0);assert.equal(await page.locator('.fasting-editor').count(),1);
 // A stale delete reloads safely and closes only its confirmation.
 await page.locator('[data-delete-fast]').click();conflict=true;await page.locator('[data-fast-delete=confirm]').click();await page.getByText('Fasts changed',{exact:true}).waitFor();await page.getByRole('button',{name:'Reload latest',exact:true}).click();await page.locator('[data-fast-delete-confirm]').waitFor({state:'detached'});await page.waitForFunction(()=>document.querySelector('.fasting-editor [name=label]')?.disabled===false);assert.equal(state.fastingPlan.schedules.length,1);await page.locator('[data-delete-fast]').click();const deletionRead=holdRefresh('fasting.schedule.delete');await page.locator('[data-fast-delete=confirm]').click();await page.locator('.fasting-editor').waitFor({state:'detached'});assert.equal(state.fastingPlan.schedules.length,0);
 // An earlier delete refresh cannot leave a stale preference button active.
 const timer=page.locator('[data-discover=timer-down]'),retryRead=page.locator('[data-fasting-status] button');
 await deletionRead.started;assert.equal(await timer.isDisabled(),true);
 const beforeWrites=writes.length;deletionRead.finish(false);await page.getByText('Read unavailable',{exact:false}).waitFor();
 assert.equal(await timer.isDisabled(),true);assert.equal(await retryRead.isEnabled(),true);
 await retryRead.click();await page.waitForFunction(()=>!document.querySelector('[data-fasting-status]'));assert.equal(await timer.isEnabled(),true);assert.equal(writes.length,beforeWrites);
 // The setting is acknowledged once. Its view remains stale until GET succeeds.
 const settingRead=holdRefresh('fasting.settings');await timer.click();await settingRead.started;
 assert.equal(writes.length,beforeWrites+1);assert.equal(writes.at(-1).type,'fasting.settings');
 assert.equal(fastingView(state,clock).settings.timerDirection,'down');
 assert.equal(await timer.evaluate(node=>node.disabled),false,'The completed mutation released its own control lock');
 assert.equal(await timer.isDisabled(),true,'The parent still owns the pending read');
 settingRead.finish(false);await page.getByText('Read unavailable',{exact:false}).waitFor();
 assert.equal(await retryRead.isEnabled(),true);await retryRead.click();
 await page.waitForFunction(()=>document.querySelector('[data-discover=timer-down]')?.getAttribute('aria-pressed')==='true');
 assert.equal(await timer.isEnabled(),true);assert.equal(writes.length,beforeWrites+1);
 // Stopping a scheduled fast preserves the occurrence name even after deleting its schedule.
 clock.now=new Date('2026-11-14T18:00:59Z');clock.asOf=clock.now.toISOString();
 await page.clock.setFixedTime(new Date(+clock.now+20*3600000));
 await page.locator('[data-fasting-back]').click();
 const occurrenceStart=state.fasts.find(row=>row.scheduled).start,goalButton=page.locator('[data-discover=edit-fast-goal]'),count=writes.length;
 await page.locator('[data-discover=edit-fast-start]').click();await page.locator('[data-time-wheel=minute]').press('ArrowUp');await page.keyboard.press('Escape');
 assert.equal(writes.length,count);
 assert.match(await page.locator('[data-fast-clock]').innerText(),/remaining/);
 assert.equal(await page.locator('[data-fast-progress]').evaluate(el=>el.value),100,'The visual goal meter caps elapsed time without stopping the fast');
 await goalButton.click();await page.locator('[data-time-wheel=minute]').press('ArrowDown');await page.locator('[data-time-apply]').click();
 await page.locator('[data-datetime-picker]').waitFor({state:'detached'});
 assert.equal(writes.at(-1).type,'fast.update');assert.deepEqual(Object.keys(writes.at(-1).payload).sort(),['activeStart','goalHours','id']);
 assert.equal(state.fasts.find(row=>row.scheduled).end,null);
 assert.equal(state.fasts.find(row=>row.scheduled).start,occurrenceStart);
 assert.ok(Math.abs(state.fasts.find(row=>row.scheduled).goalHours-19-1/60)<1e-9);
 await page.locator('[data-discover=end-fast]').click();
 await page.locator('.fasting-quick [data-confirm-fast]').click();
 await page.locator('.fasting-quick').waitFor({state:'detached'});
 await page.locator('[data-discover=fasting]').first().click();
 await page.locator('[data-fast-section=history] summary').click();
 const occurrence=state.fasts.find(record=>record.scheduled);
 const scheduledRow=page.locator(`[data-fast-history-row="${occurrence.id}"]`);
 const heading=await scheduledRow.locator('.dc-fast-history-heading strong').innerText();
 const detail=await scheduledRow.locator('.dc-fast-history-detail > div').first().innerText();
 await scheduledRow.locator('[data-discover=history-edit]').click();
 const nameField=page.locator('.fasting-editor [name=label]');
 assert.deepEqual([heading,detail,await nameField.inputValue()],['Renamed','< 1 min - Does Not Repeat','Renamed']);
 await nameField.fill('Early finish');
 await page.locator('.fasting-editor [type=submit]').click();
 await scheduledRow.getByText('Early finish',{exact:true}).waitFor();
 assert.equal(state.fasts.find(record=>record.id===occurrence.id).scheduled.label,'Renamed');
 // History paging detects changed revisions and enforces the canonical 100-row delete bound.
 for(let index=0;index<100;index++)applyFastingCommand(state,{type:'fast.record',payload:{start:'2026-11-12T12:00',end:'2026-11-13T04:00',goalHours:16,label:'Earlier '+index}},clock);
 await page.evaluate(()=>window.mount());await page.locator('.dc-fast-footer').waitFor();await page.locator('[data-fast-section=history] summary').click();assert.equal(await page.locator('[data-fast-history-row]').count(),25);state.fasts[0].note='External change';await page.locator('[data-fh-list-more]').click();await page.getByRole('button',{name:'Reload latest',exact:true}).waitFor();await page.getByRole('button',{name:'Reload latest',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[data-fasting-status]'));
 for(const count of [50,75,100,102]){await page.locator('[data-fh-list-more]').click();await page.waitForFunction(expected=>document.querySelectorAll('[data-fast-history-row]').length===expected,count);}
 await page.locator('[data-fh-list-all]').click();assert.equal(await page.locator('[data-fh-list-all]').isChecked(),false);await page.getByText('Select up to 100 fasts.',{exact:true}).waitFor();await page.locator('[data-fh-list-select]').first().check();assert.equal(await page.locator('[data-fh-list-all]').evaluate(el=>el.indeterminate),true);await page.screenshot({path:'.local/fasting-ui/history.png'});
 await page.setViewportSize({width:320,height:760});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.evaluate(()=>document.body.classList.remove('dark'));assert.equal(await page.locator('.fasting-page').evaluate(el=>getComputedStyle(el).fontFamily),'Lato, Arial, sans-serif');await page.screenshot({path:'.local/fasting-ui/history-light-320.png'});
 await page.evaluate(()=>window.mountMore());await page.locator('[data-more-open=fasting]').click();await page.locator('[data-fasting-back]').waitFor();await page.locator('.dc-fast-footer [data-discover=schedule-fast]').click();await page.evaluate(()=>window.dispatchEvent(new Event('nourishing-back',{cancelable:true})));assert.equal(await page.locator('.fasting-editor').count(),0);await page.locator('[data-fasting-back]').click();await page.locator('[data-more-open=fasting]').waitFor();assert.equal(await page.locator('.fasting-page').count(),0);
 let release;heldRead=new Promise(resolve=>release=resolve);await page.evaluate(()=>window.mount());await page.locator('.fasting-page [role=status]').waitFor();await page.evaluate(()=>{window.app.dispose();document.querySelector('#page').textContent='Closed';});release();heldRead=null;await page.waitForFunction(()=>document.querySelector('#page').textContent==='Closed');assert.equal(await page.locator('dialog[open]').count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.violations),[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }finally{await browser?.close();await new Promise(done=>server.close(done));}
});
