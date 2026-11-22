import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,act} from '../server/domain/workspace.mjs';
import {prepareProfileSettingsCommand,profileSettingsView,applyProfileSettingsCommand} from '../server/profile-settings.mjs';

const resting={mode:'mifflin-st-jeor-birthday',adultScope:true,sex:'male',birthDate:'1990-11-15',heightCm:180,weightKg:80};
const energy=()=>({resting,baseline:{mode:'multiplier',factor:0.375}});
function run(state,type,payload){const command=prepareProfileSettingsCommand(state,{type,payload});act(state,command.type,command.payload);}

test('new account energy uses original equation and birthday projection',()=>{
 const state=initialState();run(state,'profileSettings.energy',energy());
 const before=profileSettingsView(state,'2026-11-14'),after=profileSettingsView(state,'2026-11-15');
 assert.equal(before.effectiveEnergy.components.resting,1755);
 assert.equal(after.effectiveEnergy.components.resting,1750);
 assert.equal(before.effectiveEnergy.target,1755*1.375);
 assert.equal(before.energy.activity.mode,'manual');
});
test('body edits retain target, device, macro, and imported settings',()=>{
 const state=initialState();run(state,'profileSettings.energy',energy());
 state.settings.energyPolicy={...state.settings.energyPolicy,target:{mode:'fixed',includeAboveBaseline:true},activity:{mode:'health-connect',zone:'America/Chicago'},thermicEffect:true,display:'balance'};
 state.settings.macroPolicy={version:1,mode:'ratios',basis:'percent',values:{protein:25,carbohydrate:45,fat:30}};
 const previous=structuredClone(state.settings);run(state,'profileSettings.energy',{resting:{...resting,weightKg:81},baseline:{mode:'custom',kcal:250}});
 for(const key of ['target','activity','thermicEffect','display'])assert.deepEqual(state.settings.energyPolicy[key],previous.energyPolicy[key]);
 for(const [key,value]of Object.entries(previous))if(key!=='energyPolicy')assert.deepEqual(state.settings[key],value);
});
test('reference selection uses original population values and preserves fixed targets',()=>{
 const state=initialState(),view=profileSettingsView(state,'2026-11-14'),targets=structuredClone(state.settings.targets);
 const policy={version:1,referenceSet:view.referenceSet,birthDate:'1990-01-01',sex:'female',lifeStage:'standard',nutrients:['calcium']};
 run(state,'profileSettings.references',{policy});const result=profileSettingsView(state,'2026-11-14');
 assert.equal(result.referenceProjection.values.calcium,1000);assert.deepEqual(state.settings.targets,targets);
 run(state,'profileSettings.references',{policy:null});assert.equal(state.settings.nutrientReferences,undefined);
});
test('recorded metric mappings use original body projection without inventing readings',()=>{
 const state=initialState(),weightMetric={kind:'biometric',type:'Weight',unit:'lb'},heightMetric={kind:'biometric',type:'Height',unit:'in'};
 run(state,'profileSettings.body',{policy:{version:2,weightMetric,heightMetric,bodyFatMetric:null,useForResting:true,useHeightForResting:true,useForKeto:false}});
 assert.equal(profileSettingsView(state,'2026-11-14').composition.weightKg,null);
 state.biometrics.push({date:'2026-11-13',type:'Weight',unit:'lb',value:176},{date:'2026-11-13',type:'Height',unit:'in',value:70});
 const view=profileSettingsView(state,'2026-11-14');assert.equal(view.composition.weightKg,79.83225712);assert.equal(view.composition.heightCm,177.8);
});
test('invalid and overbroad edits fail without changing state',()=>{
 const state=initialState(),before=structuredClone(state);
 for(const payload of [{...energy(),targets:{}},{...energy(),resting:{...resting,adultScope:false}},{...energy(),resting:{...resting,heightCm:0}},{...energy(),baseline:{mode:'multiplier',factor:0.7}}])assert.throws(()=>run(state,'profileSettings.energy',payload),{status:400});
 assert.throws(()=>run(state,'profileSettings.body',{policy:{version:2,weightMetric:null,heightMetric:null,bodyFatMetric:null,useForResting:true,useHeightForResting:false,useForKeto:false}}),{status:400});
 assert.deepEqual(state,before);
});

