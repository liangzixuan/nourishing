import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {ID,Query} from 'node-appwrite';
import {chromium} from 'playwright-core';
import {operator,allRows,databaseId} from './operator.mjs';
const origin='https://nourishing-cloud.appwrite.network',{users,db}=operator(),ids=[ID.unique(),ID.unique()],created=[],cleanupFailures=[],report={at:new Date().toISOString(),origin,checks:[]};
const args=(tableId,id)=>({databaseId,tableId,rowId:id}),identity=h=>Object.fromEntries(['digest','generation','$updatedAt'].map(k=>[k,h[k]]));
const remember=()=>writeFileSync('.local/food-report-hosted-fixture.json',JSON.stringify({ids,created,cleanupFailures}));remember();let phase='fixture setup';
const owner=JSON.parse(readFileSync('.local/migration-destination.json','utf8').replace(/^\uFEFF/,'')).accountId,ownerBefore=identity(await db.getRow(args('workspace_heads',owner)));
try{
 const secrets=[];for(const id of ids){await users.create({userId:id,email:`food-report-ui-${id}@example.com`,password:randomUUID()+'Aa1!',name:'Hosted food/report test'});created.push(id);remember();secrets.push((await users.createSession({userId:id})).secret);}
 async function api(path,body,{account=0,status=200}={}){const r=await fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,...(account===null?{}:{Cookie:'__Host-nourishing_session='+secrets[account]}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(65000)});assert.equal(r.status,status,`${path}: status ${r.status}`);assert.match(r.headers.get('cache-control')??'',/no-store/);return r.json();}
 phase='hosted print options';
 const options=await api('/api/print-report/options');assert.equal(options.accountId,ids[0]);assert.equal((await api('/api/print-report/options',undefined,{account:1})).accountId,ids[1]);await api('/api/print-report/options',undefined,{account:null,status:401});
 phase='live barcode lookup';
 const product=await api('/api/barcode/lookup',{code:'3017620422003'});assert.equal(product.resource.barcode,'3017620422003');assert.equal(product.resource.source.apiVersion,'3.6');assert.ok(product.resource.nutrients.calories>0);
 const payload={reviewToken:product.reviewToken,date:'2026-11-15',time:'12:00',group:'Lunch',quantity:25,unit:'g'};
 await api('/api/barcode/preview',payload);await api('/api/barcode/preview',payload,{account:1,status:409});
 phase='barcode atomic save and retry';
 const command={requestId:randomUUID(),revision:product.revision,type:'barcode.log',payload};const saved=await api('/api/barcode/save',command);assert.deepEqual(await api('/api/barcode/save',command),saved);
 const current=await api('/api/backup/export'),workspace=current.manifest.workspace;assert.equal(workspace.entries.length,1);const food=workspace.foods.find(f=>f.id===product.resource.id);assert.deepEqual(food.source,product.resource.source);assert.equal(food.nutrients.calories,product.resource.nutrients.calories);
 const other=await api('/api/backup/export',undefined,{account:1});assert.equal(other.manifest.workspace.entries.length,0);assert.ok(!other.manifest.workspace.foods.some(f=>f.id===food.id));
 report.checks.push('live Open Food Facts v3.6 lookup, signed cross-account denial, atomic save and exact retry');
 phase='branded provider search';
 const search=await api('/api/branded/search',{q:'Nutella'});assert.ok(search.items.length>0);report.checks.push('live branded-food search from hosted runtime');
 phase='captured private print report';
 const request={options:{from:'2026-11-15',to:'2026-11-15',dayFilter:'all',includeToday:true,includeSupplements:true},sections:{profile:false,nutrition:true,diary:true,biometrics:false,notes:false,bloodPressure:false,glucoseKetones:false,chartIds:[],diaryColumn:{mode:'macros'}}};
 const printed=await api('/api/print-report/preview',request);assert.equal(printed.accountId,ids[0]);assert.equal(printed.capture.diary.length,1);assert.equal(printed.capture.diary[0].nutrients.calories,product.resource.nutrients.calories*.25);assert.equal((await api('/api/print-report/preview',request,{account:1})).capture.diary.length,0);
 await api('/api/print-report/preview',{...request,ownerId:ids[1]},{status:400});assert.equal((await api('/api/backup/export')).revision,current.revision);
 for(const path of ['/report-source/renderer.js','/report-source/print-en.css','/print-report.css','/barcode.css','/vendor/zxing/3.1.6/reader.wasm']){const response=await fetch(origin+path,{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);assert.ok((await response.arrayBuffer()).byteLength>100);}
 report.checks.push('private print capture/calculations, read-only preview and deployed report/scanner assets');
 phase='hosted mobile report UI';
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{const context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});await context.addCookies([{name:'__Host-nourishing_session',value:secrets[0],url:origin,secure:true,httpOnly:true,sameSite:'Lax'}]);const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(30000);await page.goto(origin+'/diary');await page.locator('#discover-tab').click();await page.locator('[data-tab=report]').click();await page.getByRole('button',{name:'Print Report',exact:true}).click();const form=page.locator('.print-flow form');await form.locator('[name=from]').fill('2026-11-15');await form.locator('[name=to]').fill('2026-11-15');await form.locator('[name=includeToday]').check();await form.locator('[name=diary]').check();await form.getByRole('button',{name:'Preview',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-print]')?.disabled===false);const frame=page.frameLocator('[data-print-frame]');assert.ok((await frame.locator('body').innerText()).includes(product.resource.name));assert.equal(await frame.locator('h1').evaluate(el=>getComputedStyle(el).fontSize),'28px');assert.equal(await frame.locator('script,[style],style').count(),0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'.local/food-report-hosted-mobile.png'});assert.deepEqual(errors,[]);report.checks.push('hosted mobile navigation, captured barcode nutrition and styled script-free report preview');}finally{await browser.close();}

 assert.deepEqual(identity(await db.getRow(args('workspace_heads',owner))),ownerBefore);report.checks.push('real owner unchanged');report.status='passed';
}catch(error){report.status='failed';report.phase=phase;report.error={name:error.name,code:error.code??null};throw Error(`Hosted food/report verification failed at ${phase} (${error.name}, ${error.code??'assertion'}).`);}
finally{
 const clean=async(label,fn)=>{try{await fn();}catch(e){if(e.code!==404)cleanupFailures.push({label,code:e.code??null});}};
 for(const id of created){const a=await users.get({userId:id}).catch(()=>null);if(a?.email!==`food-report-ui-${id}@example.com`){cleanupFailures.push({label:'identity',code:null});continue;}for(const tableId of ['workspace_recoveries','backup_reviews','health_reviews','command_receipts','workspace_media','workspace_records']){let rows=[];await clean(tableId+':list',async()=>{rows=await allRows(db,tableId,[Query.equal('ownerId',id)]);});for(const row of rows)if(row.ownerId===id)await clean(tableId,()=>db.deleteRow(args(tableId,row.$id)));}for(const tableId of ['workspace_heads','profiles'])await clean(tableId,()=>db.deleteRow(args(tableId,id)));await clean('account',()=>users.delete({userId:id}));}
 remember();report.cleanup=cleanupFailures.length?'incomplete':'complete';writeFileSync('.local/food-report-hosted-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(cleanupFailures.length)process.exitCode=1;
}
