import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,act} from '../server/domain/workspace.mjs';
import {prepareTargetPolicyCommand} from '../server/target-policy-commands.mjs';
import {targetPolicyView,previewTargetPolicy} from '../server/target-policy-view.mjs';
const date='2026-11-16',context={today:date,asOf:date+'T18:00:00Z',timeZone:'UTC'},goal={startDate:date,startWeight:80,goalWeight:75,unit:'kg',weeklyChange:-.5};
const policy={version:1,resting:{mode:'custom',kcal:1600},baseline:{mode:'custom',kcal:400},activity:{mode:'manual'},thermicEffect:false,target:{mode:'fixed',includeAboveBaseline:true},display:'balance'};
const apply=(state,type,payload)=>{const action=prepareTargetPolicyCommand(state,{type,payload},context);act(state,action.type,action.payload);};
test('weight goal preview/apply preserve expenditure, display, macros and schedules while separating default energy',()=>{
 const state=initialState();state.settings.energyPolicy=structuredClone(policy);state.settings.energyUnit='kJ';
 apply(state,'targetPolicy.schedule',{change:{kind:'template-create',template:{id:'training',name:'Training',settings:{macro:{mode:'fixed',targets:{protein:160,carbohydrate:250,fat:75}},energy:{mode:'fixed',kcal:2400}}}}});
 apply(state,'targetPolicy.schedule',{change:{kind:'weekly',from:date,days:Array(7).fill('training')}});
 const before=structuredClone(state),payload={goal,applyToEnergy:true},preview=previewTargetPolicy(state,{date,type:'targetPolicy.weightGoal',payload},context);
 assert.deepEqual(state,before);apply(state,'targetPolicy.weightGoal',payload);assert.deepEqual(targetPolicyView(state,date,context),preview.view);
 assert.equal(preview.view.weightGoal.plan.applyToEnergy,true);assert.notEqual(preview.view.weightGoal.energy.target,2400);assert.equal(preview.view.effective.energy.target,2400);
 for(const key of ['resting','baseline','activity','thermicEffect','display'])assert.deepEqual(state.settings.energyPolicy[key],before.settings.energyPolicy[key]);
 for(const key of ['macroPlan','targets','energyUnit'])assert.deepEqual(state.settings[key],before.settings[key]);assert.equal(state.settings.energyPolicy.target.includeAboveBaseline,true);
 apply(state,'targetPolicy.weightGoal',{goal,applyToEnergy:false});assert.equal(state.settings.energyPolicy.target.mode,'fixed');assert.deepEqual(state.settings.inactiveEnergyTarget.goal,goal);assert.equal(targetPolicyView(state,date,context).weightGoal.plan.applyToEnergy,false);
 apply(state,'targetPolicy.weightGoal',{goal,applyToEnergy:true});assert.equal(state.settings.inactiveEnergyTarget,undefined);
});
test('empty accounts can retain inactive gain/loss/maintain goals with canonical forecasts; invalid changes leave state intact',()=>{
 const state=initialState();for(const g of [goal,{...goal,goalWeight:85,weeklyChange:.5},{...goal,goalWeight:80,weeklyChange:0},{...goal,startWeight:180,goalWeight:170,unit:'lb'}]){
  const payload={goal:g,applyToEnergy:false},result=previewTargetPolicy(state,{date,type:'targetPolicy.weightGoal',payload},context);apply(state,'targetPolicy.weightGoal',payload);
  assert.deepEqual(result.view,targetPolicyView(state,date,context));assert.equal(result.view.weightGoal.reading.status,'unselected');assert.equal(result.view.weightGoal.entry,null);assert.equal(result.view.weightGoal.projection.goalWeight,g.goalWeight);
 }
 const before=structuredClone(state);assert.throws(()=>previewTargetPolicy(state,{date,type:'targetPolicy.weightGoal',payload:{goal,applyToEnergy:true}},context),e=>e.code===409);
 for(const payload of [{goal:{...goal,weeklyChange:.5},applyToEnergy:false},{goal,applyToEnergy:'yes'},{goal:null,applyToEnergy:false},{goal,applyToEnergy:false,owner:'other'}])assert.throws(()=>apply(state,'targetPolicy.weightGoal',payload));assert.deepEqual(state,before);
});
test('current weight retains exact measurement identity and unknown latest values',()=>{
 const state=initialState();state.settings.bodyComposition={version:2,weightMetric:{kind:'biometric',type:'Morning mass',unit:'lb'},bodyFatMetric:null,heightMetric:null,useForResting:false,useHeightForResting:false,useForKeto:false};
 state.biometrics=[{id:'custom',date,type:'Morning mass',unit:'lb',value:180},{id:'other',date,type:'Weight',unit:'kg',value:40}];let v=targetPolicyView(state,date,context).weightGoal;
 assert.deepEqual(v.entry,{selection:{kind:'metric',type:'Morning mass',unit:'lb'},unit:'lb'});assert.equal(v.reading.reading.value,180);
 state.biometrics.push({id:'invalid',date,type:'Morning mass',unit:'lb',value:0});v=targetPolicyView(state,date,context).weightGoal;assert.equal(v.reading.status,'invalid');assert.equal(v.reading.kilograms,null);assert.equal(v.entry.selection.type,'Morning mass');
});
