import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,act} from '../server/domain/workspace.mjs';
import {prepareProfileSettingsCommand,profileSettingsView} from '../server/profile-settings.mjs';

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
 const state=initialState();assert.deepEqual(profileSettingsView(state,'2026-11-14').profile.demographics,{source:null,age:null,sex:null,birthDate:null});
 assert.equal(profileSettingsView(state,'2026-11-14').profile.measurements.weight.value,null);
 run(state,'profileSettings.energy',energy());
 run(state,'profileSettings.body',{policy:{version:2,weightMetric:{kind:'biometric',type:'Morning mass',unit:'lb'},heightMetric:{kind:'biometric',type:'Height',unit:'in'},bodyFatMetric:{kind:'biometric',type:'Fat',unit:'%'},useForResting:false,useHeightForResting:false,useForKeto:false}});
 state.biometrics.push({date:'2026-11-13',type:'Morning mass',unit:'lb',value:176},{date:'2026-11-13',type:'Height',unit:'in',value:70},{date:'2026-11-13',type:'Fat',unit:'%',value:0},{date:'2026-11-14',type:'weight',unit:'kg',value:99});
 let view=profileSettingsView(state,'2026-11-14').profile;assert.equal(view.demographics.age,35);assert.equal(view.measurements.weight.value,176);assert.equal(view.measurements.weight.unit,'lb');assert.deepEqual(view.measurements.weight.choice,{selection:{kind:'metric',type:'Morning mass',unit:'lb'},unit:'lb'});assert.equal(view.measurements.bodyFat.value,0);assert.ok(Math.abs(view.bmi-79.83225712/(1.778*1.778))<1e-8);
 state.biometrics.push({date:'2026-11-14',type:'Morning mass',unit:'lb',value:0});view=profileSettingsView(state,'2026-11-14').profile;assert.equal(view.measurements.weight.status,'invalid');assert.equal(view.measurements.weight.value,null);assert.equal(view.bmi,null);
});

test('Profile age and sex use reference policy only when no resting equation exists',()=>{
 const state=initialState(),view=profileSettingsView(state,'2026-11-14');run(state,'profileSettings.references',{policy:{version:1,referenceSet:view.referenceSet,birthDate:'1990-11-15',sex:'female',lifeStage:'standard',nutrients:['calcium']}});
 assert.deepEqual(profileSettingsView(state,'2026-11-14').profile.demographics,{source:'references',age:35,sex:'female',birthDate:'1990-11-15'});
 run(state,'profileSettings.energy',energy());assert.equal(profileSettingsView(state,'2026-11-14').profile.demographics.sex,'male');assert.equal(state.settings.nutrientReferences.sex,'female');
});
