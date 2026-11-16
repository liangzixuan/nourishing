// Live disposable accounts only. Never modify the migrated owner's workspace.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import {ID,Query} from 'node-appwrite';
import {fixtureOperator} from './fixture-operator.mjs';
import {allRows,databaseId} from './operator.mjs';

const origin='https://nourishing-cloud.appwrite.network',{users,db}=fixtureOperator(),created=[],failures=[],checks=[];
const args=(tableId,rowId)=>({databaseId,tableId,rowId}),read=file=>JSON.parse(readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const owner=read('.local/migration-destination.json').accountId,before=await db.getRow(args('workspace_heads',owner));
let browser,primaryError;
const remember=()=>writeFileSync('.local/pwa-features-fixtures.json',JSON.stringify({created,failures}));
async function clean(id){
 for(const tableId of ['workspace_records','workspace_media','workspace_recoveries','command_receipts','backup_reviews','push_deliveries','account_operations'])for(const row of await allRows(db,tableId,[Query.equal('ownerId',id)]))await db.deleteRow(args(tableId,row.$id));
 for(const tableId of ['reminder_dispatch','push_accounts','fasting_dispatch','workspace_heads','profiles','account_lifecycle'])try{await db.deleteRow(args(tableId,id));}catch(error){if(error.code!==404)throw error;}
 await users.delete({userId:id});
}
try {
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const contexts=[];
 for(let index=0;index<2;index++){
  const userId=ID.unique(),email=`features-${userId}@example.com`,password=randomUUID()+'Aa1!';
  await users.create({userId,email,password,name:'PWA features verification fixture'});created.push(userId);remember();
  const context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});contexts.push(context);
  const response=await context.request.post(origin+'/api/auth/login',{headers:{Origin:origin},data:{email,password}});assert.equal(response.status(),200);
 }
 const [context,other]=contexts;
 async function get(path,session=context){const response=await session.request.get(origin+path);assert.equal(response.status(),200,path);return response.json();}
 async function post(path,data,session=context){const response=await session.request.post(origin+path,{headers:{Origin:origin},data,timeout:90000});assert.equal(response.status(),200,path+' '+await response.text());return response.json();}
 async function command(type,payload){const revision=(await get('/api/library')).revision;return post('/api/workspace/command',{requestId:randomUUID(),revision,type,payload});}
 const date='2026-11-15',food=(await command('food.save',{name:'PWA feature oats',serving:'40 g',grams:40,nutrients:{},nutrientEdits:[{kind:'label',profile:'us-2016',quantity:{amount:1},basis:{serving:'40 g',grams:40},values:{calories:{amount:'150'},protein:{amount:'5'}}}]})).item.id;
 const group=(await get('/api/offline')).state.settings.groups[0];
 await command('entry.add',{foodId:food,date,time:'12:00',group,amount:1});
 const preferences=await get('/api/coach/preferences');
 assert.equal((await post('/api/coach/answer',{date,question:'Protein',preferencesRevision:preferences.preferencesRevision})).facts[0].value,5);
 await command('coach.preferences',{revision:preferences.preferencesRevision,preferences:{goals:'Strength',dietaryPreferences:'Vegetarian',notes:'Fixture preference'}});
 assert.equal((await get('/api/coach/preferences')).preferences.notes,'Fixture preference');
 assert.notEqual((await get('/api/coach/preferences',other)).preferences.notes,'Fixture preference');
 checks.push('Coach recorded facts and account-isolated preferences');
 await command('dashboard.widgets',{patch:{glucose:true,cycle:true}});
 await command('chart.save',{version:2,name:'Fixture weight',primary:{kind:'biometric',type:'weight',unit:'kg'},secondary:null,days:14,visible:false,cycleOverlay:false});
 const chartId='custom:'+(await get('/api/charts?to='+date)).saved.find(chart=>chart.name==='Fixture weight').id;
 await command('chart.display',{id:chartId,patch:{showOnDashboard:true,range:'custom',from:'2026-11-13',to:date,primaryUnit:'lbs',includeToday:true}});
 const dashboard=await get('/api/dashboard?date='+date),charts=await get('/api/charts?to='+date);
 assert.ok(dashboard.pinnedCharts.cards.some(card=>card.id===chartId));
 assert.ok(!charts.cards.some(card=>card.id===chartId));
 assert.ok(!(await get('/api/dashboard?date='+date,other)).pinnedCharts.cards.some(card=>card.id===chartId));
 checks.push('hidden chart pinned independently with saved settings and account isolation');
 const packet=await get('/api/library/share?kind=food&id='+food);assert.equal(packet.kind,'food');assert.equal(packet.item.notes,undefined);
 const foreign=await other.request.get(origin+'/api/library/share?kind=food&id='+food),missing=await other.request.get(origin+'/api/library/share?kind=food&id='+randomUUID());assert.equal(foreign.status(),400);assert.equal(missing.status(),400);assert.deepEqual(await foreign.json(),await missing.json());
 const preview=await post('/api/library/share/preview',packet,other),input={revision:preview.revision,requestId:randomUUID(),type:'share.import',payload:packet};
 const saved=await post('/api/library/share/import',input,other);assert.deepEqual(await post('/api/library/share/import',input,other),saved);
 const print=await post('/api/library/food-print',{id:food,includeNotes:false});assert.equal(print.accountId,created[0]);assert.equal(print.capture.request.id,food);
 checks.push('explicit library sharing, exact import replay and account-bound food print');
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(25000);page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin+'/diary');await page.locator('.md-summary').waitFor();
 await page.locator('#discover-tab').click();await page.locator('[data-health-card=glucose]').waitFor();await page.locator('[data-health-card=cycle]').waitFor();
 await page.locator('[data-chart-open="'+chartId+'"]').waitFor();
 await page.getByRole('button',{name:'Share streak',exact:true}).click();await page.locator('.dc-streak-image').waitFor();await page.screenshot({path:'.local/pwa-hosted-streak.png'});await page.locator('#sheet').evaluate(dialog=>dialog.close());
 await page.locator('[data-discover=coach]').click();await page.getByRole('button',{name:'Protein',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-coach-question] [name=question]')?.value==='Protein'&&document.querySelector('.coach-results h2')?.textContent==='Protein');assert.equal(await page.locator('.coach-results article').count(),1);
 await page.screenshot({path:'.local/pwa-hosted-coach.png'});
 await page.locator('#sheet').evaluate(dialog=>dialog.close());
 await page.locator('#foods-tab').click();await page.locator('[data-library-item="'+food+'"]').click();await page.locator('[data-library-print]').click();
 await page.waitForFunction(()=>document.querySelector('[data-print]')?.disabled===false);
 assert.equal(await page.frameLocator('[data-print-frame]').locator('h1').textContent(),'PWA feature oats');
 await page.screenshot({path:'.local/pwa-hosted-food-print.png'});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 checks.push('hosted Dashboard cards and pins, streak image, Coach and styled food print on mobile Chrome');
 assert.equal((await db.getRow(args('workspace_heads',owner))).digest,before.digest);
}catch(error){primaryError=error;}finally{
 await browser?.close();for(const id of created)try{await clean(id);}catch{failures.push(id);}remember();
 if(failures.length)primaryError??=Error('Fixture cleanup incomplete; see local ledger.');
}
if(primaryError)throw primaryError;
const report={at:new Date().toISOString(),ok:true,checks,fixtureRemoved:true,ownerWorkspaceUnchanged:true};writeFileSync('.local/pwa-features-cloud-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
