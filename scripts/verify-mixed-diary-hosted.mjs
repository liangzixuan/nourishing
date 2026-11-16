// Deployed mixed Diary groups, using only a disposable private account.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import {ID,Query} from 'node-appwrite';
import {fixtureOperator} from './fixture-operator.mjs';
import {allRows,databaseId} from './operator.mjs';
const origin='https://nourishing.app',{users,db}=fixtureOperator(),id=ID.unique(),email=`mixed-${id}@example.com`,password=randomUUID()+'Aa1!';
const owner=JSON.parse(readFileSync('.local/migration-destination.json')).accountId,before=await db.getRow({databaseId,tableId:'workspace_heads',rowId:owner});
const report={at:new Date().toISOString(),checks:[],fixtureRemoved:false};let browser,page,created=false;
try{
 await users.create({userId:id,email,password,name:'Mixed diary hosted fixture'});created=true;
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});context.setDefaultTimeout(60000);
 const login=await context.request.post(origin+'/api/auth/login',{headers:{Origin:origin},data:{email,password}});assert.equal(login.status(),200);
 const get=async path=>{const response=await context.request.get(origin+path);assert.equal(response.status(),200,path);return response.json();};
 page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.addInitScript(()=>{window.cspErrors=[];document.addEventListener('securitypolicyviolation',event=>window.cspErrors.push(event.violatedDirective));});
 const day=new Date().toLocaleDateString('en-CA');let diary=await get('/api/diary?date='+day);
 const command=async(type,payload)=>{const response=await context.request.post(origin+'/api/workspace/command',{headers:{Origin:origin},data:{requestId:randomUUID(),revision:diary.revision,type,payload}});assert.equal(response.status(),200,type);const result=await response.json();diary=await get('/api/diary?date='+day);return result;};
 const food=(await command('food.save',{name:'Fixture lunch',serving:'100 g',grams:100,nutrients:{calories:100}})).item.id;
 await command('entry.add',{foodId:food,amount:1,date:day,group:'Lunch',time:'12:00'});
 await command('note.add',{date:day,group:'Lunch',time:'13:00',text:'Lunch note'});
 await command('note.add',{date:day,time:'07:00',text:'Ungrouped note'});
 await command('biometric.log',{selection:{kind:'catalog',id:'weight'},unit:'kg',values:{value:72},date:day,time:'09:00',group:'Lunch'});
 await page.goto(origin+'/diary');await page.locator('#page[aria-busy=false] .md-diary').waitFor();
 const lunch=page.locator('[data-md-group="Lunch"]'),uncategorized=page.locator('[data-md-group="Uncategorized"]');
 assert.deepEqual(await lunch.locator('[data-diary-record]').evaluateAll(rows=>rows.map(row=>row.dataset.collection)),['notes','biometrics','entries']);assert.equal(await uncategorized.locator('[data-diary-record][data-collection=notes]').count(),1);assert.equal(await page.locator('[data-diary-record]').count(),4);
 await page.screenshot({path:'.local/mixed-diary-hosted.png'});
 await lunch.locator('[data-collection=notes] [data-md-context]').click();await page.getByRole('button',{name:'Edit',exact:true}).click();await page.locator('#sheet textarea').waitFor();assert.equal(await page.locator('#sheet textarea').inputValue(),'Lunch note');await page.keyboard.press('Escape');
 await lunch.locator('[data-collection=biometrics] [data-md-context]').click();await page.getByRole('button',{name:'Edit',exact:true}).click();await page.locator('#sheet [name=value]').waitFor();assert.equal(await page.locator('#sheet [name=value]').inputValue(),'72');assert.equal(await page.locator('.mf-form').count(),0);await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Uncategorized actions',exact:true}).click();await page.getByRole('button',{name:'Select group',exact:true}).click();await page.getByText('1 selected',{exact:true}).waitFor();assert.equal(await uncategorized.locator('[data-tool-select]:checked').count(),1);await page.getByRole('button',{name:'Done',exact:true}).click();
 await lunch.locator('summary').click({position:{x:200,y:15}});assert.equal(await lunch.getAttribute('open'),null);await page.getByRole('button',{name:'Diary actions',exact:true}).click();await page.getByRole('button',{name:'Select entries',exact:true}).click();assert.equal(await lunch.getAttribute('open'),null);await page.getByRole('button',{name:'Done',exact:true}).click();
 const current=await get('/api/diary?date='+day);assert.equal(current.notes.find(row=>row.text==='Ungrouped note').group??null,null);assert.equal(current.summary.totals.calories,100);report.checks.push('notes and biometrics share meal groups with foods in source order','context menus open the correct editors','displayed Uncategorized selection includes an ungrouped note without changing its stored group','collapsed group survives selection redraw','nutrition totals unchanged');
 assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.cspErrors),[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const after=await db.getRow({databaseId,tableId:'workspace_heads',rowId:owner});assert.equal(after.digest,before.digest);assert.equal(after.$updatedAt,before.$updatedAt);report.checks.push('owner workspace unchanged; no browser/CSP errors or horizontal overflow');report.status='passed';
}catch(error){await page?.screenshot({path:'.local/mixed-diary-hosted-failure.png'}).catch(()=>{});console.error(await page?.locator('#sheet').innerText().catch(()=>''));throw error;}finally{
 await browser?.close();for(const tableId of ['command_receipts','workspace_records','workspace_media'])for(const row of await allRows(db,tableId,[Query.equal('ownerId',id)]))await db.deleteRow({databaseId,tableId,rowId:row.$id});for(const tableId of ['workspace_heads','profiles'])try{await db.deleteRow({databaseId,tableId,rowId:id});}catch(error){if(error.code!==404)throw error;}if(created)await users.delete({userId:id});
}
report.fixtureRemoved=true;writeFileSync('.local/mixed-diary-hosted-result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