test('Profile summary uses explicit policies, exact series and canonical BMI, preserving unknown and zero',()=>{
 const state=initialState();assert.deepEqual(profileSettingsView(state,'2026-11-14').profile.demographics,{source:null,age:null,sex:null,birthDate:null,lifeStage:null});
 assert.equal(profileSettingsView(state,'2026-11-14').profile.measurements.weight.value,null);
 run(state,'profileSettings.energy',energy());
 run(state,'profileSettings.body',{policy:{version:2,weightMetric:{kind:'biometric',type:'Morning mass',unit:'lb'},heightMetric:{kind:'biometric',type:'Height',unit:'in'},bodyFatMetric:{kind:'biometric',type:'Fat',unit:'%'},useForResting:false,useHeightForResting:false,useForKeto:false}});
 state.biometrics.push({date:'2026-11-13',type:'Morning mass',unit:'lb',value:176},{date:'2026-11-13',type:'Height',unit:'in',value:70},{date:'2026-11-13',type:'Fat',unit:'%',value:0},{date:'2026-11-14',type:'weight',unit:'kg',value:99});
 let view=profileSettingsView(state,'2026-11-14').profile;assert.equal(view.demographics.age,35);assert.equal(view.measurements.weight.value,176);assert.equal(view.measurements.weight.unit,'lb');assert.deepEqual(view.measurements.weight.choice,{selection:{kind:'metric',type:'Morning mass',unit:'lb'},unit:'lb'});assert.equal(view.measurements.bodyFat.value,0);assert.ok(Math.abs(view.bmi-79.83225712/(1.778*1.778))<1e-8);
 state.biometrics.push({date:'2026-11-14',type:'Morning mass',unit:'lb',value:0});view=profileSettingsView(state,'2026-11-14').profile;assert.equal(view.measurements.weight.status,'invalid');assert.equal(view.measurements.weight.value,null);assert.equal(view.bmi,null);
});

test('Profile age and sex use reference policy only when no resting equation exists',()=>{
 const state=initialState(),view=profileSettingsView(state,'2026-11-14');run(state,'profileSettings.references',{policy:{version:1,referenceSet:view.referenceSet,birthDate:'1990-11-15',sex:'female',lifeStage:'standard',nutrients:['calcium']}});
 assert.deepEqual(profileSettingsView(state,'2026-11-14').profile.demographics,{source:'references',age:35,sex:'female',birthDate:'1990-11-15',lifeStage:'standard'});
 run(state,'profileSettings.energy',energy());assert.equal(profileSettingsView(state,'2026-11-14').profile.demographics.sex,'male');assert.equal(state.settings.nutrientReferences.sex,'female');
});


