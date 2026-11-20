import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLocalDiary} from '../scripts/package-local-diary.mjs';
import {initialState,act} from '../server/domain/workspace.mjs';
import {createDataRepository} from '../server/data-repository.mjs';
import {offlineSnapshot} from '../server/offline.mjs';
await buildLocalDiary();
const {projectLocalDiary}=await import('../public/local-diary-projection.js');
test('local diary uses canonical settings, nutrient totals, record visibility and order',()=>{
 const state=initialState(),date='2026-11-15',clock={now:new Date(date+'T18:00:00Z'),timeZone:'UTC'};
 state.foods=[{id:'food',name:'Rice',grams:100,nutrients:{calories:100,protein:5}}];
 act(state,'entry.add',{foodId:'food',date,group:'Lunch',amount:2});
 act(state,'note.add',{date,group:'Lunch',text:'Note'});
 const repository=createDataRepository({},'fixture'),template=repository.diaryFromState(state,date,clock);
 act(state,'settings.save',{theme:'system',energyUnit:'kJ',showWater:false,showMacros:false,diaryTable:{version:1,summaryNutrient:'protein',groupSubtotals:'summary'},diaryGroups:{version:1,showGroups:true,hiddenGroups:['Breakfast']}});
 act(state,'group.rename',{from:'Lunch',to:'Midday'});
 const expected=repository.diaryFromState(state,date,clock),local=projectLocalDiary(state,date,{...template,revision:expected.revision},clock);
 assert.deepEqual(local,expected);assert.equal(local.summary.diaryTable.policy.groupSubtotals,'summary');assert.equal(local.theme,'system');assert.equal(local.energyUnit,'kJ');assert.equal(local.presentation.settings.showMacros,false);assert.equal(local.entries[0].energyValue,836.8);assert.equal(local.recordDisplay.groups.find(row=>row.name==='Midday').records[0].collection,'notes');
 const other=projectLocalDiary(state,'2026-11-14',{...template,cycleDays:[{phase:'fixture'}]},clock);assert.deepEqual(other.cycleDays,[]);assert.equal(other.entries.length,0);
});

test('device snapshot preserves the display and fasting state used by the normal diary',()=>{
 const state=initialState(),date='2026-11-20',clock={now:new Date(date+'T18:00:00Z'),timeZone:'UTC'};
 act(state,'settings.save',{theme:'system',showWater:false,showMacros:false,discover:{fastingDiary:false},diaryQuickAdd:{version:1,shortcuts:[{group:'Lunch',action:'note'}]},profileDemographics:{birthDate:'1990-01-01',sex:'male'}});
 act(state,'note.add',{date,group:'Lunch',text:'Meal note'});state.notes[0].imageId='a'.repeat(64);
 const snapshot=offlineSnapshot(state,{ownerId:'fixture',generation:'one'});
 const expected=createDataRepository({},'fixture').diaryFromState(state,date,clock);
 assert.deepEqual(projectLocalDiary(snapshot.state,date,expected,clock),expected);
 assert.deepEqual(snapshot.state.settings,state.settings);
 assert.equal(snapshot.state.notes[0].imageId,state.notes[0].imageId);
});
