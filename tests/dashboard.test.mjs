import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {initialState,act} from '../server/domain/workspace.mjs';
import {createDashboardView} from '../server/domain/dashboard.mjs';
import {createNutritionReportCapture} from '../server/domain/nutrition-report.mjs';
import {dashboardView,applyDashboardCommand} from '../server/dashboard-view.mjs';
const context={now:new Date('2026-11-15T12:00:00Z'),timeZone:'America/Chicago'},date='2026-11-15';
const run=(state,type,payload)=>applyDashboardCommand(state,{type,payload},context);

test('dashboard keeps original report, energy, sleep, and streak facts without filling unknowns',()=>{
 const state=initialState();state.biometrics=[{id:'sleep1',date,time:'06:00',type:'sleep',value:7.5,unit:'h'}];
 const view=dashboardView(state,{date},context),original=createDashboardView(state,view.summary.range,context);
 assert.deepEqual(view.capture,original);assert.equal(view.summary.energy,null);assert.equal(view.capture.cards.streaks.current,0);
 const expected=createNutritionReportCapture(state,{...view.energyRange,dayFilter:'all',includeToday:true,includeSupplements:true},context);
 assert.deepEqual(view.energyDays,expected.days.map(({date,totals,energy})=>({date,totals,energy})));
 assert.deepEqual(view.capture.cards.sleep,original.cards.sleep);
 assert.equal(view.capture.cards.sleep.days[0].sessionHours,7.5);assert.equal(view.capture.cards.sleep.days[0].measuredAsleepHours,null);
});
test('independent range controls and exact weight source identity survive projection',()=>{
 const state=initialState();state.biometrics=[{id:'kg1',date:'2026-10-20',time:'10:00',type:'weight',value:80,unit:'kg'},{id:'lb',date:'2026-11-14',time:'10:00',type:'weight',value:170,unit:'lb'},{id:'kg2',date,time:'10:00',type:'weight',value:78,unit:'kg'}];
 run(state,'dashboard.preferences',{patch:{energyRange:'today',weightRange:'28',reportRange:'custom',customFrom:'2026-11-01',customTo:date}});
 const view=dashboardView(state,{date},context);assert.equal(view.energyDays.length,1);assert.equal(view.summary.counts.requestedDays,15);assert.equal(view.weight.unit,'kg');assert.deepEqual(view.weight.records.map(r=>r.value),[80,78]);
 assert.throws(()=>run(state,'dashboard.preferences',{patch:{reportRange:'custom',customFrom:'2026-11-31',customTo:date}}),{status:400});assert.throws(()=>dashboardView(state,{date:'2026-02-30'},context),{status:400});
});
test('widget and news patches retain unrelated account preferences and hidden streak history',()=>{
 const state=initialState(),profile=structuredClone(state.profile);run(state,'dashboard.widgets',{patch:{sleep:false,streaks:false}});run(state,'dashboard.preferences',{patch:{newsVisible:false}});run(state,'dashboard.streakReset',{count:12});
 const view=dashboardView(state,{date},context);assert.equal(view.preferences.newsVisible,false);assert.equal(view.dashboard.widgets.energy,true);assert.equal(view.capture.cards.sleep,undefined);assert.equal(view.streaks.current,12);assert.deepEqual(state.profile,profile);
 assert.throws(()=>run(state,'dashboard.widgets',{patch:{ownerId:'other'}}),{status:400});assert.throws(()=>run(state,'dashboard.preferences',{patch:{newsVisible:'no'}}),{status:400});assert.throws(()=>run(state,'dashboard.streakReset',{count:-1}),{status:400});
});
test('dashboard capture is read-only and imported measurements retain evidence',()=>{
 const state=initialState();state.biometrics=[{id:'weight',date,type:'weight',value:75,unit:'kg',source:{provider:'fixture',recordId:'source'}}];const before=structuredClone(state);dashboardView(state,{date},context);assert.deepEqual(state,before);
});
test('dashboard provides both Consumed and Remaining average summaries',()=>{
 const state=initialState();
 state.foods=[{id:'f1',name:'Oats',serving:'100 g',grams:100,nutrients:{calories:400,protein:20,carbs:60,fat:10}}];
 act(state,'entry.add',{foodId:'f1',date,group:'Breakfast',amount:1});
 const view=dashboardView(state,{date},context);
 assert.equal(view.summaries.Consumed.energy,400);
 assert.equal(view.summaries.Consumed.rows.find(r=>r.id==='protein').mean,20);
 assert.equal(view.summaries.Remaining.energy,1600);
 assert.equal(view.summaries.Remaining.rows.find(r=>r.id==='protein').mean,80);
 run(state,'dashboard.preferences',{patch:{reportWidget:'Remaining'}});
 const remaining=dashboardView(state,{date},context);
 assert.equal(remaining.summary.widget,'Remaining');
 assert.equal(remaining.summary.energy,1600);
});
test('copied dashboard presentation modules match recorded provenance',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../docs/dashboard-ui-source.json',import.meta.url)));
 for(const row of manifest.files){const bytes=await readFile(new URL('../'+row.target,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256,row.target);}
});
