import {date as calendarDate} from './domain/calendar.mjs';
import {diaryGroups} from './domain/diary-groups.mjs';
import {calculateSummary,resolveTargetSettings,entryFacts} from './domain/nutrition.mjs';
import {parseMacroPolicy,KETO_PRESETS} from './domain/macro-policy.mjs';
import {parseEnergyPolicy} from './domain/energy-policy.mjs';
import {carbohydratePreferences} from './domain/carbohydrate-policy.mjs';
import {parseMacroPlan,projectMacroWeek,parseTemplateSettings} from './domain/macro-templates.mjs';
import {parseInactiveEnergyTarget,resolveWeightGoalTarget} from './domain/energy-target-state.mjs';
import {upperLimitSettings} from './domain/nutrient-target-view.mjs';
import {createWeightGoalView} from './domain/weight-goal-view.mjs';
import {projectBodyComposition} from './domain/body-composition.mjs';
import {createBiometricLibrary,biometricEntryForPair} from './domain/biometric-library.mjs';
import {parseEnergyUnit} from './domain/energy-units.mjs';
import {presentTargetSetupPreview} from './domain/target-setup-guidance.mjs';
import {contentDigest} from './domain/content-digest.mjs';
import {prepareLocalGuidedSetup,applyTargetPolicyToState} from './local-target-policy-write.mjs';
export {prepareLocalGuidedSetup,applyTargetPolicyToState,applyMealSuggestionPreferenceLocal} from './local-target-policy-write.mjs';

export function projectLocalTargetPolicyView(state,date,{today,asOf,timeZone='UTC'}={},revision){
 calendarDate(date);calendarDate(today);
 const carbohydrate=carbohydratePreferences(state.settings),carbohydrateId=carbohydrate.mode==='net'?'netCarbohydrate':'carbs',summary=calculateSummary(state,date);
 const plan=resolveWeightGoalTarget(state.settings,{includeInactive:true}),body=projectBodyComposition(state.biometrics??[],state.settings.bodyComposition,date),defaults={...state,settings:{...state.settings}};delete defaults.settings.macroPlan;
 const defaultSummary=calculateSummary(defaults,date),resolved=resolveTargetSettings(defaults,date),energyPolicy=parseEnergyPolicy(state.settings.energyPolicy);
 const defaultControls={macro:parseMacroPolicy(state.settings.macroPolicy)??{mode:'fixed',targets:resolved.fixedTargets},carbohydrate,energy:{configured:energyPolicy!==null,custom:!energyPolicy||energyPolicy.target.mode==='fixed',kcal:resolved.configuredEnergyTarget,includeAboveBaseline:energyPolicy?.target.includeAboveBaseline??false,inactiveTarget:parseInactiveEnergyTarget(state.settings.inactiveEnergyTarget)}};
 const upperLimits=upperLimitSettings(state,date,summary);
 const weightGoal={plan,projection:createWeightGoalView(state,date,{now:new Date(asOf??today+'T12:00:00Z'),timeZone,goalInput:plan?.goal??null}),reading:{...body.weight,kilograms:body.weightKg},entry:body.weight.metric?biometricEntryForPair(createBiometricLibrary(state),body.weight.metric.type,body.weight.metric.unit):null,energy:defaultSummary.energy};
 return {revision,date,today,upperLimits,weightGoal,defaults:{controls:defaultControls,energy:defaultSummary.energy,macroTargets:defaultSummary.macroTargets},energyUnit:parseEnergyUnit(state.settings.energyUnit??'kcal'),expenditureBreakdown:summary.expenditureBreakdown,macro:parseMacroPolicy(state.settings.macroPolicy)??{mode:'fixed',targets:{protein:state.settings.targets?.protein??null,carbohydrate:state.settings.targets?.[carbohydrateId]??null,fat:state.settings.targets?.fat??null}},energyPolicy:parseEnergyPolicy(state.settings.energyPolicy),calories:state.settings.targets?.calories??null,carbohydrate,carbohydrateId,ketoPresets:KETO_PRESETS,weekday:structuredClone(state.settings.macroSchedule??{}),plan:parseMacroPlan(state.settings.macroPlan),week:projectMacroWeek(state.settings.macroPlan,today),effective:{targets:summary.targets,macroTargets:summary.macroTargets,energy:summary.energy,assignment:summary.targetAssignment}};
}

export function projectLocalTargetPolicyPreview(state,input,context,revision){
 calendarDate(input.date);const copy=structuredClone(state);
 applyTargetPolicyToState(copy,{type:input.type,payload:input.payload},context);
 return {revision,view:projectLocalTargetPolicyView(copy,input.date,context,revision),...(input.type==='targetPolicy.setup'?{setup:presentTargetSetupPreview(prepareLocalGuidedSetup(input.payload.input))}:{})};
}

export function projectLocalMacroTemplatePreview(state,input,revision){
 calendarDate(input.date);
 const settings=parseTemplateSettings(input.settings);
 const copy={...state,settings:{...state.settings,macroPlan:{version:1,templates:[{id:'preview',name:'Preview',settings}],weeks:[],days:[{date:input.date,selection:{kind:'template',id:'preview'}}]}}};
 return {revision,date:input.date,settings,macroTargets:calculateSummary(copy,input.date).macroTargets};
}

function repeatMatches(r,day){
 return r.enabled!==false&&day>=r.startDate&&(!r.endDate||day<=r.endDate)&&Array.isArray(r.days)&&r.days.includes(new Date(`${day}T12:00:00Z`).getUTCDay());
}

export function projectLocalRepeatView(state,date,revision){
 calendarDate(date);
 const items=(state.repeats??[]).map(item=>{
  const kind=item.recipeId?'recipe':item.mealId?'meal':'food';
  const facts=entryFacts(state,{...item,date});
  return {...item,kind,name:facts.name,portionLabel:facts.portionLabel??null};
 });
 const applied=new Set((state.entries??[]).filter(row=>row.date===date&&row.repeatId).map(row=>row.repeatId));
 const previewItems=[];let alreadyLogged=0;
 for(const repeat of state.repeats??[]){
  if(!repeatMatches(repeat,date))continue;
  if(applied.has(repeat.id)){alreadyLogged++;continue;}
  try{
   const facts=entryFacts(state,{...repeat,date}),keys=['calories','protein','carbs','fat'];
   const value=repeat.quantity??repeat.amount??1;
   const kind=repeat.quantity===undefined?'servings':repeat.unit==='portion'||repeat.unit==='batch'?repeat.unit:'measurement';
   previewItems.push({id:repeat.id,fingerprint:contentDigest({day:date,repeat}),attributions:facts.attributions,name:facts.name,quantity:{kind,value,unit:repeat.unit,label:facts.portionLabel??null},group:facts.group,time:facts.time,nutrients:Object.fromEntries(keys.map(key=>[key,facts.nutrients[key]])),nutrientCoverage:Object.fromEntries(keys.map(key=>[key,facts.coverage[key]]))});
  }catch{/* Unresolved item waits for server refresh. */}
 }
 return {revision,date,groups:diaryGroups(state.settings.groups),completed:state.settings.completedDays?.includes(date)??false,items,preview:{version:1,date,items:previewItems,alreadyLogged}};
}
