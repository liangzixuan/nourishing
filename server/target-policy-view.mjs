import {parseEnergyUnit} from './domain/energy-units.mjs';
import {act} from './domain/workspace.mjs';
import {prepareTargetPolicyCommand,targetPolicyCommandFields} from './target-policy-commands.mjs';
import {digest} from './data-codec.mjs';
import {date as calendarDate} from './domain/calendar.mjs';
import {parseMacroPolicy,KETO_PRESETS} from './domain/macro-policy.mjs';
import {parseEnergyPolicy} from './domain/energy-policy.mjs';
import {carbohydratePreferences} from './domain/carbohydrate-policy.mjs';
import {parseMacroPlan,projectMacroWeek} from './domain/macro-templates.mjs';
import {calculateSummary} from './domain/nutrition.mjs';

export function targetPolicyView(state,date,{today}={}){
 calendarDate(date);calendarDate(today);
 const carbohydrate=carbohydratePreferences(state.settings),carbohydrateId=carbohydrate.mode==='net'?'netCarbohydrate':'carbs',summary=calculateSummary(state,date);
 return {revision:digest(state),date,today,energyUnit:parseEnergyUnit(state.settings.energyUnit??'kcal'),expenditureBreakdown:summary.expenditureBreakdown,macro:parseMacroPolicy(state.settings.macroPolicy)??{mode:'fixed',targets:{protein:state.settings.targets.protein??null,carbohydrate:state.settings.targets[carbohydrateId]??null,fat:state.settings.targets.fat??null}},energyPolicy:parseEnergyPolicy(state.settings.energyPolicy),calories:state.settings.targets.calories??null,carbohydrate,carbohydrateId,ketoPresets:KETO_PRESETS,weekday:structuredClone(state.settings.macroSchedule??{}),plan:parseMacroPlan(state.settings.macroPlan),week:projectMacroWeek(state.settings.macroPlan,today),effective:{targets:summary.targets,macroTargets:summary.macroTargets,energy:summary.energy,assignment:summary.targetAssignment}};
}

/** Preview shares the command parser and canonical settings application. */
export function previewTargetPolicy(state,input,context){
 const fail=()=>{throw Object.assign(Error('Choose a valid target change.'),{status:400,code:400,publicMessage:'Choose a valid target change.'});};
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==3||!['date','type','payload'].every(k=>Object.hasOwn(input,k))||!Object.hasOwn(targetPolicyCommandFields,input.type))fail();
 calendarDate(input.date);const copy=structuredClone(state);
 try{const action=prepareTargetPolicyCommand(copy,{type:input.type,payload:input.payload},context);act(copy,action.type,action.payload);return {revision:digest(state),view:targetPolicyView(copy,input.date,context)};}catch(error){if(error.status===400)Object.assign(error,{code:400,publicMessage:error.message});throw error;}
}
