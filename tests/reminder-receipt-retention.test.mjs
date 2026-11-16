import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pruneReminderReceipts,stageReminderReceiptCapacity,REMINDER_HISTORY_MS,MAX_REMINDER_RECEIPTS} from '../server/reminder-receipt-retention.mjs';
import {createReminderScheduleStore} from '../server/reminder-schedules-store.mjs';
import {createWebPushStore} from '../server/web-push-store.mjs';
import {owner,origin,vapid,subscription,reminderFixture} from './fixtures/reminder-schedules.mjs';

function receipt(f,id,createdAt,{ownerId=owner,outcome='unknown'}={}){const row={$id:id,$permissions:[],ownerId,createdAt:new Date(createdAt).toISOString(),fingerprint:'f'.repeat(64),outcome,statusCode:0,completedAt:''};f.table('push_deliveries').set(id,row);return row;}
function fill(f,count){for(let i=0;i<count;i++)receipt(f,'history-'+String(i).padStart(5,'0'),f.now()-86400000+i);}

test('retention deletes only owner receipts strictly older than 90 days in bounded pages',async()=>{
 const f=reminderFixture(),cutoff=f.now()-REMINDER_HISTORY_MS;
 for(let i=0;i<103;i++)receipt(f,'old-'+i,cutoff-1-i);
 receipt(f,'boundary',cutoff);receipt(f,'sending',f.now(),{outcome:'sending'});receipt(f,'foreign',cutoff-1000,{ownerId:'another'});
 assert.deepEqual(await pruneReminderReceipts({db:f.db,owner,now:f.clock()}),{removed:100,more:true});
 assert.deepEqual(await pruneReminderReceipts({db:f.db,owner,now:f.clock()}),{removed:3,more:false});
 assert.deepEqual([...f.table('push_deliveries').keys()].sort(),['boundary','foreign','sending']);assert.equal(f.table('push_deliveries').get('sending').outcome,'sending');
});

test('oldest cap eviction is staged with the new claim; rollback preserves uncertain history',async()=>{
 const f=reminderFixture();fill(f,MAX_REMINDER_RECEIPTS);receipt(f,'foreign',f.now()-86400001,{ownerId:'another'});
 const tx=await f.db.createTransaction();await stageReminderReceiptCapacity({db:f.db,owner,transactionId:tx.$id});assert.ok(f.table('push_deliveries').has('history-00000'));await f.db.updateTransaction({transactionId:tx.$id,rollback:true});assert.equal(f.table('push_deliveries').size,20001);
 const next=await f.db.createTransaction();await stageReminderReceiptCapacity({db:f.db,owner,transactionId:next.$id});await f.db.createRow({tableId:'push_deliveries',rowId:'new',data:{ownerId:owner,createdAt:f.clock().toISOString(),outcome:'sending'},permissions:[],transactionId:next.$id});await f.db.updateTransaction({transactionId:next.$id,commit:true});
 assert.equal(f.table('push_deliveries').size,20001);assert.equal(f.table('push_deliveries').has('history-00000'),false);assert.ok(f.table('push_deliveries').has('history-00001'));assert.ok(f.table('push_deliveries').has('foreign'));
});

test('oversized history is repaired in bounded pages before another slot can be reserved',async()=>{
 const f=reminderFixture();fill(f,MAX_REMINDER_RECEIPTS+105);const tx=await f.db.createTransaction();await assert.rejects(()=>stageReminderReceiptCapacity({db:f.db,owner,transactionId:tx.$id}),{code:503});await f.db.updateTransaction({transactionId:tx.$id,rollback:true});
 assert.deepEqual(await pruneReminderReceipts({db:f.db,owner,now:f.clock()}),{removed:100,more:true});assert.deepEqual(await pruneReminderReceipts({db:f.db,owner,now:f.clock()}),{removed:5,more:false});assert.equal(f.table('push_deliveries').size,MAX_REMINDER_RECEIPTS);
});

test('tick cleans paused history and an explicit test respects the shared cap and uncertain replay',async()=>{
 const f=reminderFixture();let sends=0;const options={db:f.db,ownerId:owner,origin,vapid,now:f.now,send:async()=>{sends++;throw Error('Unknown send result');}},store=createReminderScheduleStore(options),push=createWebPushStore(options);
 receipt(f,'old',f.now()-REMINDER_HISTORY_MS-1);assert.deepEqual(await store.tick(),{attempted:0});assert.equal(f.table('push_deliveries').size,0);
 const device=await push.subscribe({subscription:subscription(),label:'Fixture'});fill(f,MAX_REMINDER_RECEIPTS);const input={deviceId:device.deviceId,requestId:randomUUID()};assert.equal((await push.test(input)).outcome,'unknown');assert.equal(f.table('push_deliveries').size,MAX_REMINDER_RECEIPTS);assert.equal((await push.test(input)).outcome,'unknown');assert.equal(sends,1);
 const current=await store.status();await store.save({revision:current.revision,schedule:{creationId:randomUUID(),label:'Food',kind:'daily',time:'07:00',days:[4],timeZone:'America/Chicago',enabled:true}});await store.settings({revision:(await store.status()).revision,paused:false});f.setTime('2026-10-29T12:00:00Z');assert.equal((await store.tick()).attempted,1);assert.equal(f.table('push_deliveries').size,MAX_REMINDER_RECEIPTS);assert.equal((await store.tick()).attempted,0);assert.equal((await push.test(input)).outcome,'unknown');assert.equal(sends,2);
});

test('a returned foreign or public receipt cannot be removed',async()=>{
 const f=reminderFixture();for(const wrong of [{ownerId:'other'},{$permissions:['read("any")']}]){const row=receipt(f,'wrong',f.now()-REMINDER_HISTORY_MS-1);Object.assign(row,wrong);const db={...f.db,listRows:async()=>({rows:[structuredClone(row)]})};await assert.rejects(()=>pruneReminderReceipts({db,owner,now:f.clock()}),{code:503});assert.ok(f.table('push_deliveries').has('wrong'));}
});
