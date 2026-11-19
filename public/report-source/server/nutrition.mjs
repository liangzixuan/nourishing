import {parseNutrientTargetModes,activeNutrientMaximums} from './nutrient-target-modes.mjs';
import {captureExpenditureBreakdown} from './expenditure-breakdown.mjs';
import {captureScoreLimitations} from './score-limitations.mjs';
import {recipeForEntry} from './recipe-entry.mjs';
import {foodConsumedEnergy,combineConsumedEnergy} from './consumed-energy.mjs';
import {mealForEntry} from './meal-entry.mjs';
import {sourceAttributions,mergeSourceAttributions} from './catalog-source.mjs';
import {captureDayFoodQuality,captureFoodAvailability,sourceScoreConfidence,dataQualityScoreFacts} from './food-quality-capture.mjs';
import {captureSourceScoreDisplay} from './source-score-display.mjs';
import {calculateCalciumScore,calciumScoreFacts} from './calcium-score.mjs';
import {resolveDiaryGroups} from './diary-group-display.mjs';
import {overallScoreFacts} from './overall-score.mjs';
import {carbohydrateMeasurements,combineCarbohydrateMeasurements,projectCarbohydrates} from './carbohydrate-facts.mjs';
import {progressScoreFacts,plantProteinReference} from './progress-score.mjs';
import {oralScoreFacts} from './oral-score.mjs';
import {ketoScoreFacts} from './keto-score.mjs';
import {diaryDayComplete} from './diary-day-status.mjs';
import {loggedWaterMilliliters} from './water-measurement.mjs';
import {projectNutrientBalances} from './nutrient-balance-projection.mjs';
import {resolvedCarbohydrateValues} from './carbohydrate-values.mjs';
import {resolveRecipeQuantity} from './recipe-quantity.mjs';
import {resolveFoodQuantity,parseServingAmount} from './food-quantity.mjs';
import {parseFoodClassification} from './food-classification.mjs';
import {carbohydrateDefinition, carbohydrateLabel, NET_CARBOHYDRATE_TARGET_ID} from './carbohydrate-policy.mjs';
import {calculateEnergy} from './energy-policy.mjs';
import {calculateMacroTargets} from './macro-policy.mjs';
import {resolveMacroAssignment} from './macro-templates.mjs';
import {parseBodyCompositionPolicy,projectBodyComposition} from './body-composition.mjs';
import {resolveNutrientMaximums} from './nutrient-upper-limits.mjs';
import {projectNutrientDisplay,resolveHiddenNutrients} from './nutrient-display.mjs';
import {projectDiaryDisplay,createNutrientContributions,projectDiaryTable} from './diary-display.mjs';
import {projectNutrientReferences,parseNutrientReferencePolicy} from './nutrient-references.mjs';
import {date as calendarDate} from './calendar.mjs';
import {nutritionScoreDefinitions,nutritionScoreDescription} from './nutrition-score-policy.mjs';
import Big from './../vendor/big.js/7.0.1/big.mjs';
import {foodData,projectDataCompleteness,projectScoreDataCompleteness} from './data-completeness.mjs';

/**
 * Local nutrition arithmetic. Sample targets are editable product defaults.
 * Missing measurements stay unknown. These calculations do not reproduce a
 * proprietary nutrition score or provide personal dietary advice.
 */
import {catalog} from './nutrient-catalog.mjs';
export {catalog} from './nutrient-catalog.mjs';

const nutrientIds = catalog.map(n => n.id);
const own = (object, key) => Object.hasOwn(object ?? {}, key);
const validNumber = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const round = value => Math.round(value * 10000) / 10000;
const roundCarbohydrate = value => Number.isFinite(value*10000)?round(value):value;
const emptyValues = value => Object.fromEntries(nutrientIds.map(id => [id, value]));
// Keep arithmetic precise through leaf scaling and every composite layer.
// Public projections round only after their own aggregation is complete.
const projectedValues = values => Object.fromEntries(nutrientIds.map(id => [id, values[id] === null ? null : round(values[id])]));
const remainingTargets=(targets,values)=>Object.fromEntries(nutrientIds.map(id=>[id,targets[id]===null||values[id]===null?null:targets[id]-values[id]]));
export const SUPPLEMENT_CONTRIBUTION_KEYS=Object.freeze(['includedFoodContributions','includedSupplementContributions','includedUnclassifiedContributions','excludedSupplementContributions']);
const emptySupplementFilter=()=>Object.fromEntries(SUPPLEMENT_CONTRIBUTION_KEYS.map(key=>[key,0]));
const allFoodPolicy=Object.freeze({includeSupplements:true});
const antioxidantReferences=Object.freeze({betaCarotene:15000,lycopene:30000,luteinZeaxanthin:12000});
const antioxidantSourceUrl='https://support.cronometer.com/hc/en-us/articles/360042110112-Nutrition-Scores';

function quantity(value, fallback = 1) {
  return parseServingAmount(value === undefined ? fallback : value);
}

function availabilityFacts(result,amount,kind='food',ingredients){
  const f=result.supplementFilter;if(f.excludedSupplementContributions>0&&f.includedFoodContributions+f.includedSupplementContributions+f.includedUnclassifiedContributions===0)return null;
  // Local providers do not establish CRDB identity. A display name or local
  // supplement classification must never activate CRDB missing-field credit.
  const measurements=Object.fromEntries(nutrientIds.map(id=>[id,result.coverage[id].known>0?result.values[id]:null]));
  measurements.carbs=result.carbohydrates.total.coverage.known>0?result.carbohydrates.total.value:null;
  measurements.netCarbohydrate=result.carbohydrates.net.coverage.known>0?result.carbohydrates.net.value:null;
  return {amount,food:{kind,sourceDatabase:null,classification:null,measurements,...(ingredients?{ingredients}:{})}};
}
function measurement(record = {}, amount = 1,contribution='includedUnclassifiedContributions',settings={}) {
  const values=resolvedCarbohydrateValues(record.nutrients);
  const carbohydrates=carbohydrateMeasurements(record,settings);
  const result={
    values: Object.fromEntries(nutrientIds.map(id => [id, validNumber(values[id]) ? values[id] * amount : null])),
    coverage: Object.fromEntries(nutrientIds.map(id => [id, {known: validNumber(values[id]) ? 1 : 0, total: 1, complete: validNumber(values[id])}])),
    supplementFilter:{...emptySupplementFilter(),[contribution]:1},
    carbohydrates:combineCarbohydrateMeasurements([carbohydrates],amount),
    attributions:sourceAttributions(record.source),
  };
  result.consumedEnergy=combineConsumedEnergy([foodConsumedEnergy(record,carbohydrates.total.value,values)],amount);
  const availability=availabilityFacts(result,amount);availability.food.classification=contribution==='includedFoodContributions'?'food':contribution==='includedSupplementContributions'?'supplement':null;
  return {...result,availability};
}
function unresolvedEntry(entry,settings){
  const result=measurement({},1,'includedUnclassifiedContributions',settings);
  // Even when the referenced resource is gone, an explicit zero quantity is
  // known. Nonzero unresolved quantities only select the parent-map fallback.
  return {...result,availability:{amount:entry.quantity===0?0:quantity(entry.amount),food:null}};
}

