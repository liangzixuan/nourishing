import {date as calendarDate} from './domain/calendar.mjs';
import {diaryGroups} from './domain/diary-groups.mjs';
import {calculateSummary,resolveTargetSettings,entryFacts} from './domain/nutrition.mjs';
import {parseMacroPolicy,DEFAULT_MACRO_RATIOS,KETO_PRESETS} from './domain/macro-policy.mjs';
import {parseEnergyPolicy,parseEnergyExpenditure} from './domain/energy-policy.mjs';
import {parseCarbohydratePolicy,carbohydratePreferences,DEFAULT_CARBOHYDRATE_POLICY} from './domain/carbohydrate-policy.mjs';
import {parseMacroPlan,projectMacroWeek,parseTemplateSettings,changeMacroPlan} from './domain/macro-templates.mjs';
import {parseInactiveEnergyTarget,reconcileInactiveEnergyTarget,resolveWeightGoalTarget} from './domain/energy-target-state.mjs';
import {reconcileNutrientTargetModes} from './domain/nutrient-target-modes.mjs';
import {nutrientReferenceOptions} from './domain/nutrient-references.mjs';
import {nutrientUpperLimitOptions,parseNutrientUpperLimitPolicy} from './domain/nutrient-upper-limits.mjs';
import {upperLimitSettings} from './domain/nutrient-target-view.mjs';
import {parseWeightGoal} from './domain/weight-goal.mjs';
import {createWeightGoalView} from './domain/weight-goal-view.mjs';
import {projectBodyComposition} from './domain/body-composition.mjs';
import {createBiometricLibrary,biometricEntryForPair} from './domain/biometric-library.mjs';
import {parseEnergyUnit} from './domain/energy-units.mjs';
import {calculateTargetSetup,setupTargetKeys} from './domain/target-setup.mjs';
import {presentTargetSetupPreview} from './domain/target-setup-guidance.mjs';
import {parseMealSuggestionPolicy,mealReference,mealReferenceKey,mealTags} from './domain/meal-suggestion-policy.mjs';
import {contentDigest} from './domain/content-digest.mjs';

const fail=message=>{throw Object.assign(Error(message),{status:400});};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const amount=value=>value===null||typeof value==='number'&&Number.isFinite(value)&&value>=0;
const dailyIds=nutrientReferenceOptions.map(row=>row.id);
const maximumIds=nutrientUpperLimitOptions.map(row=>row.id);

export function prepareLocalGuidedSetup(input){
 const keys=input?.method==='manual'?['method','calories','percentages']:['method','adultScope','age','height','weight','units','equation','activity','percentages'];
 if(!object(input)||Object.keys(input).length!==keys.length||keys.some(key=>!Object.hasOwn(input,key))||!object(input.percentages)||Object.keys(input.percentages).length!==3||['carbs','protein','fat'].some(key=>!Object.hasOwn(input.percentages,key)))fail('Enter only the required target setup values.');
 return calculateTargetSetup(input);
}

