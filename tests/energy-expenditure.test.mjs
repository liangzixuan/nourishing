import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,act} from '../server/domain/workspace.mjs';
import {prepareTargetPolicyCommand} from '../server/target-policy-commands.mjs';
import {previewTargetPolicy,targetPolicyView} from '../server/target-policy-view.mjs';
import {createWebHandler} from '../server/http.mjs';
const date='2026-11-16',context={today:date},expenditure={resting:{mode:'custom',kcal:1600},baseline:{mode:'multiplier',factor:.2},activity:{mode:'manual'},thermicEffect:false};
const apply=(state,payload)=>{const a=prepareTargetPolicyCommand(state,{type:'targetPolicy.expenditure',payload},context);act(state,a.type,a.payload);};
test('expenditure preview and apply share canonical math and preserve target, inactive goal, display and other owners',()=>{
 const state=initialState();state.settings.energyUnit='kJ';state.settings.energyPolicy={version:1,...expenditure,target:{mode:'fixed',includeAboveBaseline:true},display:'balance'};
 state.settings.inactiveEnergyTarget={mode:'weight-goal',includeAboveBaseline:false,goal:{startDate:date,startWeight:80,goalWeight:75,unit:'kg',weeklyChange:-.5}};
 const original=structuredClone(state),input={date,type:'targetPolicy.expenditure',payload:{expenditure:{...expenditure,baseline:{mode:'custom',kcal:300},thermicEffect:true}}};
 const preview=previewTargetPolicy(state,input,context);assert.deepEqual(state,original);apply(state,input.payload);assert.deepEqual(targetPolicyView(state,date,context),preview.view);assert.equal(preview.view.energyUnit,'kJ');assert.equal(preview.view.expenditureBreakdown.mean,1900);
 assert.deepEqual(state.settings.energyPolicy.target,original.settings.energyPolicy.target);assert.equal(state.settings.energyPolicy.display,'balance');assert.deepEqual(state.settings.inactiveEnergyTarget,original.settings.inactiveEnergyTarget);assert.deepEqual(state.settings.targets,original.settings.targets);
 state.settings.energyPolicy.target={mode:'weight-goal',goal:original.settings.inactiveEnergyTarget.goal,includeAboveBaseline:true};delete state.settings.inactiveEnergyTarget;const goal=structuredClone(state.settings.energyPolicy.target);apply(state,{expenditure});assert.deepEqual(state.settings.energyPolicy.target,goal);
 const empty=initialState(),calories=empty.settings.targets.calories;apply(empty,{expenditure});assert.equal(empty.settings.energyPolicy.target.mode,'fixed');assert.equal(empty.settings.targets.calories,calories);
 for(const payload of [{expenditure:{...expenditure,activity:{mode:'health-connect',zone:'UTC'}}},{expenditure:{...expenditure,resting:{mode:'custom',kcal:-1}}},{expenditure,targets:{}}])assert.throws(()=>apply(state,payload));
 assert.throws(()=>previewTargetPolicy(state,{...input,owner:'other'},context));assert.throws(()=>previewTargetPolicy(state,{...input,type:'settings.save'},context));
});
test('target preview route requires session, same origin and strict input without mutating another owner',async()=>{
 const states={a:initialState(),b:initialState()},seen=[],handler=createWebHandler({config:{origin:'https://nourishing.test'},service:{previewTargetPolicy:async(owner,input)=>{seen.push(owner);return previewTargetPolicy(states[owner],input,context);}}});
 const body={date,type:'targetPolicy.expenditure',payload:{expenditure}},send=(owner,input=body,suffix='')=>handler(new Request('https://nourishing.test/api/target-policies/preview'+suffix,{method:'POST',headers:{Origin:'https://nourishing.test','Content-Type':'application/json',...(owner?{Cookie:'__Host-nourishing_session='+owner}:{})},body:JSON.stringify(input)}));
 assert.equal((await send(null)).status,401);assert.equal((await send('a',body,'?owner=b')).status,400);assert.equal((await send('a',{...body,owner:'b'})).status,400);const before=structuredClone(states);assert.equal((await send('a')).status,200);assert.deepEqual(states,before);assert.deepEqual(seen,['a','a']);
});