function combine(results, scale = 1) {
  const values = emptyValues(0);
  const coverage = Object.fromEntries(nutrientIds.map(id => [id, {known: 0, total: 0, complete: true}]));
  const supplementFilter=emptySupplementFilter();
  const carbohydrates=combineCarbohydrateMeasurements(results.map(result=>result.carbohydrates),scale);
  for (const result of results) {
    // Diagnostics count source leaf occurrences, independently of serving scale.
    for(const key of SUPPLEMENT_CONTRIBUTION_KEYS)supplementFilter[key]+=result.supplementFilter?.[key]??0;
    for (const id of nutrientIds) {
      if (result.values[id] !== null) values[id] += result.values[id] * scale;
      coverage[id].known += result.coverage[id].known;
      coverage[id].total += result.coverage[id].total;
      coverage[id].complete &&= result.coverage[id].complete;
    }
  }
  for (const id of nutrientIds) if(coverage[id].total > 0 && coverage[id].known === 0)values[id] = null;
  return {values, coverage,supplementFilter,carbohydrates,consumedEnergy:combineConsumedEnergy(results.map(result=>result.consumedEnergy),scale),attributions:mergeSourceAttributions(...results.map(result=>result.attributions))};
}

function recipeResult(state, recipe, amount = 1,policy=allFoodPolicy) {
  if (!recipe) return measurement({},1,'includedUnclassifiedContributions',state.settings);
  const servings = quantity(recipe.servings, 1);
  if (servings <= 0) throw new Error('Recipe yield must be greater than zero.');
  const children=(recipe.ingredients ?? []).map(item=>entryResult(state,item,policy)),result=combine(children,amount/servings);
  return {...result,availability:availabilityFacts(result,amount,'recipe',children.map(r=>r.availability).filter(r=>r!==null))};
}

function mealResult(state, meal, amount = 1,policy=allFoodPolicy) {
  if (!meal) return measurement({},1,'includedUnclassifiedContributions',state.settings);
  const children=(meal.items ?? []).map(item=>entryResult(state,item,policy)),result=combine(children,amount);
  return {...result,availability:availabilityFacts(result,amount,'meal',children.map(r=>r.availability).filter(r=>r!==null))};
}

function entryResult(state, entry,policy=allFoodPolicy) {
  const settings=state.settings;
  if (entry.nutrients && typeof entry.nutrients === 'object') return measurement(entry, quantity(entry.amount),'includedUnclassifiedContributions',settings);
  if (entry.foodId) {
    const food = (state.foods ?? []).find(item => item.id === entry.foodId);
    if (!food) return unresolvedEntry(entry,settings);
    const resolvedQuantity = resolveFoodQuantity(food, entry);
    const amount=resolvedQuantity?.amount??quantity(entry.amount),classification=parseFoodClassification(food).classification;
    if(classification==='supplement'&&!policy.includeSupplements){const excluded=combine([]);excluded.supplementFilter.excludedSupplementContributions=1;return {...excluded,resolvedQuantity,availability:null};}
    const contribution=classification==='food'?'includedFoodContributions':classification==='supplement'?'includedSupplementContributions':'includedUnclassifiedContributions';
    return {...measurement(food,amount,contribution,settings), resolvedQuantity};
  }
  if (entry.recipeId) {
    const recipe = recipeForEntry((state.recipes ?? []).find(item => item.id === entry.recipeId),entry);
    if (!recipe) return unresolvedEntry(entry,settings);
    const resolvedQuantity = resolveRecipeQuantity(recipe, entry,state);
    return {...recipeResult(state, recipe, resolvedQuantity?.amount ?? quantity(entry.amount),policy), resolvedQuantity};
  }
  if (entry.mealId){const meal=mealForEntry((state.meals??[]).find(item=>item.id===entry.mealId),entry);return meal?mealResult(state,meal,quantity(entry.amount),policy):unresolvedEntry(entry,settings);}
  return unresolvedEntry(entry,settings);
}

export function resolveNutrients(state, entry) { return projectedValues(entryResult(state, entry).values); }
export function entryFacts(state,entry){return namedEntry(state,entry,entryResult(state,entry));}
/** Export consumers retain the same resolved facts before display rounding. */
export function entryNutrientMeasurements(state,entry){return namedEntry(state,entry,entryResult(state,entry),false);}
/** Raw combined intake; callers retain the selected records and their identities. */
export function combinedEntryNutrientMeasurements(state,entries){
  const result=combine(entries.map(entry=>entryResult(state,entry)));
  return {nutrients:result.values,coverage:result.coverage,attributions:result.attributions};
}
export function recipeNutrition(state,recipe){
  const result=recipeResult(state,recipe),carbohydrates=carbohydratePairProjection(state,result.carbohydrates);
  return {nutrients:projectedValues(result.values),coverage:result.coverage,carbohydrates,carbohydrate:carbohydrates[carbohydrateDefinition(state.settings).mode],attributions:result.attributions};
}
export function recipeNutrients(state, recipe) { return projectedValues(recipeResult(state, recipe).values); }
export function mealNutrients(state, meal) { return projectedValues(mealResult(state, meal).values); }
export function recipeNutrientCoverage(state, recipe) { return recipeResult(state, recipe).coverage; }
export function mealNutrientCoverage(state, meal) { return mealResult(state, meal).coverage; }

