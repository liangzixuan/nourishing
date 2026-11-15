import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initialState,act} from '../server/domain/workspace.mjs';
import {digest} from '../server/data-codec.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {createDataRepository} from '../server/data-repository.mjs';
import {diaryToolsReview} from '../server/diary-tools.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';
const date='2026-11-15',owner='fixture',context={owner,asOf:'2026-11-15T12:00:00Z',timeZone:'UTC'};
function setup(){const state=initialState(),food=act(state,'food.save',{name:'Rice',serving:'100 g',grams:100,nutrients:{calories:100,protein:2}});for(const time of ['18:00','08:00'])act(state,'entry.add',{foodId:food.id,date,time,group:'Lunch',amount:1});act(state,'note.add',{date,text:'Note'});const f=diaryStoreFixture(state),store=createWorkspaceStore(f.db,owner);const input=(type,payload)=>({requestId:randomUUID(),revision:digest(f.state()),type,payload});return {...f,store,input,command:(type,payload)=>store.command(input(type,payload),async()=>null,context)};}

test('production command registry/store copies once after lost reply and rejects stale revisions and stale group facts',async()=>{
 const f=setup(),review=diaryToolsReview(f.state(),{operation:'copy',selection:{date,scope:'day'},destination:{date:'2026-11-16',group:'Dinner'}}),input=f.input('records.copy',{selection:review.selection,destination:review.destination,fingerprint:review.fingerprint,confirmed:true});
 f.lose();const saved=await f.store.command(input,async()=>null,context);assert.equal(f.state().entries.length,4);assert.equal(f.state().notes.length,2);assert.deepEqual(await f.store.command(input,async()=>{throw Error('Unexpected catalog replay');},context),saved);assert.equal(f.table('command_receipts').size,1);
 await assert.rejects(f.store.command({...input,requestId:randomUUID()},async()=>null,context),{code:409});
 const records=f.state().entries.filter(r=>r.date===date).map(row=>({collection:'entries',id:row.id,group:row.group}));await f.command('records.move-group',{date,group:'Breakfast',records});const before=f.state();await assert.rejects(f.command('records.move-group',{date,group:'Dinner',records}),{code:409});assert.deepEqual(f.state(),before);
});

test('mixed deletion is atomic on commit failure and completed-day/domain rejection',async()=>{
 const f=setup(),before=f.state(),selection={date,scope:'day'},input=f.input('records.delete',{selection,confirmed:true});f.fail();await assert.rejects(f.store.command(input,async()=>null,context),/Fixture commit failed/);assert.deepEqual(f.state(),before);assert.equal(f.table('command_receipts').size,0);
 await assert.rejects(f.command('records.delete',{selection:{date,scope:'selected',records:[{collection:'entries',id:before.entries[0].id},{collection:'notes',id:'missing'}]},confirmed:true}),{code:409});assert.deepEqual(f.state(),before);
 await f.command('day.complete',{date,completed:true});const completed=f.state();await assert.rejects(f.command('records.delete',{selection,confirmed:true}));assert.deepEqual(f.state(),completed);await f.command('day.complete',{date,completed:false});await f.command('records.delete',{selection,confirmed:true});assert.equal(f.state().entries.length,0);assert.equal(f.state().notes.length,0);
});

test('repository projects persisted order and energy settings without altering nutrient facts',async()=>{
 const f=setup();await f.command('diary.order',{mode:'time'});const state=f.state();state.settings.energyUnit='kJ';const persisted=diaryStoreFixture(state),repository=createDataRepository(persisted.db,owner),view=await repository.diary(date);
 assert.equal(view.energyUnit,'kJ');assert.equal(view.consumedEnergy,836.8);assert.deepEqual(view.entries.map(r=>r.time),['08:00','18:00']);assert.equal(view.entries[0].energyValue,418.4);assert.equal(view.entries[0].facts.nutrients.calories,100);assert.equal(view.revision,digest(state));
});
