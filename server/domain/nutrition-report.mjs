import {captureExpenditureBreakdown} from './expenditure-breakdown.mjs';
import {captureConsumedBreakdown} from './consumed-energy.mjs';
import {captureReportGuidance,NUTRITION_REPORT_CAPTURE_VERSION} from './report-guidance.mjs';
import {captureScoreReportGuidance} from './score-report-guidance.mjs';
import {energyReportLimitationCodes} from './energy-guidance.mjs';
import {mergeSourceAttributions} from './catalog-source.mjs';
import {captureNutrientBalances} from './nutrient-balance-projection.mjs';
import {catalog,createDailyNutritionReader,dataCompletenessIdentities,SUPPLEMENT_CONTRIBUTION_KEYS} from './nutrition.mjs';
import {date,captureCalendar} from './calendar.mjs';
export {parseReportTimeZone} from './calendar.mjs';
import {carbohydrateDefinition,netCarbohydrateDefinition,carbohydrateLabel,carbohydrateDescription} from './carbohydrate-policy.mjs';
import {parseNutrientDisplayPolicy,resolveHiddenNutrients} from './nutrient-display.mjs';
import {nutritionScoreDefinitions} from './nutrition-score-policy.mjs';
import {captureDataCompletenessReport,captureDataCompletenessDay} from './data-completeness-report.mjs';

const dayMilliseconds=86400000,round=value=>Math.round(value*10000)/10000;
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
const known=value=>typeof value==='number'&&Number.isFinite(value);
function displayCapture(days,id,policy,hidden){
  const thresholds=days.map(day=>day.nutrientDisplay.thresholds[id]).filter(Boolean),maximumDays={above:0,within:0,partial:0,unknown:0,eligible:0};
  for(const threshold of thresholds){maximumDays[threshold.status]++;maximumDays.eligible++;}
  const values=thresholds.map(row=>row.maximum),minimum=values.length?Math.min(...values):null,highest=values.length?Math.max(...values):null;
  const maximumRange=values.length?{minimum,maximum:highest,knownDays:values.length,unavailableDays:days.length-values.length}:null;
  const maximum=days.length===0?policy?.maximums[id]??null:values.length===days.length&&minimum===highest?minimum:null;
  const maximumSources=[...new Map(thresholds.filter(row=>row.reference).map(row=>{const item={source:row.reference,intakeBasis:row.intakeBasis,comparisonSupported:row.comparisonSupported};return [JSON.stringify(item),item];})).values()];
  return {visible:!hidden.has(id),maximum,maximumRange,maximumDays,maximumSources};
}
function summarizeDays(days,identity,select){
  const observations=days.map(day=>({complete:day.complete,...select(day)})),measured=observations.filter(row=>known(row.value)),knownDays=measured.length,intake=measured.reduce((sum,row)=>sum+row.value,0),targets=measured.filter(row=>known(row.target)),targetKnownDays=targets.length,targetSum=targets.reduce((sum,row)=>sum+row.target,0);
  const targetReason=knownDays===0?'no-known-intake':targetKnownDays!==knownDays?'missing-target':targetSum===0?'zero-target':null;
  return {...identity,mean:knownDays?round(intake/knownDays):null,eligibleDays:days.length,knownDays,partialDays:measured.filter(row=>!row.coverage.complete).length,unknownDays:days.length-knownDays,zeroByCompletionDays:measured.filter(row=>row.complete&&row.coverage.total===0&&row.value===0).length,targetKnownDays,meanTarget:knownDays&&targetKnownDays===knownDays?round(targetSum/knownDays):null,percentOfMeanTarget:targetReason===null?round(intake/targetSum*100):null,reason:knownDays?null:'no-known-intake',targetReason};
}
const energyFields=[['consumed','Consumed'],['expenditure','Expenditure'],['target','Effective target'],['remaining','Remaining to target'],['balance','Energy balance'],['exercise','Recorded exercise']];
export function captureNutritionScores(days){
  const rows=days.map(day=>({date:day.date,scores:day.scores.map(({id,value,coverage,gate,display,confidence})=>({id,value,coverage:{...coverage},...(gate?{gate:{...gate}}:{}),...(display?{display:{...display}}:{}),...(confidence?{confidence:structuredClone(confidence)}:{})}))}));
  const summary=nutritionScoreDefinitions.map(({id,name,method,description})=>{
    const measured=rows.map(day=>day.scores.find(score=>score.id===id)).filter(score=>known(score.value));
    const confidence=method.startsWith('public-web-')&&id!=='dataQuality'?{method:'mean-daily-source-data-confidence-v1',days:rows.length,value:rows.length?rows.reduce((sum,day)=>sum+day.scores.find(score=>score.id===id).confidence.value,0)/rows.length:null}:null;
    return {id,name,method,description,unit:'%',...(confidence?{confidence}:{}),mean:measured.length?measured.reduce((sum,score)=>sum+score.value,0)/measured.length:null,eligibleDays:rows.length,knownDays:measured.length,partialDays:measured.filter(score=>!score.coverage.complete).length,unknownDays:rows.length-measured.length};
  });
  return {version:6,method:'mean-known-daily-local-scores-v1',summary,days:rows,limitations:captureScoreReportGuidance()};
}
export function captureEnergyReport(days){
  const rows=days.map(day=>({date:day.date,energy:structuredClone(day.energy),coverage:{...day.nutrientCoverage.calories},complete:day.complete,logged:day.logged}));
  const summary=energyFields.map(([id,name])=>{const measured=rows.filter(row=>known(row.energy[id]));return {id,name,unit:'kcal',mean:measured.length?round(measured.reduce((sum,row)=>sum+row.energy[id],0)/measured.length):null,eligibleDays:rows.length,knownDays:measured.length,unknownDays:rows.length-measured.length,partialDays:['consumed','remaining','balance'].includes(id)?measured.filter(row=>!row.coverage.complete).length:0};});
  return {version:3,unit:'kcal',summary,days:rows,breakdown:captureExpenditureBreakdown(rows),consumedBreakdown:captureConsumedBreakdown(days),limitations:[...energyReportLimitationCodes]};
}
export function parseNutritionReportOptions(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['from','to','dayFilter','includeToday','includeSupplements'].includes(key)))fail('Choose nutrition report dates, day filter, Include Today and Include Supplements only.');
  const from=date(input.from),to=date(input.to),days=(Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/dayMilliseconds+1;
  if(days<1||days>3660)fail('Choose an inclusive nutrition report range from 1 to 3660 days.');
  if(!['all','nonempty','complete'].includes(input.dayFilter))fail('Choose all, nonempty or complete report days.');
  if(typeof input.includeToday!=='boolean')fail('Include Today must be true or false.');
  if(typeof input.includeSupplements!=='boolean')fail('Include Supplements must be true or false.');
  return {from,to,dayFilter:input.dayFilter,includeToday:input.includeToday,includeSupplements:input.includeSupplements};
}
export function createNutritionReport(state,input,clock){return createNutritionReportCapture(state,input,clock).report;}

