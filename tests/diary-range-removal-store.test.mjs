import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Permission,Role} from 'node-appwrite';
import {initialState} from '../server/domain/workspace.mjs';
import {applyFastingCommand} from '../server/fasting.mjs';
import {parseReminderSchedule} from '../server/reminder-schedules.mjs';
import {packWorkspace,unpackWorkspace,rowId} from '../server/data-codec.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';
import {createDiaryRangeRemovalStore} from '../server/diary-range-removal-store.mjs';
import {pruneDiaryRemovalJobs} from '../server/diary-range-removal-jobs.mjs';
import {runAccountCleanup} from '../server/account-cleanup-worker.mjs';

const owner='range-test';
const selected={start:'2026-11-03',end:'2026-11-04',timeZone:'America/Chicago',types:['notes']};
const stamp=Date.parse('2026-11-08T00:00:00Z');
const acl=[Permission.read(Role.user(owner))];

function fixture({schedules=false}={}){
 const state=initialState();
 if(schedules)applyFastingCommand(state,{type:'fasting.schedule.save',payload:{
  id:randomUUID(),revision:0,label:'Scheduled',startDate:'2026-11-14',time:'11:00',recurrence:'once',
  interval:1,days:[],untilDate:null,goalHours:16,enabled:true,
 }},{now:new Date(stamp),timeZone:'UTC'});
 state.settings.completedDays=[selected.start,'2026-11-09'];
 state.notes=Array.from({length:360},(_,i)=>({id:'n'+i,date:i%3===0?'2026-11-09':selected.start,time:'09:45',text:'test '+i,group:'Lunch'}));
 const keepPhoto='a'.repeat(64),discardPhoto='b'.repeat(64);
 state.notes[0].imageId=keepPhoto;
 state.notes[1].imageId=keepPhoto;
 state.notes[2].imageId=discardPhoto;
 const f=diaryStoreFixture(state,owner),oldGeneration='fixture-generation';
 if(schedules){
  const daily=parseReminderSchedule({kind:'daily',label:'Daily',time:'09:00',days:[0,1,2,3,4,5,6],timeZone:'UTC'},{now:new Date(stamp)});
  const payload=JSON.stringify({devices:[{id:'local'}],schedules:[daily],paused:false,resumedAt:new Date(stamp).toISOString()});
  f.table('push_accounts').set(owner,{$id:owner,ownerId:owner,payload});
 }
 f.table('workspace_heads').get(owner).$permissions=acl;
 for(const sourceId of [keepPhoto,discardPhoto]){
  const namespace='note_photos',$id=rowId(owner,oldGeneration,namespace,sourceId);
  f.table('workspace_media').set($id,{$id,$permissions:acl,namespace,sourceId,ownerId:owner,generation:oldGeneration,fileId:rowId(owner,namespace,sourceId),digest:sourceId,bytes:80,width:2,height:2});
 }
 const foreign=packWorkspace(initialState(),'foreign',oldGeneration);for(const r of foreign.rows)f.table('workspace_records').set(r.$id,r);
 let clock=stamp,afterStage=()=>{},afterCommit=()=>{};
 const create=f.db.createRow.bind(f.db),del=f.db.deleteRow.bind(f.db),commit=f.db.updateTransaction.bind(f.db),batches=[];
 f.db.createRows=async({tableId,rows,transactionId})=>{
  assert.ok(transactionId);batches.push(rows.length);
  for(const {$id,$permissions,...data} of rows)await create({tableId,rowId:$id,data,permissions:$permissions,transactionId});
  await afterStage();
  return {rows:[]};
 };
 f.db.deleteRows=async({tableId,queries,transactionId})=>{
  assert.ok(transactionId);
  const {rows}=await f.db.listRows({tableId,queries});
  for(const row of rows)await del({tableId,rowId:row.$id,transactionId});
  return {rows};
 };
 f.db.updateTransaction=async input=>{await commit(input);if(input.commit)afterCommit();};
 const store=createDiaryRangeRemovalStore({db:f.db,ownerId:owner,now:()=>clock});
 const cleanup=async()=>pruneDiaryRemovalJobs({db:f.db,now:clock});
 const activeState=()=>{const head=f.table('workspace_heads').get(owner);return unpackWorkspace(head,[...f.table('workspace_records').values()].filter(r=>r.ownerId===owner&&r.generation===head.generation));};
 return {...f,state:activeState,store,cleanup,oldGeneration,keepPhoto,discardPhoto,batches,advance(){clock+=86_400_000;},setAfterStage(fn){afterStage=fn;},setAfterCommit(fn){afterCommit=fn;}};
}
async function reviewed(f){return {...selected,revision:(await f.store.preview(selected)).revision,requestId:randomUUID()};}
async function drain(f){
 for(let i=0;i<100&&f.table('diary_removal_jobs').size;i++)assert.equal((await f.cleanup()).failed,0);
 assert.equal(f.table('diary_removal_jobs').size,0);
}

