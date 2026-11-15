import test from 'node:test';
import assert from 'node:assert/strict';
import {runAccountCleanup} from '../server/account-cleanup-worker.mjs';
import entry from '../server/account-cleanup-entry.mjs';
import {accountFixture} from './fixtures/account-fixture.mjs';
import {createAccountLifecycle} from '../server/account-lifecycle.mjs';
import {createAccountDeletion} from '../server/account-deletion.mjs';
import {parseCleanupRequest} from '../server/account-cleanup-entry.mjs';
const now=1700000000000,expired=new Date(now-1000).toISOString(),future=new Date(now+1000).toISOString();
const job=(id,state,expiresAt=expired)=>({$id:id,ownerId:state==='complete'?'':'owner',state,phase:'drain',version:0,expiresAt,updatedAt:expired,counts:'{"files":0,"rows":0}'});

test('targeted worker accesses only its exact job and never prunes other receipts',async()=>{
 const id='37e91cde-4eaf-4f56-94a0-25bb975fb942',f=accountFixture();f.put('account_deletions',id,job(id,'pending'));f.put('account_deletions','other',job('other','pending'));f.put('account_deletions','expired',job('expired','prepared'));
 const get=f.db.getRow;f.db.getRow=async input=>{assert.equal(input.rowId,id);return get(input);};f.db.listRows=async()=>{throw Error('Targeted work must not list jobs');};const calls=[];
 const result=await runAccountCleanup({db:f.db,enabled:true,jobId:id,clock:()=>now,deletion:{async step(value){calls.push(value);return {status:'deleted',phase:'done',counts:{files:0,rows:0}};}}});assert.deepEqual(calls,[id]);assert.equal(result.deleted,1);assert.equal(result.pruned,0);assert.ok(f.table('account_deletions').has('expired'));assert.ok(f.table('account_deletions').has('other'));
 await assert.rejects(runAccountCleanup({db:f.db,deletion:{step(){}},enabled:true,jobId:'bad'}));
});

test('private cleanup request accepts only an exact optional job ID and rejects invalid entry bodies',async()=>{
 const jobId='37e91cde-4eaf-4f56-94a0-25bb975fb942';assert.deepEqual(parseCleanupRequest(''),{});assert.deepEqual(parseCleanupRequest(undefined),{});assert.deepEqual(parseCleanupRequest(JSON.stringify({jobId})),{jobId});assert.deepEqual(parseCleanupRequest({jobId}),{jobId});
 for(const body of [null,'{','{}','null','[]',JSON.stringify({jobId,owner:'other'}),JSON.stringify({jobId:'bad'})])assert.throws(()=>parseCleanupRequest(body),{code:400});
 const old=process.env.ACCOUNT_CLEANUP_ENABLED;process.env.ACCOUNT_CLEANUP_ENABLED='true';try{let response;await entry({req:{body:'{"owner":"other"}'},res:{json:(body,status)=>{response={body,status};}}});assert.equal(response.status,400);}finally{if(old===undefined)delete process.env.ACCOUNT_CLEANUP_ENABLED;else process.env.ACCOUNT_CLEANUP_ENABLED=old;}
});
test('worker disabled default does not access data or SDK credentials',async()=>{
 const result=await runAccountCleanup({db:{listRows(){throw Error('No reads');}},deletion:{step(){throw Error('No work');}}});assert.equal(result.enabled,false);
 const old=process.env.ACCOUNT_CLEANUP_ENABLED;delete process.env.ACCOUNT_CLEANUP_ENABLED;try{let response;await entry({res:{json:(body,status)=>{response={body,status};}}});assert.deepEqual(response,{body:{ok:true,enabled:false},status:200});}finally{if(old===undefined)delete process.env.ACCOUNT_CLEANUP_ENABLED;else process.env.ACCOUNT_CLEANUP_ENABLED=old;}
});
test('worker prunes only expired prepared/complete receipts and bounds unchanged pending work',async()=>{
 const f=accountFixture();for(const row of [job('ready','prepared'),job('done','complete'),job('fresh','prepared',future),job('pending','pending'),job('unknown','pending')])f.put('account_deletions',row.$id,row);
 const seen=[],result=await runAccountCleanup({db:f.db,enabled:true,clock:()=>now,deletion:{async step(id){seen.push(id);return {status:id==='unknown'?'needs_attention':'pending',phase:'drain',counts:{files:0,rows:0}};}}});
 assert.deepEqual(new Set(seen),new Set(['pending','unknown']));assert.equal(seen.length,2);assert.equal(result.pruned,2);assert.equal(result.needsAttention,1);assert.equal(f.table('account_deletions').has('fresh'),true);assert.equal(f.table('account_deletions').has('pending'),true);
});
test('private worker progresses without a browser and isolates failures within job/step limits',async()=>{
 const f=accountFixture();for(const id of ['a','b','c'])f.put('account_deletions',id,job(id,'pending'));
 const calls=[],result=await runAccountCleanup({db:f.db,enabled:true,clock:()=>now,maxJobs:2,maxStepsPerJob:2,deletion:{async step(id){calls.push(id);if(id==='a')throw {code:503};return {status:calls.filter(x=>x===id).length===2?'deleted':'pending',phase:'files',counts:{files:1,rows:0}};}}});
 assert.deepEqual(calls,['a','b','b']);assert.equal(result.failed,1);assert.equal(result.deleted,1);assert.equal(result.examined,2);
});
test('receipt pruning cannot delete a job confirmed concurrently',async()=>{
 const f=accountFixture();f.put('account_deletions','race',job('race','prepared'));f.beforeCommit=async()=>{f.beforeCommit=null;const row=f.table('account_deletions').get('race');f.put('account_deletions','race',{...row,state:'pending',version:1,expiresAt:future});};
 const result=await runAccountCleanup({db:f.db,enabled:true,clock:()=>now,deletion:{async step(){return {status:'pending',phase:'drain',counts:{files:0,rows:0}};}}});assert.equal(f.table('account_deletions').get('race').state,'pending');assert.equal(result.pruned,0);
});

