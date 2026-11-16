import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,act} from '../server/domain/workspace.mjs';
import {prepareTargetPolicyCommand} from '../server/target-policy-commands.mjs';
import {targetPolicyView,previewTargetPolicy} from '../server/target-policy-view.mjs';
import {DEFAULT_MACRO_RATIOS} from '../server/domain/macro-policy.mjs';
import {DEFAULT_CARBOHYDRATE_POLICY} from '../server/domain/carbohydrate-policy.mjs';
const date='2026-11-16',context={today:date},goal={mode:'weight-goal',goal:{startDate:date,startWeight:80,goalWeight:75,unit:'kg',weeklyChange:-.5},includeAboveBaseline:true};
const policy={version:1,resting:{mode:'custom',kcal:1600},baseline:{mode:'custom',kcal:400},activity:{mode:'manual'},thermicEffect:false,target:goal,display:'balance'};
const apply=(state,type,payload)=>{const input={date,type,payload},before=structuredClone(state),preview=previewTargetPolicy(state,input,context);assert.deepEqual(state,before);const action=prepareTargetPolicyCommand(state,{type,payload},context);act(state,action.type,action.payload);assert.deepEqual(targetPolicyView(state,date,context),preview.view);return preview.view;};
test('custom energy restores inactive goals and preserves expenditure, display and scheduled targets',()=>{
 const state=initialState();state.settings.energyPolicy=structuredClone(policy);
 apply(state,'targetPolicy.schedule',{change:{kind:'template-create',template:{id:'scheduled',name:'Scheduled',settings:{macro:{mode:'fixed',targets:{protein:150,carbohydrate:200,fat:75}},energy:{mode:'fixed',kcal:2400}}}}});
 apply(state,'targetPolicy.schedule',{change:{kind:'weekly',from:date,days:Array(7).fill('scheduled')}});const before=structuredClone(state.settings);
 let v=apply(state,'targetPolicy.customEnergy',{enabled:true,kcal:1800});assert.equal(v.defaults.energy.target,1800);assert.equal(v.effective.energy.target,2400);assert.deepEqual(state.settings.inactiveEnergyTarget,goal);assert.equal(state.settings.energyPolicy.target.includeAboveBaseline,false);
 apply(state,'targetPolicy.aboveBaseline',{enabled:true});apply(state,'targetPolicy.customEnergy',{enabled:true,kcal:1900});assert.equal(state.settings.energyPolicy.target.includeAboveBaseline,true);
 apply(state,'targetPolicy.customEnergy',{enabled:false,kcal:null});assert.deepEqual(state.settings.energyPolicy.target,goal);assert.equal(state.settings.inactiveEnergyTarget,undefined);
 for(const key of ['resting','baseline','activity','thermicEffect','display'])assert.deepEqual(state.settings.energyPolicy[key],before.energyPolicy[key]);assert.deepEqual(state.settings.macroPlan,before.macroPlan);
 const empty=initialState();apply(empty,'targetPolicy.customEnergy',{enabled:true,kcal:0});assert.equal(targetPolicyView(empty,date,context).defaults.energy.target,0);assert.throws(()=>apply(empty,'targetPolicy.customEnergy',{enabled:false,kcal:null}),e=>e.status===409);assert.throws(()=>apply(empty,'targetPolicy.aboveBaseline',{enabled:true}),e=>e.status===409);
});
test('macro modes, carbohydrate identity and restore defaults retain unrelated values and source guidance',()=>{
 const state=initialState();state.settings.energyPolicy=structuredClone(policy);const before=structuredClone(state.settings);
 apply(state,'targetPolicy.carbohydrate',{policy:{mode:'net',netExcluded:['fiber','allulose']}});
 let v=apply(state,'targetPolicy.macros',{macro:{mode:'fixed',targets:{protein:0,carbohydrate:null,fat:65}}});assert.equal(v.defaults.macroTargets.targets.protein,0);assert.equal(v.defaults.macroTargets.targets.carbohydrate,null);assert.equal(state.settings.targets.carbs,before.targets.carbs);
 for(const basis of ['percent','kcal','grams']){v=apply(state,'targetPolicy.macros',{macro:{version:1,mode:'ratios',basis,values:{protein:25,carbohydrate:45,fat:30}}});assert.equal(v.defaults.macroTargets.basis,basis);}
 v=apply(state,'targetPolicy.macros',{macro:{version:1,mode:'keto',program:'custom',leanBodyMassKg:null,proteinPerKg:1.6,carbohydrateGrams:30,athleticBonus:false,proteinAddition:0}});assert.equal(v.defaults.macroTargets.targets.protein,null);assert.ok(v.defaults.macroTargets.reasons.some(row=>row.code==='proteinMissing'));
 apply(state,'targetPolicy.restoreDefaults',{section:'macro'});assert.deepEqual(state.settings.macroPolicy,DEFAULT_MACRO_RATIOS);apply(state,'targetPolicy.restoreDefaults',{section:'carbohydrate'});assert.deepEqual(state.settings.carbohydratePolicy,DEFAULT_CARBOHYDRATE_POLICY);assert.deepEqual(state.settings.energyPolicy,before.energyPolicy);assert.equal(state.settings.targets.protein,0);assert.equal(state.settings.targets.netCarbohydrate,null);
});
test('malformed macro controls fail without mutation',()=>{
 const state=initialState(),before=structuredClone(state);for(const [type,payload] of [
 ['targetPolicy.customEnergy',{enabled:true}],['targetPolicy.customEnergy',{enabled:true,kcal:-1}],['targetPolicy.customEnergy',{enabled:false,kcal:100}],['targetPolicy.customEnergy',{enabled:true,kcal:100,owner:'other'}],['targetPolicy.aboveBaseline',{enabled:1}],['targetPolicy.restoreDefaults',{section:'all'}],['targetPolicy.macros',{macro:{version:1,mode:'ratios',basis:'percent',values:{protein:20,carbohydrate:20,fat:20}}}]
 ]){assert.throws(()=>apply(state,type,payload));assert.deepEqual(state,before);}
});
