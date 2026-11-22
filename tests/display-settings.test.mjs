import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,act} from '../server/domain/workspace.mjs';
import {applyWorkspaceCommand} from '../server/workspace-commands.mjs';
import {displayView} from '../server/display-settings.mjs';
import {createWebHandler} from '../server/http.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';

test('Display saves only canonical choices, preserves unrelated policy and uses account revision receipts',async()=>{
 const seed=initialState();seed.settings.diaryDisplay={version:1,highlighted:['fiber'],showHighlights:true,macroDisplay:'remaining'};seed.settings.fontScale=1.2;
 const fixture=diaryStoreFixture(seed),store=createWorkspaceStore(fixture.db,'fixture'),other=diaryStoreFixture(initialState(),'other');
 const before=structuredClone(fixture.state()),patch={energyUnit:'kJ',showTimestamp:false,showWater:false,diaryTable:{version:1,summaryNutrient:'protein',groupSubtotals:'macros'},diaryDisplay:{...displayView(before).settings.diaryDisplay,showHighlights:false}};
 const command={requestId:crypto.randomUUID(),revision:displayView(before).revision,type:'display.save',payload:patch};const result=await store.command(command);assert.deepEqual(await store.command(command),result);
 const saved=fixture.state();assert.equal(saved.settings.energyUnit,'kJ');assert.equal(saved.settings.showTimestamp,false);assert.equal(saved.settings.fontScale,1.2);assert.deepEqual(saved.settings.diaryTable,patch.diaryTable);assert.ok(displayView(saved).summaryNutrients.some(row=>row.id==='netCarbohydrate'));assert.deepEqual(saved.settings.diaryDisplay,{version:1,highlighted:['fiber'],showHighlights:false,macroDisplay:'remaining'});assert.deepEqual(saved.foods,before.foods);assert.equal(other.state().settings.energyUnit,undefined);
 await assert.rejects(store.command({...command,requestId:crypto.randomUUID(),payload:{theme:'light'}}),error=>(error.code??error.status)===409);
 for(const payload of [{energyUnit:'cal'},{theme:'blue'},{showTimestamp:0},{showEnergy:'false'},{diaryDisplay:{version:1}},{owner:'other'},{}, {fontScale:2.01},{fontScale:'1'},{matchDeviceFontSize:1},{diaryTable:{version:1,summaryNutrient:'unknown',groupSubtotals:'macros'}},{diaryTable:{version:1,summaryNutrient:'protein',groupSubtotals:'other'}}]){const state=fixture.state(),snapshot=structuredClone(state);assert.throws(()=>applyWorkspaceCommand(state,{type:'display.save',payload}),error=>(error.code??error.status)===400);assert.deepEqual(state,snapshot);}
});
test('Display GET is authenticated, account scoped and rejects caller ownership selectors',async()=>{
 const origin='https://fixture.example',states={one:initialState(),two:initialState()};states.two.settings.theme='light';let reads=[];const handler=createWebHandler({config:{origin},service:{display:async secret=>{reads.push(secret);if(!states[secret])throw {code:401};return displayView(states[secret]);}}});
 const get=(path,secret)=>handler(new Request(origin+path,{headers:secret?{cookie:'__Host-nourishing_session='+secret}:{}}));
 assert.equal((await get('/api/display')).status,401);assert.equal((await get('/api/display?owner=two','one')).status,400);assert.deepEqual(reads,[]);
 assert.equal((await (await get('/api/display','one')).json()).settings.theme,'dark');assert.equal((await (await get('/api/display','two')).json()).settings.theme,'light');assert.deepEqual(reads,['one','two']);
});