/** Resolve once; full daily facts stay internal for selected-chart and print producers. */
export function createNutritionReportCapture(state,input,{now,timeZone}={}, {contributionNutrient=null}={}){
  const options=parseNutritionReportOptions(input),calendar=captureCalendar(now,timeZone),requestedDays=(Date.parse(options.to+'T00:00:00Z')-Date.parse(options.from+'T00:00:00Z'))/dayMilliseconds+1;
  const counts={requestedDays,excludedTodayDays:0,excludedByFilterDays:0,eligibleDays:0},days=[],start=Date.parse(options.from+'T00:00:00Z');
  const readDay=createDailyNutritionReader(state,{includeSupplements:options.includeSupplements},{contributionNutrient});
  for(let index=0;index<requestedDays;index++){
    const day=new Date(start+index*dayMilliseconds).toISOString().slice(0,10);
    if(!options.includeToday&&day===calendar.today){counts.excludedTodayDays++;continue;}
    const facts=readDay(day);
    if((options.dayFilter==='nonempty'&&!facts.logged)||(options.dayFilter==='complete'&&!facts.complete)){counts.excludedByFilterDays++;continue;}
    days.push(facts);
  }
  counts.eligibleDays=days.length;
  const supplementFilter={...Object.fromEntries(SUPPLEMENT_CONTRIBUTION_KEYS.map(key=>[key,days.reduce((sum,day)=>sum+day.supplementFilter[key],0)])),filteredEmptyDays:days.filter(day=>day.supplementFilter.excludedSupplementContributions>0&&day.supplementFilter.includedFoodContributions+day.supplementFilter.includedSupplementContributions+day.supplementFilter.includedUnclassifiedContributions===0).length};
  const displayPolicy=parseNutrientDisplayPolicy(state.settings?.nutrientDisplay),hidden=new Set(resolveHiddenNutrients(displayPolicy));
  const nutrients=catalog.map(({id,name,unit,category})=>({...summarizeDays(days,{id,name,unit,category},day=>({value:day.totals[id],target:day.targets[id],coverage:day.nutrientCoverage[id]})),...displayCapture(days,id,displayPolicy,hidden)}));
  const definition=carbohydrateDefinition(state.settings),definitions={total:{mode:'total',excluded:[]},net:netCarbohydrateDefinition(state.settings)};
  const carbohydrates=Object.fromEntries(['total','net'].map(mode=>{
    const captured=definitions[mode],label=captured?carbohydrateLabel(captured):'Net carbohydrate',reasons={};
    for(const day of days)for(const [reason,count]of Object.entries(day.carbohydrates[mode].reasons))reasons[reason]=(reasons[reason]??0)+count;
    return [mode,{definition:captured,label,description:captured?carbohydrateDescription(captured):'Net carbohydrate definition is not set.',unit:'g',summary:{...summarizeDays(days,{id:mode+'Carbohydrate',name:label,unit:'g',category:'Tracking'},day=>day.carbohydrates[mode]),...displayCapture(days,mode==='net'?'netCarbohydrate':'carbs',displayPolicy,hidden)},reasons}];
  }));
  const selected=carbohydrates[definition.mode],carbohydrate={...selected,summary:{...selected.summary,id:'trackedCarbohydrate'}};
  const report={version:NUTRITION_REPORT_CAPTURE_VERSION,attributions:mergeSourceAttributions(...days.map(day=>day.attributions)),options,calendar,counts,days:days.map(({date,logged,complete,dataCompleteness})=>({date,logged,complete,dataCompleteness:captureDataCompletenessDay(dataCompleteness)})),nutrients,supplementFilter,carbohydrate,carbohydrates,dataCompleteness:captureDataCompletenessReport(days,dataCompletenessIdentities(carbohydrates)),scores:captureNutritionScores(days),energy:captureEnergyReport(days),balances:captureNutrientBalances(days,state.settings?.nutrientBalances,options),limitations:captureReportGuidance()};
  return {report,days};
}
