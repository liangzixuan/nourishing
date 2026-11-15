import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initialState} from '../server/domain/workspace.mjs';
import {saveFastingSchedule,tickFastingSchedules} from '../server/domain/fasting-schedules.mjs';
import {parseReminderSchedule,dueReminderEvent,nextReminderDue,eligibleReminderEvent} from '../server/reminder-schedules.mjs';
import {createWebPushStore} from '../server/web-push-store.mjs';
import {createReminderScheduleStore} from '../server/reminder-schedules-store.mjs';
import {createReminderWorker} from '../server/reminder-schedules-worker.mjs';
import {createAccountLifecycle} from '../server/account-lifecycle.mjs';
import {owner,origin,vapid,subscription,reminderFixture} from './fixtures/reminder-schedules.mjs';
const draft=(extra={})=>({creationId:randomUUID(),label:'Food reminder',kind:'daily',time:'07:00',days:[4],timeZone:'America/Chicago',enabled:true,...extra});
const schedule=extra=>parseReminderSchedule(draft(extra),{now:new Date('2026-01-01T00:00:00Z')});
const preferences=schedules=>({paused:false,resumedAt:'2026-01-01T00:00:00Z',schedules});
async function ready({state=initialState(),send=async()=>({statusCode:201}),extra={}}={}){
 const f=reminderFixture(state),options={db:f.db,ownerId:owner,origin,vapid,now:f.now,send},push=createWebPushStore(options),store=createReminderScheduleStore(options);
 await push.subscribe({subscription:subscription(),label:'Pixel'});let current=await store.status();await store.save({revision:current.revision,schedule:draft(extra)});current=await store.status();await store.settings({revision:current.revision,paused:false});return {...f,store,push,options};
}

