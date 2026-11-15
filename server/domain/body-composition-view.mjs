import {resolveWeightGoalTarget} from './energy-target-state.mjs';
import {date as calendarDate} from './calendar.mjs';
import {parseBodyCompositionPolicy,projectBodyComposition,bodyMetricOptions} from './body-composition.mjs';
import {projectWeightGoalProgress} from './weight-goal.mjs';
import {calculateSummary} from './nutrition.mjs';

export function configuredWeightProgress(state,date){
  const goal=resolveWeightGoalTarget(state.settings)?.goal??null;
  return projectWeightGoalProgress(goal,projectBodyComposition(state.biometrics??[],state.settings?.bodyComposition,date),date);
}

export function createBodyCompositionView(state,date){
  calendarDate(date);const policy=parseBodyCompositionPolicy(state.settings?.bodyComposition),composition=projectBodyComposition(state.biometrics??[],policy,date),goal=resolveWeightGoalTarget(state.settings)?.goal??null;
  return {date,policy,options:bodyMetricOptions(state),composition,weightProgress:projectWeightGoalProgress(goal,composition,date),summary:calculateSummary(state,date)};
}
