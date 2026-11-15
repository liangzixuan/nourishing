import {createNutritionReportCapture} from './nutrition-report.mjs';
import {nutrientDisplayOptions} from './nutrient-display.mjs';
const ids=new Set(nutrientDisplayOptions.map(row=>row.id)),known=value=>typeof value==='number'&&Number.isFinite(value);
const fail=message=>{throw Object.assign(Error(message),{status:400})};
/** The report and ranked sources share one calendar, workspace and filtered daily
 * calculation. Source means use this nutrient's known-day denominator. */
export function createReportNutrientDetail(state,input,clock){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='nutrient,options'||!ids.has(input.nutrient))fail('Choose report options and a known nutrient only.');
 const {report,days}=createNutritionReportCapture(state,input.options,clock,{contributionNutrient:input.nutrient}),summary=input.nutrient==='netCarbohydrate'?report.carbohydrates.net.summary:report.nutrients.find(row=>row.id===input.nutrient);
 const measuredDays=days.filter(day=>known(day.contributions.target.value)),denominator=measuredDays.length,total=denominator?measuredDays.reduce((sum,day)=>sum+day.contributions.target.value,0):null;
 const targetTotal=denominator&&measuredDays.every(day=>known(day.contributions.target.target))?measuredDays.reduce((sum,day)=>sum+day.contributions.target.target,0):null;
 const sources=days.flatMap(day=>day.contributions.entries.filter(entry=>entry.kind==='water'||entry.coverage.total>0).map(entry=>({...entry,date:day.date}))),measured=sources.filter(entry=>known(entry.value));
 measured.sort((a,b)=>b.value-a.value||a.date.localeCompare(b.date)||(a.id??'').localeCompare(b.id??''));
 const entries=measured.slice(0,10).map(entry=>({...entry,mean:denominator?entry.value/denominator:null,percentOfTarget:targetTotal>0?entry.value/targetTotal*100:null}));
 return {version:1,report,detail:{version:1,nutrient:input.nutrient,summary,denominator,total,targetTotal,measuredSources:measured.length,unknownSources:sources.length-measured.length,omittedSources:Math.max(0,measured.length-10),entries}};
}