function carbohydratePairProjection(state,measurements,project=true,targets,emptyIsUnknown=false){
  return projectCarbohydrates({settings:state.settings,measurements,targets,roundValue:project?roundCarbohydrate:value=>value,emptyIsUnknown});
}
function carbohydrateProjection(state,measurements,project=true,target){
  const mode=carbohydrateDefinition(state.settings).mode;
  return carbohydratePairProjection(state,measurements,project,target===undefined?undefined:{[mode]:target})[mode];
}
export function resolveCarbohydrates(state,entry){return carbohydratePairProjection(state,entryResult(state,entry).carbohydrates);}
export function resolveCarbohydrate(state,entry){return carbohydrateProjection(state,entryResult(state,entry).carbohydrates);}
export function foodCarbohydrate(state,food){return carbohydrateProjection(state,measurement(food,1,'includedUnclassifiedContributions',state.settings).carbohydrates);}
export function recipeCarbohydrate(state,recipe){return carbohydrateProjection(state,recipeResult(state,recipe).carbohydrates);}
export function mealCarbohydrate(state,meal){return carbohydrateProjection(state,mealResult(state,meal).carbohydrates);}

function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Date must use YYYY-MM-DD.');
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new Error('Date is invalid.');
  return date;
}

export function resolveTargetSettings(state, date) {
  const configured = state.settings?.targets ?? {};
  const scheduled = state.settings?.macroSchedule?.[parseDate(date).getUTCDay()] ?? {};
  const known=value=>validNumber(value)?value:null;
  const fixed=Object.fromEntries(catalog.map(nutrient=>[nutrient.id,known(own(configured,nutrient.id)?configured[nutrient.id]:nutrient.target)]));
  const modes=parseNutrientTargetModes(state.settings?.nutrientTargetModes).nutrients;
  for(const [id,choice]of Object.entries(modes))if(choice.daily==='reference')fixed[id]=null;
  const references=projectNutrientReferences(state.settings?.nutrientReferences,date,state.settings?.nutrientTargetModes);
  const activeMaximums=activeNutrientMaximums(state.settings?.nutrientDisplay,state.settings?.nutrientTargetModes);
  Object.assign(fixed,references.values);
  const targets=Object.fromEntries(catalog.map(nutrient=>[nutrient.id,own(scheduled,nutrient.id)?known(scheduled[nutrient.id]):fixed[nutrient.id]]));
  const customTargetOrigin=id=>own(scheduled,id)?'weekday':!own(references.values,id)&&modes[id]?.daily!=='reference'&&own(configured,id)?'saved':own(activeMaximums,id)?'custom-maximum':null;
  const antioxidantTargets=Object.fromEntries(Object.entries(antioxidantReferences).map(([id,value])=>{
    const origin=customTargetOrigin(id)??'published';
    return [id,{origin,ordinaryTarget:targets[id],reference:origin==='published'?{value,unit:catalog.find(row=>row.id===id).unit,sourceUrl:antioxidantSourceUrl}:null}];
  }));
  const carbohydrateTargetId=carbohydrateDefinition(state.settings).mode==='total'?'carbs':NET_CARBOHYDRATE_TARGET_ID;
  const resolved=resolveMacroAssignment(state.settings?.macroPlan,date),{settings:template,...targetAssignment}=resolved;
  let macroPolicy=state.settings?.macroPolicy,energyPolicy=state.settings?.energyPolicy,fixedTargets={protein:fixed.protein,carbohydrate:carbohydrateTargetId==='carbs'?fixed.carbs:known(configured[NET_CARBOHYDRATE_TARGET_ID]),fat:fixed.fat};
  const weekdayTargets={...scheduled},overrideSources=Object.fromEntries(Object.keys(scheduled).map(id=>[id,'weekday']));
  if(template){
    for(const id of ['protein','fat',carbohydrateTargetId]){delete weekdayTargets[id];delete overrideSources[id];}
    if(template.macro.mode==='fixed'){macroPolicy=null;fixedTargets={...template.macro.targets};}else macroPolicy=template.macro;
    if(template.energy.mode==='fixed'){
      weekdayTargets.calories=template.energy.kcal;
      overrideSources.calories='template';
      if(energyPolicy)energyPolicy={...energyPolicy,target:{mode:'fixed',includeAboveBaseline:false}};
    }
  }
  const bodyPolicy=parseBodyCompositionPolicy(state.settings?.bodyComposition),body=bodyPolicy&&(bodyPolicy.useForResting||bodyPolicy.useHeightForResting||bodyPolicy.useForKeto)?projectBodyComposition(state.biometrics??[],bodyPolicy,date):null;
  const recordedInputs={...(bodyPolicy?.useForResting?{recordedWeightKg:body.weightKg}:{}),...(bodyPolicy?.useHeightForResting?{recordedHeightCm:body.heightCm}:{}),...(bodyPolicy?.useForKeto?{recordedLeanMassKg:body.leanMassKg}:{})};
  const {maximums}=resolveNutrientMaximums(state.settings?.nutrientDisplay,state.settings?.nutrientUpperLimits,state.settings?.nutrientReferences,date,state.settings?.nutrientTargetModes);
  const customScoreTargets=Object.fromEntries(['sodium','sugar'].map(id=>[id,customTargetOrigin(id)!==null]));
  const ironReference=references.references.find(row=>row.id==='iron'&&row.selected);
  const plantTargets={ironReference:ironReference?{referenceSet:references.referenceSet,kind:ironReference.kind,sourceUrl:ironReference.source.url,group:ironReference.source.group??null,ageLabel:ironReference.source.ageLabel??null}:null,ironOrigin:customTargetOrigin('iron'),proteinOrigin:template?.macro.mode==='fixed'?'template':customTargetOrigin('protein'),proteinMaximumCustom:own(activeMaximums,'protein'),proteinReference:plantProteinReference(parseNutrientReferencePolicy(state.settings?.nutrientReferences),date)};
  return {targets,hiddenNutrients:new Set(resolveHiddenNutrients(state.settings?.nutrientDisplay)),inactiveNetTarget:known(own(weekdayTargets,NET_CARBOHYDRATE_TARGET_ID)?weekdayTargets[NET_CARBOHYDRATE_TARGET_ID]:configured[NET_CARBOHYDRATE_TARGET_ID]),plantTargets,antioxidantTargets,maximums,customScoreTargets,weekdayTargets,overrideSources,carbohydrateTargetId,configuredEnergyTarget:fixed.calories,fixedTargets,macroPolicy,energyPolicy,targetAssignment,recordedInputs};
}