test('Diary preferences and renamed groups preserve canonical assignments and expand new meal logs',async()=>{
 const seed=initialState();seed.foods=[{id:'food',name:'Food',grams:100,nutrients:{calories:10}}];seed.meals=[{id:'meal',name:'Meal',items:[{foodId:'food',amount:2}]}];act(seed,'entry.add',{foodId:'food',date:'2026-11-16',group:'Lunch',amount:1});seed.notes=[{id:'note',date:'2026-11-16',group:'Lunch',text:'Note'},{id:'ungrouped',date:'2026-11-16',group:null,text:'Keep null'}];seed.biometrics=[{id:'weight',date:'2026-11-16',group:'Lunch',type:'weight',unit:'kg',value:70}];seed.repeats=[{id:'repeat',foodId:'food',group:'Lunch',amount:1,days:[1]}];
 const fixture=diaryStoreFixture(seed),store=createWorkspaceStore(fixture.db,'fixture'),save=(type,payload)=>store.command({requestId:crypto.randomUUID(),revision:displayView(fixture.state()).revision,type,payload});
 await save('display.save',{diaryGroups:{version:1,showGroups:true,hiddenGroups:['Lunch']},diaryQuickAdd:{version:1,shortcuts:[{group:'Lunch',action:'note'}]},alwaysExpandMeals:true,diaryCalendar:{version:1,food:false,exercise:true,biometric:true,note:true,fast:true}});const before=fixture.state();
 const rename={requestId:crypto.randomUUID(),revision:displayView(before).revision,type:'group.rename',payload:{from:'Lunch',to:'Midday'}};const result=await store.command(rename);assert.deepEqual(await store.command(rename),result);const renamed=fixture.state();for(const key of ['entries','biometrics','repeats'])assert.equal(renamed[key][0].group,'Midday');assert.equal(renamed.notes[0].group,'Midday');assert.equal(renamed.notes[1].group,null);assert.deepEqual(renamed.settings.diaryGroups.hiddenGroups,['Midday']);assert.equal(renamed.settings.diaryQuickAdd.shortcuts[0].group,'Midday');assert.deepEqual(renamed.foods,before.foods);assert.deepEqual(renamed.meals,before.meals);
 await save('entry.add',{mealId:'meal',date:'2026-11-16',group:'Midday',amount:1});assert.equal(fixture.state().entries.at(-1).foodId,'food');assert.equal(fixture.state().entries.at(-1).amount,2);
 for(const payload of [{diaryGroups:{version:1,showGroups:true,hiddenGroups:['foreign']}},{diaryQuickAdd:{version:1,shortcuts:[{group:'Midday',action:'foreign'}]}},{alwaysExpandMeals:'yes'},{diaryCalendar:{version:1,food:true}}]){const snapshot=fixture.state();await assert.rejects(save('display.save',payload),error=>(error.status??error.code)===400);assert.deepEqual(fixture.state(),snapshot);}
 await assert.rejects(save('group.rename',{from:'Midday',to:'Dinner'}),error=>(error.status??error.code)===409);
});

test('Font Size uses canonical range and independent browser mode without changing other preferences',async()=>{
 const fixture=diaryStoreFixture(initialState());
 const ownedStore=createWorkspaceStore(fixture.db,'fixture');
 for(const scale of [.75,1,2]){const before=fixture.state(),input={requestId:crypto.randomUUID(),revision:displayView(before).revision,type:'display.save',payload:{fontScale:scale,matchDeviceFontSize:false}};const result=await ownedStore.command(input);assert.deepEqual(await ownedStore.command(input),result);assert.equal(displayView(fixture.state()).settings.fontScale,scale);assert.equal(displayView(fixture.state()).settings.matchDeviceFontSize,false);assert.deepEqual(fixture.state().settings.targets,before.settings.targets);}
 const input={requestId:crypto.randomUUID(),revision:displayView(fixture.state()).revision,type:'display.save',payload:{matchDeviceFontSize:true}};await ownedStore.command(input);assert.equal(displayView(fixture.state()).settings.fontScale,2);assert.equal(displayView(fixture.state()).settings.matchDeviceFontSize,true);
 for(const payload of [{fontScale:.74},{fontScale:2.01},{fontScale:Infinity},{fontScale:null},{fontScale:'1.2'},{matchDeviceFontSize:'true'}])assert.throws(()=>applyWorkspaceCommand(fixture.state(),{type:'display.save',payload}),error=>(error.code??error.status)===400);
});

test('group slots preserve gaps, existing assignments and accounts with more than eight groups',async()=>{
 const {diaryGroupSlots}=await import('../server/domain/diary-group-rename.mjs');
 const fixture=diaryStoreFixture(initialState()),store=createWorkspaceStore(fixture.db,'fixture');
 const change=(slot,from,name,enabled)=>store.command({requestId:crypto.randomUUID(),revision:displayView(fixture.state()).revision,type:'group.editSlot',payload:{slot,from,name,enabled}});
 const slots=()=>diaryGroupSlots(fixture.state().settings);
 await change(8,null,'Evening',true);await change(6,null,'Afternoon',false);
 assert.deepEqual(slots(),['Uncategorized','Breakfast','Lunch','Dinner','Snacks','Afternoon',null,'Evening']);
 assert.deepEqual(fixture.state().settings.diaryGroups.hiddenGroups,['Afternoon']);
 await assert.rejects(change(6,null,'Stale',true),error=>(error.code??error.status)===409);
 await assert.rejects(change(6,'Afternoon','Lunch',true),error=>(error.code??error.status)===409);
 await change(6,'Afternoon','Tea',true);assert.equal(slots()[5],'Tea');
 assert.deepEqual(fixture.state().settings.diaryGroups.hiddenGroups,[]);
 const extended=Array.from({length:10},(_,i)=>'Name '+i);assert.deepEqual(diaryGroupSlots({groups:extended}),extended);
});
