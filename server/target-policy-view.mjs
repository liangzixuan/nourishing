import {presentTargetSetupPreview} from './domain/target-setup-guidance.mjs';
import {effectiveNutrientUpperLimitPolicy,projectNutrientUpperLimits,nutrientUpperLimitOptions} from './domain/nutrient-upper-limits.mjs';
import {parseInactiveEnergyTarget,resolveWeightGoalTarget} from './domain/energy-target-state.mjs';
import {createWeightGoalView} from './domain/weight-goal-view.mjs';
import {projectBodyComposition} from './domain/body-composition.mjs';
import {createBiometricLibrary,biometricEntryForPair} from './domain/biometric-library.mjs';
import {parseEnergyUnit} from './domain/energy-units.mjs';
import {act} from './domain/workspace.mjs';
import {prepareTargetPolicyCommand,targetPolicyCommandFields,prepareGuidedSetup} from './target-policy-commands.mjs';
import {digest} from './data-codec.mjs';
import {date as calendarDate} from './domain/calendar.mjs';
import {parseMacroPolicy,KETO_PRESETS} from './domain/macro-policy.mjs';
import {parseEnergyPolicy} from './domain/energy-policy.mjs';
import {carbohydratePreferences} from './domain/carbohydrate-policy.mjs';
import {parseMacroPlan,projectMacroWeek,parseTemplateSettings} from './domain/macro-templates.mjs';
import {calculateSummary,resolveTargetSettings} from './domain/nutrition.mjs';

export function targetPolicyView(state,date,{today,asOf,timeZone='UTC'}={}){
 calendarDate(date);calendarDate(today);
 const carbohydrate=carbohydratePreferences(state.settings),carbohydrateId=carbohydrate.mode==='net'?'netCarbohydrate':'carbs',summary=calculateSummary(state,date);
 const plan=resolveWeightGoalTarget(state.settings,{includeInactive:true}),body=projectBodyComposition(state.biometrics??[],state.settings.bodyComposition,date),defaults={...state,settings:{...state.settings}};delete defaults.settings.macroPlan;
 const defaultSummary=calculateSummary(defaults,date),resolved=resolveTargetSettings(defaults,date),energyPolicy=parseEnergyPolicy(state.settings.energyPolicy);
 const defaultControls={macro:parseMacroPolicy(state.settings.macroPolicy)??{mode:'fixed',targets:resolved.fixedTargets},carbohydrate,energy:{configured:energyPolicy!==null,custom:!energyPolicy||energyPolicy.target.mode==='fixed',kcal:resolved.configuredEnergyTarget,includeAboveBaseline:energyPolicy?.target.includeAboveBaseline??false,inactiveTarget:parseInactiveEnergyTarget(state.settings.inactiveEnergyTarget)}};
 const upperPolicy=effectiveNutrientUpperLimitPolicy(state.settings.nutrientUpperLimits,state.settings.nutrientTargetModes),upperLimits={date,policy:upperPolicy,options:nutrientUpperLimitOptions,projection:projectNutrientUpperLimits(upperPolicy,state.settings.nutrientReferences,date),summary:{nutrientDisplay:summary.nutrientDisplay,attributions:summary.attributions}};
 const weightGoal={plan,projection:createWeightGoalView(state,date,{now:new Date(asOf??today+'T12:00:00Z'),timeZone,goalInput:plan?.goal??null}),reading:{...body.weight,kilograms:body.weightKg},entry:body.weight.metric?biometricEntryForPair(createBiometricLibrary(state),body.weight.metric.type,body.weight.metric.unit):null,energy:defaultSummary.energy};
 return {revision:digest(state),date,today,upperLimits,weightGoal,defaults:{controls:defaultControls,energy:defaultSummary.energy,macroTargets:defaultSummary.macroTargets},energyUnit:parseEnergyUnit(state.settings.energyUnit??'kcal'),expenditureBreakdown:summary.expenditureBreakdown,macro:parseMacroPolicy(state.settings.macroPolicy)??{mode:'fixed',targets:{protein:state.settings.targets.protein??null,carbohydrate:state.settings.targets[carbohydrateId]??null,fat:state.settings.targets.fat??null}},energyPolicy:parseEnergyPolicy(state.settings.energyPolicy),calories:state.settings.targets.calories??null,carbohydrate,carbohydrateId,ketoPresets:KETO_PRESETS,weekday:structuredClone(state.settings.macroSchedule??{}),plan:parseMacroPlan(state.settings.macroPlan),week:projectMacroWeek(state.settings.macroPlan,today),effective:{targets:summary.targets,macroTargets:summary.macroTargets,energy:summary.energy,assignment:summary.targetAssignment}};
}

/** Preview shares the command parser and canonical settings application. */
export function previewTargetPolicy(state,input,context){
 const fail=()=>{throw Object.assign(Error('Choose a valid target change.'),{status:400,code:400,publicMessage:'Choose a valid target change.'});};
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==3||!['date','type','payload'].every(k=>Object.hasOwn(input,k))||!Object.hasOwn(targetPolicyCommandFields,input.type))fail();
 calendarDate(input.date);const copy=structuredClone(state);
 try{const action=prepareTargetPolicyCommand(copy,{type:input.type,payload:input.payload},context);act(copy,action.type,action.payload);return {revision:digest(state),view:targetPolicyView(copy,input.date,context),...(input.type==='targetPolicy.setup'?{setup:presentTargetSetupPreview(prepareGuidedSetup(input.payload.input))}:{})};}catch(error){if([400,409].includes(error.status))Object.assign(error,{code:error.status,publicMessage:error.message});throw error;}
}

/** Isolated template projection works even when the saved scheduler is disabled. */
export function previewMacroTemplate(state,input){
 const fail=()=>{throw Object.assign(Error('Choose valid template settings.'),{status:400,code:400,publicMessage:'Choose valid template settings.'});};
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==2||!['date','settings'].every(key=>Object.hasOwn(input,key)))fail();
 try{
  calendarDate(input.date);const settings=parseTemplateSettings(input.settings),copy={...state,settings:{...state.settings,macroPlan:{version:1,templates:[{id:'preview',name:'Preview',settings}],weeks:[],days:[{date:input.date,selection:{kind:'template',id:'preview'}}]}}};
  return {revision:digest(state),date:input.date,settings,macroTargets:calculateSummary(copy,input.date).macroTargets};
 }catch(error){fail();}
}
