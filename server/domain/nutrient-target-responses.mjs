import {calculateSummary} from './nutrition.mjs';
import {createTargetView,createNutrientTargetsView,upperLimitSettings} from './nutrient-target-view.mjs';
import {createNutritionReport} from './nutrition-report.mjs';
import {defaultDiaryDisplayPolicy} from './diary-display.mjs';
import {resolveHiddenNutrients} from './nutrient-display.mjs';
import {summaryRows,dashboardNutritionCard} from './dashboard-summary.mjs';
import {projectProfileSettings} from '../profile-settings-view.mjs';

export const usesNutrientTargets=path=>/^\/api\/(?:nutrient-targets|targets|target-policies|profile-settings|nutrition-report|dashboard)(?:\?|$)/.test(path);

function retainsIntake(rows,report){
 const nutrients=new Map(report.nutrients.map(row=>[row.id,row]));
 return rows.every(row=>row.mean==null||!nutrients.has(row.id)||(row.mean===nutrients.get(row.id).mean&&row.knownDays===nutrients.get(row.id).knownDays));
}

/** Reuse the cached calendar and selections when recomputing an offline view. */
export function projectNutrientTargetResponse(path,view,state,revision){
 const route=path.split('?')[0],date=view.date,settings=state.settings;
 if(route==='/api/nutrient-targets')return {revision,...createNutrientTargetsView(state,date)};
 if(route==='/api/targets')return {revision,...createTargetView(state,date)};
 if(route==='/api/profile-settings')return projectProfileSettings(state,date,revision);
 if(route==='/api/target-policies'){
  const summary=calculateSummary(state,date);
  return {...view,revision,upperLimits:upperLimitSettings(state,date,summary),effective:{...view.effective,targets:summary.targets}};
 }
 const calendar=view.report?.calendar??view.capture?.calendar;
 if(!calendar)return view;
 const clock={now:new Date(calendar.asOf),timeZone:calendar.timeZone};
 if(route==='/api/nutrition-report'){
  const report=createNutritionReport(state,view.report.options,clock),highlighted=[...(settings.diaryDisplay??defaultDiaryDisplayPolicy).highlighted];
  // Older device copies can lack part of a retained server food or meal. Only
  // refresh intake-based measures when that copy reproduces the known intake.
  if(!retainsIntake(view.report.nutrients,report)){
   const hidden=new Set(resolveHiddenNutrients(settings.nutrientDisplay));
   return {...view,revision,report:{...view.report,nutrients:view.report.nutrients.map(row=>({...row,visible:!hidden.has(row.id)}))},display:{...view.display,highlighted}};
  }
  return {...view,revision,report,display:{...view.display,highlighted}};
 }
 if(route==='/api/dashboard'&&view.summary&&view.capture){
  const report=createNutritionReport(state,{...view.summary.range,dayFilter:'all',includeToday:true,includeSupplements:true},clock);
  const cards={...view.capture.cards};
  const measured=[...(cards.nutrition?.nutrients??[]),...(cards.energy?.summary?[cards.energy.summary]:[]),...view.summary.rows];
  if(!retainsIntake(measured,report)||view.summary.counts.eligibleDays>report.counts.eligibleDays)return view;
  if(cards.nutrition)cards.nutrition=dashboardNutritionCard(report);
  if(cards.energy)cards.energy={...cards.energy,summary:report.nutrients.find(row=>row.id==='calories')};
  return {...view,revision,capture:{...view.capture,cards},summary:{...view.summary,...summaryRows(report,settings,view.summary.widget),counts:report.counts}};
 }
 return view;
}
