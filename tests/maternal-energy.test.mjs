import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../server/domain/workspace.mjs';
import * as demographics from '../server/domain/profile-demographics.mjs';
import {NUTRIENT_REFERENCE_SET} from '../server/domain/nutrient-references.mjs';
import {calculateDailyNutrition} from '../server/domain/nutrition.mjs';
import {calculateDailyNutrition as packagedDay} from '../public/report-source/server/nutrition.mjs';

const date='2026-11-16';
const reference=lifeStage=>({version:1,referenceSet:NUTRIENT_REFERENCE_SET,birthDate:'1992-05-03',sex:'female',lifeStage,nutrients:[]});
function workspace(){
 const state=initialState();
 state.settings.energyPolicy={version:1,resting:{mode:'mifflin-st-jeor',adultScope:true,sex:'female',weightKg:66,heightCm:167,age:34},
  baseline:{mode:'multiplier',factor:0.375},activity:{mode:'manual'},thermicEffect:false,target:{mode:'calculated',adjustmentKcal:0,includeAboveBaseline:false},display:'remaining'};
 state.settings.macroPolicy={version:1,mode:'keto',program:'custom',leanBodyMassKg:51.3,proteinPerKg:1.5,carbohydrateGrams:30,athleticBonus:false,proteinAddition:0};
 return state;
}

test('life stage resolves for the applicable sex from saved personal and reference settings',()=>{
 const settings={nutrientReferences:reference('lactating')};
 assert.equal(demographics.profileLifeStage(settings,'female'),'lactating');
 settings.profileDemographics={sex:'female',lifeStage:'standard'};
 assert.equal(demographics.profileLifeStage(settings,'female'),'standard');
 assert.equal(demographics.profileLifeStage(settings,'male'),'standard');
 assert.equal(demographics.profileLifeStage(settings,null),null);
 assert.equal(demographics.profileLifeStage({profileDemographics:{sex:'female'}},'female'),null);
});

for(const [name,day] of [['server',calculateDailyNutrition],['packaged offline report',packagedDay]]){
 test(name+' uses maternal BMR before the baseline factor and rounds keto protein before assigning fat',()=>{
  const state=workspace();
  for(const stage of ['pregnant','lactating']){
   state.settings.profileDemographics={sex:'female',lifeStage:stage};
   for(const proteinAddition of [0,25]){
    state.settings.macroPolicy.proteinAddition=proteinAddition;
    const before=structuredClone(state.settings),result=day(state,date);
    assert.equal(result.energy.components.resting,1672.8);
    assert.equal(result.energy.components.baseline,627.28125);
    assert.equal(result.energy.target,2300.08125);
    assert.equal(result.macroTargets.targets.protein,102);
    assert.equal(result.macroTargets.targets.fat,(2300.08125-4*(102+30))/9);
    assert.deepEqual(state.settings,before);
   }
  }
 });
 test(name+' honors reviewed reference fallback, independent custom BMR, explicit targets and missing body facts',()=>{
  const state=workspace();
  state.settings.nutrientReferences=reference('pregnant');
  assert.equal(day(state,date).macroTargets.targets.protein,102);
  state.settings.energyPolicy.resting={mode:'custom',kcal:1400};
  assert.equal(day(state,date).energy.components.baseline,525);
  assert.equal(day(state,date).macroTargets.targets.protein,102);
  state.settings.macroSchedule={1:{calories:1900,protein:83}};
  assert.equal(day(state,date).energy.target,1900);
  assert.equal(day(state,date).macroTargets.targets.protein,83);
  delete state.settings.macroSchedule;
  state.settings.macroPolicy.leanBodyMassKg=null;
  assert.equal(day(state,date).macroTargets.targets.protein,null);
  assert.equal(day(state,date).macroTargets.targets.fat,null);
  state.settings.macroPolicy=null;
  state.settings.targets.protein=73;
  assert.equal(day(state,date).macroTargets.targets.protein,73);
  state.settings.energyPolicy.resting=workspace().settings.energyPolicy.resting;
  state.settings.energyPolicy.resting={...state.settings.energyPolicy.resting,mode:'mifflin-st-jeor-birthday',birthDate:'2020-01-01'};
  delete state.settings.energyPolicy.resting.age;
  assert.equal(day(state,date).energy.expenditure,null);
 });
}

test('known keto allocations use whole grams and clamp residual fat to zero when energy is exhausted',()=>{
 const state=workspace();
 state.settings.profileDemographics={sex:'female',lifeStage:'lactating'};
 state.settings.macroPolicy.carbohydrateGrams=30.5;
 state.settings.energyPolicy.target={mode:'fixed',includeAboveBaseline:false};
 state.settings.targets.calories=500;
 for(const project of [calculateDailyNutrition,packagedDay]){
  const {macroTargets,energy}=project(state,date);
  assert.equal(energy.target,500);
  assert.deepEqual(macroTargets.targets,{protein:102,carbohydrate:31,fat:0});
  assert.ok(!macroTargets.reasons.some(row=>row.code==='fatExceeded'));
 }
});

test('a queued profile change recalculates diary targets from the durable offline snapshot',async()=>{
 const {buildLocalDiary}=await import('../scripts/package-local-diary.mjs');
 await buildLocalDiary();
 const {projectLocalDiary,applyProfileSettingsProjection}=await import('../public/local-diary-projection.js');
 const {offlineSnapshot}=await import('../server/offline.mjs');
 const {applyProfileSettingsCommand}=await import('../server/profile-settings.mjs');
 const {calculateSummary}=await import('../server/domain/nutrition.mjs');
 const server=workspace(),device=structuredClone(offlineSnapshot(server,{ownerId:'fixture',generation:'one'}).state);
 const clock={now:new Date(date+'T12:00:00Z'),timeZone:'UTC'};
 for(const value of ['pregnant','lactating','female','male']){
  const action={type:'profileSettings.demographic',payload:{field:'sex',value,date}};
  applyProfileSettingsProjection(device,action);
  applyProfileSettingsCommand(server,action);
  const local=projectLocalDiary(device,date,{},clock),expected=calculateSummary(server,date);
  assert.deepEqual(local.summary.energy,expected.energy);
  assert.deepEqual(local.summary.macroTargets,expected.macroTargets);
  assert.equal(local.summary.macroTargets.targets.protein,['pregnant','lactating'].includes(value)?102:77);
 }
});