test('expired receipt pruning that wins confirmation prevents any lifecycle claim',async()=>{
 const f=accountFixture();let time=now;const lifecycle=createAccountLifecycle({db:f.db,now:()=>time});f.accounts.set('owner',{$id:'owner',$createdAt:'2023-10-15T06:38:00.000+00:00',status:true,sessions:['session']});await lifecycle.initialize('owner');
 const deletion=createAccountDeletion({...f,lifecycle,now:()=>time}),{ticket}=await deletion.prepare('owner'),createTransaction=f.db.createTransaction;
 // Confirmation already validated the receipt, but its consent transaction has not started.
 f.db.createTransaction=async input=>{f.db.createTransaction=createTransaction;time+=11*60*1000;const result=await runAccountCleanup({db:f.db,deletion,enabled:true,clock:()=>time});assert.equal(result.pruned,1);return createTransaction(input);};
 await assert.rejects(deletion.begin(ticket,'owner'),{code:404});assert.equal(f.table('account_lifecycle').get('owner').state,'active');assert.equal(f.accounts.get('owner').status,true);assert.equal(f.table('account_deletions').has(ticket.id),false);
});
test('successive private worker invocations complete a real deletion with the browser closed',async()=>{
 const f=accountFixture(),lifecycle=createAccountLifecycle({db:f.db,now:()=>now});f.accounts.set('owner',{$id:'owner',$createdAt:'2023-10-15T06:38:00.000+00:00',status:true,sessions:['session']});await lifecycle.initialize('owner');
 const deletion=createAccountDeletion({...f,lifecycle,now:()=>now}),{ticket}=await deletion.prepare('owner');await deletion.begin(ticket,'owner');
 for(let i=0;i<40;i++){const id='orphan'+i;f.files.set(id,{$id:id,$permissions:['read("user:owner")']});f.put('workspace_records','row'+i,{ownerId:'owner'});}f.files.set('foreign',{$id:'foreign',$permissions:['read("user:other")']});
 for(let i=0;i<20;i++){await runAccountCleanup({db:f.db,deletion,enabled:true,clock:()=>now});if((await deletion.status(ticket)).status==='deleted')break;}
 assert.equal((await deletion.status(ticket)).status,'deleted');assert.equal(f.accounts.has('owner'),false);assert.equal(f.table('workspace_records').size,0);assert.equal(f.files.size,1);assert.ok(f.files.has('foreign'));
});
test('wall-time budget stops between bounded steps and does not remove pending jobs',async()=>{
 const f=accountFixture();for(const id of ['a','b'])f.put('account_deletions',id,job(id,'pending'));let time=now,steps=0;
 await runAccountCleanup({db:f.db,enabled:true,budgetMs:25,clock:()=>{time+=10;return time;},deletion:{async step(){steps++;return {status:'pending',phase:'files',counts:{files:1,rows:0}};}}});assert.equal(steps,1);assert.equal(f.table('account_deletions').size,2);
});
