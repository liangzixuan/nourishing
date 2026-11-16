import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../server/domain/workspace.mjs';
import {applyWorkspaceCommand} from '../server/workspace-commands.mjs';
import {displayView} from '../server/display-settings.mjs';
import {createWebHandler} from '../server/http.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';

test('Display saves only canonical choices, preserves unrelated policy and uses account revision receipts',async()=>{
 const seed=initialState();seed.settings.diaryDisplay={version:1,highlighted:['fiber'],showHighlights:true,macroDisplay:'remaining'};seed.settings.fontScale=1.2;
 const fixture=diaryStoreFixture(seed),store=createWorkspaceStore(fixture.db,'fixture'),other=diaryStoreFixture(initialState(),'other');
 const before=structuredClone(fixture.state()),patch={energyUnit:'kJ',showTimestamp:false,showWater:false,diaryDisplay:{...displayView(before).settings.diaryDisplay,showHighlights:false}};
 const command={requestId:crypto.randomUUID(),revision:displayView(before).revision,type:'display.save',payload:patch};const result=await store.command(command);assert.deepEqual(await store.command(command),result);
 const saved=fixture.state();assert.equal(saved.settings.energyUnit,'kJ');assert.equal(saved.settings.showTimestamp,false);assert.equal(saved.settings.fontScale,1.2);assert.deepEqual(saved.settings.diaryDisplay,{version:1,highlighted:['fiber'],showHighlights:false,macroDisplay:'remaining'});assert.deepEqual(saved.foods,before.foods);assert.equal(other.state().settings.energyUnit,undefined);
 await assert.rejects(store.command({...command,requestId:crypto.randomUUID(),payload:{theme:'light'}}),error=>(error.code??error.status)===409);
 for(const payload of [{energyUnit:'cal'},{theme:'blue'},{showTimestamp:0},{showEnergy:'false'},{diaryDisplay:{version:1}},{owner:'other'},{}, {fontScale:2}]){const state=fixture.state(),snapshot=structuredClone(state);assert.throws(()=>applyWorkspaceCommand(state,{type:'display.save',payload}),error=>(error.code??error.status)===400);assert.deepEqual(state,snapshot);}
});
test('Display GET is authenticated, account scoped and rejects caller ownership selectors',async()=>{
 const origin='https://fixture.example',states={one:initialState(),two:initialState()};states.two.settings.theme='light';let reads=[];const handler=createWebHandler({config:{origin},service:{display:async secret=>{reads.push(secret);if(!states[secret])throw {code:401};return displayView(states[secret]);}}});
 const get=(path,secret)=>handler(new Request(origin+path,{headers:secret?{cookie:'__Host-nourishing_session='+secret}:{}}));
 assert.equal((await get('/api/display')).status,401);assert.equal((await get('/api/display?owner=two','one')).status,400);assert.deepEqual(reads,[]);
 assert.equal((await (await get('/api/display','one')).json()).settings.theme,'dark');assert.equal((await (await get('/api/display','two')).json()).settings.theme,'light');assert.deepEqual(reads,['one','two']);
});