export function isExerciseEntry(entry) {
  return entry.kind === 'exercise' || entry.type === 'exercise' || validNumber(entry.caloriesBurned) || validNumber(entry.exerciseCalories);
}

/** Resolve the recorded exercise fields for every expenditure consumer. */
export function exerciseEntryFacts(entry){
  return {calories:validNumber(entry.caloriesBurned)?entry.caloriesBurned:validNumber(entry.exerciseCalories)?entry.exerciseCalories:validNumber(entry.calories)?entry.calories:null,duration:validNumber(entry.duration)?entry.duration:null};
}

function namedEntry(state, entry, result,project=true) {
  const resource = entry.foodId ? state.foods?.find(item => item.id === entry.foodId) : entry.recipeId ? state.recipes?.find(item => item.id === entry.recipeId) : state.meals?.find(item => item.id === entry.mealId);
  const carbohydrates=carbohydratePairProjection(state,result.carbohydrates,project);
  return {...entry, ...result.resolvedQuantity, attributions:result.attributions, name: resource?.name || entry.name || 'Unavailable food', nutrients: project?projectedValues(result.values):result.values, coverage: result.coverage,carbohydrates,carbohydrate:carbohydrates[carbohydrateDefinition(state.settings).mode]};
}

function scoreFacts(definition,totals,targets,coverage,carbohydrate,targetSettings) {
  const facts=scoreCalculationFacts(definition,totals,targets,coverage,carbohydrate,targetSettings);
  if(!definition.method.startsWith('public-web-'))return facts;
  const {value,...display}=captureSourceScoreDisplay(facts.score.value,targetSettings.foodEntryCount);
  return {...facts,score:{...facts.score,value,display,...(definition.id==='dataQuality'?{}:{confidence:sourceScoreConfidence(targetSettings.foodAvailability,facts.confidenceComponentIds??facts.componentIds)})}};
}
function scoreCalculationFacts(definition,totals,targets,coverage,carbohydrate,targetSettings) {
  if(definition.id==='dataQuality')return dataQualityScoreFacts(definition,targetSettings.foodAvailability,targetSettings.hiddenNutrients);
  if(definition.id==='calciumAbsorption')return calciumScoreFacts(definition,targetSettings.calciumScore);
  if(definition.id==='overall')return overallScoreFacts(definition,totals,targets,coverage,targetSettings);
  if(definition.id==='keto')return ketoScoreFacts(definition,totals,targets,coverage,carbohydrate,targetSettings);
  if(['public-web-progress-v1','public-web-antioxidant-v1','public-web-plant-v1'].includes(definition.method))return progressScoreFacts(definition,totals,targets,coverage,targetSettings);
  if(definition.id==='oral')return oralScoreFacts(definition,totals,targets,coverage,targetSettings);
  // The carbohydrate slot follows the active tracking definition. Other score
  // components continue to use their raw nutrient facts and editable targets.
  const scoreValues={...totals,carbs:carbohydrate.value},scoreTargets={...targets,carbs:carbohydrate.target},scoreCoverage={...coverage,carbs:carbohydrate.coverage};
  const {id,name,selection}=definition;
  const components=catalog.filter(n=>selection===null||Array.isArray(selection)&&selection.includes(n.id)||selection===n.category).map(n=>{
    const targetBasis=null;
    const measuredCoverage={...scoreCoverage[n.id]},value=measuredCoverage.known>0?scoreValues[n.id]:null,target=scoreTargets[n.id];
    const exclusion=target===null||target===undefined?'target-unavailable':target<=0?'target-disabled':value===null||measuredCoverage.known===0?'unmeasured':null;
    const progress=exclusion!==null?null:Math.min(1,value/target);
    const net=n.id==='carbs'&&carbohydrate.definition.mode==='net';
    return {id:net?NET_CARBOHYDRATE_TARGET_ID:n.id,name:n.id==='carbs'?carbohydrate.label:n.name,unit:n.unit,value,target:target??null,targetBasis,coverage:measuredCoverage,included:exclusion===null,exclusion,progress,weight:null,points:null};
  });
  return aggregateScore(definition,components);
}
function aggregateScore(definition,components){
  const nutrients=components.filter(row=>row.target>0),measured=components.filter(row=>row.included);
  const weight=()=>1,totalWeight=measured.length;
  for(const row of measured){row.weight=weight(row)/totalWeight;row.points=row.progress*row.weight*100;}
  // Keep the established mean-then-scale arithmetic order. Summing separately
  // scaled points can cross an IEEE-754 half-rounding boundary.
  const baseValue=measured.length?Math.round(measured.reduce((sum,row)=>sum+row.progress*weight(row),0)/totalWeight*100):null;
  const value=baseValue;
  return {components,componentIds:nutrients.map(row=>row.id),score:{id:definition.id,name:definition.name,value, coverage: {known: measured.length, total: nutrients.length, complete: nutrients.every(n => n.coverage.complete)},
      description: nutritionScoreDescription(definition),
      method: definition.method}};
}
function scoresFor(totals,targets,coverage,carbohydrate,targetSettings){return nutritionScoreDefinitions.map(definition=>scoreFacts(definition,totals,targets,coverage,carbohydrate,targetSettings).score);}

function foodDataCapture(day){
  const foods=day.foodFacts;
  return id=>foodData(id==='carbs'||id===NET_CARBOHYDRATE_TARGET_ID?foods.carbohydrates[id===NET_CARBOHYDRATE_TARGET_ID?'net':'total'].coverage:foods.coverage[id]);
}

