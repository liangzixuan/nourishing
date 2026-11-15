import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initialState} from '../server/domain/workspace.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {digest} from '../server/data-codec.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';
const arm={asOf:'2026-11-14T10:00:00Z',timeZone:'UTC'};
function setup(){const f=diaryStoreFixture(initialState()),store=createWorkspaceStore(f.db,'fixture');return {...f,store,command(type,payload,context=arm){return store.command({requestId:randomUUID(),revision:digest(f.state()),type,payload},async()=>null,context);}};}
const payload=()=>({id:randomUUID(),revision:0,label:'Morning',startDate:'2026-11-14',time:'11:00',recurrence:'daily',interval:1,days:[],untilDate:null,goalHours:16,enabled:true});
test('workspace schedule, due fast and next queue intent commit together',async()=>{
 const f=setup();await f.command('fasting.schedule.save',payload());const first=f.table('fasting_dispatch').get('fixture');assert.equal(first.dueAt,'2026-11-14T11:00:00.000Z');
 assert.equal((await f.store.tickFasting({asOf:'2026-11-14T11:01:00Z',timeZone:'UTC'})).changed,true);const next=f.table('fasting_dispatch').get('fixture');assert.equal(f.state().fasts.length,1);assert.notEqual(next.token,first.token);assert.equal(next.dueAt,'2026-11-15T11:00:00.000Z');
 const schedule=f.state().fastingPlan.schedules[0];await f.command('fasting.schedule.delete',{id:schedule.id,revision:schedule.revision},{asOf:'2026-11-14T11:02:00Z',timeZone:'UTC'});assert.equal(f.table('fasting_dispatch').size,0);
});
test('failed workspace commit cannot arm a schedule; lost success reply retains one intent',async()=>{
 const f=setup();f.fail();await assert.rejects(()=>f.command('fasting.schedule.save',payload()));assert.equal(f.state().fastingPlan,undefined);assert.equal(f.table('fasting_dispatch').size,0);
 f.lose();await f.command('fasting.schedule.save',payload());assert.equal(f.table('fasting_dispatch').size,1);assert.equal(f.state().fastingPlan.schedules.length,1);
});
test('activation stages an existing schedule without changing its health state',async()=>{
 const f=setup();await f.command('fasting.schedule.save',payload());const before=f.state();f.table('fasting_dispatch').clear();assert.deepEqual(await f.store.syncFastingDispatch(arm),{scheduled:true});assert.deepEqual(f.state(),before);assert.equal(f.table('fasting_dispatch').size,1);
});