test('source daily rules retain exact 15-minute late boundary and prohibit retroactive resume',()=>{
 const state=initialState(),row=schedule(),prefs=preferences([row]);
 assert.equal(dueReminderEvent(row,state,new Date('2026-10-29T12:15:00Z')).key,'daily:2026-10-29');
 assert.equal(dueReminderEvent(row,state,new Date('2026-10-29T12:15:00.001Z')),null);
 assert.equal(eligibleReminderEvent(row,state,{...prefs,resumedAt:'2026-10-29T12:01:00Z'},new Date('2026-10-29T12:01:30Z')),null);
 assert.equal(nextReminderDue(state,prefs,new Date('2026-10-29T11:59:00Z')),'2026-10-29T12:00:00.000Z');
});
test('next wake uses canonical local weekdays, skips DST gaps and preserves the repeated-hour date key',()=>{
 const state=initialState(),spring=schedule({time:'02:30',days:[0]});
 assert.equal(nextReminderDue(state,preferences([spring]),new Date('2026-03-08T06:00:00Z')),'2026-03-15T07:30:00.000Z');
 const fall=schedule({time:'01:30',days:[0]});assert.equal(nextReminderDue(state,preferences([fall]),new Date('2026-11-01T06:31:00Z'),{after:true}),'2026-11-01T07:30:00.000Z');
 assert.equal(dueReminderEvent(fall,state,new Date('2026-11-01T06:31:00Z')).key,dueReminderEvent(fall,state,new Date('2026-11-01T07:31:00Z')).key);
});
test('source food, weight and fasting-goal conditions remain authoritative',()=>{
 const state=initialState(),food=schedule({foodCondition:{group:'Breakfast'}});state.entries.push({kind:'food',date:'2026-10-29',group:'Breakfast'});assert.equal(dueReminderEvent(food,state,new Date('2026-10-29T12:00:00Z')),null);
 const metric={kind:'biometric',type:'Weight',unit:'kg'},weight=schedule({kind:'weight',weightMetric:metric});state.biometrics.push({date:'2026-10-22',type:'Weight',unit:'kg',value:70});assert.ok(dueReminderEvent(weight,state,new Date('2026-10-29T12:00:00Z')));assert.equal(nextReminderDue(state,preferences([weight]),new Date('2026-10-28T12:00:00Z')),'2026-10-29T12:00:00.000Z');
 const fasting=schedule({kind:'fasting'});state.fasts.push({id:'fast',start:'2026-10-29T11:00:00Z',end:null,goalHours:1});assert.equal(dueReminderEvent(fasting,state,new Date('2026-10-29T12:00:00Z')).key,'fast:fast');
});
test('scheduled-start reminder waits for canonical fast creation',()=>{
 const state=initialState(),now=new Date('2026-11-01T12:59:00Z'),row=schedule({kind:'fasting-start',timeZone:'UTC'});
 saveFastingSchedule(state,{id:randomUUID(),revision:0,label:'Start',timeZone:'UTC',startDate:'2026-11-01',time:'13:00',recurrence:'once',days:[],untilDate:null,goalHours:1,enabled:true,confirmed:true},now);
 assert.equal(nextReminderDue(state,preferences([row]),now),'2026-11-01T13:00:00.000Z');assert.equal(dueReminderEvent(row,state,new Date('2026-11-01T13:00:00Z')),null);
 tickFastingSchedules(state,new Date('2026-11-01T13:00:00Z'));assert.ok(dueReminderEvent(row,state,new Date('2026-11-01T13:00:00Z')));
});
test('saving schedules stays paused, and resume requires a connected browser and current revision',async()=>{
 const f=reminderFixture(),store=createReminderScheduleStore({db:f.db,ownerId:owner,origin,vapid,now:f.now});
 await store.save({revision:0,schedule:draft()});let value=await store.status();assert.equal(value.paused,true);assert.equal(f.table('reminder_dispatch').size,0);
 await assert.rejects(()=>store.settings({revision:value.revision,paused:false}),/Connect/);await assert.rejects(()=>store.remove({revision:0,id:value.schedules[0].id}),{code:409});
 await store.remove({revision:value.revision,id:value.schedules[0].id});assert.equal((await store.status()).schedules.length,0);
});
test('scheduled send has a durable claim, remains generic and does not repeat across worker instances',async()=>{
 const sent=[],f=await ready({send:async(...args)=>{assert.ok([...f.table('push_deliveries').values()].some(row=>row.outcome==='sending'));sent.push(args);return {statusCode:201};}});
 f.setTime('2026-10-29T12:01:00Z');assert.equal((await f.store.tick()).attempted,1);assert.equal((await createReminderScheduleStore(f.options).tick()).attempted,0);assert.equal(sent.length,1);assert.deepEqual(Object.keys(JSON.parse(sent[0][1])).sort(),['tag','version']);
 assert.equal(f.table('reminder_dispatch').get(owner).dueAt,'2026-11-05T13:00:00.000Z');assert.equal((await f.store.status()).paused,false);
});
test('lost claim reply and lost result update never resend an uncertain occurrence',async()=>{
 let sends=0;const f=await ready({send:async()=>{sends++;return {statusCode:201};}});f.setTime('2026-10-29T12:01:00Z');f.lose();await f.store.tick();await f.store.tick();assert.equal(sends,0);
 const g=await ready({send:async()=>{sends++;return {statusCode:201};}});g.setTime('2026-10-29T12:01:00Z');g.failReceipt();await assert.rejects(()=>g.store.tick(),/Receipt update/);await g.store.tick();assert.equal(sends,1);
});
test('pause before wake prevents delivery; private worker honors account deletion lifecycle',async()=>{
 let sends=0;const f=await ready({send:async()=>{sends++;return {statusCode:201};}}),lifecycle=createAccountLifecycle({db:f.db,now:f.now});await lifecycle.initialize(owner);
 const worker=createReminderWorker({db:f.db,functions:f.functions,lifecycle,origin,vapid,clock:f.clock,send:f.options.send});await worker.dispatch(owner);assert.equal(f.executions.length,1);
 const request=JSON.parse(f.executions[0].body);f.setTime('2026-10-29T12:01:00Z');await lifecycle.claim(owner,'delete-job');await assert.rejects(()=>worker.run(request),{code:409});assert.equal(sends,0);assert.equal(f.table('push_deliveries').size,0);
 const g=await ready({send:async()=>{sends++;return {statusCode:201};}});let status=await g.store.status();await g.store.settings({revision:status.revision,paused:true});g.setTime('2026-10-29T12:01:00Z');assert.equal((await g.store.tick()).attempted,0);assert.equal(g.table('reminder_dispatch').size,0);assert.equal(sends,0);
});
test('bounded batches advance past claimed events instead of starving remaining devices',async()=>{
 let sends=0;const f=await ready({send:async()=>{sends++;return {statusCode:201};}});
 for(let i=1;i<5;i++)await f.push.subscribe({subscription:subscription('device-'+i),label:'Browser '+i});
 for(let i=1;i<8;i++){const current=await f.store.status();await f.store.save({revision:current.revision,schedule:draft({label:'Reminder '+i})});}
 f.setTime('2026-10-29T12:01:00Z');const first=await f.store.tick();assert.deepEqual(first,{attempted:32,more:true});assert.equal(f.table('reminder_dispatch').get(owner).dueAt,'2026-10-29T12:00:00.000Z');
 assert.deepEqual(await f.store.tick(),{attempted:8,more:false});assert.equal(sends,40);assert.equal(f.table('push_deliveries').size,40);
});
test('delayed worker delivers within the lifecycle and ignores a replaced token',async()=>{
 let sends=0;const f=await ready({send:async()=>{sends++;return {statusCode:201};}}),lifecycle=createAccountLifecycle({db:f.db,now:f.now});await lifecycle.initialize(owner);
 const worker=createReminderWorker({db:f.db,functions:f.functions,lifecycle,origin,vapid,clock:f.clock,send:f.options.send});await worker.dispatch(owner);const request=JSON.parse(f.executions[0].body);f.setTime('2026-10-29T12:01:00Z');
 assert.equal((await worker.run(request)).attempted,1);assert.equal(sends,1);assert.equal(f.table('account_operations').size,0);assert.equal((await worker.run(request)).stale,true);assert.equal(sends,1);
 await assert.rejects(()=>worker.run({...request,ownerId:'another-account'}),{code:400});
});
test('device removal, reconnect and expiration change reminder intent in the same commit',async()=>{
 const f=await ready(),connected=(await f.push.status()).devices[0];assert.ok(f.table('reminder_dispatch').has(owner));
 await f.push.unsubscribe({id:connected.id});assert.equal(f.table('reminder_dispatch').size,0);assert.equal((await f.store.status()).paused,false);
 const again=await f.push.subscribe({subscription:subscription('reconnected'),label:'Again'});assert.ok(f.table('reminder_dispatch').has(owner));
 const expired=createWebPushStore({...f.options,send:async()=>({statusCode:410})});await expired.test({deviceId:again.deviceId,requestId:randomUUID()});assert.equal(f.table('reminder_dispatch').size,0);assert.equal((await f.push.status()).devices.length,0);
});

test('cloud-verifier expired subscription path reserves one receipt without invoking transport',async()=>{
 let sends=0;const f=await ready({send:async()=>{sends++;throw Error('Expired fixture must never reach transport');}});
 const account=f.table('push_accounts').get(owner),payload=JSON.parse(account.payload);payload.devices[0].subscription.expirationTime=f.now()-60000;account.payload=JSON.stringify(payload);
 const lifecycle=createAccountLifecycle({db:f.db,now:f.now});await lifecycle.initialize(owner);
 const worker=createReminderWorker({db:f.db,functions:f.functions,lifecycle,origin,vapid,clock:f.clock,send:f.options.send});await worker.dispatch(owner);const request=JSON.parse(f.executions[0].body);f.setTime('2026-10-29T12:01:00Z');
 assert.equal((await worker.run(request)).attempted,1);assert.equal(sends,0);
 const receipts=[...f.table('push_deliveries').values()];assert.equal(receipts.length,1);assert.equal(receipts[0].outcome,'expired');assert.equal(receipts[0].statusCode,0);
 assert.equal(f.table('reminder_dispatch').size,0);assert.equal((await f.push.status()).devices.length,0);assert.equal((await worker.run(request)).stale,true);assert.equal(f.table('account_operations').size,0);
});
