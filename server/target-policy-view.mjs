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
 return {revision:digest(state),date,today,macro:parseMacroPolicy(state.settings.macroPolicy)??{mode:'fixed',targets:{protein:state.settings.targets.protein??null,carbohydrate:state.settings.targets[carbohydrateId]??null,fat:state.settings.targets.fat??null}},energyPolicy:parseEnergyPolicy(state.settings.energyPolicy),calories:state.settings.targets.calories??null,carbohydrate,carbohydrateId,ketoPresets:KETO_PRESETS,weekday:structuredClone(state.settings.macroSchedule??{}),plan:parseMacroPlan(state.settings.macroPlan),week:projectMacroWeek(state.settings.macroPlan,today),effective:{targets:summary.targets,macroTargets:summary.macroTargets,energy:summary.energy,assignment:summary.targetAssignment}};
}
