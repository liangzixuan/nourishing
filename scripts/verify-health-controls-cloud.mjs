// Only disposable accounts are changed. The imported owner's digest is compared read-only.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {ID,Query} from 'node-appwrite';
import {chromium} from 'playwright-core';
import {fixtureOperator} from './fixture-operator.mjs';
import {allRows} from './operator.mjs';
const origin=process.env.VERIFY_ORIGIN||'https://nourishing-cloud.appwrite.network',{users,db}=fixtureOperator(),created=[],failures=[],checks=[];
assert.ok(['https://nourishing-cloud.appwrite.network','https://nourishing.app'].includes(origin));
const owner=JSON.parse(readFileSync('.local/migration-destination.json')).accountId,args={databaseId:'nourishing',tableId:'workspace_heads',rowId:owner},before=await db.getRow(args);
let browser,page,primaryError;
const ledger=()=>writeFileSync('.local/health-control-fixtures.json',JSON.stringify({created,failures}));
async function clean(id){
 assert.ok(created.includes(id)&&id!==owner);
 assert.equal((await allRows(db,'workspace_media',[Query.equal('ownerId',id)])).length,0,'This fixture must not own files.');
 for(const tableId of ['workspace_records','command_receipts'])for(const row of await allRows(db,tableId,[Query.equal('ownerId',id)])){assert.equal(row.ownerId,id);await db.deleteRow({databaseId:'nourishing',tableId,rowId:row.$id});}
 for(const tableId of ['workspace_heads','profiles','reminder_dispatch','fasting_dispatch'])try{await db.deleteRow({databaseId:'nourishing',tableId,rowId:id});}catch(error){if(error.code!==404)throw error;}
 await users.delete({userId:id});
}
try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const contexts=[];
 for(let index=0;index<2;index++){
  const userId=ID.unique(),email=`health-ui-${userId}@example.com`,password=randomUUID()+'Aa1!';await users.create({userId,email,password,name:'Health controls verification fixture'});created.push(userId);ledger();
  const context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});contexts.push(context);const response=await context.request.post(origin+'/api/auth/login',{headers:{Origin:origin},data:{email,password}});assert.equal(response.status(),200);
 }
 const [context,other]=contexts;
 async function get(path,session=context){const response=await session.request.get(origin+path);assert.equal(response.status(),200,path);return response.json();}
 async function post(path,data,session=context){const response=await session.request.post(origin+path,{headers:{Origin:origin},data,timeout:90000});assert.equal(response.status(),200,path+' '+await response.text());return response.json();}
 const command=async(type,payload)=>post('/api/workspace/command',{requestId:randomUUID(),revision:(await get('/api/library')).revision,type,payload});
 const date='2026-11-14',range='?from=2026-11-13&to=2026-11-15';
 const packet={format:'nourish-cycle-data',version:1,source:{id:'fixture',name:'Fixture observations'},exportedAt:'2026-11-15T18:00:00Z',records:[{id:'phase',date,metric:'phase',value:'follicular',observedAt:null}]};
 const review=await post('/api/cycle/preview',packet),input={requestId:randomUUID(),revision:review.revision,type:'cycle.import',payload:{data:packet,reviewToken:review.reviewToken,confirmed:true}};
 assert.equal((await get('/api/cycle'+range)).view.records.length,0);const saved=await post('/api/cycle/import',input);assert.deepEqual(await post('/api/cycle/import',input),saved);
 const view=await get('/api/cycle'+range);assert.equal(view.view.records.length,1);assert.equal((await get('/api/cycle'+range,other)).view.records.length,0);const ids=view.view.records.map(row=>row.id);
 const foreign=await other.request.post(origin+'/api/cycle/removal-preview',{headers:{Origin:origin},data:{ids}});assert.equal(foreign.status(),409);
 assert.equal((await get('/api/diary?date='+date)).cycleDays.length,1);await command('cycle.display',{policy:{version:1,showDiary:false}});assert.equal((await get('/api/diary?date='+date)).cycleDays.length,0);await command('cycle.display',{policy:{version:1,showDiary:true}});
 checks.push('reviewed cycle import, exact retry, diary visibility and second-account isolation');
 await command('biometric.log',{date,time:'08:00',selection:{kind:'new-custom',name:'Meter'},values:{value:90},unit:'mg/dL',group:null});
 await command('glucose.settings',{policy:{version:1,glucose:{type:'Meter'},insulin:null,displayUnit:'mmol/L',range:{low:4,high:8}}});
 const glucose=await get('/api/glucose-timeline'+range);assert.equal(glucose.view.stats.count,1);assert.ok(glucose.view.stats.mean>4&&glucose.view.stats.mean<6);assert.equal((await get('/api/glucose-timeline'+range,other)).view.status,'unconfigured');
 await command('chart.display',{id:'cgm',patch:{visible:true,hours:48,compare:{kind:'exercise',id:'duration'},targetRange:{mode:'custom',custom:{unit:'mg/dL',low:80,high:150,fastedHigh:105}}}});
 const chart=(await get('/api/charts?to=2026-11-15&card=cgm')).cards[0];assert.equal(chart.settings.hours,48);assert.equal(chart.settings.compare.id,'duration');assert.equal(chart.settings.targetRange.custom.high,150);
 checks.push('glucose source and units, CGM comparison and custom range persisted');
 await Promise.all([get('/api/dashboard?date=2026-11-15'),get('/api/charts?to=2026-11-15')]);
 checks.push('overlapping Dashboard and Charts reads recover provider transaction conflicts');
 page=await context.newPage();const errors=[];page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));await page.goto(origin+'/diary');await page.locator('.md-summary').waitFor();await page.locator('#settings-tab').click();await page.getByRole('button',{name:'Cycle Tracking',exact:true}).click();await page.locator('.health-observations input').waitFor();await page.screenshot({path:'.local/health-cycle-hosted.png'});await page.locator('#sheet [data-close]').click();
 await page.getByRole('button',{name:'Glucose Timeline',exact:true}).click();await page.locator('[data-gt-stat=count]').waitFor();assert.equal(await page.locator('[data-gt-stat=count]').getAttribute('data-value'),'1');await page.screenshot({path:'.local/health-glucose-hosted.png'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('#sheet [data-close]').click();
 await page.locator('#discover-tab').click();await page.getByRole('button',{name:'Charts',exact:true}).click();await page.locator('[data-chart-open=cgm]').waitFor();await page.locator('.cgm-details>summary').click();await page.locator('[data-mcl-stat=mean]').waitFor();await page.screenshot({path:'.local/health-cgm-hosted.png'});assert.deepEqual(errors,[]);
 checks.push('hosted mobile cycle review, glucose timeline and CGM statistics render without script errors');
 const removal=await post('/api/cycle/removal-preview',{ids}),remove={requestId:randomUUID(),revision:removal.revision,type:'cycle.remove',payload:{ids,reviewToken:removal.reviewToken,confirmed:true}};const removed=await post('/api/cycle/remove',remove);assert.deepEqual(await post('/api/cycle/remove',remove),removed);assert.equal((await get('/api/cycle'+range)).view.records.length,0);
 checks.push('reviewed removal and exact retry');assert.equal((await db.getRow(args)).digest,before.digest);
}catch(error){primaryError=error;if(page&&!page.isClosed()){await page.screenshot({path:'.local/health-controls-failure.png'}).catch(()=>{});writeFileSync('.local/health-controls-failure.txt',(await page.locator('body').innerText().catch(()=>'')));}}finally{await browser?.close();for(const id of created)try{await clean(id);}catch{failures.push(id);}ledger();if(failures.length)primaryError??=Error('Fixture cleanup incomplete; see local ledger.');}
if(primaryError)throw primaryError;
const report={at:new Date().toISOString(),origin,ok:true,checks,fixturesRemoved:true,ownerWorkspaceUnchanged:true};writeFileSync('.local/health-controls-cloud-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
