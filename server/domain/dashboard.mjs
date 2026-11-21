import {createNutritionReportCapture,parseNutritionReportOptions} from './nutrition-report.mjs';
import {projectDashboardSettings} from './dashboard-settings.mjs';
import {biometricObservations,metricOptions,projectChart} from './chart-metrics.mjs';
import {createLoggingStreakView} from './logging-streaks.mjs';
import {createWeightGoalView} from './weight-goal-view.mjs';
import {configuredWeightProgress} from './body-composition-view.mjs';
import {createCycleView} from './cycle-view.mjs';
import {createCycleOverlay} from './cycle-overlay-capture.mjs';
import {resolveCycleChartOverlays} from './cycle-overlay-settings.mjs';
import {createSleepView} from './sleep.mjs';
import {createGlucoseTimelineView} from './glucose-timeline.mjs';
import {captureFastingTiming} from './fasting-view.mjs';

const invalid=message=>{throw Object.assign(new Error(message),{status:400});};
import {dashboardNutritionCard} from './dashboard-summary.mjs';
export function parseDashboardRange(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==2||Object.keys(input).some(key=>!['from','to'].includes(key)))invalid('Choose dashboard from and to dates only.');
  const {from,to}=parseNutritionReportOptions({...input,dayFilter:'all',includeToday:true,includeSupplements:true});return {from,to};
}
function energyCard(report,days,range){
  const rows=days.map(day=>({date:day.date,consumed:day.energy.consumed,exercise:day.energy.exercise,expenditure:day.energy.expenditure,target:day.energy.target,remaining:day.energy.remaining,balance:day.energy.balance,coverage:{...day.nutrientCoverage.calories},complete:day.complete,logged:day.logged,completionZero:day.complete&&day.nutrientCoverage.calories.total===0&&day.totals.calories===0}));
  const chart=projectChart(days,{kind:'nutrient',id:'calories'},{kind:'energy',id:'expenditure'},range);
  chart.primary.info={...chart.primary.info,name:'Consumed energy'};
  return {chart,rows,summary:report.nutrients.find(row=>row.id==='calories'),capture:report.energy};
}
function weightCard(days,metric,range){
  const observations=metric===null?[]:biometricObservations(days,metric),values=observations.map(row=>row.value),count=values.length;
  let min=null,max=null;for(const value of values){min=min===null?value:Math.min(min,value);max=max===null?value:Math.max(max,value);}
  return {metric,status:metric===null?'unselected':metric.unit===null?'review-required':count?'ready':'empty',chart:metric===null?null:projectChart(days,metric,null,range),statistics:{min,max,spread:count?max-min:null,count,latest:observations.at(-1)??null}};
}
/** One report captures the calendar and raw days before any other source reads.
 * Cards select facts from that capture; no second daily calculation or clock. */
export function createDashboardView(state,input,{now,timeZone}={}){
  const range=parseDashboardRange(input),{report,days}=createNutritionReportCapture(state,{...range,dayFilter:'all',includeToday:true,includeSupplements:true},{now,timeZone});
  const settings=projectDashboardSettings(state.settings?.dashboard),cards={};
  if(settings.widgets.energy)cards.energy=energyCard(report,days,range);
  if(settings.widgets.weight)cards.weight={...weightCard(days,settings.weightMetric,range),progress:configuredWeightProgress(state,range.to),goal:createWeightGoalView(state,range.to,{now:new Date(report.calendar.asOf),timeZone:report.calendar.timeZone,context:'dashboard'})};
  if(settings.widgets.fasting)cards.fasting=captureFastingTiming(state,report.calendar.asOf);
  if(settings.widgets.nutrition)cards.nutrition=dashboardNutritionCard(report);
  if(settings.widgets.coach)cards.coach={range:{...range}};
  if(settings.widgets.streaks)cards.streaks=createLoggingStreakView(state,{now:new Date(report.calendar.asOf),timeZone:report.calendar.timeZone});
  if(settings.widgets.cycle)cards.cycle=createCycleView(state,range,{now:new Date(report.calendar.asOf),timeZone:report.calendar.timeZone});
  if(settings.widgets.sleep)cards.sleep=createSleepView(state,range);
  if(settings.widgets.glucose)cards.glucose=createGlucoseTimelineView(state,range,{now:new Date(report.calendar.asOf),timeZone:report.calendar.timeZone,overlayContext:'dashboard'});
  const cycleChartOverlays=resolveCycleChartOverlays(state.settings?.cycleChartOverlays),overlayCharts=[['dashboardEnergy',cards.energy?.chart],['dashboardWeight',cards.weight?.chart]].filter(([key,chart])=>chart&&cycleChartOverlays.charts[key]);
  if(overlayCharts.length){const capture=createCycleOverlay(state,range,{now:new Date(report.calendar.asOf),timeZone:report.calendar.timeZone});for(const [,chart]of overlayCharts)chart.cycleOverlay=capture;}
  return {version:1,range,calendar:report.calendar,settings,cycleChartOverlays,weightOptions:metricOptions(state).filter(option=>option.metric.kind==='biometric'),cards};
}
