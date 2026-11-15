// Actual private Function wakeup against a disposable account; never bootstraps real owners.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {ID,Functions,Query} from 'node-appwrite';
import {fixtureOperator} from './fixture-operator.mjs';
import {allRows} from './operator.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {createDataRepository} from '../server/data-repository.mjs';
import {createFastingDispatcher} from '../server/scheduler-dispatch.mjs';
import {digest} from '../server/data-codec.mjs';
const {db,users,client}=fixtureOperator(),functions=new Functions(client),functionId='nourishing-scheduler',owner=ID.unique(),store=createWorkspaceStore(db,owner),repository=createDataRepository(db,owner);
const args=(tableId,rowId)=>({databaseId:'nourishing',tableId,rowId});
const reportPath=new URL('../.local/scheduler-e2e-verification.json',import.meta.url),ledgerPath=new URL('../.local/scheduler-e2e-fixture.json',import.meta.url);
const report={at:new Date().toISOString(),checks:[],projectWideSchedulerRun:false};let created=false,passed=false;
const failures=[],saveLedger=removed=>writeFileSync(ledgerPath,JSON.stringify({owner,created,removed,cleanupFailures:failures}));
saveLedger(false);
try{
 assert.equal((await db.listRows({databaseId:'nourishing',tableId:'fasting_dispatch',queries:[Query.limit(1)]})).total,0,'No existing account may be armed during fixture activation');
 const fn=await functions.get({functionId});assert.equal(fn.enabled,true);assert.equal(fn.interval,0);assert.deepEqual(fn.execute,[]);assert.equal(fn.deploymentId,process.env.NOURISHING_EXPECTED_SCHEDULER_DEPLOYMENT);
 await users.create({userId:owner,email:`scheduler-e2e-${owner}@example.com`,password:randomUUID()+'Aa1!',name:'Scheduler one-shot verification fixture'});created=true;saveLedger(false);await store.create();
 const now=new Date(),due=new Date(Math.ceil((+now+120000)/60000)*60000),stamp=due.toISOString();
 await store.command({requestId:randomUUID(),revision:digest(await repository.readState()),type:'fasting.schedule.save',payload:{id:randomUUID(),revision:0,label:'Fixture one-shot',startDate:stamp.slice(0,10),time:stamp.slice(11,16),recurrence:'once',interval:1,days:[],untilDate:null,goalHours:16,enabled:true}},async()=>null,{asOf:now.toISOString(),timeZone:'UTC'});
 const dispatcher=createFastingDispatcher({db,functions,functionId});assert.equal((await dispatcher.dispatch(owner)).queued,true);
 const armed=await db.getRow(args('fasting_dispatch',owner));assert.deepEqual(armed.$permissions,[]);assert.equal(armed.dueAt,stamp);
 let execution=await functions.getExecution({functionId,executionId:armed.executionId});assert.equal(execution.status,'scheduled');assert.equal(Date.parse(execution.scheduledAt),+due+60000);assert.equal(execution.deploymentId,fn.deploymentId);
 report.executionId=execution.$id;report.deploymentId=execution.deploymentId;report.dueAt=stamp;report.scheduledAt=execution.scheduledAt;console.log(JSON.stringify({phase:'queued',executionId:execution.$id,scheduledAt:execution.scheduledAt}));
 const deadline=Date.now()+6*60000;
 while(['scheduled','waiting','processing'].includes(execution.status)&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,5000));execution=await functions.getExecution({functionId,executionId:armed.executionId});}
 assert.equal(execution.status,'completed',execution.errors||'Scheduled execution did not complete');assert.equal(execution.responseStatusCode,200);assert.equal(execution.errors,'');
 report.executionStartedAt=execution.$createdAt;report.executionUpdatedAt=execution.$updatedAt;report.duration=execution.duration;
 const state=await repository.readState();assert.equal(state.fasts.length,1);assert.equal(Date.parse(state.fasts[0].start),+due);assert.equal(state.fastingPlan.schedules[0].lastOccurrence.outcome,'started');assert.equal(state.fastingPlan.schedules[0].lastOccurrence.fastId,state.fasts[0].id);
 await assert.rejects(()=>db.getRow(args('fasting_dispatch',owner)),{code:404});report.checks.push('actual one-shot worker starts one canonical scheduled fast and removes final intent');
 const replay=await functions.createExecution({functionId,async:false,xpath:'/fasting/'+armed.token,body:JSON.stringify({owner,generation:armed.generation,token:armed.token})});assert.equal(replay.responseStatusCode,200);assert.equal(JSON.parse(replay.responseBody).stale,true);assert.equal((await repository.readState()).fasts.length,1);report.checks.push('duplicate callback is stale and cannot create another fast');passed=true;
}finally{
 const clean=async(resource,work)=>{try{await work();}catch(error){if(error.code!==404)failures.push({resource,code:error.code??'unknown'});}};
 if(created){for(const tableId of ['command_receipts','workspace_records']){let rows=[];await clean(tableId+':list',async()=>{rows=await allRows(db,tableId,[Query.equal('ownerId',owner)]);});for(const row of rows){assert.equal(row.ownerId,owner);await clean(tableId+':'+row.$id,()=>db.deleteRow(args(tableId,row.$id)));}}
  for(const tableId of ['fasting_dispatch','workspace_heads','profiles'])await clean(tableId,()=>db.deleteRow(args(tableId,owner)));await clean('fixture_user',()=>users.delete({userId:owner}));
 }
 report.fixtureRemoved=failures.length===0;report.status=passed&&report.fixtureRemoved?'passed':'verification-incomplete';saveLedger(report.fixtureRemoved);writeFileSync(reportPath,JSON.stringify({...report,cleanupFailures:failures},null,2));if(failures.length)throw Error('Scheduler fixture cleanup is incomplete.');
}
console.log(JSON.stringify(report));