/** Identity-only report schema, including when no dates are eligible. */
export function dataCompletenessIdentities(carbohydrates){
  return {nutrients:[...catalog.map(({id,name,unit})=>({id,name,unit,...(id==='carbs'?{definition:structuredClone(carbohydrates.total.definition)}:{})})),{id:NET_CARBOHYDRATE_TARGET_ID,name:'Net carbohydrate',unit:'g',definition:structuredClone(carbohydrates.net.definition)}],groups:nutritionScoreDefinitions.map(({id,name})=>({id,name}))};
}

function dailyScoreCapture(day,totals,targets,carbohydrate,macroTargets,carbohydrates){
  const scoreResults=nutritionScoreDefinitions.map(definition=>scoreFacts(definition,totals,targets,day.nutrientCoverage,carbohydrate,{...day.targetSettings,macroTargets,carbohydrates}));
  const foodDataFor=foodDataCapture(day);
  const dataCompleteness=projectDataCompleteness({date:day.date,nutrients:dataCompletenessIdentities(carbohydrates).nutrients.map(row=>({...row,...foodDataFor(row.id)})),groups:scoreResults.map(({score,componentIds})=>({id:score.id,name:score.name,componentIds}))});
  const dataQuality=captureDayFoodQuality({date:day.date,capture:day.targetSettings.foodAvailability,hidden:day.targetSettings.hiddenNutrients,groups:scoreResults.filter(r=>r.score.method.startsWith('public-web-')&&r.score.id!=='dataQuality').map(({score})=>({id:score.id,name:score.name,componentIds:score.confidence.componentIds}))});
  return {scores:scoreResults.map(row=>row.score),dataCompleteness,dataQuality};
}

/** Read-only details and ranked sources from a single daily food capture. */
export function calculateScoreDetails(state,date,scoreId){
  calendarDate(date);const definition=nutritionScoreDefinitions.find(({id})=>id===scoreId);
  if(!definition)throw Object.assign(new Error('Choose a known nutrition progress score.'),{status:400});
  const day=calculateDay(state,date),{targets,macroTargets,carbohydrateTargets}=dayTargets(state,day,day.intake.calories);
  const carbohydrates=carbohydratePairProjection(state,day.carbohydrates,false,carbohydrateTargets),carbohydrate=carbohydrates[carbohydrateDefinition(state.settings).mode];
  const {score,components,componentIds,calculation}=scoreFacts(definition,day.intake,targets,day.nutrientCoverage,carbohydrate,{...day.targetSettings,macroTargets,carbohydrates});
  if(scoreId==='dataQuality')return {version:12,date,attributions:mergeSourceAttributions(day.attributions,day.targetSettings.energyPolicy?.thermicEffect?day.energyFoodFacts.attributions:[]),scope:'day',score,dataQuality:captureDayFoodQuality({date,capture:day.targetSettings.foodAvailability,hidden:day.targetSettings.hiddenNutrients,groups:[]})};
  const foodDataFor=foodDataCapture(day);
  const facts={date,totals:day.intake,targets,nutrientCoverage:day.nutrientCoverage,complete:day.complete,carbohydrate,carbohydrates,entries:day.foodEntries.map((entry,index)=>namedEntry(state,entry,day.foodResults[index])),hydration:{logged:day.loggedWater,target:targets.water}};
  for(const component of components){
    component.foodData=component.exclusion==='net-required'?foodData({known:0,total:foodDataFor(component.id).total}):foodDataFor(component.id);
    const contributions=createNutrientContributions(facts,component.id),food=contributions.entries.filter(row=>row.kind==='food'),measured=food.filter(row=>row.value!==null);
    component.sources={entries:measured.slice(0,10),measuredFoodCount:measured.length,unmeasuredFoodCount:food.length-measured.length,omittedFoodCount:Math.max(0,measured.length-10),water:component.id==='water'&&day.loggedWaterCount>0?{value:day.loggedWater}:null,notes:contributions.notes};
  }
  return {version:12,date,attributions:mergeSourceAttributions(day.attributions,day.targetSettings.energyPolicy?.thermicEffect?day.energyFoodFacts.attributions:[]),scope:'day',score,components,...(calculation?{calculation}:{}),dataCompleteness:projectScoreDataCompleteness({date,componentIds,components}),limitations:captureScoreLimitations(definition)};
}

// The nutrition owner supplies resolved food facts and local diary identities.
// Optional non-food groups remain null; food entries keep the diary's Snacks fallback.
function scoreFoodRecords(entries,results){return entries.flatMap((entry,index)=>{const result=results[index];if(result.availability===null)return [];return [{date:entry.date,group:entry.group||'Snacks',facts:{values:result.values,coverage:result.coverage}}];});}
function scoreContext(state,foodEntries,foodResults,otherRecords){const foods=scoreFoodRecords(foodEntries,foodResults);return {foodEntryCount:foods.length,foodAvailability:captureFoodAvailability(foodResults.map(r=>r.availability).filter(r=>r!==null)),calciumScore:calculateCalciumScore([...foods,...otherRecords.map(r=>({date:r.date,group:r.group??null,facts:null}))],resolveDiaryGroups(state.settings??{}))};}

