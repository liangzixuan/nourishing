import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,act} from '../server/domain/workspace.mjs';
import {applyWorkspaceCommand} from '../server/workspace-commands.mjs';
import {displayView} from '../server/display-settings.mjs';
import {projectLocalDiary} from '../server/local-diary-projection.mjs';
import {offlineSnapshot} from '../server/offline.mjs';
import {parseWaterSettings,resolveWaterSettings,waterToMilliliters,waterFromMilliliters} from '../server/domain/water-settings.mjs';

test('Water settings keep drinking volumes separate from nutrient targets and hide only diary rows',()=>{
 const state=initialState(),day='2026-11-20',targets=structuredClone(state.settings.targets);
 const policy={...resolveWaterSettings(state.settings),group:'Lunch',unit:'fl oz',goalMl:waterToMilliliters(64,'fl oz'),containerMl:waterToMilliliters(8,'fl oz'),showEntries:false};
 applyWorkspaceCommand(state,{type:'display.save',payload:{waterSettings:policy}});
 applyWorkspaceCommand(state,{type:'water.add',payload:{date:day,time:'12:00',group:'Lunch',amount:policy.containerMl}});
 assert.deepEqual(state.settings.targets,targets);
 assert.equal(state.biometrics[0].group,'Lunch');
 const diary=projectLocalDiary(state,day),local=projectLocalDiary(offlineSnapshot(state,{ownerId:'fixture',generation:'fixture'}).state,day);
 assert.deepEqual(local.summary,diary.summary);
 assert.equal(diary.presentation.settings.waterSettings.goalMl,1892.705892);
 assert.equal(diary.summary.hydration.logged,236.5882);
 assert.equal(diary.biometrics.length,1);
 assert.equal(diary.recordDisplay.groups.flatMap(group=>group.records).length,0);
 applyWorkspaceCommand(state,{type:'display.save',payload:{waterSettings:{...policy,showEntries:true}}});
 assert.equal(projectLocalDiary(state,day).recordDisplay.groups.flatMap(group=>group.records).length,1);
 act(state,'group.rename',{from:'Lunch',to:'Midday'});
 assert.equal(state.settings.waterSettings.group,'Midday');
 assert.equal(state.biometrics[0].group,'Midday');
 assert.equal(displayView(state).settings.waterSettings.group,'Midday');
});

test('Water units preserve volume and reject invalid settings and destinations',()=>{
 const state=initialState(),policy=resolveWaterSettings(state.settings);
 assert.equal(waterToMilliliters(8,'fl oz'),236.5882365);
 assert.equal(waterFromMilliliters(waterToMilliliters(1,'cup'),'fl oz'),8);
 assert.equal(waterFromMilliliters(waterToMilliliters(250,'mL'),'mL'),250);
 for(const patch of [{unit:'oz'},{group:'Missing'},{containerMl:0},{goalMl:Infinity},{showEntries:'yes'},{extra:true}])assert.throws(()=>parseWaterSettings({...policy,...patch},state.settings.groups),error=>error.status===400);
 assert.throws(()=>applyWorkspaceCommand(state,{type:'water.add',payload:{date:'2026-11-20',group:'Missing',amount:250}}));
 assert.equal(state.biometrics.length,0);
});
