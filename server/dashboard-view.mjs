import {dashboardPinnedCharts} from './dashboard-pinned-charts.mjs';
import {projectDashboardHealthCards} from './dashboard-health-cards.mjs';
import {digest} from './data-codec.mjs';
import {act} from './domain/workspace.mjs';
import {date as calendarDate,captureCalendar} from './domain/calendar.mjs';
import {createDashboardView} from './domain/dashboard.mjs';
import {createNutritionReportCapture} from './domain/nutrition-report.mjs';
import {parseDiscoverSettings} from './domain/discover-settings.mjs';
import {projectDashboardSettings,parseDashboardSettings} from './domain/dashboard-settings.mjs';
import {weightSeries} from './domain/body-chart-sources.mjs';
import {createWeightGoalView} from './domain/weight-goal-view.mjs';
import {weightKilogramsPerUnit} from './domain/weight-units.mjs';
import {parseDiaryDisplayPolicy,defaultDiaryDisplayPolicy} from './domain/diary-display.mjs';
import {resolveScoreDisplay} from './domain/nutrition-score-policy.mjs';
import {resetLoggingStreaks,createLoggingStreakView} from './domain/logging-streaks.mjs';
import {fastingScheduleView} from './domain/fasting-schedules.mjs';
import Big from 'big.js';
const fail=message=>{throw Object.assign(Error(message),{status:400,code:400,publicMessage:message});};
export const dashboardCommandFields={
 'dashboard.preferences':['patch'], 'dashboard.widgets':['patch'], 'dashboard.streakReset':['count']
};
const object=(value)=>value&&typeof value==='object'&&!Array.isArray(value);
function clock(context){const now=context?.now??(context?.asOf?new Date(context.asOf):null);captureCalendar(now,context?.timeZone);return {now,timeZone:context.timeZone};}
export function applyDashboardCommand(state,action,context={}){
 if(!Object.hasOwn(dashboardCommandFields,action.type))return {handled:false};
 const p=action.payload,keys=dashboardCommandFields[action.type];if(!object(p)||Object.keys(p).length!==1||!Object.hasOwn(p,keys[0]))fail('Choose dashboard settings only.');
 if(action.type==='dashboard.streakReset'){resetLoggingStreaks(state,p,clock(context));return {handled:true,result:createLoggingStreakView(state,clock(context))};}
 if(!object(p.patch)||!Object.keys(p.patch).length)fail('Choose at least one dashboard setting.');
 const payload=action.type==='dashboard.preferences'?{discover:parseDiscoverSettings({...parseDiscoverSettings(state.settings.discover),...p.patch})}:{dashboard:parseDashboardSettings({...projectDashboardSettings(state.settings.dashboard),widgets:{...projectDashboardSettings(state.settings.dashboard).widgets,...p.patch}})};
 return {handled:true,result:act(state,'settings.save',payload)};
}
// Same date-window rule as the original Discover UI; the account clock owns today.
export function dashboardRange(choice,today,state,prefs){
 if(choice==='custom')return {from:prefs.customFrom,to:prefs.customTo};
 let days=choice==='today'?1:Number(choice);
 if(choice==='all'){const dates=['entries','biometrics','exercises','notes','water'].flatMap(key=>(state[key]??[]).map(row=>row.date)).filter(date=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&date<=today).sort();days=Math.min(3660,Math.max(1,Math.round((Date.parse(today)-Date.parse(dates[0]??today))/86400000)+1));}
 return {from:new Date(Date.parse(today+'T12:00:00Z')-(days-1)*86400000).toISOString().slice(0,10),to:today};
}
function summaryRows(report,settings,widget){
 const nutrient=id=>id==='netCarbohydrate'?report.carbohydrates.net.summary:report.nutrients.find(row=>row.id===id);
 const macros=[nutrient('protein'),{...report.carbohydrate.summary,name:report.carbohydrate.label},nutrient('fat')].filter(Boolean);
 if(widget==='Nutrition Scores')return {rows:resolveScoreDisplay(settings).selected.map(id=>report.scores.summary.find(row=>row.id===id)).filter(Boolean),scores:true,targets:true};
 if(widget==='Highlighted Nutrients')return {rows:(parseDiaryDisplayPolicy(settings.diaryDisplay)??defaultDiaryDisplayPolicy).highlighted.map(id=>{const row=nutrient(id);return row?{...row,id}:null;}).filter(row=>row&&row.visible!==false),targets:true};
 if(widget==='Macro Targets')return {rows:macros,targets:true};
 const metric=widget==='Expenditure'?'expenditure':widget==='Energy Budget'?'remaining':'consumed';return {rows:macros,energy:report.energy.summary.find(row=>row.id===metric)?.mean??null};
}
export function dashboardView(state,{date},context){
 calendarDate(date);const captured=clock(context),preferences=parseDiscoverSettings(state.settings.discover),range=dashboardRange(preferences.reportRange,date,state,preferences);
 const capture=createDashboardView(state,range,captured),cache=new Map();
 const read=window=>{const key=window.from+window.to;if(!cache.has(key))cache.set(key,createNutritionReportCapture(state,{...window,dayFilter:'all',includeToday:true,includeSupplements:true},captured));return cache.get(key);};
 const {report}=read(range),energyRange=dashboardRange(preferences.energyRange,date,state,preferences),energyDays=capture.settings.widgets.energy?read(energyRange).days.map(day=>({date:day.date,totals:day.totals,energy:day.energy})):[];
 const weightRange=dashboardRange(preferences.weightRange,date,state,preferences),weight=weightSeries(state,date),unit=weight.metric?.unit??(state.profile.units==='imperial'?'lb':'kg'),planned=createWeightGoalView(state,date,{...captured,context:'dashboard'});
 const profileWeightUnit=state.profile.units==='imperial'?'lb':'kg';
 const goal=planned?{unit:planned.unit,value:planned.goalWeight,label:planned.weeklyChange===0?'Maintain weight':planned.weeklyChange<0?'Lose weight':'Gain weight'}:{unit:profileWeightUnit,value:Number.isFinite(state.profile.weight)?new Big(state.profile.weight).div(weightKilogramsPerUnit[profileWeightUnit]).toNumber():null,label:state.profile.goal==='Lose'?'Lose weight':state.profile.goal==='Gain'?'Gain weight':'Maintain weight'};
 const target=preferences.weightTarget&&Number.isFinite(goal.value)&&weightKilogramsPerUnit[goal.unit]&&weightKilogramsPerUnit[unit]?new Big(goal.value).times(weightKilogramsPerUnit[goal.unit]).div(weightKilogramsPerUnit[unit]).toNumber():null;
 const upcoming=capture.settings.widgets.fasting?fastingScheduleView(state,captured.now,captured.timeZone).schedules.filter(row=>row.nextStart).sort((a,b)=>a.nextStart.localeCompare(b.nextStart))[0]??null:null;
 return {revision:digest(state),date,unit:state.settings.energyUnit??'kcal',preferences,dashboard:capture.settings,capture,health:projectDashboardHealthCards(capture),pinnedCharts:dashboardPinnedCharts(state,date,captured),streaks:capture.cards.streaks??createLoggingStreakView(state,captured),summary:{widget:preferences.reportWidget,...summaryRows(report,state.settings,preferences.reportWidget),counts:report.counts,range},energyDays,energyRange,weight:{range:weightRange,unit,target,records:weight.records.filter(row=>row.date>=weightRange.from&&row.date<=weightRange.to).map(({date,time,value})=>({date,time,value}))},goal,upcoming:upcoming?{label:upcoming.label,start:upcoming.nextStart}:null,news:{version:1,items:[]},unsupported:['referrals']};
}