test('large range commits a complete generation and one retriable result with only surviving photo mappings',async()=>{
 const f=fixture(),input=await reviewed(f);
 assert.equal((await f.store.preview(selected)).removed.notes,240);
 let lost=false;f.setAfterCommit(()=>{if(!lost&&f.table('command_receipts').size){lost=true;throw Error('Lost acknowledgement');}});
 const answer=await f.store.remove(input);
 assert.ok(lost);assert.equal(answer.removed.notes,240);assert.equal(answer.removed.daysReopened,1);
 assert.deepEqual(await f.store.remove(input),answer);
 assert.equal(f.table('command_receipts').size,1);
 assert.equal(f.state().notes.length,120);
 const generation=f.table('workspace_heads').get(owner).generation;
 const activeMedia=[...f.table('workspace_media').values()].filter(r=>r.generation===generation);
 assert.deepEqual(activeMedia.map(r=>r.sourceId),[f.keepPhoto]);
 assert.equal(f.table('workspace_recoveries').size,0);
 assert.ok(f.batches.length>1&&Math.max(...f.batches)<=100);
 const worker=await runAccountCleanup({db:f.db,enabled:true,clock:()=>stamp,deletion:{step(){throw Error('No pending account erasures.');}}});
 assert.equal(worker.failed,0);
 const cleanup=worker.diaryRemoval;
 assert.equal(cleanup.examined,1);assert.equal(cleanup.pruned,1);assert.ok(cleanup.rowsRemoved>360);
 assert.equal(f.table('diary_removal_jobs').size,0);
 assert.ok([...f.table('workspace_records').values()].some(r=>r.ownerId==='foreign'));
 assert.ok([...f.table('workspace_records').values()].filter(r=>r.ownerId===owner).every(r=>r.generation===generation));
 assert.equal(f.table('workspace_media').size,1);
 await assert.rejects(()=>f.store.remove({...input,types:['food']}),{code:409});
});

test('a staged failure keeps the original Diary and can resume the exact save',async()=>{
 const f=fixture(),input=await reviewed(f);let failed=false;
 f.setAfterStage(()=>{if(!failed){failed=true;throw Error('staging interrupted');}});
 await assert.rejects(()=>f.store.remove(input),/staging interrupted/);
 assert.equal(f.state().notes.length,360);
 assert.equal(f.table('workspace_heads').get(owner).generation,f.oldGeneration);
 assert.equal(f.table('command_receipts').size,0);
 assert.equal((await f.store.remove(input)).removed.notes,240);
 assert.equal(f.state().notes.length,120);
});

test('concurrent head changes prevent the swap and obsolete staging can be reclaimed',async()=>{
 const f=fixture(),input=await reviewed(f);let changed=false;
 f.setAfterStage(()=>{if(!changed){changed=true;f.table('workspace_heads').get(owner).$updatedAt='later-head';}});
 await assert.rejects(()=>f.store.remove(input),{code:409});
 assert.equal(f.table('workspace_heads').get(owner).generation,f.oldGeneration);assert.equal(f.state().notes.length,360);
 f.advance();await drain(f);
 assert.equal(f.state().notes.length,360);
 assert.ok([...f.table('workspace_records').values()].every(r=>r.generation===f.oldGeneration));
});

test('cleanup honors existing explicitly retained generations',async()=>{
 const f=fixture(),input=await reviewed(f),id=rowId(owner,f.oldGeneration);
 f.table('workspace_recoveries').set(id,{$id:id,$permissions:[],ownerId:owner,generation:f.oldGeneration});
 await f.store.remove(input);await drain(f);
 assert.ok([...f.table('workspace_records').values()].some(r=>r.ownerId===owner&&r.generation===f.oldGeneration));
 assert.ok(f.table('workspace_recoveries').has(id));
});

test('cleanup claiming an expired staging job fences off its delayed writer',async()=>{
 const f=fixture(),input=await reviewed(f);
 f.setAfterStage(async()=>{
  f.setAfterStage(()=>{});
  f.advance();
  assert.equal((await f.cleanup()).pruned,1);
 });
 await assert.rejects(()=>f.store.remove(input),{code:409});
 assert.equal(f.state().notes.length,360);
 assert.ok([...f.table('workspace_records').values()].every(r=>r.generation===f.oldGeneration));
 assert.equal((await f.store.remove(input)).removed.notes,240);
});

test('an empty selection records one exact receipt and retains the active generation',async()=>{
 const f=fixture(),range={...selected,start:'2025-01-02',end:'2025-01-02'};
 const preview=await f.store.preview(range);
 assert.deepEqual(Object.values(preview.removed),[0,0,0,0,0,0]);
 const input={...range,revision:preview.revision,requestId:randomUUID()};
 const result=await f.store.remove(input);
 assert.deepEqual(result,{ok:true,...preview});
 assert.equal(f.table('workspace_heads').get(owner).generation,f.oldGeneration);
 assert.equal(f.table('diary_removal_jobs').size,0);
 await f.store.remove(await reviewed(f));
 assert.deepEqual(await f.store.remove(input),result);
 assert.equal(f.table('command_receipts').size,2);
});

test('both scheduled dispatches use the new active generation after removal',async()=>{
 const f=fixture({schedules:true}),plan=f.state().fastingPlan;
 await f.store.remove(await reviewed(f));
 const head=f.table('workspace_heads').get(owner);
 assert.deepEqual(f.state().fastingPlan,plan);
 for(const tableId of ['fasting_dispatch','reminder_dispatch']){
  const record=f.table(tableId).get(owner);
  assert.equal(record.ownerId,owner);
  assert.equal(record.generation,head.generation);
 }
});
