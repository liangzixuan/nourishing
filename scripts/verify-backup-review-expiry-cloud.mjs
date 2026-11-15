// Explicit disposable fixture. Invokes the normal private cleanup worker only with no pending deletion jobs.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {ID,Query} from 'node-appwrite';
import {operator,allRows,databaseId} from './operator.mjs';
import {fixtureOperator} from './fixture-operator.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';

const raw=operator(),fixture=fixtureOperator(),{db}=raw,owner=ID.unique(),run=promisify(execFile);
const args=(tableId,rowId)=>({databaseId,tableId,rowId}),optional=async work=>{try{return await work();}catch(error){if(error.code===404)return null;throw error;}};
const identity=head=>Object.fromEntries(['generation','digest','$updatedAt'].map(key=>[key,head[key]]));
const ledger={owner,created:false,reviewIds:[ID.unique(),ID.unique()],executionId:null,executionUnresolved:false};
const report={passed:0,expiredRemoved:0,freshPreserved:0,fixtureWorkspaceUnchanged:0,realOwnerUnchanged:0,cleanupFailures:0};
const remember=()=>writeFileSync('.local/backup-review-expiry-fixture.json',JSON.stringify(ledger,null,2));remember();
let realOwner,realBefore;
try{
 realOwner=JSON.parse(readFileSync('.local/migration-destination.json','utf8').replace(/^\uFEFF/,'')).accountId;assert.notEqual(realOwner,owner);realBefore=identity(await db.getRow(args('workspace_heads',realOwner)));
 assert.equal((await allRows(db,'account_deletions',[Query.equal('state','pending')])).length,0,'Pending deletions require separate handling.');
 let user;try{user=await fixture.users.create({userId:owner,email:`review-expiry-${owner}@example.com`,password:randomUUID()+'Aa1!',name:'Private review expiry fixture'});}catch(error){if(error.fixtureOwner===owner){ledger.created=true;ledger.createdAt=JSON.parse(readFileSync('.local/fixture-accounts/'+owner+'.json','utf8')).createdAt;remember();}throw error;}ledger.created=true;ledger.createdAt=user.$createdAt;remember();
 await createWorkspaceStore(db,owner).create();const head=await db.getRow(args('workspace_heads',owner)),before=identity(head),records=await allRows(db,'workspace_records',[Query.equal('ownerId',owner)]);
 for(const [index,id] of ledger.reviewIds.entries())await db.createRow({...args('backup_reviews',id),data:{ownerId:owner,generation:head.generation,review:'{}',manifest:'{}',expiresAt:new Date(Date.now()+(index?30*60*1000:-60000)).toISOString()},permissions:[]});
 const cli=process.env.APPWRITE_CLI_ENTRY??join(process.env.APPDATA,'npm','node_modules','appwrite-cli','run.js');
 ledger.executionUnresolved=true;remember();
 const {stdout}=await run(process.execPath,[cli,'functions','create-execution','--function-id','nourishing-account-cleanup','--async=false','--raw'],{timeout:120000,maxBuffer:1024*1024,windowsHide:true});
 const execution=JSON.parse(stdout.trim());assert.equal(execution.resourceId,'nourishing-account-cleanup');assert.equal(execution.status,'completed');ledger.executionId=execution.$id;ledger.executionUnresolved=false;remember();assert.equal(execution.responseStatusCode,200);
 const body=JSON.parse(execution.responseBody);assert.equal(body.failed,0);assert.equal(body.enabled,true);assert.ok(body.reviewsPruned>=1);report.workerReviewsPruned=body.reviewsPruned;
 assert.equal(await optional(()=>db.getRow(args('backup_reviews',ledger.reviewIds[0]))),null);report.expiredRemoved=1;
 const fresh=await db.getRow(args('backup_reviews',ledger.reviewIds[1]));assert.equal(fresh.ownerId,owner);assert.deepEqual(fresh.$permissions,[]);report.freshPreserved=1;
 assert.deepEqual(identity(await db.getRow(args('workspace_heads',owner))),before);assert.deepEqual(await allRows(db,'workspace_records',[Query.equal('ownerId',owner)]),records);report.fixtureWorkspaceUnchanged=1;
 assert.deepEqual(identity(await db.getRow(args('workspace_heads',realOwner))),realBefore);report.realOwnerUnchanged=1;report.passed=1;
}catch(error){report.failureCode=Number.isInteger(error.code)?error.code:0;report.assertionFailed=error.name==='AssertionError'?1:0;process.exitCode=1;}
finally{
 if(ledger.created&&!ledger.executionUnresolved){
  try{
   const user=await raw.users.get({userId:owner});assert.equal(user.$createdAt,ledger.createdAt);assert.equal(user.email,`review-expiry-${owner}@example.com`);
   for(const tableId of ['backup_reviews','workspace_records'])for(const row of await allRows(db,tableId,[Query.equal('ownerId',owner)])){assert.equal(row.ownerId,owner);await db.deleteRow(args(tableId,row.$id));}
   for(const tableId of ['workspace_heads','fasting_dispatch','reminder_dispatch']){const row=await optional(()=>db.getRow(args(tableId,owner)));if(row){assert.equal(row.ownerId,owner);await db.deleteRow(args(tableId,owner));}}
   await fixture.users.delete({userId:owner});
  }catch{report.cleanupFailures++;}
 }else if(ledger.executionUnresolved)report.cleanupFailures++;
 if(realBefore)try{assert.deepEqual(identity(await db.getRow(args('workspace_heads',realOwner))),realBefore);}catch{report.cleanupFailures++;}
 if(report.cleanupFailures){report.passed=0;process.exitCode=1;}remember();writeFileSync('.local/backup-review-expiry-cloud-verification.json',JSON.stringify(report,null,2));
}
console.log(JSON.stringify(report));
