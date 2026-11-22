import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountLifecycle} from '../server/account-lifecycle.mjs';
import {accountFixture} from './fixtures/account-fixture.mjs';

test('initialization recovers an ambiguous create only from the exact active lifecycle row',async()=>{
 const f=accountFixture(),create=f.db.createRow;f.db.createRow=async input=>{await create(input);throw {code:503};};const life=createAccountLifecycle({db:f.db});await life.initialize('owner');assert.equal(f.table('account_lifecycle').get('owner').state,'active');
 f.db.createRow=async()=>{throw {code:503};};await assert.rejects(life.initialize('missing'),{code:503});f.put('account_lifecycle','foreign',{ownerId:'another',state:'active',jobId:'',version:0});await assert.rejects(life.initialize('foreign'),{code:409});
 f.put('account_lifecycle','deleting',{ownerId:'deleting',state:'deleting',jobId:'job',version:1});await assert.rejects(life.initialize('deleting'),{code:409});
});
test('missing lifecycle fails closed; deletion prevents new operations while existing work drains',async()=>{
 const f=accountFixture(),life=createAccountLifecycle({db:f.db});await assert.rejects(life.enter('owner','read'),{code:409});await life.initialize('owner');
 const op=await life.enter('owner','upload');await life.claim('owner','job');await assert.rejects(life.enter('owner','late'),{code:409});assert.equal((await life.pending('owner')).active,1);await life.settle(op);assert.equal((await life.pending('owner')).active,0);
 await assert.rejects(life.initialize('owner'),{code:409});await assert.rejects(life.claim('owner','different'),{code:409});await life.claim('owner','job');
});
test('read errors settle, uncertain mutation errors retain ownership, recovered success settles',async()=>{
 const f=accountFixture(),life=createAccountLifecycle({db:f.db});await life.initialize('owner');
 await assert.rejects(life.run('owner','read',async()=>{throw Error('Read network failure');}));assert.equal((await life.pending('owner')).active,0);
 await assert.rejects(life.run('owner','write',async op=>{op.markUncertain();throw Error('Unknown upload');}));assert.equal((await life.pending('owner')).uncertain,1);
 assert.equal(await life.run('owner','retry',async op=>{op.markUncertain();return 'receipt found';}),'receipt found');assert.equal((await life.pending('owner')).active,1);
});
test('concurrent begin/enter conflict cannot create an unregistered late operation',async()=>{
 const f=accountFixture(),life=createAccountLifecycle({db:f.db});await life.initialize('owner');f.beforeCommit=async()=>{f.beforeCommit=null;await life.claim('owner','job');};
 await assert.rejects(life.enter('owner','race'),{code:409});assert.equal((await life.pending('owner')).active,0);
});
test('parallel operations retry definite conflicts and lost enter replies recover their exact row',async()=>{
 const f=accountFixture(),life=createAccountLifecycle({db:f.db});await life.initialize('owner');
 const operations=await Promise.all([1,2,3,4].map(index=>life.enter('owner','read'+index)));assert.equal(new Set(operations.map(op=>op.id)).size,4);assert.equal((await life.pending('owner')).active,4);
 f.lostCommit=true;const recovered=await life.enter('owner','lost-enter');assert.ok(f.table('account_operations').has(recovered.id));assert.equal(f.table('account_operations').size,5);await life.settle(recovered);
 for(const operation of operations)await life.settle(operation);assert.equal((await life.pending('owner')).active,0);
});
test('a foreground read can register while other requests repeatedly advance an active account',async()=>{
 const f=accountFixture(),life=createAccountLifecycle({db:f.db});await life.initialize('owner');
 const update=f.db.updateRow;let competingReads=0;
 f.db.updateRow=async input=>{
  const result=await update(input);
  if(input.tableId==='account_lifecycle'&&input.transactionId&&competingReads<5){
   competingReads++;
   await update({...input,transactionId:undefined});
  }
  return result;
 };
 const op=await life.enter('owner','exerciseCatalog');
 assert.equal(competingReads,5);assert.equal((await life.pending('owner')).active,1);
 await life.settle(op);assert.equal((await life.pending('owner')).active,0);
});
test('persistent contention reports a busy active account after rollback',async t=>{
 const f=accountFixture(),life=createAccountLifecycle({db:f.db});await life.initialize('owner');
 const update=f.db.updateRow;let elapsed=0;
 t.mock.method(performance,'now',()=>elapsed);
 f.db.updateRow=async input=>{
  const result=await update(input);
  if(input.transactionId){
   await update({...input,transactionId:undefined});
   elapsed+=10000;
  }
  return result;
 };
 await assert.rejects(life.enter('owner','diary'),{code:503,publicMessage:'The account is busy. Please try again.'});
 assert.equal(f.table('account_lifecycle').get('owner').state,'active');
 assert.equal((await life.pending('owner')).active,0);
});
test('failed operation-row removal is recoverable only after its settled marker is durable',async()=>{
 const f=accountFixture(),life=createAccountLifecycle({db:f.db});await life.initialize('owner');const op=await life.enter('owner','finished');f.failDeleteRow=true;await life.settle(op);assert.equal(f.table('account_operations').get(op.id).state,'settled');assert.equal((await life.pending('owner')).active,0);assert.equal(f.table('account_operations').size,0);
});

