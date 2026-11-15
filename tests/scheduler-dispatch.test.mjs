import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initialState} from '../server/domain/workspace.mjs';
import {applyFastingCommand,tickCloudFasting} from '../server/fasting.mjs';
import {captureCalendar} from '../server/domain/calendar.mjs';
import {createFastingDispatcher,planFastingDispatch,stageFastingDispatch,parseSchedulerRequest} from '../server/scheduler-dispatch.mjs';
import {accountFixture} from './fixtures/account-fixture.mjs';

const owner='owner',generation='generation',arm=new Date('2026-11-14T10:00:00Z');
function scheduled({time='11:00',timeZone='UTC',date='2026-11-14',recurrence='once',now=arm}={}){
 const state=initialState();applyFastingCommand(state,{type:'fasting.schedule.save',payload:{id:randomUUID(),revision:0,label:'Scheduled',startDate:date,time,recurrence,interval:1,days:[],untilDate:null,goalHours:16,enabled:true}},{now,timeZone});return state;
}
function setup(){
 const f=accountFixture(),executions=new Map(),creates=[];let current=arm,lost=false;
 const functions={async getExecution({executionId}){if(!executions.has(executionId))throw {code:404};return structuredClone(executions.get(executionId));},async listExecutions({queries}){const parsed=queries.map(JSON.parse);return {executions:[...executions.values()].filter(e=>parsed.filter(q=>q.method==='equal').every(q=>q.values.includes(e[q.attribute]))).slice(0,1).map(e=>structuredClone(e))};},async createExecution(input){creates.push(input);const execution={$id:'execution'+creates.length,resourceId:input.functionId,requestPath:input.xpath,status:'scheduled',scheduledAt:input.scheduledAt};executions.set(execution.$id,execution);if(lost){lost=false;throw {code:503};}return structuredClone(execution);}};
 const dispatcher=createFastingDispatcher({db:f.db,functions,clock:()=>current});
 return {...f,dispatcher,creates,executions,setNow:value=>{current=new Date(value);},loseCreate:()=>{lost=true;},async stage(state,now=current){const tx=await f.db.createTransaction();const plan=await stageFastingDispatch({db:f.db,owner,state,generation,transactionId:tx.$id,now,timeZone:'UTC'});await f.db.updateTransaction({transactionId:tx.$id,commit:true});f.put('workspace_heads',owner,{ownerId:owner,generation});return plan;}};
}
test('projection preserves canonical next start, timezone and source state',()=>{
 const state=scheduled({time:'07:00',timeZone:'America/Chicago'}),before=structuredClone(state);
 assert.equal(planFastingDispatch(state,{generation,now:arm,timeZone:'UTC'}).dueAt,'2026-11-14T13:00:00.000Z');assert.deepEqual(state,before);
 assert.notEqual(planFastingDispatch(state,{generation:'new-generation',now:arm,timeZone:'UTC'}).token,planFastingDispatch(state,{generation,now:arm,timeZone:'UTC'}).token);
 state.fastingPlan.schedules[0].enabled=false;assert.equal(planFastingDispatch(state,{generation,now:arm,timeZone:'UTC'}),null);
});
test('dispatch projection retains canonical daylight-saving gap and fold handling',()=>{
 const gapNow=new Date('2026-03-07T12:00:00Z'),gap=scheduled({now:gapNow,date:'2026-03-07',time:'02:30',timeZone:'America/Chicago',recurrence:'daily'});
 assert.equal(planFastingDispatch(gap,{generation,now:gapNow,timeZone:'UTC'}).dueAt,'2026-03-09T07:30:00.000Z');
 const foldNow=new Date('2026-10-31T12:00:00Z'),fold=scheduled({now:foldNow,date:'2026-10-31',time:'01:30',timeZone:'America/Chicago',recurrence:'daily'});
 assert.equal(planFastingDispatch(fold,{generation,now:foldNow,timeZone:'UTC'}).dueAt,'2026-11-01T06:30:00.000Z');
});
test('dispatch intent is atomic with caller transaction and deleted after the final occurrence',async()=>{
 const f=setup(),state=scheduled(),tx=await f.db.createTransaction();
 await stageFastingDispatch({db:f.db,owner,state,generation,transactionId:tx.$id,now:arm,timeZone:'UTC'});assert.equal(f.table('fasting_dispatch').size,0);
 await f.db.updateTransaction({transactionId:tx.$id,rollback:true});assert.equal(f.table('fasting_dispatch').size,0);
 await f.stage(state);assert.equal(f.table('fasting_dispatch').size,1);
 tickCloudFasting(state,captureCalendar(new Date('2026-11-14T11:01:00Z'),'UTC'));await f.stage(state,new Date('2026-11-14T11:01:00Z'));assert.equal(f.table('fasting_dispatch').size,0);
});
test('one-shot runs one minute after canonical due and repeated dispatch reuses it',async()=>{
 const f=setup(),plan=await f.stage(scheduled());assert.equal((await f.dispatcher.dispatch(owner)).queued,true);assert.equal((await f.dispatcher.dispatch(owner)).queued,false);assert.equal(f.creates.length,1);
 assert.equal(f.creates[0].scheduledAt,'2026-11-14T11:01:00.000Z');assert.deepEqual(JSON.parse(f.creates[0].body),{owner,generation,token:plan.token});assert.equal(f.creates[0].async,true);
});
test('lost create response is recovered from execution path without another queue write',async()=>{
 const f=setup();await f.stage(scheduled());f.loseCreate();await assert.rejects(()=>f.dispatcher.dispatch(owner));assert.equal((await f.dispatcher.dispatch(owner)).queued,false);assert.equal(f.creates.length,1);
});
test('late provider reply cannot overwrite a replaced schedule intent',async()=>{
 const f=setup();await f.stage(scheduled());const newer={...f.table('fasting_dispatch').get(owner),token:'b'.repeat(64),executionId:''};
 const commit=f.db.updateTransaction;let once=true;f.db.updateTransaction=async input=>{if(input.commit&&once){once=false;f.put('fasting_dispatch',owner,newer);}return commit(input);};
 assert.equal((await f.dispatcher.dispatch(owner)).stale,true);assert.equal(f.table('fasting_dispatch').get(owner).token,newer.token);assert.equal(f.table('fasting_dispatch').get(owner).executionId,'');
});
test('stale deferral does not delay a replacement intent',async()=>{
 const f=setup(),plan=await f.stage(scheduled());const row=f.table('fasting_dispatch').get(owner);f.put('fasting_dispatch',owner,{...row,token:'b'.repeat(64)});await f.dispatcher.defer(owner,plan.token);assert.equal(f.table('fasting_dispatch').get(owner).repairAt,arm.toISOString());
});
test('stale token, old workspace generation and deleted owner do not tick',async()=>{
 const f=setup(),plan=await f.stage(scheduled());let ticks=0;const tick=()=>{ticks++;};
 assert.equal((await f.dispatcher.wake({owner,generation,token:'c'.repeat(64)},tick)).stale,true);
 f.put('workspace_heads',owner,{ownerId:owner,generation:'new-generation'});assert.equal((await f.dispatcher.wake({owner,generation,token:plan.token},tick)).stale,true);
 f.table('workspace_heads').delete(owner);assert.equal((await f.dispatcher.wake({owner,generation,token:plan.token},tick)).stale,true);assert.equal(ticks,0);
});
test('wake consumes occurrence once and keeps source fifteen-minute lateness rule',async()=>{
 for(const [time,outcome,count] of [['11:01','started',1],['11:16','missed',0]]){
  const f=setup(),state=scheduled(),plan=await f.stage(state);f.setNow('2026-11-14T'+time+':00Z');let ticks=0;
  const tick=async(_,now)=>{ticks++;const result=tickCloudFasting(state,captureCalendar(now,'UTC'));await f.stage(state,now);return result;};
  assert.equal((await f.dispatcher.wake({owner,generation,token:plan.token},tick)).changed,true);assert.equal((await f.dispatcher.wake({owner,generation,token:plan.token},tick)).stale,true);assert.equal(ticks,1);assert.equal(state.fasts.length,count);assert.equal(state.fastingPlan.schedules[0].lastOccurrence.outcome,outcome);
 }
});
test('an early provider wake queues a future execution instead of reusing itself',async()=>{
 const f=setup(),state=scheduled(),plan=await f.stage(state);await f.dispatcher.dispatch(owner);f.executions.get('execution1').status='processing';f.setNow('2026-11-14T10:59:00Z');
 const result=await f.dispatcher.wake({owner,generation,token:plan.token},async(_,now)=>tickCloudFasting(state,captureCalendar(now,'UTC')));assert.equal(result.changed,false);assert.equal(result.queued,true);assert.equal(f.creates.length,2);assert.equal(f.creates[1].scheduledAt,'2026-11-14T11:01:00.000Z');assert.equal(state.fasts.length,0);
});
test('scheduler request accepts private repair and exact token identity only',()=>{
 assert.deepEqual(parseSchedulerRequest(''),{kind:'repair'});assert.deepEqual(parseSchedulerRequest('{"repair":true}'),{kind:'repair'});assert.equal(parseSchedulerRequest({owner,generation,token:'a'.repeat(64)}).kind,'wake');for(const body of ['null','{}','{"owner":"owner"}',{owner,generation,token:'a'.repeat(64),now:'2020-01-01'}])assert.throws(()=>parseSchedulerRequest(body));
});
