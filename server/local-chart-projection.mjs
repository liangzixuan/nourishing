import Big from 'big.js';
import {createMobileChartView} from './domain/mobile-chart-view.mjs';
import {parseCycleRecordValues} from './domain/cycle-record-parser.mjs';
import {applyChartPreference} from './domain/chart-display-command.mjs';
import {chartMetricOptions} from './chart-options.mjs';
import {mobileChartUnitChoices} from './domain/mobile-chart-metrics.mjs';
import {chartDisplayUnits} from './domain/chart-display-units.mjs';
import {date as calendarDate,captureCalendar} from './domain/calendar.mjs';
import {createDashboardView} from './domain/dashboard.mjs';
import {createNutritionReport,createNutritionReportCapture} from './domain/nutrition-report.mjs';
import {parseDiscoverSettings} from './domain/discover-settings.mjs';
import {weightSeries} from './domain/body-chart-sources.mjs';
import {createWeightGoalView} from './domain/weight-goal-view.mjs';
import {weightKilogramsPerUnit} from './domain/weight-units.mjs';
import {summaryRows} from './domain/dashboard-summary.mjs';
import {createLoggingStreakView} from './domain/logging-streaks.mjs';
import {fastingScheduleView} from './domain/fasting-schedules.mjs';
import {projectDashboardHealthCards} from './dashboard-health-cards.mjs';
import {parseEnergyPolicy} from './domain/energy-policy.mjs';
import {parseEnergyUnit} from './domain/energy-units.mjs';
import {parseDiaryDisplayPolicy,defaultDiaryDisplayPolicy} from './domain/diary-display.mjs';
import {resolveScoreDisplay} from './domain/nutrition-score-policy.mjs';
export {projectLocalTargetPolicyView,projectLocalTargetPolicyPreview,projectLocalMacroTemplatePreview,projectLocalRepeatView} from './local-target-policy.mjs';

function formatCards(state,cards){
 return cards.map(card=>({...card,unitChoices:Object.fromEntries(['primary','secondary'].map(axis=>[axis,card.kind==='custom'?(card.definition[axis]?chartDisplayUnits(card.definition[axis]):[]):mobileChartUnitChoices(state,card.id,axis,card.settings)]))}));
}

/** Same chart-surface producer as the server, over the account's local snapshot. */
export function projectLocalChartSurface(state,input,clock,revision){
 const view=createMobileChartView(state,input,clock);
 return {...view,revision,options:chartMetricOptions(state,view.preferences),saved:state.charts??[],cards:formatCards(state,view.cards)};
}

function dashboardRange(choice,today,state,prefs){
 if(choice==='custom')return {from:prefs.customFrom,to:prefs.customTo};
 let days=choice==='today'?1:Number(choice);
 if(choice==='all'){
  const dates=['entries','biometrics','exercises','notes','water'].flatMap(key=>(state[key]??[]).map(row=>row.date)).filter(date=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&date<=today).sort();
  days=Math.min(3660,Math.max(1,Math.round((Date.parse(today)-Date.parse(dates[0]??today))/86400000)+1));
 }
 return {from:new Date(Date.parse(today+'T12:00:00Z')-(days-1)*86400000).toISOString().slice(0,10),to:today};
}

