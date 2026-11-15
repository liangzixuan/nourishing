import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import {ID,Query} from 'node-appwrite';
import {operator,allRows,databaseId} from './operator.mjs';
import {targetsBrowserFlow} from './targets-browser-flow.mjs';
const origin='https://nourishing-cloud.appwrite.network',{users,db}=operator(),created=[],report={at:new Date().toISOString()};let browser,primaryError;
async function clean(id){for(const tableId of ['command_receipts','workspace_records','workspace_media'])for(const row of await allRows(db,tableId,[Query.equal('ownerId',id)]))await db.deleteRow({databaseId,tableId,rowId:row.$id});for(const tableId of ['workspace_heads','profiles'])try{await db.deleteRow({databaseId,tableId,rowId:id});}catch(error){if(error.code!==404)throw error;}await users.delete({userId:id});}
try{
 const owner=JSON.parse(readFileSync('.local/migration-destination.json')).accountId,baseline=JSON.parse(readFileSync('.local/workspace-import.json')).workspaceDigest;
 const ownerDigest=async()=>(await db.getRow({databaseId,tableId:'workspace_heads',rowId:owner})).digest;assert.equal(await ownerDigest(),baseline);
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 async function account(){const id=ID.unique(),email=`targets-${id}@example.com`,password=randomUUID()+'Aa1!';await users.create({userId:id,email,password,name:'Targets fixture'});created.push(id);writeFileSync('.local/targets-fixture.json',JSON.stringify({created}));const context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});const login=await context.request.post(origin+'/api/auth/login',{headers:{Origin:origin},data:{email,password}});assert.equal(login.status(),200);return context;}
 const context=await account();let revision=(await (await context.request.get(origin+'/api/targets?date=2026-11-14')).json()).revision;
 const command=async(type,payload)=>{const response=await context.request.post(origin+'/api/workspace/command',{headers:{Origin:origin},data:{requestId:randomUUID(),revision,type,payload}});assert.equal(response.status(),200);const result=await response.json();revision=result.revision;return result;};
 const food=await command('food.save',{name:'Fixture food',serving:'100 g',grams:100,nutrients:{calories:200,protein:10}});await command('entry.add',{date:'2026-11-14',foodId:food.item.id,quantity:100,unit:'g',group:'Lunch'});
 const page=await context.newPage();report.checks=await targetsBrowserFlow(page,origin);
 const own=await (await context.request.get(origin+'/api/targets?date=2026-11-14')).json();assert.equal(own.nutrients.find(r=>r.id==='protein').dailyTarget,125);
 const other=await account(),otherTargets=await (await other.request.get(origin+'/api/targets?date=2026-11-14')).json();assert.equal(otherTargets.nutrients.find(r=>r.id==='protein').dailyTarget,100);
 const denied=await other.request.get(origin+'/api/targets?date=2026-11-14&ownerId='+created[0]);assert.equal(denied.status(),400);
 const reportResponse=await other.request.get(origin+'/api/nutrition-report?from=2026-11-14&to=2026-11-14&dayFilter=all&includeToday=true&includeSupplements=true');assert.equal(reportResponse.status(),200);assert.equal((await reportResponse.json()).report.nutrients.find(r=>r.id==='calories').mean,null);assert.equal(reportResponse.headers()['cache-control'],'no-store');
 const stale=await other.request.post(origin+'/api/workspace/command',{headers:{Origin:origin},data:{requestId:randomUUID(),revision:own.revision,type:'nutrientTarget.patch',payload:{date:'2026-11-14',id:'protein',changes:{dailyTarget:999}}}});assert.equal(stale.status(),409);
 const final=await (await context.request.get(origin+'/api/targets?date=2026-11-14')).json();assert.equal(final.revision,own.revision);
 assert.equal(await ownerDigest(),baseline);report.ownerWorkspaceUnchanged=true;report.checks.push('second account has independent targets and empty report','cross-account query and stale revision denied');report.status='passed';
}catch(error){primaryError=error;}finally{await browser?.close();const pending=[];for(const id of created)try{await clean(id);}catch{pending.push(id);}if(pending.length){writeFileSync('.local/targets-cleanup-pending.json',JSON.stringify({created:pending}));primaryError??=Error('Fixture cleanup incomplete; IDs retained locally.');}}
if(primaryError)throw primaryError;report.fixtureRemoved=true;writeFileSync('.local/targets-browser-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
