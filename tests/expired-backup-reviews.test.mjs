import test from 'node:test';
import assert from 'node:assert/strict';
import {pruneExpiredBackupReviews} from '../server/expired-backup-reviews.mjs';
import {accountFixture} from './fixtures/account-fixture.mjs';

const now=1700000000000,expired=new Date(now-1).toISOString(),future=new Date(now+1).toISOString();
const review=(id,fields={})=>({$id:id,ownerId:'owner',generation:'generation',$permissions:[],expiresAt:expired,...fields});
function fixture(){
 const f=accountFixture(),list=f.db.listRows;
 f.db.listRows=async input=>{
  assert.equal(input.tableId,'backup_reviews');
  const queries=input.queries.map(JSON.parse),cutoff=queries.find(q=>q.method==='lessThanEqual');
  assert.deepEqual(cutoff,{method:'lessThanEqual',attribute:'expiresAt',values:[new Date(now).toISOString()]});
  assert.ok(queries.some(q=>q.method==='orderAsc'&&q.attribute==='expiresAt'));
  return list(input);
 };
 const put=(id,fields)=>f.put('backup_reviews',id,review(id,fields));
 return {...f,putReview:put,run:options=>pruneExpiredBackupReviews({db:f.db,now,...options})};
}

test('expiry deletes only private expired review metadata and preserves every linked generation',async()=>{
 const f=fixture();f.putReview('old');f.putReview('at-boundary',{expiresAt:new Date(now).toISOString()});f.putReview('valid',{expiresAt:future});
 for(const name of ['workspace_records','workspace_media','workspace_recoveries','command_receipts','workspace_heads'])f.put(name,'retained',{ownerId:'owner',generation:'generation'});
 f.files.set('photo',{generation:'generation'});
 const result=await f.run();assert.deepEqual(result,{pruned:2,skipped:1,failed:0});assert.equal(f.table('backup_reviews').size,1);assert.ok(f.table('backup_reviews').has('valid'));
 for(const name of ['workspace_records','workspace_media','workspace_recoveries','command_receipts','workspace_heads'])assert.equal(f.table(name).size,1);assert.equal(f.files.size,1);
});

test('unknown ownership, public permissions and malformed expiry remain for inspection',async()=>{
 const f=fixture();f.putReview('public',{$permissions:['read("any")']});f.putReview('owner',{ownerId:''});f.putReview('generation',{generation:null});f.putReview('date',{expiresAt:'not-a-date'});f.putReview('noncanonical',{expiresAt:'2020-01-01'});
 const result=await f.run();assert.deepEqual(result,{pruned:0,skipped:5,failed:0});assert.equal(f.table('backup_reviews').size,5);
});

test('concurrent extension after staging conflicts and preserves the valid review',async()=>{
 const f=fixture();f.putReview('review');
 // The fixture's commit hook belongs to its original object, so wrap commit at its public boundary.
 const commit=f.db.updateTransaction;let changed=false;
 f.db.updateTransaction=async input=>{if(input.commit&&!changed){changed=true;f.putReview('review',{expiresAt:future});}return commit(input);};
 const result=await f.run();assert.equal(result.pruned,0);assert.equal(result.failed,0);assert.equal(f.table('backup_reviews').get('review').expiresAt,future);
});

test('changed identity before staging is skipped and later changes fail the guard',async()=>{
 for(const at of [1,2]){
  const f=fixture();f.putReview('review');const get=f.db.getRow;let reads=0;
  f.db.getRow=async input=>{if(++reads===at)f.putReview('review',{ownerId:'other'});return get(input);};
  const result=await f.run();assert.equal(result.pruned,0);assert.equal(result.failed,0);assert.ok(f.table('backup_reviews').has('review'));
 }
});

test('404 and 409 races are benign; provider failure rolls back and leaves review retryable',async()=>{
 for(const code of [404,409,503]){
  const f=fixture();f.putReview('review');let rollbacks=0;const update=f.db.updateTransaction;
  f.db.updateTransaction=async input=>{if(input.commit)throw {code};if(input.rollback)rollbacks++;return update(input);};
  const result=await f.run();assert.equal(result.pruned,0);assert.equal(result.failed,code===503?1:0);assert.equal(rollbacks,1);assert.ok(f.table('backup_reviews').has('review'));
 }
});

test('batch and shared deadline bound metadata cleanup',async()=>{
 const f=fixture();for(let i=0;i<5;i++)f.putReview('review'+i);
 assert.equal((await f.run({limit:2})).pruned,2);let checks=0;
 assert.equal((await f.run({timeLeft:()=>++checks<3})).pruned,1);assert.equal(f.table('backup_reviews').size,2);
 f.db.listRows=async()=>{throw Error('Expired budget must not query');};assert.deepEqual(await f.run({timeLeft:()=>false}),{pruned:0,skipped:0,failed:0});
 await assert.rejects(f.run({limit:26}));
});