test('direct profile demographics save independently without inventing other facts or energy policy',()=>{
 const state=initialState(),before=structuredClone(state.settings);
 applyProfileSettingsCommand(state,{type:'profileSettings.demographic',payload:{field:'birthDate',value:'1990-11-15',date:'2026-11-16'}});
 let profile=profileSettingsView(state,'2026-11-16').profile;
 assert.equal(profile.demographics.age,36);assert.equal(profile.demographics.sex,null);assert.equal(state.settings.energyPolicy,undefined);
 applyProfileSettingsCommand(state,{type:'profileSettings.demographic',payload:{field:'sex',value:'female',date:'2026-11-16'}});
 profile=profileSettingsView(state,'2026-11-16').profile;assert.equal(profile.demographics.sex,'female');
 for(const [key,value]of Object.entries(before))assert.deepEqual(state.settings[key],value);
 state.settings.nutrientTargetModes={version:1,nutrients:{calcium:{daily:'reference'}}};
 assert.equal(profileSettingsView(state,'2026-11-16').profile.demographics.birthDate,'1990-11-15');
 assert.equal(profileSettingsView(state,'2026-11-16').profile.demographics.sex,'female');
 assert.equal(state.settings.nutrientReferences,undefined);
 assert.throws(()=>applyProfileSettingsCommand(state,{type:'profileSettings.demographic',payload:{field:'birthDate',value:'2030-01-01',date:'2026-11-16'}}),{status:400});
});
test('direct birthday and sex synchronize existing demographic policy inputs but preserve their scope',()=>{
 const state=initialState();run(state,'profileSettings.energy',energy());
 run(state,'profileSettings.references',{policy:{version:1,referenceSet:profileSettingsView(state,'2026-11-16').referenceSet,birthDate:'1990-11-15',sex:'male',lifeStage:'standard',nutrients:['calcium']}});
 const prior=structuredClone(state.settings);
 applyProfileSettingsCommand(state,{type:'profileSettings.demographic',payload:{field:'birthDate',value:'1991-11-15',date:'2026-11-16'}});
 assert.equal(state.settings.energyPolicy.resting.birthDate,'1991-11-15');assert.equal(state.settings.nutrientReferences.birthDate,'1991-11-15');
 assert.deepEqual(state.settings.energyPolicy.target,prior.energyPolicy.target);assert.deepEqual(state.settings.nutrientReferences.nutrients,['calcium']);
 applyProfileSettingsCommand(state,{type:'profileSettings.demographic',payload:{field:'sex',value:'female',date:'2026-11-16'}});
 assert.equal(state.settings.energyPolicy.resting.sex,'female');assert.equal(state.settings.nutrientReferences.sex,'female');
});
test('direct measurements atomically select their series, retain custom type and switches, and reject invalid values',()=>{
 const state=initialState();
 const save=(kind,value,unit)=>applyProfileSettingsCommand(state,{type:'profileSettings.measurement',payload:{kind,value,unit,date:'2026-11-16',time:'12:30'}});
 save('weight',80,'kg');save('height',180,'cm');save('bodyFat',0,'%');
 let view=profileSettingsView(state,'2026-11-16');assert.equal(view.profile.measurements.bodyFat.value,0);assert.equal(view.profile.bmi,80/1.8/1.8);assert.equal(state.settings.bodyComposition.useForResting,false);
 state.settings.bodyComposition.weightMetric.type='Morning mass';state.settings.bodyComposition.useForResting=true;
 save('weight',180,'lb');assert.equal(state.biometrics.at(-1).type,'Morning mass');assert.equal(state.settings.bodyComposition.weightMetric.unit,'lb');assert.equal(state.settings.bodyComposition.useForResting,true);
 const before=structuredClone(state);assert.throws(()=>save('height',0,'cm'),{status:400});assert.throws(()=>save('bodyFat',101,'%'),{status:400});assert.throws(()=>save('weight',1,'cm'),{status:400});assert.deepEqual(state,before);
});

test('changing the profile life stage updates the active population without changing custom targets',()=>{
 const state=initialState(),date='2026-11-16';
 run(state,'profileSettings.references',{policy:{version:1,referenceSet:profileSettingsView(state,date).referenceSet,birthDate:'1992-02-02',sex:'female',lifeStage:'lactating',nutrients:['iron','folate']}});
 const targets=structuredClone(state.settings.targets);
 for(const [value,sex,lifeStage,iron,folate] of [
  ['male','male','standard',8,400],['pregnant','female','pregnant',27,600],
  ['lactating','female','lactating',9,500],['female','female','standard',18,400]
 ]){
  applyProfileSettingsCommand(state,{type:'profileSettings.demographic',payload:{field:'sex',value,date}});
  const result=profileSettingsView(state,date);
  assert.equal(result.profile.demographics.sex,sex);
  assert.equal(result.profile.demographics.lifeStage,lifeStage);
  assert.deepEqual(result.referenceProjection.values,{iron,folate});
  assert.deepEqual(state.settings.targets,targets);
 }
});
