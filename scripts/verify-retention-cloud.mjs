import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {ID,Functions,Query} from 'node-appwrite';
import {fixtureOperator} from './fixture-operator.mjs';
import {allRows} from './operator.mjs';

const {db,users,client}=fixtureOperator(),functions=new Functions(client),databaseId='nourishing',userId=ID.unique(),rowIds=[];
const args=(tableId,rowId)=>({databaseId,tableId,rowId}),owner=JSON.parse(readFileSync('.local/migration-destination.json','utf8')).accountId;
const before=await db.getRow(args('workspace_heads',owner));let created=false,primaryError,execution;
try {
 const metadata=await functions.get({functionId:'nourishing-account-cleanup'});
 assert.equal(metadata.deploymentId,process.env.NOURISHING_EXPECTED_CLEANUP_DEPLOYMENT);assert.deepEqual(metadata.execute,[]);assert.equal(metadata.interval,60);
 assert.equal((await allRows(db,'account_deletions',[Query.equal('state','pending')])).length,0,'Pending deletion exists; do not invoke a global fixture check.');
 await users.create({userId,email:`retention-${userId}@example.com`,name:'Receipt retention verification fixture'});created=true;
 for(const [age,outcome] of [[91,'unknown'],[0,'unknown'],[0,'sending']]){
  const rowId=ID.unique();await db.createRow({...args('push_deliveries',rowId),data:{ownerId:userId,fingerprint:'f'.repeat(64),outcome,statusCode:0,createdAt:new Date(Date.now()-age*86400000).toISOString(),completedAt:''},permissions:[]});rowIds.push(rowId);
 }
 writeFileSync('.local/retention-live-fixture.json',JSON.stringify({userId,rowIds}));
 execution=await functions.createExecution({functionId:'nourishing-account-cleanup',body:'',async:false});
 assert.equal(execution.responseStatusCode,200);const body=JSON.parse(execution.responseBody);assert.equal(body.failed,0);assert.ok(body.reminderReceiptsPruned>=1);
 await assert.rejects(db.getRow(args('push_deliveries',rowIds[0])),{code:404});
 for(let i=1;i<rowIds.length;i++){const row=await db.getRow(args('push_deliveries',rowIds[i]));assert.equal(row.ownerId,userId);assert.equal(row.outcome,i===1?'unknown':'sending');assert.deepEqual(row.$permissions,[]);}
 assert.equal((await db.getRow(args('workspace_heads',owner))).digest,before.digest);
}catch(error){primaryError=error;}finally{
 if(created){for(const row of await allRows(db,'push_deliveries',[Query.equal('ownerId',userId)]))await db.deleteRow(args('push_deliveries',row.$id));await users.delete({userId});}
}
if(primaryError)throw primaryError;
const report={at:new Date().toISOString(),ok:true,executionId:execution.$id,expiredRemoved:true,recentUncertainReceiptsPreserved:true,privatePermissions:true,fixtureRemoved:true,ownerWorkspaceUnchanged:true};
writeFileSync('.local/retention-cloud-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
