// Deployed Report nutrient and CGM detail flows, using only a disposable private account.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import {ID,Query} from 'node-appwrite';
import {fixtureOperator} from './fixture-operator.mjs';
import {allRows,databaseId} from './operator.mjs';
const origin='https://nourishing.app',{users,db}=fixtureOperator(),id=ID.unique(),email=`detail-${id}@example.com`,password=randomUUID()+'Aa1!';
const owner=JSON.parse(readFileSync('.local/migration-destination.json')).accountId,before=await db.getRow({databaseId,tableId:'workspace_heads',rowId:owner});
const report={at:new Date().toISOString(),checks:[],fixtureRemoved:false};let browser,page,created=false;
try{
 await users.create({userId:id,email,password,name:'Discover detail hosted fixture'});created=true;
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});context.setDefaultTimeout(60000);
 const login=await context.request.post(origin+'/api/auth/login',{headers:{Origin:origin},data:{email,password}});assert.equal(login.status(),200);
 const get=async path=>{const response=await context.request.get(origin+path);assert.equal(response.status(),200,path);return response.json();};
 page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.addInitScript(()=>{window.cspErrors=[];document.addEventListener('securitypolicyviolation',event=>window.cspErrors.push(event.violatedDirective));});
 const day=new Date().toLocaleDateString('en-CA');let diary=await get('/api/diary?date='+day);
 const command=async(type,payload)=>{const response=await context.request.post(origin+'/api/workspace/command',{headers:{Origin:origin},data:{requestId:randomUUID(),revision:diary.revision,type,payload}});assert.equal(response.status(),200,type);const result=await response.json();diary=await get('/api/diary?date='+day);return result;};
 const food=(await command('food.save',{name:'Fixture oats',serving:'100 g',grams:100,nutrients:{calories:100,protein:5,vitaminC:12}})).item.id;
 await command('entry.add',{foodId:food,amount:1,date:day,group:'Breakfast',time:'00:10'});
 await command('biometric.log',{date:day,time:'00:05',selection:{kind:'new-custom',name:'Fixture meter'},values:{value:90},unit:'mg/dL',group:null});
 await command('glucose.settings',{policy:{version:1,glucose:{type:'Fixture meter'},insulin:null,displayUnit:'mg/dL',range:null}});
 await command('chart.display',{id:'cgm',patch:{visible:true,hours:72,showCompare:true,compare:{kind:'nutrient',id:'protein'}}});
 await page.goto(origin+'/diary');await page.locator('.md-summary').waitFor();await page.getByRole('button',{name:'Discover',exact:true}).click();await page.locator('.dc-dashboard').waitFor();
 await page.getByRole('button',{name:'Report',exact:true}).click();await page.locator('.report-remaining .report-energy-ring svg').waitFor();assert.equal(await page.locator('.report-remaining h2').textContent(),'Remaining');
 const nutrient=page.locator('[data-report-nutrient=vitaminC]');await nutrient.evaluate(el=>el.closest('details').open=true);await nutrient.click();await page.locator('[data-mrnd-ready]').waitFor();assert.equal(await page.locator('[data-mrnd-average]').getAttribute('data-value'),'12');assert.equal(await page.locator('[data-mrnd-source]').count(),1);await page.screenshot({path:'.local/report-detail-hosted.png'});
 await page.locator('[data-mrnd-help]').click();await page.locator('[data-mrnd-help-content]').waitFor();await page.keyboard.press('Escape');await page.locator('[data-mrnd-ready]').waitFor();await page.getByRole('button',{name:'Close nutrient details',exact:true}).click();await page.locator('[data-mobile-report=nutrient]').waitFor({state:'detached'});
 report.checks.push('Remaining ring renders; nutrient daily average, sources, help and Back use the canonical report');
 await page.getByRole('button',{name:'Charts',exact:true}).click();await page.locator('[data-chart-open=cgm]').click();await page.locator('.cgm-detail [data-chart-plot=cgm-comparison]').waitFor();await page.waitForFunction(()=>Object.values(window.Chart?.instances??{}).filter(chart=>chart.canvas.closest('.cgm-detail')).length===2);
 const plots=await page.evaluate(()=>Object.values(window.Chart.instances).filter(chart=>chart.canvas.closest('.cgm-detail')).map(chart=>({id:chart.canvas.dataset.chartPlot,min:chart.options.scales.x.min,max:chart.options.scales.x.max,points:chart.data.datasets.flatMap(row=>row.data)})));assert.equal(plots.length,2);assert.equal(plots[0].min,plots[1].min);assert.equal(plots[0].max,plots[1].max);assert.ok(plots.find(row=>row.id==='cgm-comparison').points.some(point=>point.y===5));await page.screenshot({path:'.local/cgm-detail-hosted.png'});
 await page.locator('[data-cgm-hours="48"]').click();await page.waitForFunction(()=>document.querySelector('.cgm-detail')?.dataset.cgmBusy==='false');assert.equal((await get('/api/charts?to='+day+'&card=cgm')).cards[0].settings.hours,48);
 await page.locator('[data-cgm-settings]').click();await page.locator('[data-cgm-target]').click();await page.locator('[data-mcl-range-mode][value=diabetic]').click();await page.waitForFunction(()=>document.querySelector('.cgm-detail')?.dataset.cgmBusy==='false');assert.equal((await get('/api/charts?to='+day+'&card=cgm')).cards[0].settings.targetRange.mode,'diabetic');
 await page.keyboard.press('Escape');assert.equal(await page.locator('.cgm-detail').getAttribute('data-cgm-screen'),'settings');await page.keyboard.press('Escape');assert.equal(await page.locator('.cgm-detail').getAttribute('data-cgm-screen'),'detail');await page.locator('[data-cgm-help]').click();await page.getByRole('dialog').last().waitFor();await page.keyboard.press('Escape');await page.keyboard.press('Escape');await page.locator('.cgm-detail').waitFor({state:'detached'});assert.ok(await page.evaluate(()=>Object.values(window.Chart.instances).every(chart=>chart.canvas.isConnected)));
 report.checks.push('CGM comparison has real protein points and shares glucose bounds','hour and target settings persist; nested Back/help return correctly; chart instances dispose');
 assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.cspErrors),[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const after=await db.getRow({databaseId,tableId:'workspace_heads',rowId:owner});assert.equal(after.digest,before.digest);assert.equal(after.$updatedAt,before.$updatedAt);report.checks.push('owner workspace unchanged; no browser/CSP errors or horizontal overflow');report.status='passed';
}catch(error){await page?.screenshot({path:'.local/discover-details-hosted-failure.png'}).catch(()=>{});console.error(await page?.locator('#sheet').innerText().catch(()=>''));throw error;}finally{
 await browser?.close();for(const tableId of ['command_receipts','workspace_records','workspace_media'])for(const row of await allRows(db,tableId,[Query.equal('ownerId',id)]))await db.deleteRow({databaseId,tableId,rowId:row.$id});for(const tableId of ['workspace_heads','profiles'])try{await db.deleteRow({databaseId,tableId,rowId:id});}catch(error){if(error.code!==404)throw error;}if(created)await users.delete({userId:id});
}
report.fixtureRemoved=true;writeFileSync('.local/discover-details-hosted-result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
