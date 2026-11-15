import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountLifecycle} from '../server/account-lifecycle.mjs';
import {createAccountDeletion} from '../server/account-deletion.mjs';
import {accountFixture} from './fixtures/account-fixture.mjs';
const createdAt='2023-10-15T06:38:00.000+00:00';
const replacement=()=>({$id:'owner',$createdAt:'2023-11-15T06:38:00.000+00:00',status:true,sessions:['new-session']});
async function setup(){const f=accountFixture(),lifecycle=createAccountLifecycle({db:f.db,now:f.now});f.accounts.set('owner',{$id:'owner',$createdAt:createdAt,status:true,sessions:['session']});f.accounts.set('other',{$id:'other',$createdAt:createdAt,status:true});await lifecycle.initialize('owner');const deletion=createAccountDeletion({...f,lifecycle,now:f.now,pageSize:100});return Object.assign(f,{lifecycle,deletion});}
async function finish(f,ticket){for(let i=0;i<80;i++){const value=await f.deletion.status(ticket,{advance:true});if(value.status==='deleted')return value;}throw Error('Deletion did not finish within fixture steps');}
test('prepared receipt requires owner and secret, does not disclose identity or disable account',async()=>{
 const f=await setup(),prepared=await f.deletion.prepare('owner');assert.equal(prepared.status.status,'ready');assert.equal(f.accounts.get('owner').status,true);assert.equal(JSON.stringify(prepared.status).includes('owner'),false);
 await assert.rejects(f.deletion.begin(prepared.ticket,'other'),{code:403});await assert.rejects(f.deletion.status({...prepared.ticket,secret:'0'.repeat(64)}),{code:403});assert.equal(f.table('account_deletions').get(prepared.ticket.id).tokenHash.includes(prepared.ticket.secret),false);
 assert.equal(f.table('account_deletions').get(prepared.ticket.id).userCreatedAt,createdAt);
});

test('account identity is required before a prepared receipt is issued',async()=>{
 const f=await setup();delete f.accounts.get('owner').$createdAt;await assert.rejects(f.deletion.prepare('owner'),{code:503});assert.equal(f.table('account_deletions').size,0);assert.equal((await f.lifecycle.pending('owner')).active,0);
});

test('replacement identity blocks cleanup before account disable and before session revoke',async()=>{
 for(const stage of ['block','sessions']){
  const f=await setup(),{ticket}=await f.deletion.prepare('owner');await f.deletion.begin(ticket,'owner');
  if(stage==='block')f.accounts.set('owner',replacement());
  else {const update=f.users.updateStatus;f.users.updateStatus=async input=>{const value=await update(input);f.accounts.set('owner',replacement());return value;};}
  const result=await f.deletion.step(ticket.id);assert.equal(result.status,'needs_attention');assert.deepEqual(f.accounts.get('owner'),replacement());assert.equal(f.table('account_deletions').get(ticket.id).ownerId,'owner');
 }
});

test('lost account-delete reply followed by ID reuse never deletes the replacement',async()=>{
 const f=await setup(),{ticket}=await f.deletion.prepare('owner');await f.deletion.begin(ticket,'owner');
 for(let i=0;i<40&&(await f.deletion.status(ticket)).phase!=='user';i++)await f.deletion.step(ticket.id);
 assert.equal((await f.deletion.status(ticket)).phase,'user');const remove=f.users.delete;let calls=0;
 f.users.delete=async input=>{calls++;await remove(input);f.accounts.set('owner',replacement());throw {code:503};};
 assert.equal((await f.deletion.step(ticket.id)).status,'needs_attention');
 for(let i=0;i<3;i++)assert.equal((await f.deletion.step(ticket.id)).status,'needs_attention');
 assert.equal(calls,1);assert.deepEqual(f.accounts.get('owner'),replacement());assert.equal(f.table('account_lifecycle').get('owner').state,'deleting');assert.equal(f.table('account_deletions').get(ticket.id).ownerId,'owner');
});

