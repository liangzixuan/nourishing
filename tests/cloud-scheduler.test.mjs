import test from 'node:test';
import assert from 'node:assert/strict';
import {runCloudScheduler} from '../server/cloud-scheduler.mjs';

function fixture(count){
 const calls=[],rows=Array.from({length:count},(_,i)=>({$id:'owner'+i,ownerId:'owner'+i,token:'token'+i}));
 return {calls,db:{async listRows(input){calls.push(input);const limit=input.queries.map(JSON.parse).find(q=>q.method==='limit').values[0];return {rows:rows.slice(0,limit)};}}};
}
test('scheduler disabled by default performs no reads',async()=>{
 assert.deepEqual(await runCloudScheduler({db:{listRows(){throw Error('Must not read');}}}),{enabled:false,examined:0,queued:0,unchanged:0,failed:0,blocked:0,more:false});
});
test('repair uses a bounded due page, concurrency and a continuation',async()=>{
 const {db,calls}=fixture(8);let active=0,peak=0;
 const result=await runCloudScheduler({db,enabled:true,pageSize:5,concurrency:2,clock:()=>new Date('2026-11-15T12:00:00Z'),defer:async()=>{},dispatch:async owner=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setImmediate(resolve));active--;return {queued:owner==='owner0'};}});
 assert.equal(result.examined,5);assert.equal(result.queued,1);assert.equal(result.unchanged,4);assert.equal(result.more,true);assert.equal(peak,2);assert.equal(calls.length,1);
 assert.equal(calls[0].tableId,'fasting_dispatch');assert.ok(calls[0].queries.map(JSON.parse).some(q=>q.method==='lessThanEqual'&&q.attribute==='repairAt'&&q.values[0]==='2026-11-15T12:00:00.000Z'));
});
test('failed queue jobs are deferred with their token and do not starve later pages',async()=>{
 const {db}=fixture(4),deferred=[];
 const result=await runCloudScheduler({db,enabled:true,pageSize:4,dispatch:async owner=>{if(owner==='owner1')throw {code:503};return {queued:true};},defer:async(...args)=>deferred.push(args)});
 assert.deepEqual(deferred,[['owner1','token1']]);assert.equal(result.failed,1);assert.equal(result.blocked,0);assert.equal(result.more,true);assert.equal(result.queued,3);
});
test('failed deferral stops busy continuation loops',async()=>{
 const {db}=fixture(1);const result=await runCloudScheduler({db,enabled:true,pageSize:1,dispatch:async()=>{throw {code:503};},defer:async()=>{throw {code:503};}});
 assert.equal(result.failed,1);assert.equal(result.blocked,1);assert.equal(result.more,true);
});
test('repair yields between batches when its time budget expires',async()=>{
 const {db}=fixture(8);let elapsed=0;
 const result=await runCloudScheduler({db,enabled:true,pageSize:8,concurrency:2,budgetMs:10,monotonic:()=>elapsed,defer:async()=>{},dispatch:async()=>{elapsed+=10;return {queued:true};}});
 assert.equal(result.examined,2);assert.equal(result.more,true);
});
