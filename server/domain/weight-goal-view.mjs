import {resolveWeightGoalTarget} from './energy-target-state.mjs';
import {projectWeightGoal} from './weight-goal.mjs';
import {captureCalendar} from './calendar.mjs';
import {createCycleOverlay} from './cycle-overlay-capture.mjs';
import {resolveCycleChartOverlays} from './cycle-overlay-settings.mjs';

/** Presentation capture keeps the reviewed plan separate from cycle records. */
export function createWeightGoalView(state,date,{now,timeZone,context='targets',goalInput=undefined}={}){
 if(!['targets','dashboard'].includes(context))throw Error('Choose a supported weight-plan context.');
 const goal=projectWeightGoal(goalInput===undefined?resolveWeightGoalTarget(state.settings)?.goal:goalInput,date);
 if(goal===null)return null;
 const calendar=captureCalendar(now,timeZone),chart=context==='targets'?'targetsWeightGoal':'dashboardWeightGoal',cycleOverlayEnabled=resolveCycleChartOverlays(state.settings?.cycleChartOverlays).charts[chart];
 const range=goal.forecastDate?{from:goal.startDate,to:goal.forecastDate}:null;
 return {...goal,calendar,range,cycleOverlayChart:chart,cycleOverlayEnabled,...(cycleOverlayEnabled&&range?{cycleOverlay:createCycleOverlay(state,range,{now:new Date(calendar.asOf),timeZone:calendar.timeZone})}:{})};
}
