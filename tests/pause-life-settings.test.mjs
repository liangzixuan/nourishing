import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,act} from '../server/domain/workspace.mjs';
import {calculateSummary} from '../server/domain/nutrition.mjs';
import {pauseLifeView} from '../server/pause-life-settings.mjs';
import {applyWorkspaceCommand} from '../server/workspace-commands.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {createWebHandler} from '../server/http.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';

test('Pause Life saves presentation only with canonical validation and receipt replay',async()=>{
 const seed=initialState(),date='2026-11-16';seed.foods=[{id:'food',name:'Food',grams:100,nutrients:{calories:120,protein:5,fat:4,carbs:15}}];act(seed,'entry.add',{foodId:'food',date,amount:1,group:'Lunch'});
 const fixture=diaryStoreFixture(seed),store=createWorkspaceStore(fixture.db,'fixture'),before=fixture.state(),nutrition=calculateSummary(before,date);
 assert.deepEqual(pauseLifeView(before).policy,{version:1,enabled:false,program:'galveston'});
 for(const program of ['galveston','bfb-ps'])for(const enabled of [true,false]){
  const policy={version:1,enabled,program},command={requestId:crypto.randomUUID(),revision:pauseLifeView(fixture.state()).revision,type:'pauseLife.save',payload:{policy}};
  const result=await store.command(command);assert.deepEqual(await store.command(command),result);const saved=fixture.state();assert.deepEqual(saved.settings.pauseLife,policy);assert.deepEqual(saved.entries,before.entries);assert.deepEqual(saved.foods,before.foods);assert.deepEqual({...saved.settings,pauseLife:undefined},{...before.settings,pauseLife:undefined});assert.deepEqual(calculateSummary(saved,date),nutrition);
 }
 for(const payload of [{},{policy:{version:1,enabled:true,program:'unknown'}},{policy:{version:1,enabled:'true',program:'galveston'}},{policy:{version:1,enabled:true,program:'galveston',targets:1}},{policy:null,owner:'other'}]){const state=fixture.state(),before=structuredClone(state);assert.throws(()=>applyWorkspaceCommand(state,{type:'pauseLife.save',payload}),error=>(error.status??error.code)===400);assert.deepEqual(state,before);}
});

test('Pause Life read requires auth and excludes caller owner selection',async()=>{
 const origin='https://fixture.example',states={one:initialState(),two:initialState()};states.two.settings.pauseLife={version:1,enabled:true,program:'bfb-ps'};const reads=[];
 const handler=createWebHandler({config:{origin},service:{pauseLife:async secret=>{reads.push(secret);return pauseLifeView(states[secret]);}}});
 const get=(path,secret)=>handler(new Request(origin+path,{headers:secret?{cookie:'__Host-nourishing_session='+secret}:{}}));
 assert.equal((await get('/api/pause-life')).status,401);assert.equal((await get('/api/pause-life?owner=two','one')).status,400);assert.deepEqual(reads,[]);
 assert.equal((await(await get('/api/pause-life','one')).json()).policy.enabled,false);assert.equal((await(await get('/api/pause-life','two')).json()).policy.program,'bfb-ps');assert.deepEqual(reads,['one','two']);
});
