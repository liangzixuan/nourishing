import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import {ID,Query} from 'node-appwrite';
import {fixtureOperator} from './fixture-operator.mjs';
import {allRows,databaseId} from './operator.mjs';

const origin=process.env.VERIFY_ORIGIN||'https://nourishing-cloud.appwrite.network',{users,db}=fixtureOperator(),created=[],failures=[];
assert.ok(['https://nourishing-cloud.appwrite.network','https://nourishing.app'].includes(origin));
const report={at:new Date().toISOString(),origin,checks:[]},args=(tableId,rowId)=>({databaseId,tableId,rowId});
const owner=JSON.parse(readFileSync('.local/migration-destination.json','utf8').replace(/^\uFEFF/,'')).accountId;
const before=await db.getRow(args('workspace_heads',owner));let browser,primaryError;
const remember=()=>writeFileSync('.local/pwa-cloud-fixtures.json',JSON.stringify({created,failures}));
async function clean(id){
 for(const tableId of ['workspace_records','workspace_media','workspace_recoveries','command_receipts','backup_reviews','push_deliveries','account_operations'])for(const row of await allRows(db,tableId,[Query.equal('ownerId',id)]))await db.deleteRow(args(tableId,row.$id));
 for(const tableId of ['reminder_dispatch','push_accounts','fasting_dispatch','workspace_heads','profiles','account_lifecycle'])try{await db.deleteRow(args(tableId,id));}catch(error){if(error.code!==404)throw error;}
 await users.delete({userId:id});
}
try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const sessions=[];
 for(let i=0;i<2;i++){
  const userId=ID.unique(),email=`pwa-${userId}@example.com`,password=randomUUID()+'Aa1!';
  await users.create({userId,email,password,name:'PWA cloud verification fixture'});created.push(userId);remember();
  const context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});sessions.push(context);
  const response=await context.request.post(origin+'/api/auth/login',{headers:{Origin:origin},data:{email,password}});assert.equal(response.status(),200);
 }
 const [context,other]=sessions;
 async function get(path,session=context){const response=await session.request.get(origin+path);assert.equal(response.status(),200,path);return response.json();}
 async function post(path,data,session=context){const response=await session.request.post(origin+path,{headers:{Origin:origin},data,timeout:90000});assert.equal(response.status(),200,`${path}: ${await response.text()}`);return response.json();}
 let revision=(await get('/api/library')).revision;
 const command=async(type,payload)=>{const result=await post('/api/workspace/command',{requestId:randomUUID(),revision,type,payload});revision=result.revision;return result;};
 const label={profile:'us-2016',population:'adult-4-plus',name:'PWA label fixture',serving:'1 cup',grams:'40',values:{calories:{amount:'150'},protein:{amount:'5'},sodium:{percent:'10'}}};
 const draft={name:label.name,serving:label.serving,grams:Number(label.grams),nutrients:{},nutrientEdits:[{kind:'label',profile:label.profile,quantity:{amount:1},basis:{serving:label.serving,grams:Number(label.grams)},values:label.values}]};
 const food=(await command('food.save',draft)).item.id;
 await command('favorite.set',{kind:'food',id:food,enabled:true});
 assert.equal((await get('/api/library/favorites')).items[0].id,food);assert.equal((await get('/api/library/favorites',other)).items.length,0);
 const resource=(await get('/api/library/item?kind=food&id='+encodeURIComponent(food))).resource;
 assert.equal(resource.nutrients.sodium,230);assert.deepEqual(resource.source.labelEdits[0].values,label.values);assert.equal(resource.source.labelEdits[0].profile,label.profile);
 report.checks.push('label source and derived nutrients','account-isolated favorites');
 const input={kind:'biometrics',text:'date,type,value,unit,time\n2026-11-14,Weight,70,kg,08:00'};
 const preview=await post('/api/imports/csv/preview',input);assert.equal(preview.count,1);
 const request={...input,revision:preview.revision,reviewToken:preview.reviewToken,requestId:randomUUID()};
 const saved=await post('/api/imports/csv/import',request);assert.deepEqual(await post('/api/imports/csv/import',request),saved);
 const foreign=await other.request.post(origin+'/api/imports/csv/import',{headers:{Origin:origin},data:request});assert.ok([400,409].includes(foreign.status()));
 assert.equal((await get('/api/library/favorites')).items.length,1);
 report.checks.push('CSV preview and atomic import','exact retry','foreign review rejected','favorites preserved across generation swap');
 const snapshot=await get('/api/offline'),offlineCommand={...snapshot.identity,operationId:randomUUID(),type:'note.add',payload:{date:'2026-11-15',time:'12:00',group:snapshot.state.settings.groups[0],text:'Offline cloud fixture'}};
 const offlineSaved=await post('/api/offline/commands',offlineCommand),offlineReplay=await post('/api/offline/commands',offlineCommand);assert.equal(offlineReplay.replayed,true);assert.equal(offlineReplay.operationId,offlineSaved.operationId);
 assert.equal((await get('/api/diary?date=2026-11-15')).notes.filter(row=>row.id===offlineCommand.operationId).length,1);
 for(const [session,input]of [[other,offlineCommand],[context,{...offlineCommand,generation:'previous-generation'}]]){const response=await session.request.post(origin+'/api/offline/commands',{headers:{Origin:origin},data:input});assert.equal(response.status(),409);}
 const reminder=await get('/api/reminders');assert.equal(reminder.paused,true);assert.equal(reminder.schedules.length,0);
 await post('/api/reminders/schedule',{revision:reminder.revision,schedule:{creationId:randomUUID(),kind:'daily',label:'Fixture reminder',time:'12:00',days:[0,1,2,3,4,5,6],timeZone:'UTC',enabled:true}});
 assert.equal((await get('/api/reminders')).schedules.length,1);assert.equal((await get('/api/reminders',other)).schedules.length,0);
 report.checks.push('offline immutable replay','offline account and generation isolation','paused reminder settings and isolation');
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin+'/diary');await page.locator('.md-summary').waitFor();await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>navigator.serviceWorker.controller);
 assert.equal(await page.locator('link[rel=manifest]').getAttribute('href'),'/manifest.webmanifest');
 const manifest=await get('/manifest.webmanifest');assert.equal(manifest.display,'standalone');
 for(const icon of manifest.icons)assert.equal((await context.request.get(origin+icon.src)).status(),200);
 const cached=await page.evaluate(async()=>{const result=[];for(const name of await caches.keys())for(const request of await(await caches.open(name)).keys())result.push(new URL(request.url).pathname);return result.sort();});
 const assetManifest=await page.evaluate(()=>fetch('/offline-assets.js').then(r=>r.text()).then(text=>JSON.parse(text.slice(text.indexOf('=')+1).replace(/;\s*$/,''))));
 assert.deepEqual(cached,assetManifest.files.slice().sort());assert.ok(cached.every(path=>!path.startsWith('/api/')&&!['/diary','/account','/login'].includes(path)));
 revision=(await get('/api/library')).revision;for(const amount of [1,2])await command('entry.add',{foodId:food,date:'2026-11-15',time:amount===1?'12:00':'13:00',group:snapshot.state.settings.groups[0],amount});
 await page.goto(origin+'/offline.html');await page.getByRole('button',{name:'Keep diary on this device'}).click();await page.getByRole('button',{name:'Refresh copy'}).waitFor();
 const biometricsBefore=(await get('/api/offline')).state.biometrics.length;
 await context.setOffline(true);await page.goto(origin+'/diary');await page.getByRole('heading',{name:'Offline diary'}).waitFor();
 await page.getByLabel('Date',{exact:true}).fill('2026-11-15');await page.waitForFunction(()=>document.querySelector('.offline-summary').textContent.includes('450 kcal'));
 const dailyScores=await page.locator('[data-offline-panel=scores]').innerHTML(),completeness=await page.locator('[data-offline-completeness-value]').textContent();
 await page.getByRole('button',{name:'Select foods',exact:true}).click();await page.locator('[data-select-food]').first().check();await page.waitForFunction(()=>document.querySelector('.offline-summary').textContent.includes('150 kcal'));
 assert.equal(await page.locator('[data-offline-panel=scores]').innerHTML(),dailyScores);assert.equal(await page.locator('[data-offline-completeness-value]').textContent(),completeness);
 await page.locator('[data-offline-panel=balances]>summary').click();await page.locator('[data-balance-scope]').filter({hasText:'1 selected food entry'}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'.local/pwa-hosted-offline-analysis.png'});
 await page.getByRole('button',{name:'Done',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.offline-summary').textContent.includes('450 kcal'));
 report.checks.push('offline food selection and balances with unchanged daily scores and completeness');
 await page.getByRole('button',{name:'Water',exact:true}).click();await page.getByLabel('Water (mL)').fill('250');await page.getByRole('button',{name:'Save pending'}).click();await page.getByRole('button',{name:'Sync 1 pending'}).waitFor();await page.reload();await page.getByRole('button',{name:'Sync 1 pending'}).waitFor();
 await context.setOffline(false);await page.getByRole('button',{name:'Refresh copy'}).waitFor({timeout:90000});assert.equal((await get('/api/offline')).state.biometrics.length,biometricsBefore+1);
 await page.getByRole('link',{name:'Open online diary'}).click();await page.locator('.md-summary').waitFor();
 report.checks.push('hosted offline restart, queued water entry, and automatic sync');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 report.checks.push('hosted service worker','install manifest and icons','public-only offline cache','offline/online recovery','mobile layout');
 for(const path of ['/api/home-widgets','/api/health-connect/export/intake/options'])assert.equal((await context.request.get(origin+path)).status(),404);
 assert.equal((await db.getRow(args('workspace_heads',owner))).digest,before.digest);report.ownerWorkspaceUnchanged=true;
}catch(error){primaryError=error;}finally{
 await browser?.close();for(const id of created)try{await clean(id);}catch{failures.push(id);}remember();
 if(failures.length)primaryError??=Error('Fixture cleanup incomplete; see local ledger.');
}
if(primaryError)throw primaryError;
report.fixtureRemoved=true;report.ok=true;writeFileSync('.local/pwa-cloud-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
