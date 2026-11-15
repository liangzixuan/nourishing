// Disposable private delayed execution. Its subscription is expired before it is stored.
// No real browser subscription is read or used, and no project-wide repair is invoked.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createECDH,randomBytes,randomUUID} from 'node:crypto';
import {ID,Functions,Query} from 'node-appwrite';
import {fixtureOperator} from './fixture-operator.mjs';
import {allRows,delay} from './operator.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {createAccountLifecycle} from '../server/account-lifecycle.mjs';
import {parseReminderSchedule} from '../server/reminder-schedules.mjs';
import {parsePushSubscription} from '../server/web-push.mjs';
import {createReminderScheduleStore} from '../server/reminder-schedules-store.mjs';
import {createReminderDispatcher} from '../server/reminder-schedules-dispatch.mjs';
import {rowId} from '../server/data-codec.mjs';

const expected=process.env.NOURISHING_EXPECTED_REMINDERS_DEPLOYMENT,origin=process.env.NOURISHING_REMINDERS_ORIGIN;
assert.ok(expected,'Set NOURISHING_EXPECTED_REMINDERS_DEPLOYMENT to the deployed revision.');
assert.ok(origin&&new URL(origin).protocol==='https:'&&new URL(origin).origin===origin,'Set NOURISHING_REMINDERS_ORIGIN to the exact deployed PUBLIC_ORIGIN.');
const {db,users,client}=fixtureOperator(),functions=new Functions(client),functionId='nourishing-reminders',owner=ID.unique(),lifecycle=createAccountLifecycle({db});
const args=(tableId,id=owner)=>({databaseId:'nourishing',tableId,rowId:id}),optional=async work=>{try{return await work();}catch(error){if(error.code===404)return null;throw error;}};
const reportPath=new URL('../.local/reminders-cloud-verification.json',import.meta.url),ledgerPath=new URL('../.local/reminders-cloud-fixture.json',import.meta.url);
const report={at:new Date().toISOString(),checks:[],projectWideReminderRun:false,realBrowserSubscriptionsUsed:false},failures=[];
let created=false,passed=false;const saveLedger=removed=>writeFileSync(ledgerPath,JSON.stringify({owner,created,removed,cleanupFailures:failures},null,2));saveLedger(false);
try{
 const fn=await functions.get({functionId});assert.equal(fn.enabled,true);assert.equal(fn.interval,0);assert.deepEqual(fn.execute,[]);assert.deepEqual(fn.events,[]);assert.equal(fn.deploymentId,expected);
 const variables=await functions.listVariables({functionId});
 assert.equal(variables.variables.find(row=>row.key==='PUBLIC_ORIGIN')?.value,origin,'Fixture origin must match the real worker.');
 assert.equal(variables.variables.find(row=>row.key==='REMINDERS_ENABLED')?.value,'true','Enable the private worker for this fixture only.');
 try{await users.create({userId:owner,email:`reminders-e2e-${owner}@example.com`,password:randomUUID()+'Aa1!',name:'Reminder delayed execution verification fixture'});created=true;}
 catch(error){if(error.fixtureOwner===owner)created=true;throw error;}saveLedger(false);
 await createWorkspaceStore(db,owner).create();
 const now=new Date(),due=new Date(Math.ceil((+now+120000)/60000)*60000),stamp=due.toISOString(),curve=createECDH('prime256v1');curve.generateKeys();
 const subscription=parsePushSubscription({endpoint:'https://fcm.googleapis.com/fcm/send/nourishing-expired-fixture-'+owner,expirationTime:+now-60000,keys:{p256dh:curve.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}});
 assert.ok(subscription.expirationTime<+now);
 const schedule=parseReminderSchedule({creationId:randomUUID(),label:'Disposable expired notification',kind:'daily',time:stamp.slice(11,16),days:[due.getUTCDay()],timeZone:'UTC',enabled:true},{now});
 const payload={devices:[{id:rowId(owner,origin,subscription.endpoint),subscription,label:'Expired synthetic browser',origin,createdAt:now.toISOString(),lastTestAt:''}],schedules:[schedule],paused:false,resumedAt:now.toISOString()};
 await db.createRow({...args('push_accounts'),data:{ownerId:owner,version:0,payload:JSON.stringify(payload)},permissions:[]});
 // Reconcile requires no VAPID credentials and cannot send. The real worker uses its own config.
 await createReminderScheduleStore({db,ownerId:owner,origin}).reconcile();
 const dispatcher=createReminderDispatcher({db,functions,functionId});assert.equal((await dispatcher.dispatch(owner)).queued,true);
 const armed=await db.getRow(args('reminder_dispatch'));assert.equal(armed.dueAt,stamp);assert.deepEqual(armed.$permissions,[]);
 let execution=await functions.getExecution({functionId,executionId:armed.executionId});assert.equal(execution.status,'scheduled');assert.equal(execution.deploymentId,expected);assert.equal(Date.parse(execution.scheduledAt),+due+60000);
 Object.assign(report,{executionId:execution.$id,deploymentId:expected,dueAt:stamp,scheduledAt:execution.scheduledAt});console.log(JSON.stringify({phase:'queued',executionId:execution.$id,scheduledAt:execution.scheduledAt}));
 const deadline=Date.now()+6*60000;
 while(['scheduled','waiting','processing'].includes(execution.status)&&Date.now()<deadline){await delay(5000);execution=await functions.getExecution({functionId,executionId:armed.executionId});}
 assert.equal(execution.status,'completed','Delayed reminder execution did not complete.');assert.equal(execution.responseStatusCode,200);assert.equal(execution.errors,'');
 // Scheduled async executions do not retain responseBody. Inspect durable effects instead.
 const receipts=await allRows(db,'push_deliveries',[Query.equal('ownerId',owner)]);assert.equal(receipts.length,1);assert.equal(receipts[0].outcome,'expired');assert.equal(receipts[0].statusCode,0);assert.deepEqual(receipts[0].$permissions,[]);
 assert.equal(JSON.parse((await db.getRow(args('push_accounts'))).payload).devices.length,0);await assert.rejects(()=>db.getRow(args('reminder_dispatch')),{code:404});
 Object.assign(report,{executionCreatedAt:execution.$createdAt,executionUpdatedAt:execution.$updatedAt,duration:execution.duration,outcome:'expired',providerStatusCode:0});report.checks.push('actual delayed worker records expired without provider transport, removes the synthetic browser and clears its intent');
 const replay=await functions.createExecution({functionId,async:false,xpath:'/reminders/'+armed.token,body:JSON.stringify({owner,generation:armed.generation,token:armed.token})});assert.equal(replay.responseStatusCode,200);assert.equal(JSON.parse(replay.responseBody).stale,true);assert.equal((await allRows(db,'push_deliveries',[Query.equal('ownerId',owner)])).length,1);report.checks.push('duplicate callback is stale and does not reserve another delivery');passed=true;
}finally{
 const clean=async(resource,work)=>{try{await work();return true;}catch(error){if(error.code===404)return true;failures.push({resource,code:error.code??'unknown'});return false;}};
 if(created){
  const idle=await clean('fixture_lifecycle',async()=>{await lifecycle.claim(owner,owner);const deadline=Date.now()+60000;let pending=await lifecycle.pending(owner);while((pending.active||pending.more)&&Date.now()<deadline){await delay(2000);pending=await lifecycle.pending(owner);}assert.equal(pending.active,0,'Retain fixture until worker operation ends.');assert.equal(pending.more,false);});
  if(idle){
   for(const tableId of ['reminder_dispatch','push_accounts','fasting_dispatch','workspace_heads','profiles'])await clean(tableId,async()=>{const row=await optional(()=>db.getRow(args(tableId)));if(row){assert.equal(row.ownerId,owner);await db.deleteRow(args(tableId));}});
   for(const tableId of ['push_deliveries','workspace_records','command_receipts']){let rows=[];await clean(tableId+':list',async()=>{rows=await allRows(db,tableId,[Query.equal('ownerId',owner)]);});for(const row of rows)await clean(tableId+':'+row.$id,async()=>{assert.equal(row.ownerId,owner);await db.deleteRow(args(tableId,row.$id));});}
   if(failures.length===0)await clean('fixture_user',()=>users.delete({userId:owner}));
  }
 }
 report.fixtureRemoved=failures.length===0;report.status=passed&&report.fixtureRemoved?'passed':'verification-incomplete';saveLedger(report.fixtureRemoved);writeFileSync(reportPath,JSON.stringify({...report,cleanupFailures:failures},null,2));if(failures.length)throw Error('Reminder fixture cleanup is incomplete. See .local/reminders-cloud-fixture.json.');
}
console.log(JSON.stringify(report));
