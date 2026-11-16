import {chooseDiaryDate} from './diary-test-navigation.mjs';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import {ID,Query} from 'node-appwrite';
import {fixtureOperator} from './fixture-operator.mjs';
import {allRows,databaseId} from './operator.mjs';
const origin='https://nourishing-cloud.appwrite.network',{users,db,storage}=fixtureOperator(),created=[],report={at:new Date().toISOString(),checks:[]};let browser,primaryError;
async function clean(id){for(const tableId of ['health_reviews','command_receipts','workspace_records','workspace_media'])for(const row of await allRows(db,tableId,[Query.equal('ownerId',id)])){if(tableId==='workspace_media')try{await storage.deleteFile({bucketId:'private-media',fileId:row.fileId});}catch(error){if(error.code!==404)throw error;}await db.deleteRow({databaseId,tableId,rowId:row.$id});}for(const tableId of ['workspace_heads','profiles'])try{await db.deleteRow({databaseId,tableId,rowId:id});}catch(error){if(error.code!==404)throw error;}await users.delete({userId:id});}
try{
 const owner=JSON.parse(readFileSync('.local/migration-destination.json')).accountId,baseline=JSON.parse(readFileSync('.local/workspace-import.json')).workspaceDigest;
 const ownerDigest=async()=>(await db.getRow({databaseId,tableId:'workspace_heads',rowId:owner})).digest;assert.equal(await ownerDigest(),baseline);
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});
 const id=ID.unique(),email=`expanded-${id}@example.com`,password=randomUUID()+'Aa1!';await users.create({userId:id,email,password,name:'Expanded cloud fixture'});created.push(id);writeFileSync('.local/expanded-fixtures.json',JSON.stringify({created}));
 const post=async(path,data,headers={})=>{const r=await context.request.post(origin+path,{headers:{Origin:origin,...headers},data,timeout:90000});if(r.status()!==200){const body=await r.json();throw Error(`${path}: ${r.status()} ${body.error??'failed'}`);}return r.json();};
 await post('/api/auth/login',{email,password});const get=async path=>{const r=await context.request.get(origin+path,{timeout:90000});assert.equal(r.status(),200,path);return r.json();};
 let revision=(await get('/api/diary?date=2026-11-14')).revision;
 const command=async(type,payload)=>{const r=await post('/api/workspace/command',{requestId:randomUUID(),revision,type,payload});revision=r.revision;return r;};
 const food=(await command('food.save',{name:'Cloud fixture oats',serving:'100 g',grams:100,nutrients:{calories:200,protein:10}})).item.id;
 await command('meal.log',{date:'2026-11-14',time:'12:00',group:'Lunch',rows:[{foodId:food,quantity:50,unit:'g'},{foodId:food,quantity:25,unit:'g'}]});
 await command('exercise.add',{date:'2026-11-14',time:'13:00',group:'Lunch',name:'Fixture walk',duration:30,calories:150});
 await command('note.add',{date:'2026-11-14',text:'Fixture note',time:'12:00',group:'Lunch'});
 await get('/api/records/options?date=2026-11-14');await get('/api/target-policies?date=2026-11-14');await get('/api/repeats?date=2026-11-14');
 report.checks.push('cloud measured meal batch and exercise/note writes','record/repeat/advanced-target reads');
 const start=performance.now();const oracle=await post('/api/food-insights/oracle',{nutrient:'protein',basis:'100g',query:'',offset:0,limit:20});assert.equal(oracle.items.length,20);assert.ok(oracle.coverage.examined>=34885);report.catalogColdMs=Math.round(performance.now()-start);
 const warm=performance.now();await post('/api/food-insights/oracle',{nutrient:'fiber',basis:'100g',query:'',offset:0,limit:20});report.catalogWarmMs=Math.round(performance.now()-warm);
 const suggestions=await post('/api/food-insights/suggestions',{date:'2026-11-14',filters:{diets:[],categories:[],exclusions:[],includeCustom:false},limit:20});assert.ok(suggestions.items.length>0);const rows=suggestions.items[0].rows.map(({ref,quantity,unit,portionId})=>({ref,quantity,unit,...(unit==='portion'?{portionId}:{})}));await post('/api/food-insights/preview',{date:'2026-11-14',rows});report.checks.push('complete catalog nutrient ranking','source meal suggestions and measured preview');
 const exported=await post('/api/reports/export',{kind:'diary',from:'2026-11-14',to:'2026-11-14'});assert.match(exported.csv,/Cloud fixture oats/);report.checks.push('cloud CSV export');
 const health=JSON.parse(readFileSync('android/fixtures/example-export.json')),preview=await post('/api/health-connect/preview?summary=1',health);assert.ok(preview.counts.added>0);const imported=await post('/api/health-connect/import?summary=1',health,{'X-Nourish-Review-Token':preview.reviewToken});assert.deepEqual(imported.counts,preview.counts);const replay=await post('/api/health-connect/import?summary=1',health,{'X-Nourish-Review-Token':preview.reviewToken});assert.deepEqual(replay,imported);report.checks.push('Health Connect preview/import and duplicate retry');
 const page=await context.newPage();page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/diary');await chooseDiaryDate(page,'2026-11-14');await page.locator('#foods-tab').click();await page.getByRole('button',{name:'Suggest Food',exact:true}).click();await page.getByRole('button',{name:'Get Suggestions',exact:true}).waitFor();await page.screenshot({path:'.local/cloud-suggest-food.png'});await page.getByRole('button',{name:'Close',exact:true}).click();await page.locator('#discover-tab').click();await page.getByRole('button',{name:'Charts',exact:true}).click();await page.getByRole('heading',{name:'Charts',exact:true}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);report.checks.push('hosted mobile suggestions/charts navigation');
 await page.getByRole('button',{name:'Snapshots',exact:true}).click();await page.getByRole('button',{name:'Add photo',exact:true}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));report.checks.push('hosted snapshots navigation');
 if(process.env.NOURISH_TEST_PHOTO){
  await page.locator('#diary-tab').click();await page.getByRole('button',{name:'Add entry',exact:true}).click();await page.getByRole('button',{name:'Photo Log',exact:true}).click();
  const before=await get('/api/diary?date=2026-11-14'),started=performance.now();
  await page.locator('[data-photo-gallery]').setInputFiles(process.env.NOURISH_TEST_PHOTO);
  await page.locator('.photo-food-row').first().waitFor({timeout:90000});report.hostedPhotoMs=Math.round(performance.now()-started);
  assert.ok(await page.locator('.photo-food-row').count()>=3);await page.screenshot({path:'.local/cloud-photo-results.png'});
  await page.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:'Add entry',exact:true}).click();await page.getByRole('button',{name:'Photo Log',exact:true}).click();await page.getByRole('button',{name:'Choose photo',exact:true}).waitFor();assert.equal(await page.locator('.photo-food-row').count(),0);
  assert.equal((await get('/api/diary?date=2026-11-14')).revision,before.revision);report.checks.push('hosted real Gemini upload, source matching and close discards unsaved photo');
 }
 assert.deepEqual(errors,[]);
 assert.equal(await ownerDigest(),baseline);report.ownerWorkspaceUnchanged=true;report.status='passed';
}catch(error){primaryError=error;}finally{await browser?.close();const pending=[];for(const id of created)try{await clean(id);}catch{pending.push(id);}if(pending.length){writeFileSync('.local/expanded-cleanup-pending.json',JSON.stringify({created:pending}));primaryError??=Error('Fixture cleanup incomplete; retained IDs locally.');}}
if(primaryError)throw primaryError;report.fixtureRemoved=true;writeFileSync('.local/expanded-cloud-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