test('an interrupted settlement can finish without replaying the account operation', async () => {
 const f=accountFixture(), life=createAccountLifecycle({db:f.db});
 await life.initialize('owner');
 const get=f.db.getRow, update=f.db.updateRow;
 let workCalls=0, ownershipReadFailed=false, writeReplyLost=false, markerWrites=0;
 f.db.getRow=async input=>{
  if(workCalls && input.tableId==='account_operations' && !ownershipReadFailed){
   ownershipReadFailed=true;
   throw new TypeError('fetch failed');
  }
  return get(input);
 };
 f.db.updateRow=async input=>{
  const row=await update(input);
  if(input.tableId==='account_operations' && input.data.state==='settled'){
   markerWrites++;
   if(!writeReplyLost){writeReplyLost=true;throw Object.assign(Error('Lost marker reply'),{code:503});}
  }
  return row;
 };
 const result=await life.run('owner','offlineSnapshot',async()=>{workCalls++;return 'snapshot';});
 assert.equal(result,'snapshot');
 assert.equal(workCalls,1);
 assert.equal(ownershipReadFailed,true);
 assert.equal(writeReplyLost,true);
 assert.equal(markerWrites,1);
 await life.claim('owner','job');
 assert.deepEqual(await life.pending('owner'),{active:0,uncertain:0,more:false});
});

test('an unconfirmed settlement retains the owned operation for deletion to drain', async () => {
 const f=accountFixture(), life=createAccountLifecycle({db:f.db});
 await life.initialize('owner');
 const update=f.db.updateRow;
 let attempts=0;
 f.db.updateRow=input=>{
  if(input.tableId==='account_operations'){
   attempts++;
   throw Object.assign(Error('Service unavailable'),{code:503});
  }
  return update(input);
 };
 await assert.rejects(life.run('owner','offlineSnapshot',async()=>true),{code:503});
 assert.equal(attempts,3);
 assert.equal((await life.pending('owner')).active,1);
});

test('Appwrite terminal commit conflicts retry without requiring a second rollback',async()=>{
 const f=accountFixture(),life=createAccountLifecycle({db:f.db});await life.initialize('owner');
 const update=f.db.updateTransaction;let rejected,commits=0;
 f.db.updateTransaction=async input=>{
  if(input.transactionId===rejected)throw {code:400,type:'transaction_not_ready'};
  if(input.commit&&commits++===0){rejected=input.transactionId;await update({transactionId:rejected,rollback:true});throw {code:409,type:'transaction_conflict'};}
  return update(input);
 };
 const operation=await life.enter('owner','charts');assert.equal(commits,2);assert.equal((await life.pending('owner')).active,1);await life.settle(operation);
});

test('an unclassified conflict with failed rollback is not retried',async()=>{
 const f=accountFixture(),life=createAccountLifecycle({db:f.db});await life.initialize('owner');let commits=0;
 f.db.updateTransaction=async input=>{if(input.commit){commits++;throw {code:409,type:'unknown_conflict'};}throw {code:503};};
 await assert.rejects(life.enter('owner','charts'),{code:409,type:'unknown_conflict'});assert.equal(commits,1);assert.equal((await life.pending('owner')).active,0);
});
