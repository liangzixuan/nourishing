import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,act} from '../server/domain/workspace.mjs';
import {prepareTargetPolicyCommand} from '../server/target-policy-commands.mjs';
import {targetPolicyView} from '../server/target-policy-view.mjs';
const today='2026-11-14',context={today};
const apply=(state,type,payload)=>{const action=prepareTargetPolicyCommand(state,{type,payload},context);return act(state,action.type,action.payload);};
const view=state=>targetPolicyView(state,today,context);
const policy={version:1,resting:{mode:'custom',kcal:1600},baseline:{mode:'custom',kcal:400},activity:{mode:'manual'},thermicEffect:false,target:{mode:'calculated',adjustmentKcal:-200,includeAboveBaseline:false},display:'remaining'};
test('macro and energy controls reuse source calculations and preserve unrelated settings',()=>{
 const state=initialState();state.settings.targets.fiber=35;const groups=[...state.settings.groups];
 apply(state,'targetPolicy.energy',{policy});apply(state,'targetPolicy.macros',{macro:{version:1,mode:'ratios',basis:'percent',values:{protein:30,carbohydrate:40,fat:30}}});
 const result=view(state);assert.equal(result.effective.energy.target,1800);assert.equal(result.effective.targets.protein,135);assert.equal(result.effective.targets.carbs,180);assert.equal(state.settings.targets.fiber,35);assert.deepEqual(state.settings.groups,groups);
 apply(state,'targetPolicy.energy',{policy:{...policy,target:{mode:'fixed',includeAboveBaseline:false}},kcal:2100});assert.deepEqual(state.settings.inactiveEnergyTarget,policy.target);assert.equal(view(state).effective.energy.target,2100);
});
test('fixed macros follow the selected carbohydrate identity without replacing its stored alternative',()=>{
 const state=initialState();apply(state,'targetPolicy.carbohydrate',{policy:{mode:'net',netExcluded:['fiber','sugarAlcohol']}});
 apply(state,'targetPolicy.macros',{macro:{mode:'fixed',targets:{protein:120,carbohydrate:150,fat:80}}});
 assert.equal(state.settings.targets.carbs,250);assert.equal(state.settings.targets.netCarbohydrate,150);assert.equal(view(state).effective.macroTargets.targets.carbohydrate,150);
});
test('weekday updates preserve unedited weekdays and nutrient overrides',()=>{
 const state=initialState();state.settings.macroSchedule={'1':{protein:90},'6':{fiber:40}};
 apply(state,'targetPolicy.weekday',{weekday:6,targets:{protein:145,calories:2200}});assert.equal(view(state).effective.targets.protein,145);assert.equal(state.settings.macroSchedule['6'].fiber,40);assert.equal(state.settings.macroSchedule['1'].protein,90);
 apply(state,'targetPolicy.weekday',{weekday:6,targets:null});assert.equal(view(state).effective.targets.protein,100);assert.equal(state.settings.macroSchedule['1'].protein,90);
});
test('template scheduler edits keep history, reject foreign references and support daily override',()=>{
 const state=initialState(),template={id:'training',name:'Training',settings:{macro:{mode:'fixed',targets:{protein:160,carbohydrate:250,fat:75}},energy:{mode:'fixed',kcal:2400}}};
 apply(state,'targetPolicy.schedule',{change:{kind:'template-create',template}});apply(state,'targetPolicy.schedule',{change:{kind:'weekly',from:today,days:Array(7).fill('training')}});assert.equal(view(state).effective.targets.protein,160);
 apply(state,'targetPolicy.schedule',{change:{kind:'day',date:today,selection:{kind:'default'}}});assert.equal(view(state).effective.targets.protein,100);
 assert.throws(()=>apply(state,'targetPolicy.schedule',{change:{kind:'weekly',from:'2026-11-13',days:Array(7).fill(null)}}));
 assert.throws(()=>apply(state,'targetPolicy.schedule',{change:{kind:'weekday',weekday:1,templateId:'foreign'}}));
 assert.throws(()=>prepareTargetPolicyCommand(state,{type:'targetPolicy.schedule',payload:{change:{kind:'enabled',enabled:true}}}));
});
test('target policies reject unsupported keys and malformed values',()=>{
 const state=initialState();for(const [type,payload] of [['targetPolicy.energy',{policy,ownerId:'foreign'}],['targetPolicy.energy',{policy,kcal:-1}],['targetPolicy.macros',{macro:{version:1,mode:'ratios',basis:'percent',values:{protein:30,carbohydrate:30,fat:30}}}],['targetPolicy.weekday',{weekday:9,targets:null}],['targetPolicy.weekday',{weekday:1,targets:{protein:'100'}}],['targetPolicy.carbohydrate',{policy:{mode:'net',netExcluded:null}}]])assert.throws(()=>apply(state,type,payload));
});
test('editing a fixed energy target preserves an inactive goal when expenditure is unconfigured',()=>{
 const state=initialState(),inactive={mode:'weight-goal',goal:{startDate:today,startWeight:80,goalWeight:75,unit:'kg',weeklyChange:-0.25},includeAboveBaseline:false};
 state.settings.inactiveEnergyTarget=structuredClone(inactive);apply(state,'targetPolicy.energy',{policy:null,kcal:2200});assert.deepEqual(state.settings.inactiveEnergyTarget,inactive);assert.equal(state.settings.targets.calories,2200);
});