function calculateDay(state, date,policy=allFoodPolicy,records=null) {
  parseDate(date);
  const dateEntries = records?.entries ?? (state.entries ?? []).filter(entry => entry.date === date);
  const foodEntries = dateEntries.filter(entry => !isExerciseEntry(entry));
  const foodResults = foodEntries.map(entry => entryResult(state, entry,policy));
  const foodFacts=combine(foodResults),results=[foodFacts];
  const biometrics = records?.biometrics ?? (state.biometrics ?? []).filter(item => item.date === date);
  const waterEntries = biometrics.map(loggedWaterMilliliters).filter(value=>value!==null);
  let loggedWater = 0,loggedWaterCount=0;
  for (const mL of waterEntries) {
    loggedWaterCount++;
    loggedWater += mL;
    const contribution = {values: emptyValues(null), coverage: Object.fromEntries(nutrientIds.map(id => [id, {known: 0, total: 0, complete: true}]))};
    contribution.values.water = mL;
    contribution.coverage.water = {known: 1, total: 1, complete: true};
    results.push(contribution);
  }
  const {values: intake, coverage: nutrientCoverage,supplementFilter,carbohydrates,attributions} = combine(results);
  const notes=records?.notes??(state.notes??[]).filter(note=>note.date===date);
  const targetSettings = {...resolveTargetSettings(state,date),...scoreContext(state,foodEntries,foodResults,[...dateEntries.filter(isExerciseEntry),...biometrics,...notes])};
  const exerciseEntries=dateEntries.filter(isExerciseEntry).map(exerciseEntryFacts);
  // Report intake filters must not change the expenditure estimate. Resolve
  // unfiltered food facts only when the selected TEF calculation needs them.
  const energyFoodFacts=!policy.includeSupplements&&state.settings?.energyPolicy?.thermicEffect===true?combine(foodEntries.map(entry=>entryResult(state,entry,allFoodPolicy))):{values:intake,coverage:nutrientCoverage,attributions};
  const complete=diaryDayComplete(state,date),logged=dateEntries.length>0||biometrics.length>0||notes.length>0,hasNutrientData=nutrientIds.some(id=>nutrientCoverage[id].known>0);
  return {date,attributions,intake,targetSettings,nutrientCoverage,biometrics,exerciseEntries,energyFoodFacts,loggedWater,loggedWaterCount,complete,logged,hasNutrientData,foodEntries,foodResults,foodFacts,supplementFilter,carbohydrates};
}
/** Resolve all effective daily targets once, after unrounded energy is known. */
function dayTargets(state,day,consumed,{historical=false}={}){
  const {targets:baseline,weekdayTargets,carbohydrateTargetId,configuredEnergyTarget,fixedTargets,macroPolicy,energyPolicy,targetAssignment,recordedInputs}=day.targetSettings;
  const foodTotals=Object.fromEntries(nutrientIds.map(id=>[id,historical&&!day.complete&&day.energyFoodFacts.coverage[id].total===0?null:day.energyFoodFacts.values[id]]));
  const calculatedEnergy=calculateEnergy({policy:energyPolicy,date:day.date,consumed,configuredTarget:configuredEnergyTarget,scheduledTarget:{present:own(weekdayTargets,'calories'),value:weekdayTargets.calories??null},exerciseEntries:day.exerciseEntries,biometrics:day.biometrics,foodTotals,foodCoverage:day.energyFoodFacts.coverage,recordedWeightKg:recordedInputs.recordedWeightKg,recordedHeightCm:recordedInputs.recordedHeightCm});
  const energy={...calculatedEnergy,attributions:mergeSourceAttributions(day.attributions,energyPolicy?.thermicEffect?day.energyFoodFacts.attributions:[])};
  const macroTargets={...calculateMacroTargets({policy:macroPolicy,energyTarget:energy.target,exerciseKcal:energy.exercise,carbohydrateTargetId,fixedTargets,weekdayTargets,recordedLeanMassKg:recordedInputs.recordedLeanMassKg}),attributions:mergeSourceAttributions(energyPolicy?.thermicEffect?day.energyFoodFacts.attributions:[])};
  const targets={...baseline,calories:energy.target,protein:macroTargets.targets.protein,fat:macroTargets.targets.fat};
  if(carbohydrateTargetId==='carbs')targets.carbs=macroTargets.targets.carbohydrate;
  const carbohydrateTargets={total:targets.carbs,net:carbohydrateTargetId===NET_CARBOHYDRATE_TARGET_ID?macroTargets.targets.carbohydrate:day.targetSettings.inactiveNetTarget};
  return {energy,macroTargets,targets,targetAssignment,carbohydrateTargets};
}
function projectEnergy(energy){
  const rounded=value=>value===null?null:round(value),keys=['consumed','exercise','target','remaining','expenditure','balance','configuredTarget','targetBaseline','aboveBaseline','baselineExpenditure','targetAdjustment'];
  return {...energy,...Object.fromEntries(keys.map(key=>[key,rounded(energy[key])])),components:Object.fromEntries(Object.entries(energy.components).map(([key,value])=>[key,rounded(value)])),device:energy.device?{...energy.device,value:rounded(energy.device.value)}:null};
}

/** Raw historical day facts. A completion marker can confirm an otherwise
 * unmeasured zero; incomplete days with no nutrient contributions stay unknown. */
function dailyPolicy(options){
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>key!=='includeSupplements')||(Object.hasOwn(options,'includeSupplements')&&typeof options.includeSupplements!=='boolean'))throw Object.assign(Error('Choose a boolean Include Supplements calculation policy.'),{status:400});
  return {includeSupplements:options.includeSupplements??true};
}
export function calculateDailyNutrition(state,date,options={}){
  return historicalNutrition(state,calculateDay(state,date,dailyPolicy(options)));
}
/** Request-scoped date lookup. Full biometric history remains available to dated
 * body/target calculations. Callers consume this synchronously before edits. */