/** Same dashboard producer as the server, over the account's local snapshot. */
export function projectLocalDashboard(state,{date},context,revision){
 calendarDate(date);
 const now=context?.now??(context?.asOf?new Date(context.asOf):new Date());
 const timeZone=context?.timeZone??'UTC';
 captureCalendar(now,timeZone);
 const captured={now,timeZone},preferences=parseDiscoverSettings(state.settings.discover),range=dashboardRange(preferences.reportRange,date,state,preferences);
 const capture=createDashboardView(state,range,captured),cache=new Map();
 const read=window=>{const key=window.from+window.to;if(!cache.has(key))cache.set(key,createNutritionReportCapture(state,{...window,dayFilter:'all',includeToday:true,includeSupplements:true},captured));return cache.get(key);};
 const {report}=read(range),energyRange=dashboardRange(preferences.energyRange,date,state,preferences),energyDays=capture.settings.widgets.energy?read(energyRange).days.map(day=>({date:day.date,totals:day.totals,energy:day.energy})):[];
 const weightRange=dashboardRange(preferences.weightRange,date,state,preferences),weight=weightSeries(state,date),unit=weight.metric?.unit??(state.profile?.units==='imperial'?'lb':'kg'),planned=createWeightGoalView(state,date,{...captured,context:'dashboard'});
 const profileWeightUnit=state.profile?.units==='imperial'?'lb':'kg';
 const goal=planned?{unit:planned.unit,value:planned.goalWeight,mode:planned.weeklyChange===0?'maintain':planned.weeklyChange<0?'lose':'gain'}:{unit:profileWeightUnit,value:Number.isFinite(state.profile?.weight)?new Big(state.profile.weight).div(weightKilogramsPerUnit[profileWeightUnit]).toNumber():null,mode:state.profile?.goal==='Lose'?'lose':state.profile?.goal==='Gain'?'gain':'maintain'};
 const target=preferences.weightTarget&&Number.isFinite(goal.value)&&weightKilogramsPerUnit[goal.unit]&&weightKilogramsPerUnit[unit]?new Big(goal.value).times(weightKilogramsPerUnit[goal.unit]).div(weightKilogramsPerUnit[unit]).toNumber():null;
 const upcoming=capture.settings.widgets.fasting?fastingScheduleView(state,captured.now,captured.timeZone).schedules.filter(row=>row.nextStart).sort((a,b)=>a.nextStart.localeCompare(b.nextStart))[0]??null:null;
 return {revision,date,unit:state.settings.energyUnit??'kcal',preferences,dashboard:capture.settings,capture,health:projectDashboardHealthCards(capture),pinnedCharts:projectLocalChartSurface(state,{to:date,surface:'dashboard'},captured,revision),streaks:capture.cards.streaks??createLoggingStreakView(state,captured),summary:{widget:preferences.reportWidget,...summaryRows(report,state.settings,preferences.reportWidget),counts:report.counts,range},summaries:{Consumed:{widget:'Consumed',...summaryRows(report,state.settings,'Consumed'),counts:report.counts,range},Remaining:{widget:'Remaining',...summaryRows(report,state.settings,'Remaining'),counts:report.counts,range}},energyDays,energyRange,weight:{range:weightRange,unit,target,records:weight.records.filter(row=>row.date>=weightRange.from&&row.date<=weightRange.to).map(({date,time,value})=>({date,time,value}))},goal,upcoming:upcoming?{label:upcoming.label,start:upcoming.nextStart}:null,news:{version:1,items:[]},unsupported:['referrals']};
}

/** Same nutrition-report producer as the server, over the account's local snapshot. */
export function projectLocalReport(state,options,clock,revision){
 const report=createNutritionReport(state,options,{now:new Date(),timeZone:'UTC',...clock}),today=report.calendar.today;
 const dates=['entries','biometrics','exercises','notes','water'].flatMap(key=>(state[key]??[]).map(row=>row.date)).filter(date=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&date<=today).sort();
 const earliest=dates[0]??today,limit=new Date(Date.parse(today+'T12:00:00Z')-3659*86400000).toISOString().slice(0,10);
 const diaryDisplay=parseDiaryDisplayPolicy(state.settings.diaryDisplay)??defaultDiaryDisplayPolicy;
 return {revision,energyUnit:parseEnergyUnit(state.settings.energyUnit??'kcal'),report,display:{energyBudget:parseEnergyPolicy(state.settings.energyPolicy)?.display??'remaining',highlighted:[...diaryDisplay.highlighted],scores:resolveScoreDisplay(state.settings).selected},availableRange:{from:earliest<limit?limit:earliest,to:today}};
}

/** Same producer and command rules as the server, over the account's local snapshot. */
export async function projectLocalChart(state,action,view,id){
 const next=structuredClone(state);applyChartPreference(next,action);
 const identities=new Map();
 for(const row of next.cycleRecords??[]){const key=JSON.stringify([row.source?.id,row.metric,row.source?.recordId]);if(!identities.has(key)){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));identities.set(key,'cycle-'+Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join(''));}}
 next.cycleRecords=parseCycleRecordValues(next.cycleRecords,(...parts)=>identities.get(JSON.stringify(parts)));
 const result=createMobileChartView(next,{to:view.to,card:id},{now:new Date(view.calendar.asOf),timeZone:view.calendar.timeZone});
 if(!Object.hasOwn(state,'cycleRecords')){
  // Offline snapshots omit the health records. Reuse the server's capture only
  // for dates it examined, retaining the boundaries and original source IDs.
  result.hasRecordedPhases=view.hasRecordedPhases;
  const previous=view.cards.find(row=>row.id===id);
  const source=view.cycleSource?.id===id?view.cycleSource:previous?.cycleOverlay?{
   id,dates:previous.cycleCoveredDates??previous.dates,observations:previous.cycleOverlay.observations
  }:null;
  if(source)result.cycleSource=source;
  for(const card of result.cards.filter(row=>row.cycleOverlayEnabled)){
   const dates=new Set(card.dates.filter(day=>day<view.calendar.today));
   const covered=new Set(source?.dates);
   card.cycleOverlay.observations=(source?.observations??[]).filter(row=>dates.has(row.date));
   if(view.hasRecordedPhases!==false&&[...dates].some(day=>!covered.has(day))){
    card.cycleCoveredDates=[...dates].filter(day=>covered.has(day));
   }
  }
 }
 return {...result,localChartState:{mobileCharts:next.settings.mobileCharts,charts:next.charts},revision:view.revision,options:chartMetricOptions(next,result.preferences),saved:next.charts,cards:formatCards(next,result.cards)};
}
