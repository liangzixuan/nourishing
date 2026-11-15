import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../server/domain/workspace.mjs';
import {applyWorkspaceCommand} from '../server/workspace-commands.mjs';
import {targetView,reportView} from '../server/nutrition-views.mjs';
const date='2026-11-14',options={from:date,to:date,dayFilter:'all',includeToday:true,includeSupplements:true};
test('target patches change the report without replacing unrelated settings',()=>{
 const state=initialState(),before=structuredClone(state.settings);
 applyWorkspaceCommand(state,{type:'nutrientTarget.patch',payload:{date,id:'protein',changes:{dailyTarget:123,maximum:180,visible:false}}});
 const row=targetView(state,date).nutrients.find(r=>r.id==='protein');
 assert.equal(row.dailyTarget,123);assert.equal(row.maximum,180);assert.equal(row.visible,false);
 assert.deepEqual(state.settings.groups,before.groups);assert.equal(state.settings.targets.fiber,before.targets.fiber);
 applyWorkspaceCommand(state,{type:'day.complete',payload:{date,completed:true}});
 assert.equal(reportView(state,options).report.nutrients.find(r=>r.id==='protein').meanTarget,123);
});
test('scheduled targets cannot be overwritten through the simple editor',()=>{
 const state=initialState();state.settings.macroSchedule={'6':{protein:90}};
 assert.equal(targetView(state,date).nutrients.find(r=>r.id==='protein').editor,'weekday');
 assert.throws(()=>applyWorkspaceCommand(state,{type:'nutrientTarget.patch',payload:{date,id:'protein',changes:{dailyTarget:120}}}),{code:409});
 assert.equal(state.settings.macroSchedule['6'].protein,90);
});
test('preference commands accept only supported fields and preserve target policies',()=>{
 const state=initialState(),targets=structuredClone(state.settings.targets);
 applyWorkspaceCommand(state,{type:'preferences.patch',payload:{theme:'system'}});assert.equal(state.settings.theme,'system');assert.deepEqual(state.settings.targets,targets);
 for(const payload of [{theme:'bad'},{theme:'light',ownerId:'other'},{targets:{protein:0}},{theme:null}])assert.throws(()=>applyWorkspaceCommand(state,{type:'preferences.patch',payload}));
});
test('reports distinguish unlogged days, complete zero days, and partial nutrient data',()=>{
 const state=initialState();assert.equal(reportView(state,options).report.nutrients.find(r=>r.id==='calories').mean,null);
 applyWorkspaceCommand(state,{type:'day.complete',payload:{date,completed:true}});assert.equal(reportView(state,options).report.nutrients.find(r=>r.id==='calories').mean,0);
 applyWorkspaceCommand(state,{type:'day.complete',payload:{date,completed:false}});
 state.foods.push({id:'fixture',name:'Fixture food',grams:100,serving:'100 g',nutrients:{calories:200,protein:10}});
 applyWorkspaceCommand(state,{type:'entry.add',payload:{date,foodId:'fixture',quantity:50,unit:'g',group:'Lunch'}});
 const report=reportView(state,options).report;assert.equal(report.nutrients.find(r=>r.id==='calories').mean,100);assert.equal(report.nutrients.find(r=>r.id==='fat').mean,null);
 assert.equal(reportView(state,{...options,dayFilter:'complete'}).report.counts.eligibleDays,0);
 assert.throws(()=>reportView(state,{...options,from:'2026-02-30'}),{code:400});
 assert.throws(()=>targetView(state,'bad'),{code:400});
});
test('include-today filter uses the account time zone at a UTC date boundary',()=>{
 const state=initialState(),now=new Date('2026-11-15T02:00:00Z');
 assert.equal(reportView(state,{...options,includeToday:false},{now,timeZone:'America/Chicago'}).report.counts.eligibleDays,0);
 assert.equal(reportView(state,{...options,includeToday:false},{now,timeZone:'UTC'}).report.counts.eligibleDays,1);
});
