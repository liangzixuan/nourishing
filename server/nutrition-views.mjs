import {createTargetView,createNutrientTargetsView} from './domain/nutrient-target-view.mjs';
import {digest} from './data-codec.mjs';
import {createNutritionReport} from './domain/nutrition-report.mjs';
import {parseEnergyPolicy} from './domain/energy-policy.mjs';
import {parseEnergyUnit} from './domain/energy-units.mjs';
import {parseDiaryDisplayPolicy,defaultDiaryDisplayPolicy} from './domain/diary-display.mjs';
import {resolveScoreDisplay} from './domain/nutrition-score-policy.mjs';
function project(fn){try{return fn();}catch(error){if([400,409].includes(error.status))throw Object.assign(error,{code:error.status,publicMessage:error.message});throw error;}}
export function nutrientTargetsView(state,date){return project(()=>({revision:digest(state),...createNutrientTargetsView(state,date)}));}
export function targetView(state,date){return project(()=>({revision:digest(state),...createTargetView(state,date)}));}
export function reportView(state,options,clock){return project(()=>{
 const report=createNutritionReport(state,options,{now:new Date(),timeZone:'UTC',...clock}),today=report.calendar.today;
 // Match the local Discover All Time range without exposing record contents.
 const dates=['entries','biometrics','exercises','notes','water'].flatMap(key=>(state[key]??[]).map(row=>row.date)).filter(date=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&date<=today).sort();
 const earliest=dates[0]??today,limit=new Date(Date.parse(today+'T12:00:00Z')-3659*86400000).toISOString().slice(0,10);
 const diaryDisplay=parseDiaryDisplayPolicy(state.settings.diaryDisplay)??defaultDiaryDisplayPolicy;
 return {revision:digest(state),energyUnit:parseEnergyUnit(state.settings.energyUnit??'kcal'),report,display:{energyBudget:parseEnergyPolicy(state.settings.energyPolicy)?.display??'remaining',highlighted:[...diaryDisplay.highlighted],scores:resolveScoreDisplay(state.settings).selected},availableRange:{from:earliest<limit?limit:earliest,to:today}};
});}
