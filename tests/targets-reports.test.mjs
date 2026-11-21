import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../server/domain/workspace.mjs';
import {applyWorkspaceCommand} from '../server/workspace-commands.mjs';
import {targetView,reportView,nutrientTargetsView} from '../server/nutrition-views.mjs';
import {projectDiaryBulkWrite,createNutrientTargetsView,projectNutrientTargetResponse} from '../server/local-diary-projection.mjs';
import {offlineSnapshot} from '../server/offline.mjs';
import {NUTRIENT_REFERENCE_SET} from '../server/domain/nutrient-references.mjs';
import {dashboardView} from '../server/dashboard-view.mjs';
import {profileSettingsView} from '../server/profile-settings.mjs';
import {targetPolicyView} from '../server/target-policy-view.mjs';
const date='2026-11-14',options={from:date,to:date,dayFilter:'all',includeToday:true,includeSupplements:true};
test('reset restores the account nutrient defaults and preserves other settings in both projections',()=>{
 const state=initialState(),defaults=initialState(),action={type:'nutrientTarget.reset',payload:{}};
 const macroTargets={calories:1830,carbs:125,netCarbohydrate:90,protein:80,fat:95};
 state.settings.targets={...macroTargets,water:3275,sodium:1400,ash:null};
 state.settings.energyUnit='kJ';state.settings.macroSchedule={'6':{protein:92,sodium:1200}};
 state.settings.macroPolicy={version:1,mode:'ratios',basis:'percent',values:{protein:30,carbohydrate:40,fat:30}};
 state.settings.carbohydratePolicy={mode:'net',netExcluded:['fiber']};
 state.settings.nutrientTargetModes={version:1,nutrients:{ash:{daily:'custom',maximum:'reference'},protein:{daily:'custom',maximum:'custom'}}};
 state.settings.nutrientDisplay={version:1,hidden:['protein','sodium'],maximums:{carbs:125,netCarbohydrate:null,sodium:600,ash:null}};
 state.settings.diaryDisplay={version:1,highlighted:['ash','sodium'],showHighlights:false,macroDisplay:'remaining'};
 state.notes.push({id:'keep',date,text:'Synthetic note'});
 const local=structuredClone(state),expected=structuredClone(state),defaultView=createNutrientTargetsView(defaults,date);
 expected.settings.targets={...macroTargets,water:defaults.settings.targets.water};
 expected.settings.nutrientTargetModes.nutrients={protein:{daily:'custom',maximum:'custom'}};
 expected.settings.nutrientDisplay={version:1,hidden:defaultView.groups.flatMap(group=>group.nutrients).filter(row=>!row.visible).map(row=>row.id),maximums:{carbs:125,netCarbohydrate:null}};
 expected.settings.diaryDisplay.highlighted=defaultView.highlighted;
 assert.throws(()=>applyWorkspaceCommand(state,{...action,payload:{targets:{}}}),{code:400});
 applyWorkspaceCommand(state,action);projectDiaryBulkWrite(local,action);
 assert.deepEqual(local,state);
 assert.deepEqual([...state.settings.nutrientDisplay.hidden].sort(),[...expected.settings.nutrientDisplay.hidden].sort());
 expected.settings.nutrientDisplay.hidden=state.settings.nutrientDisplay.hidden;
 assert.deepEqual(state,expected);applyWorkspaceCommand(state,action);assert.deepEqual(state,expected);
 applyWorkspaceCommand(defaults,action);assert.deepEqual(defaults,initialState());
});
test('reset projects cached reads from the same recorded facts and preserves server intake on a partial old copy',()=>{
 const state=initialState(),clock={now:new Date(date+'T17:00:00Z'),timeZone:'UTC'},action={type:'nutrientTarget.reset',payload:{}};
 const reference={version:1,referenceSet:NUTRIENT_REFERENCE_SET,birthDate:'1980-01-01',sex:'female',lifeStage:'standard',nutrients:['calcium']};
 Object.assign(state.settings,{nutrientReferences:reference,nutrientTargetModes:{version:1,nutrients:{calcium:{daily:'custom',maximum:'custom'}}},discover:{reportWidget:'Highlighted Nutrients'},diaryDisplay:{version:1,highlighted:['calcium','sodium'],showHighlights:true,macroDisplay:'remaining'}});
 Object.assign(state.settings.targets,{calcium:450,water:3200});
 state.foods.push({id:'item',serving:'100 g',grams:100,name:'Test',notes:'omitted',nutrients:{calories:350,sodium:100,calcium:400}});
 applyWorkspaceCommand(state,{type:'entry.add',payload:{date,foodId:'item',amount:1,group:'Lunch'}});
 const capture=s=>Object.fromEntries([
  ['nutrient-targets',nutrientTargetsView(s,date)],['targets',targetView(s,date)],
  ['profile-settings',profileSettingsView(s,date)],['target-policies',targetPolicyView(s,date,{today:date})],
  ['nutrition-report',reportView(s,options,clock)],['dashboard',dashboardView(s,{date},clock)]
 ]);
 const before=capture(state),local=offlineSnapshot(state,{ownerId:'a',generation:'g'}).state;
 projectDiaryBulkWrite(local,action);applyWorkspaceCommand(state,action);
 const expected=capture(state);
 for(const [path,view] of Object.entries(before)){
  const projected=projectNutrientTargetResponse('/api/'+path,view,local,expected[path].revision);
  if(path==='dashboard')assert.deepEqual(projected,{...expected[path],pinnedCharts:view.pinnedCharts});
  else assert.deepEqual(projected,expected[path],path);
 }
 const calcium=expected['nutrient-targets'].groups.flatMap(group=>group.nutrients).find(row=>row.id==='calcium');
 assert.equal(calcium.dailyTarget.mode,'reference');assert.equal(calcium.dailyTarget.saved.present,false);assert.ok(calcium.dailyTarget.effective>450);
 local.foods=[];
 const partialReport=projectNutrientTargetResponse('/api/nutrition-report',before['nutrition-report'],local,'latest');
 assert.equal(partialReport.report.nutrients.find(row=>row.id==='calcium').mean,400);
 const partialDashboard=projectNutrientTargetResponse('/api/dashboard',before.dashboard,local,'latest');
 assert.deepEqual(partialDashboard.summary,before.dashboard.summary);
});
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