export function createDailyNutritionReader(state,options={}, {contributionNutrient=null}={}){
  if(contributionNutrient!==null&&!nutrientIds.includes(contributionNutrient)&&contributionNutrient!==NET_CARBOHYDRATE_TARGET_ID)throw Object.assign(Error('Choose a known contribution nutrient.'),{status:400});
  const policy=dailyPolicy(options),entries=new Map(),biometrics=new Map(),notes=new Map();
  for(const [rows,index]of [[state.entries??[],entries],[state.biometrics??[],biometrics],[state.notes??[],notes]])for(const row of rows){let day=index.get(row.date);if(!day){day=[];index.set(row.date,day);}day.push(row);}
  return date=>historicalNutrition(state,calculateDay(state,date,policy,{entries:entries.get(date)??[],biometrics:biometrics.get(date)??[],notes:notes.get(date)??[]}),contributionNutrient);
}
function historicalNutrition(state,day,contributionNutrient=null){
  const {date,intake,nutrientCoverage,biometrics,logged,complete,hasNutrientData,supplementFilter}=day;
  const totals=Object.fromEntries(nutrientIds.map(id=>[id,!complete&&nutrientCoverage[id].total===0?null:intake[id]]));
  const {energy,macroTargets,targets,targetAssignment,carbohydrateTargets}=dayTargets(state,day,totals.calories,{historical:true});
  const carbohydrates=carbohydratePairProjection(state,day.carbohydrates,false,carbohydrateTargets,!complete),selectedCarbohydrate=carbohydrates[carbohydrateDefinition(state.settings).mode];
  const nutrientDisplay=projectNutrientDisplay({policy:state.settings?.nutrientDisplay,upperPolicy:state.settings?.nutrientUpperLimits,referencePolicy:state.settings?.nutrientReferences,modes:state.settings?.nutrientTargetModes,date,totals,targets,coverage:nutrientCoverage,complete,carbohydrate:selectedCarbohydrate,carbohydrates});
  const diaryDisplay=projectDiaryDisplay({policy:state.settings?.diaryDisplay,hidden:nutrientDisplay.hidden,totals,targets,coverage:nutrientCoverage,complete,carbohydrate:selectedCarbohydrate,carbohydrates});
  const balances=projectNutrientBalances({date,attributions:day.attributions,totals,nutrientCoverage,complete,logged},state.settings?.nutrientBalances);
  const contributionFacts=contributionNutrient===null?{}:{contributions:createNutrientContributions({date,attributions:day.attributions,totals,targets,nutrientCoverage,complete,carbohydrates,carbohydrate:selectedCarbohydrate,entries:day.foodEntries.map((entry,index)=>namedEntry(state,entry,day.foodResults[index])),hydration:{logged:day.loggedWater}},contributionNutrient)};
  return {...contributionFacts,date,attributions:energy.attributions,balances,totals,targets,targetAssignment,remaining:remainingTargets(targets,totals),nutrientCoverage,nutrientDisplay,diaryDisplay,biometrics,energy,consumedEnergy:day.foodFacts.consumedEnergy,macroTargets,logged,complete,hasNutrientData,supplementFilter,carbohydrates,carbohydrate:selectedCarbohydrate,...dailyScoreCapture(day,totals,targets,selectedCarbohydrate,macroTargets,carbohydrates)};
}

/** Selected intake uses full-day targets, never a selected subset of expenditure
 * or thermic-effect inputs. Reuse the already resolved food leaves for both. */
export function calculateSelectionNutrition(state,date,entryIds){
  calendarDate(date);
  const fail=message=>{throw Object.assign(new Error(message),{status:400});};
  if(!Array.isArray(entryIds)||!entryIds.length||Array.from(entryIds).some(id=>typeof id!=='string'||!id.trim())||new Set(entryIds).size!==entryIds.length)fail('Choose one or more unique food entry IDs.');
  const wanted=new Set(entryIds),day=calculateDay(state,date);
  const selected=day.foodEntries.map((entry,index)=>({entry,result:day.foodResults[index]})).filter(({entry})=>wanted.has(entry.id));
  if(selected.length!==wanted.size||new Set(selected.map(({entry})=>entry.id)).size!==wanted.size)fail('Every selected ID must identify one food entry on this date.');
  const result=combine(selected.map(({result})=>result)),nutrientCoverage=result.coverage;
  const totals=Object.fromEntries(nutrientIds.map(id=>[id,nutrientCoverage[id].total===0?null:result.values[id]]));
  const {targets,macroTargets,carbohydrateTargets}=dayTargets(state,day,day.intake.calories);
  const carbohydrates=carbohydratePairProjection(state,result.carbohydrates,false,carbohydrateTargets,true),carbohydrate=carbohydrates[carbohydrateDefinition(state.settings).mode];
  const nutrientDisplay=projectNutrientDisplay({policy:state.settings?.nutrientDisplay,upperPolicy:state.settings?.nutrientUpperLimits,referencePolicy:state.settings?.nutrientReferences,modes:state.settings?.nutrientTargetModes,date,totals,targets,coverage:nutrientCoverage,complete:false,carbohydrate,carbohydrates});
  const diaryDisplay=projectDiaryDisplay({policy:state.settings?.diaryDisplay,hidden:nutrientDisplay.hidden,totals,targets,coverage:nutrientCoverage,complete:false,carbohydrate,carbohydrates});
  const balances=projectNutrientBalances({date,attributions:result.attributions,totals,nutrientCoverage,complete:false,logged:true},state.settings?.nutrientBalances);
  return {date,attributions:mergeSourceAttributions(result.attributions,day.targetSettings.energyPolicy?.thermicEffect?day.energyFoodFacts.attributions:[]),balances,scope:'selection',consumedEnergy:result.consumedEnergy,selectedEntryIds:selected.map(({entry})=>entry.id),selectedCount:selected.length,totals,targets,remaining:remainingTargets(targets,totals),nutrientCoverage,carbohydrate,carbohydrates,nutrientDisplay,diaryDisplay,entries:selected.map(({entry,result})=>namedEntry(state,entry,result)),scores:scoresFor(totals,targets,nutrientCoverage,carbohydrate,{...day.targetSettings,...scoreContext(state,selected.map(r=>r.entry),selected.map(r=>r.result),[]),macroTargets,carbohydrates}),limitations:['Intake includes only selected food entries. Logged water and other nonfood records are excluded.','Targets use the full day, including its energy and activity inputs.','Missing measurements remain unknown. Remaining amounts from partial totals are upper bounds.']};
}