export function applyTargetPolicyToState(state,action,context={}){
 const p=action.payload;
 if(!object(p))fail('Choose the required target settings only.');
 const prev=state.settings??(state.settings={});
 const next={...prev};
 let patch={};
 switch(action.type){
  case 'targetPolicy.setup':{
   if(p.confirmed!==true)fail('Review the targets before applying.');
   const plan=prepareLocalGuidedSetup(p.input);
   next.targets={...prev.targets,...plan.targets};
   next.targetSetup={...plan,appliedAt:new Date().toISOString()};
   delete next.macroPolicy;
   delete next.macroSchedule;
   if(next.energyPolicy)next.energyPolicy={...next.energyPolicy,target:{mode:'fixed',includeAboveBaseline:false}};
   reconcileInactiveEnergyTarget(prev,next,{energyPolicy:next.energyPolicy});
   state.settings=next;
   return;
  }
  case 'targetPolicy.upperLimits':patch={nutrientUpperLimits:parseNutrientUpperLimitPolicy(p.policy)};break;
  case 'targetPolicy.restoreDefaults':
   if(!['macro','carbohydrate'].includes(p.section))fail('Choose macro or carbohydrate defaults.');
   patch=p.section==='macro'?{macroPolicy:parseMacroPolicy(DEFAULT_MACRO_RATIOS)}:{carbohydratePolicy:parseCarbohydratePolicy(DEFAULT_CARBOHYDRATE_POLICY)};break;
  case 'targetPolicy.customEnergy':{
   if(typeof p.enabled!=='boolean'||!Object.hasOwn(p,'kcal')||p.enabled&&(!amount(p.kcal)||p.kcal===null)||!p.enabled&&p.kcal!==null)fail('Choose Custom with a valid energy amount, or turn it off.');
   const policy=parseEnergyPolicy(prev.energyPolicy);
   if(p.enabled){patch={targets:{...prev.targets,calories:p.kcal}};if(policy)patch.energyPolicy={...policy,target:policy.target.mode==='fixed'?policy.target:{mode:'fixed',includeAboveBaseline:false}};}
   else{if(!policy)throw Object.assign(Error('Set up Energy Expenditure before using a calculated energy target.'),{status:409});patch={energyPolicy:{...policy,target:parseInactiveEnergyTarget(prev.inactiveEnergyTarget)??(policy.target.mode!=='fixed'?policy.target:{mode:'calculated',adjustmentKcal:0,includeAboveBaseline:true})}};}break;
  }
  case 'targetPolicy.aboveBaseline':{
   if(typeof p.enabled!=='boolean')fail('Choose whether to add expenditure above baseline.');
   const policy=parseEnergyPolicy(prev.energyPolicy);if(!policy)throw Object.assign(Error('Set up Energy Expenditure before adding expenditure above baseline.'),{status:409});
   patch={energyPolicy:{...policy,target:{...policy.target,includeAboveBaseline:p.enabled}}};break;
  }
  case 'targetPolicy.weightGoal':{
   const goal=parseWeightGoal(p.goal),policy=parseEnergyPolicy(prev.energyPolicy);
   if(!goal||typeof p.applyToEnergy!=='boolean')fail('Choose a weight goal and whether to apply it to energy.');
   const target={mode:'weight-goal',goal,includeAboveBaseline:policy?.target.includeAboveBaseline??true};
   if(p.applyToEnergy){if(!policy)throw Object.assign(Error('Set up Energy Expenditure before applying a weight goal.'),{status:409});patch={energyPolicy:{...policy,target}};}
   else patch={inactiveEnergyTarget:target,...(policy?{energyPolicy:{...policy,target:policy.target.mode==='fixed'?policy.target:{mode:'fixed',includeAboveBaseline:false}}}:{})};break;
  }
  case 'targetPolicy.expenditure':{
   const expenditure=parseEnergyExpenditure(p.expenditure);if(expenditure.activity.mode!=='manual')fail('Choose recorded exercise for activity.');
   const previous=parseEnergyPolicy(prev.energyPolicy);
   patch={energyPolicy:{...(previous??{version:1,target:{mode:'fixed',includeAboveBaseline:false},display:'remaining'}),...expenditure}};break;
  }
  case 'targetPolicy.macros':{
   const macro=parseTemplateSettings({macro:p.macro,energy:{mode:'inherit'}}).macro;
   const carb=carbohydratePreferences(prev).mode==='net'?'netCarbohydrate':'carbs';
   patch=macro.mode==='fixed'?{macroPolicy:null,targets:{...prev.targets,protein:macro.targets.protein,[carb]:macro.targets.carbohydrate,fat:macro.targets.fat}}:{macroPolicy:macro};break;
  }
  case 'targetPolicy.energy':{
   if(p.policy===undefined)fail('Choose an energy policy.');
   const policy=parseEnergyPolicy(p.policy);if(policy?.activity?.mode==='health-connect')fail('Choose recorded exercise for activity.');
   patch=policy===null&&!prev.energyPolicy?{}:{energyPolicy:policy};
   if(Object.hasOwn(p,'kcal')){if(!amount(p.kcal)||p.kcal===null)fail('Enter a nonnegative calorie target.');patch.targets={...prev.targets,calories:p.kcal};}break;
  }
  case 'targetPolicy.carbohydrate':patch={carbohydratePolicy:parseCarbohydratePolicy(p.policy)};break;
  case 'targetPolicy.weekday':{
   if(!Number.isInteger(p.weekday)||p.weekday<0||p.weekday>6)fail('Choose a weekday.');
   const schedule=structuredClone(prev.macroSchedule??{});
   if(p.targets===null)delete schedule[p.weekday];
   else{
    if(!object(p.targets)||!Object.keys(p.targets).length||Object.entries(p.targets).some(([key,value])=>!['calories','protein','carbs','netCarbohydrate','fat'].includes(key)||!amount(value)))fail('Enter valid weekday energy and macro targets.');
    schedule[p.weekday]={...schedule[p.weekday],...p.targets};
   }
   patch={macroSchedule:schedule};break;
  }
  case 'targetPolicy.schedule':patch={macroPlan:changeMacroPlan(prev.macroPlan,p.change,{today:context.today})};break;
  default:return;
 }
 if(Object.hasOwn(patch,'targets'))next.targets={...prev.targets,...patch.targets};
 if(Object.hasOwn(patch,'energyPolicy')){if(patch.energyPolicy===null)delete next.energyPolicy;else next.energyPolicy=patch.energyPolicy;}
 if(Object.hasOwn(patch,'nutrientUpperLimits')){if(patch.nutrientUpperLimits===null)delete next.nutrientUpperLimits;else next.nutrientUpperLimits=patch.nutrientUpperLimits;}
 if(Object.hasOwn(patch,'macroPlan')){if(patch.macroPlan===null)delete next.macroPlan;else next.macroPlan=parseMacroPlan(patch.macroPlan);}
 if(Object.hasOwn(patch,'macroPolicy')){if(patch.macroPolicy===null)delete next.macroPolicy;else next.macroPolicy=patch.macroPolicy;}
 if(Object.hasOwn(patch,'carbohydratePolicy'))next.carbohydratePolicy=patch.carbohydratePolicy;
 if(Object.hasOwn(patch,'macroSchedule'))next.macroSchedule=patch.macroSchedule;
 reconcileInactiveEnergyTarget(prev,next,patch);
 const modes=reconcileNutrientTargetModes(prev,next,patch,{dailyIds,maximumIds});
 if(Object.keys(modes.nutrients).length)next.nutrientTargetModes=modes;else delete next.nutrientTargetModes;
 if(next.targetSetup&&setupTargetKeys.some(key=>next.targets?.[key]!==next.targetSetup.targets[key]))delete next.targetSetup;
 state.settings=next;
}

export function applyMealSuggestionPreferenceLocal(state,input){
 const policy=parseMealSuggestionPolicy(state.settings?.mealSuggestions);
 if(input?.action==='tags'){
  const ref=mealReference(input.ref),tags=input.tags===null?null:mealTags(input.tags);
  policy.tags=policy.tags.filter(row=>mealReferenceKey(row.ref)!==mealReferenceKey(ref));
  if(tags)policy.tags.push({ref,revision:input.revision,tags});
 }else if(input?.action==='feedback'){
  const ref=mealReference(input.ref,{template:true});
  policy.lessOften=policy.lessOften.filter(row=>mealReferenceKey(row)!==mealReferenceKey(ref));
  if(input.lessOften)policy.lessOften.push(ref);
 }else if(input?.action==='exclude'){
  const ref=mealReference(input.ref,{template:true});
  policy.excluded=policy.excluded.filter(row=>mealReferenceKey(row)!==mealReferenceKey(ref));
  if(input.excluded)policy.excluded.push(ref);
 }
 state.settings.mealSuggestions=policy;
 return policy;
}

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