test('finish preserves replacement identity and original absence can finish normally',async()=>{
 const f=await setup(),{ticket}=await f.deletion.prepare('owner');await f.deletion.begin(ticket,'owner');
 for(let i=0;i<40&&(await f.deletion.status(ticket)).phase!=='finish';i++)await f.deletion.step(ticket.id);
 assert.equal((await f.deletion.status(ticket)).phase,'finish');f.accounts.set('owner',replacement());assert.equal((await f.deletion.step(ticket.id)).status,'needs_attention');assert.deepEqual(f.accounts.get('owner'),replacement());assert.ok(f.table('account_lifecycle').has('owner'));
 f.accounts.delete('owner');assert.equal((await finish(f,ticket)).status,'deleted');
 const absent=await setup(),prepared=await absent.deletion.prepare('owner');await absent.deletion.begin(prepared.ticket,'owner');absent.accounts.delete('owner');assert.equal((await finish(absent,prepared.ticket)).status,'deleted');
});
test('drains owned operations and removes all generations, legacy orphans and account last',async()=>{
 const f=await setup(),operation=await f.lifecycle.enter('owner','upload'),{ticket}=await f.deletion.prepare('owner');
 for(const table of ['workspace_records','workspace_media','workspace_recoveries','health_reviews','backup_reviews','command_receipts'])for(let i=0;i<105;i++)f.put(table,'row'+String(i).padStart(3,'0'),{ownerId:'owner',generation:i%2?'old':'staged'});
 // Media mappings must carry an owned file reference; missing files are already removed.
 for(const row of f.table('workspace_media').values())row.fileId='missing-'+row.$id;
 for(const table of ['fasting_dispatch','reminder_dispatch','profiles','workspace_heads'])f.put(table,'owner',{ownerId:'owner'});for(const table of ['fasting_dispatch','reminder_dispatch'])f.put(table,'other',{ownerId:'other'});f.put('workspace_records','foreign',{ownerId:'other'});f.put('catalog_foods','shared',{name:'Public catalog'});
 for(let i=0;i<115;i++)f.files.set('file'+String(i).padStart(3,'0'),{$id:'file'+String(i).padStart(3,'0'),$permissions:['read("user:owner")']});f.files.set('foreign',{$id:'foreign',$permissions:['read("user:other")']});
 await f.deletion.begin(ticket,'owner');await f.deletion.step(ticket.id);assert.equal(f.accounts.get('owner').status,false);assert.deepEqual(f.accounts.get('owner').sessions,[]);assert.equal((await f.deletion.status(ticket,{advance:true})).status,'pending');assert.ok(f.table('workspace_records').size>100);
 await f.lifecycle.settle(operation);const result=await finish(f,ticket);assert.equal(result.status,'deleted');assert.equal(f.accounts.has('owner'),false);assert.ok(f.accounts.has('other'));assert.equal(f.files.size,1);assert.ok(f.files.has('foreign'));assert.equal(f.table('workspace_records').size,1);assert.equal(f.table('catalog_foods').size,1);assert.equal(f.table('account_lifecycle').has('owner'),false);assert.equal(f.table('account_deletions').get(ticket.id).ownerId,'');assert.equal((await f.deletion.begin(ticket,'owner')).status,'deleted');
 for(const table of ['fasting_dispatch','reminder_dispatch']){assert.equal(f.table(table).has('owner'),false);assert.equal(f.table(table).has('other'),true);}
});
test('unknown upload stays pending indefinitely and deletion failures resume with retained identity',async()=>{
 const f=await setup(),op=await f.lifecycle.enter('owner','upload');await f.lifecycle.hold(op);const {ticket}=await f.deletion.prepare('owner');await f.deletion.begin(ticket,'owner');await f.deletion.step(ticket.id);const waiting=await f.deletion.step(ticket.id);assert.equal(waiting.status,'needs_attention');assert.ok(f.accounts.has('owner'));assert.equal(f.table('account_operations').size,1);
 await f.lifecycle.settle(op);f.files.set('orphan',{$id:'orphan',$permissions:['read("user:owner")']});f.failDeleteFile=true;let failed=false;for(let i=0;i<10;i++){const state=await f.deletion.step(ticket.id);if(state.status==='needs_attention'){failed=true;break;}}assert.ok(failed);assert.ok(f.accounts.has('owner'));assert.ok(f.files.has('orphan'));f.lostUserDelete=true;assert.equal((await finish(f,ticket)).status,'deleted');
});
test('mixed file permissions block removal and preserve foreign access evidence',async()=>{
 const f=await setup(),{ticket}=await f.deletion.prepare('owner');f.files.set('mixed',{$id:'mixed',$permissions:['read("user:owner")','read("user:other")']});await f.deletion.begin(ticket,'owner');let result;for(let i=0;i<8;i++){result=await f.deletion.step(ticket.id);if(result.status==='needs_attention')break;}assert.equal(result.status,'needs_attention');assert.ok(f.files.has('mixed'));assert.ok(f.accounts.has('owner'));
});
test('row failures and duplicate workers resume, and abandoned prepared tickets are removed',async()=>{
 const f=await setup(),abandoned=await f.deletion.prepare('owner'),{ticket}=await f.deletion.prepare('owner');f.put('workspace_records','first',{ownerId:'owner'});f.put('workspace_recoveries','old',{ownerId:'owner'});await f.deletion.begin(ticket,'owner');
 f.failDeleteRow=true;let failure;for(let i=0;i<20;i++){failure=await f.deletion.step(ticket.id);if(failure.status==='needs_attention')break;}assert.equal(failure.status,'needs_attention');assert.ok(f.accounts.has('owner'));assert.ok(f.table('workspace_records').has('first'));
 for(let i=0;i<30;i++){await Promise.all([f.deletion.step(ticket.id),f.deletion.step(ticket.id)]);if((await f.deletion.status(ticket)).status==='deleted')break;}
 assert.equal((await f.deletion.status(ticket)).status,'deleted');assert.equal(f.table('workspace_recoveries').size,0);assert.equal(f.table('account_deletions').has(abandoned.ticket.id),false);assert.equal(f.table('account_deletions').size,1);
});
test('missing file scan anchors restart inventory instead of declaring it empty',async()=>{
 const f=await setup(),{ticket}=await f.deletion.prepare('owner');for(let i=0;i<101;i++){const id='file'+String(i).padStart(3,'0');f.files.set(id,{$id:id,$permissions:['read("user:owner")']});}await f.deletion.begin(ticket,'owner');
 for(let i=0;i<4;i++)await f.deletion.step(ticket.id);const job=f.table('account_deletions').get(ticket.id);assert.equal(job.phase,'files');assert.ok(job.cursor);f.files.delete(job.cursor);await f.deletion.step(ticket.id);assert.equal(f.table('account_deletions').get(ticket.id).cursor,'');assert.equal((await finish(f,ticket)).status,'deleted');assert.equal(f.files.size,0);
});