export function calculateSummary(state, date) {
  const day=calculateDay(state,date),{intake,nutrientCoverage,biometrics,loggedWater,foodEntries,foodResults}=day,totals=projectedValues(intake);
  const {energy:rawEnergy,macroTargets,targets,targetAssignment,carbohydrateTargets}=dayTargets(state,day,intake.calories),energy=projectEnergy(rawEnergy);
  const carbohydrates=carbohydratePairProjection(state,day.carbohydrates,false,carbohydrateTargets),selectedCarbohydrate=carbohydrates[carbohydrateDefinition(state.settings).mode];
  const nutrientDisplay=projectNutrientDisplay({policy:state.settings?.nutrientDisplay,upperPolicy:state.settings?.nutrientUpperLimits,referencePolicy:state.settings?.nutrientReferences,modes:state.settings?.nutrientTargetModes,date,totals:intake,targets,coverage:nutrientCoverage,complete:day.complete,carbohydrate:selectedCarbohydrate,carbohydrates});
  const diaryDisplay=projectDiaryDisplay({policy:state.settings?.diaryDisplay,hidden:nutrientDisplay.hidden,totals:intake,targets,coverage:nutrientCoverage,complete:day.complete,carbohydrate:selectedCarbohydrate,carbohydrates});
  const balances=projectNutrientBalances({date,attributions:day.attributions,totals:intake,nutrientCoverage,complete:day.complete,logged:day.logged},state.settings?.nutrientBalances);
  const grouped=new Map((state.settings?.groups??[]).map(group=>[typeof group==='string'?group:group.name,[]]));
  foodEntries.forEach((entry,index)=>{const name=entry.group||'Snacks';if(!grouped.has(name))grouped.set(name,[]);grouped.get(name).push(foodResults[index]);});
  const tableDay={totals:intake,targets:{},coverage:nutrientCoverage,complete:day.complete,carbohydrate:selectedCarbohydrate,carbohydrates};
  const tableGroups=Array.from(grouped,([name,results])=>{const facts=combine(results);return {name,totals:facts.values,targets:{},coverage:facts.coverage,complete:day.complete,carbohydrates:carbohydratePairProjection(state,facts.carbohydrates,false),carbohydrate:carbohydrateProjection(state,facts.carbohydrates,false)};});
  const diaryTable=projectDiaryTable({policy:state.settings?.diaryTable,day:tableDay,groups:tableGroups});

  const {scores,dataCompleteness,dataQuality}=dailyScoreCapture(day,intake,targets,selectedCarbohydrate,macroTargets,carbohydrates);
  const remaining=projectedValues(remainingTargets(targets,intake));
  const resolvedFoods=(state.foods??[]).map(food=>({...food,nutrients:resolvedCarbohydrateValues(food.nutrients)}));
  const oracle = Object.fromEntries(catalog.map(nutrient => [nutrient.id, resolvedFoods.filter(food => validNumber(food.nutrients?.[nutrient.id])).map(food => ({foodId: food.id, name: food.name, attributions:sourceAttributions(food.source), value: food.nutrients[nutrient.id], unit: nutrient.unit, serving: food.serving})).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)).slice(0, 20)]));
  const gaps = catalog.filter(n => targets[n.id] > 0 && intake[n.id] !== null && nutrientCoverage[n.id].complete && intake[n.id] < targets[n.id] && !['calories', 'sodium', 'sugar', 'addedSugar', 'fat', 'carbs'].includes(n.id));
  const suggestions = resolvedFoods.map(food => {
    const contributions = gaps.map(n => ({id: n.id, name: n.name, value: food.nutrients?.[n.id], score: validNumber(food.nutrients?.[n.id]) ? Math.min(food.nutrients[n.id] / Math.max(targets[n.id] - intake[n.id], targets[n.id] * 0.1), 1) : 0})).filter(n => n.score > 0).sort((a, b) => b.score - a.score);
    return {foodId: food.id, name: food.name, attributions:mergeSourceAttributions(day.attributions,sourceAttributions(food.source)), score: round(contributions.reduce((sum, n) => sum + n.score, 0)), nutrients: contributions.slice(0, 3).map(n => n.id), reason: contributions.length ? `Adds measured ${contributions.slice(0, 3).map(n => n.name.toLowerCase()).join(', ')} toward your targets.` : 'No fully measured target gap can be evaluated.'};
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 8);
  return {date, attributions:energy.attributions, complete:day.complete, balances, totals, targets:{...targets,calories:energy.target}, remaining, nutrientCoverage,carbohydrates:carbohydratePairProjection(state,day.carbohydrates,true,carbohydrateTargets),carbohydrate:carbohydrateProjection(state,day.carbohydrates,true,selectedCarbohydrate.target),
    hydration: {logged: round(loggedWater), target: targets.water},
    energy,consumedEnergy:day.foodFacts.consumedEnergy,expenditureBreakdown:captureExpenditureBreakdown([{energy:rawEnergy}]),macroTargets,targetAssignment,nutrientDisplay,diaryDisplay,diaryTable,dataCompleteness,dataQuality,
    scores, suggestions, oracle,
    entries: foodEntries.map((entry, index) => namedEntry(state, entry, foodResults[index])), biometrics,
    limitations: ['Total and Net carbohydrate are resolved separately on each food using its recorded measurements and declared method. Missing deductions remain unknown.', 'Targets are editable sample defaults, not personal dietary advice.', 'Sample food measurements are illustrative. Missing measurements do not mean zero.', 'Scores and suggestions use transparent local formulas.']};
}

export function* iterateTrendDays(state, from, to) {
  const start = parseDate(from);
  const end = parseDate(to);
  if (end < start) throw new Error('The end date must be on or after the start date.');
  const count = Math.round((end - start) / 86400000) + 1;
  if (count > 3660) throw new Error('A trend request can include at most 3660 days.');
  const readDay=createDailyNutritionReader(state);
  for(let index=0;index<count;index++){
    const date = new Date(start.valueOf() + index * 86400000).toISOString().slice(0, 10);
    const facts=readDay(date);
    const energy=projectEnergy(facts.energy);
    yield {...facts,carbohydrates:Object.fromEntries(Object.entries(facts.carbohydrates).map(([mode,row])=>[mode,{...row,value:row.value===null?null:roundCarbohydrate(row.value),remaining:row.remaining===null?null:roundCarbohydrate(row.remaining)}])),totals:projectedValues(facts.totals),targets:{...facts.targets,calories:energy.target},remaining:projectedValues(facts.remaining),energy,carbohydrate:{...facts.carbohydrate,value:facts.carbohydrate.value===null?null:roundCarbohydrate(facts.carbohydrate.value),remaining:facts.carbohydrate.remaining===null?null:roundCarbohydrate(facts.carbohydrate.remaining)}};
  }
}

export function calculateTrends(state,from,to){return Array.from(iterateTrendDays(state,from,to));}
