import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright-core';
import {CHROME_EXECUTABLE} from './_chrome.mjs';
import {waitForOutboxIdle} from './fixtures/browser-outbox.mjs';
import {initialState,act} from '../server/domain/workspace.mjs';
import {createDataRepository} from '../server/data-repository.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';
import {displayView} from '../server/display-settings.mjs';
import {nutrientTargetsView} from '../server/nutrition-views.mjs';
import {createWebHandler} from '../server/http.mjs';
import {barcodeAssets} from '../scripts/package-barcode-assets.mjs';

test('Diary group actions update mixed records locally and reconcile canonical copies and reusable foods',async()=>{
 const seed=initialState();seed.settings.groups.unshift('Uncategorized');
 const date=new Date().toLocaleDateString('en-CA'),previous=new Date(date+'T12:00:00Z');previous.setUTCDate(previous.getUTCDate()-1);const yesterday=previous.toISOString().slice(0,10);
 seed.foods=[{id:'rice',name:'Rice',grams:100,nutrients:{calories:100}},{id:'apple',name:'Apple',grams:100,nutrients:{calories:50}}];
 act(seed,'entry.add',{date,group:'Lunch',foodId:'rice',amount:1,time:'12:00'});act(seed,'note.add',{date,group:'Lunch',text:'Lunch note',time:'14:00'});act(seed,'water.add',{date,group:'Lunch',amount:250});seed.biometrics[0].time='10:00';
 act(seed,'exercise.add',{date,group:'Lunch',name:'Walk',duration:20,calories:60,time:'11:00'});act(seed,'entry.add',{date,group:'Dinner',foodId:'apple',amount:2,time:'18:00'});
 act(seed,'entry.add',{date:yesterday,group:'Lunch',foodId:'apple',amount:1,time:'12:15'});act(seed,'note.add',{date:yesterday,group:'Lunch',text:'Yesterday note'});act(seed,'entry.add',{date:yesterday,group:'Dinner',foodId:'rice',amount:5});
 const fixture=diaryStoreFixture(seed),store=createWorkspaceStore(fixture.db,'fixture'),repository=createDataRepository(fixture.db,'fixture'),clock={now:new Date(),timeZone:'UTC'};
 const sent=[];let base,handler,browser,page,hold=null,release;
 const service={current:async()=>({id:'fixture',email:'fixture@example.com',name:'Fixture'}),offlineSnapshot:()=>store.offlineSnapshot(),offlineCommand:async(_,input)=>{if(hold)await hold;sent.push({type:input.type,payload:input.payload});return store.offlineCommand(input);},readDiary:(_,day)=>repository.diary(day,clock),display:async()=>displayView(fixture.state()),nutrientTargets:async(_,day)=>nutrientTargetsView(fixture.state(),day),workspaceCommand:async(_,input)=>{if(hold)await hold;const trace={type:input.type,payload:input.payload};sent.push(trace);let result;try{result=await store.command(input);trace.result=result;}catch(error){trace.error={code:error.code,status:error.status,message:error.message};throw error;}return result;}};
 const vendor=new Map((await barcodeAssets()).map(asset=>['/'+asset.path,asset]));
 const assets={get(path){if(vendor.has(path))return vendor.get(path);const file=resolve('public','.'+(path==='/diary'?'/diary.html':path));if(!file.startsWith(resolve('public')+'/')&&!file.startsWith(resolve('public')+'\\'))return;const ext=extname(file);if(existsSync(file)&&['.html','.js','.mjs','.css','.svg','.woff2'].includes(ext))return {body:readFileSync(file),type:({'.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'})[ext]??'text/javascript'};}};
 const server=createServer(async(req,res)=>{const response=await handler(new Request(base+req.url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:req,duplex:'half'})}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));});await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;handler=createWebHandler({config:{origin:base},service,assets});
 try{
  browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});page=await browser.newPage({viewport:{width:412,height:915},colorScheme:'dark',extraHTTPHeaders:{Cookie:'__Host-nourishing_session=fixture'}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(base+'/diary');await page.locator('.md-diary').waitFor();
  const menu=async(group='Lunch')=>{await page.getByRole('button',{name:group+' actions',exact:true}).click();await page.locator('.diary-menu-sheet').waitFor();};
  const dismiss=async()=>{await page.keyboard.press('Escape');await page.locator('#sheet').waitFor({state:'hidden'});};
  const localState=()=>page.evaluate(async()=>await(await import('/local-engine.js')).localWorkspaceState());
  const localUntil=async predicate=>{for(let i=0;i<100;i++){if(predicate(await localState()))return;await new Promise(r=>setTimeout(r,50));}assert.fail('Local group change did not appear');};
  const breakfast=page.locator('[data-md-group="Breakfast"]');
  await breakfast.locator('summary strong').click();
  assert.equal(await breakfast.evaluate(node=>node.open),false,'Selecting an empty group must not expand it');
  assert.equal(await breakfast.locator('[data-md-select-group]').getAttribute('aria-pressed'),'true');
  await page.locator('#add-food').click();await page.getByRole('button',{name:'Add Note',exact:true}).click();
  await page.locator('#sheet textarea').waitFor();assert.equal(await page.locator('#sheet select[name=group]').inputValue(),'Breakfast');await dismiss();
  await breakfast.locator('[data-md-fold-group]').click();assert.equal(await breakfast.evaluate(node=>node.open),true);
  await breakfast.locator('[data-md-fold-group]').click();assert.equal(await breakfast.evaluate(node=>node.open),false);
  const touch=await page.context().newCDPSession(page);
  const swipe=async(row,dx,dy=0,finish='touchEnd')=>{await row.scrollIntoViewIfNeeded();const box=await row.boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let step=1;step<=5;step++)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*step/5,y:y+dy*step/5}]});await touch.send('Input.dispatchTouchEvent',{type:finish,touchPoints:[]});};
  const riceRow=page.locator('[data-diary-record]').filter({hasText:'Rice'}).first();
  await swipe(riceRow,110);assert.equal(await riceRow.locator('.md-swipe-options').isVisible(),true,'Right swipe reveals options');
  mkdirSync('.local/diary-group',{recursive:true});await page.screenshot({path:'.local/diary-group/swipe-options.png'});
  await riceRow.locator('.md-swipe-options').click();await page.locator('.diary-tools-menu').waitFor();await dismiss();
  await swipe(riceRow,-110);assert.equal(await riceRow.locator('.md-swipe-delete').isVisible(),true,'Left swipe reveals delete');
  await page.screenshot({path:'.local/diary-group/swipe-delete.png'});
  await riceRow.locator('.md-swipe-delete').click();await page.locator('[data-confirm]').waitFor();await dismiss();assert.equal(fixture.state().entries.filter(r=>r.date===date&&r.foodId==='rice').length,1);
  await swipe(riceRow,8,-90);assert.equal(await riceRow.locator('.md-swipe-options').isVisible(),false,'Vertical scrolling must not reveal actions');
  await swipe(riceRow,90,0,'touchCancel');assert.equal(await riceRow.locator('.md-swipe-options').isVisible(),false,'Interrupted touch closes the action');
  await page.locator('#add-food').click();await page.getByRole('button',{name:'Add Note',exact:true}).click();
  await page.locator('#sheet textarea').fill('Swipe deletion test');hold=new Promise(r=>release=r);await page.locator('#sheet button[type=submit]').click();
  await localUntil(s=>s.notes.some(row=>row.text==='Swipe deletion test'&&row.group==='Breakfast'));assert.equal(fixture.state().notes.some(row=>row.text==='Swipe deletion test'),false);
  if(!await breakfast.evaluate(node=>node.open))await breakfast.locator('[data-md-fold-group]').click();
  let pendingNote=page.locator('[data-diary-record]').filter({hasText:'Swipe deletion test'});
  await pendingNote.locator('.entry-name').click();await page.locator('#sheet textarea').waitFor();assert.equal(await page.locator('#sheet textarea').isEditable(),true,'A pending note remains editable');
  await page.locator('#sheet textarea').fill('Pending first edit');await page.locator('#sheet button[type=submit]').click();await localUntil(s=>s.notes.some(r=>r.text==='Pending first edit'));
  const editedNote=page.locator('[data-diary-record]').filter({hasText:'Pending first edit'});await editedNote.locator('.entry-name').click();await page.locator('#sheet textarea').fill('Pending final edit');await page.locator('#sheet button[type=submit]').click();await localUntil(s=>s.notes.some(r=>r.text==='Pending final edit'));
  await page.reload();await page.locator('.md-diary').waitFor();await localUntil(s=>s.notes.some(r=>r.text==='Pending final edit'));
  hold=null;release();await waitForOutboxIdle(page,()=>fixture.state().notes.some(r=>r.text==='Pending final edit'));
  assert.equal(fixture.state().notes.filter(r=>['Swipe deletion test','Pending first edit','Pending final edit'].includes(r.text)).length,1);
  hold=new Promise(r=>release=r);
  for(const value of [300,350]){
   await page.locator('[data-diary-record]').filter({hasText:'Water'}).first().locator('.entry-name').click();await page.locator('#sheet [name=value]').fill(String(value));await page.locator('[data-mb-save]').click();await localUntil(s=>s.biometrics.some(r=>r.type==='Water'&&r.value===value));
  }
  for(const duration of [25,30]){
   await page.locator('[data-diary-record]').filter({hasText:'Walk'}).first().locator('.entry-name').click();await page.locator('#sheet [name=duration]').fill(String(duration));await page.locator('.me-save').click();await localUntil(s=>s.entries.some(r=>r.name==='Walk'&&r.duration===duration));
  }
  assert.equal(fixture.state().biometrics[0].value,250);assert.equal(fixture.state().entries.find(r=>r.name==='Walk').duration,20);
  if(!await breakfast.evaluate(node=>node.open))await breakfast.locator('[data-md-fold-group]').click();
  pendingNote=page.locator('[data-diary-record]').filter({hasText:'Pending final edit'});await swipe(pendingNote,-110);await pendingNote.locator('.md-swipe-delete').click();await page.locator('[data-confirm]').click();
  await localUntil(s=>!s.notes.some(row=>row.text==='Pending final edit'));hold=null;release();await waitForOutboxIdle(page,()=>!fixture.state().notes.some(row=>row.text==='Pending final edit'));
  assert.equal(fixture.state().biometrics[0].value,350);assert.equal(fixture.state().entries.find(r=>r.name==='Walk').duration,30);
  assert.ok(sent.some(row=>row.type==='note.add'&&row.payload.group==='Breakfast'));assert.ok(sent.some(row=>row.type==='records.delete'));
  await menu();
  assert.deepEqual(await page.locator('.diary-menu-sheet button').allTextContents(),['Add Group Timestamp','Sort Group Entries by Time',"Copy Yesterday’s Group",'Create Recipe from Group','Create Meal from Group','Edit Group Quick Add Default','Copy','Show Nutrition Summary','Delete']);
  assert.equal(await page.locator('.diary-menu-sheet img').count(),9);await page.waitForFunction(()=>[...document.querySelectorAll('.diary-menu-sheet img')].every(img=>img.complete&&img.naturalWidth>0));mkdirSync('.local/diary-group',{recursive:true});await page.screenshot({path:'.local/diary-group/menu.png'});await page.evaluate(()=>history.back());await page.locator('#sheet').waitFor({state:'hidden'});assert.equal(await page.locator('.md-diary').count(),1);await menu();await page.mouse.click(400,20);await page.locator('#sheet').waitFor({state:'hidden'});
  hold=new Promise(r=>release=r);
  await menu();await page.getByRole('button',{name:'Sort Group Entries by Time',exact:true}).click();await localUntil(s=>s.settings.diaryGroupOrder?.groups.some(g=>g.group==='Lunch'&&g.mode==='time'));
  await page.waitForFunction(()=>{const rows=[...document.querySelectorAll('[data-diary-record]')];return rows.findIndex(n=>n.textContent.includes('Water'))<rows.findIndex(n=>n.textContent.includes('Rice'));});
  assert.equal(fixture.state().settings.diaryGroupOrder,undefined);
  await menu();await page.getByRole('button',{name:'Add Group Timestamp',exact:true}).click();await page.locator('input[name=time]').fill('13:45');await page.locator('#sheet').getByRole('button',{name:'Save',exact:true}).click();await localUntil(s=>s.notes.find(r=>r.text==='Lunch note').time==='13:45');
  const pending=await localState();assert.ok(['entries','notes','biometrics'].every(c=>pending[c].filter(r=>r.date===date&&r.group==='Lunch').every(r=>r.time==='13:45')));assert.equal(fixture.state().notes.find(r=>r.text==='Lunch note').time,'14:00');
  await menu();await page.getByRole('button',{name:'Copy Yesterday’s Group',exact:true}).click();await localUntil(s=>s.notes.filter(r=>r.text==='Yesterday note').length===2);
  await menu();await page.getByRole('button',{name:'Edit Group Quick Add Default',exact:true}).click();await page.getByRole('radio',{name:'Add note',exact:true}).check();await page.getByRole('button',{name:'Save',exact:true}).click();await localUntil(s=>s.settings.diaryQuickAdd?.shortcuts.some(r=>r.group==='Lunch'&&r.action==='note'));
  await page.reload();await page.locator('.md-diary').waitFor();await localUntil(s=>s.notes.filter(r=>r.text==='Yesterday note').length===2);hold=null;release();await waitForOutboxIdle(page,()=>fixture.state().notes.length===3&&fixture.state().settings.diaryQuickAdd?.shortcuts.some(r=>r.group==='Lunch'&&r.action==='note'));
  assert.equal(fixture.state().entries.filter(r=>r.date===date&&r.group==='Lunch').length,3);assert.equal(fixture.state().entries.filter(r=>r.date===date&&r.group==='Dinner').length,1);assert.equal(fixture.state().settings.diaryQuickAdd.shortcuts[0].action,'note');
  for(const kind of ['Meal','Recipe']){
   await menu();await page.getByRole('button',{name:'Create '+kind+' from Group',exact:true}).click();await page.getByRole('textbox',{name:'Name',exact:true}).fill('Group '+kind);assert.deepEqual(await page.locator('.diary-tools-preview li').count(),2);await page.getByRole('button',{name:'Save',exact:true}).click();await waitForOutboxIdle(page,()=>fixture.state()[kind.toLowerCase()+'s'].some(r=>r.name==='Group '+kind));
  }
  assert.equal(fixture.state().meals[0].items.length,2);assert.equal(fixture.state().recipes[0].ingredients.length,2);
  await menu();await page.getByRole('button',{name:'Copy',exact:true}).click();await page.locator('#sheet').waitFor({state:'hidden'});await menu('Dinner');await page.getByRole('button',{name:'Paste',exact:true}).click();await page.locator('input[name=date]').waitFor();assert.equal(await page.locator('select[name=group]').inputValue(),'Dinner');hold=new Promise(r=>release=r);await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Copy',exact:true}).click();await localUntil(s=>s.entries.filter(r=>r.group==='Dinner'&&r.date===date).length===4);assert.equal(fixture.state().entries.filter(r=>r.group==='Dinner'&&r.date===date).length,1);hold=null;release();await waitForOutboxIdle(page,()=>fixture.state().entries.filter(r=>r.group==='Dinner'&&r.date===date).length===4);
  await menu();await page.screenshot({path:'.local/diary-group/copied-menu.png'});await page.getByRole('button',{name:'Show Nutrition Summary',exact:true}).click();await page.locator('.meal-nutrition-summary [aria-busy=false]').waitFor();assert.match(await page.locator('.meal-nutrition-summary').innerText(),/150/);await page.getByRole('heading',{name:'Nutrition summary',exact:true}).waitFor();await dismiss();await menu('Breakfast');assert.equal(await page.getByRole('button',{name:'Delete',exact:true}).isDisabled(),true);await page.getByRole('button',{name:'Copy Yesterday’s Group',exact:true}).click();await page.locator('#sheet').waitFor({state:'hidden'});
  await page.locator('[data-action=complete-day]').click();await waitForOutboxIdle(page,()=>fixture.state().settings.completedDays.includes(date));assert.equal(await page.locator('.md-swipe-delete').count(),0,'Completed days do not expose row deletion');await menu();for(const name of ['Add Group Timestamp','Copy Yesterday’s Group','Delete'])assert.equal(await page.getByRole('button',{name,exact:true}).isDisabled(),true);assert.equal(await page.getByRole('button',{name:'Copy',exact:true}).isEnabled(),true);await dismiss();await page.locator('[data-action=complete-day]').click();await waitForOutboxIdle(page,()=>!fixture.state().settings.completedDays.includes(date));
  await menu();await page.getByRole('button',{name:'Delete',exact:true}).click();await page.getByRole('button',{name:'Delete',exact:true}).click();await waitForOutboxIdle(page,()=>!fixture.state().entries.some(r=>r.date===date&&r.group==='Lunch'));
  assert.equal(fixture.state().notes.filter(r=>r.date===date&&r.group==='Lunch').length,0);assert.equal(fixture.state().biometrics.filter(r=>r.group==='Lunch').length,0);assert.equal(fixture.state().biometrics.filter(r=>r.group==='Dinner').length,1);assert.equal(fixture.state().entries.filter(r=>r.date===date&&r.group==='Dinner').length,4);assert.equal(fixture.state().entries.filter(r=>r.date===yesterday).length,2);assert.deepEqual(errors,[]);assert.deepEqual(sent.filter(r=>r.error),[]);
 }catch(error){console.error('Group command failures',sent.filter(r=>r.error));mkdirSync('.local/diary-group',{recursive:true});await page?.screenshot({path:'.local/diary-group/failure.png'}).catch(()=>{});throw error;}finally{release?.();await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
