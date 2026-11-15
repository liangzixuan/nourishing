import {energyReasonText} from './energy-guidance.mjs';
import {convertEnergy,parseEnergyUnit} from './energy-units.mjs';
import {serializeCsv} from './csv-export.mjs';
import {catalog,calculateSummary,calculateTrends} from './nutrition.mjs';
import {date} from './workspace.mjs';

const kinds=['daily-nutrients','daily-energy','diary','exercises','biometrics','notes'];
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
const nutrientColumns=energyUnit=>catalog.flatMap(nutrient=>[`${nutrient.id} [${nutrient.unit==='kcal'?energyUnit:nutrient.unit}]`,`${nutrient.id}.known`,`${nutrient.id}.total`]);
const sourceText=value=>value===undefined||value===null?'':typeof value==='string'?value:JSON.stringify(value);
const nutrientCells=(values,coverage,energyUnit)=>catalog.flatMap(nutrient=>[nutrient.unit==='kcal'&&values[nutrient.id]!==undefined?convertEnergy(values[nutrient.id],'kcal',energyUnit):values[nutrient.id],coverage[nutrient.id].known,coverage[nutrient.id].total]);
const carbohydrateColumns=(includeTarget,prefix='trackedCarbohydrate')=>['trackedCarbohydrate [g]',...(includeTarget?['trackedCarbohydrate.target [g]']:[]),'trackedCarbohydrate.known','trackedCarbohydrate.total','trackedCarbohydrate.complete','trackedCarbohydrate.definition','trackedCarbohydrate.label','trackedCarbohydrate.description','trackedCarbohydrate.reasons'].map(field=>field.replace('trackedCarbohydrate',prefix));
const carbohydrateCells=(carbohydrate,includeTarget=false)=>[carbohydrate.value,...(includeTarget?[carbohydrate.target]:[]),carbohydrate.coverage.known,carbohydrate.coverage.total,carbohydrate.coverage.complete,JSON.stringify(carbohydrate.definition),carbohydrate.label,carbohydrate.description,JSON.stringify(carbohydrate.reasons)];

const carbohydratePairColumns=includeTarget=>['total','net'].flatMap(mode=>carbohydrateColumns(includeTarget,mode+'Carbohydrate'));
const carbohydratePairCells=(pairs,includeTarget=false,clearTargets=false)=>['total','net'].flatMap(mode=>carbohydrateCells(clearTargets?{...pairs[mode],target:null}:pairs[mode],includeTarget));

function range(options){
  if(!options||typeof options!=='object'||Array.isArray(options))fail('Choose a report and date range.');
  const {kind,from,to,includeGroups=false,energyUnit='kcal'}=options;parseEnergyUnit(energyUnit);
  if(!kinds.includes(kind))fail('Choose daily-nutrients, daily-energy, diary, exercises, biometrics or notes.');
  if(typeof includeGroups!=='boolean')fail('Include diary groups must be true or false.');
  if(includeGroups&&kind!=='daily-nutrients')fail('Diary group rows are available only for daily nutrient reports.');
  date(from);date(to);
  const days=(Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000+1;
  if(days<1)fail('The end date must be on or after the start date.');
  if(days>3660)fail('A report can include at most 3660 days.');
  return {kind,from,to,includeGroups,energyUnit};
}

function groupSummaries(state,day){
  // Summary entries own food/exercise classification. Select their raw source
  // records: reusing projected nutrients would apply serving amounts twice.
  const entries=state.entries.filter(entry=>entry.date===day);
  if(!entries.length)return [];
  const foodIds=new Set(calculateSummary({...state,entries,biometrics:[],notes:[]},day).entries.map(entry=>entry.id));
  const groups=new Map();
  for(const entry of entries){
    if(!foodIds.has(entry.id))continue;
    if(!groups.has(entry.group))groups.set(entry.group,[]);
    groups.get(entry.group).push(entry);
  }
  const order=[...new Set([...(state.settings?.groups??[]),...groups.keys()])].filter(group=>groups.has(group));
  return order.map(group=>({group,summary:calculateSummary({...state,entries:groups.get(group),biometrics:[],notes:[]},day)}));
}

/** CSV reports use explicit nutrient IDs and units; they are not backup files or
 * CSV import templates. Blank nutrient cells mean unknown, never measured zero.
 * Coverage counts preserve partial sums and explicitly completed empty days. */
export function exportReport(state,options){
  const {kind,from,to,includeGroups,energyUnit}=range(options),energy=value=>value===undefined?undefined:convertEnergy(value,'kcal',energyUnit),within=record=>record.date>=from&&record.date<=to;
  let fields,rows;
  if(kind==='daily-nutrients'){
    fields=['date','logged','complete','hasNutrientData',...nutrientColumns(energyUnit),...carbohydrateColumns(true),...carbohydratePairColumns(true),'sourceAttribution'];
    const days=calculateTrends(state,from,to);
    if(!includeGroups)rows=days.map(day=>[day.date,day.logged,day.complete,day.hasNutrientData,...nutrientCells(day.totals,day.nutrientCoverage,energyUnit),...carbohydrateCells(day.carbohydrate,true),...carbohydratePairCells(day.carbohydrates,true),day.attributions.join('\n')]);
    else{
      fields.splice(1,0,'rowType','diaryGroup');
      rows=days.flatMap(day=>[
        [day.date,'daily','',day.logged,day.complete,day.hasNutrientData,...nutrientCells(day.totals,day.nutrientCoverage,energyUnit),...carbohydrateCells(day.carbohydrate,true),...carbohydratePairCells(day.carbohydrates,true),day.attributions.join('\n')],
        ...groupSummaries(state,day.date).map(({group,summary})=>[
          day.date,'group',group,true,day.complete,catalog.some(nutrient=>summary.nutrientCoverage[nutrient.id].known>0),...nutrientCells(summary.totals,summary.nutrientCoverage,energyUnit),...carbohydrateCells({...summary.carbohydrate,target:null},true),...carbohydratePairCells(summary.carbohydrates,true,true),summary.attributions.join('\n'),
        ]),
      ]);
    }
  }else if(kind==='daily-energy'){
    const energyFields=['consumed','expenditure','target','remaining','balance','exercise','configuredTarget','targetBaseline','aboveBaseline'],components=['resting','baseline','adjustedBaseline','activity','thermicEffect'];
    fields=['date','logged','complete',...energyFields.map(key=>`${key} [${energyUnit}]`),...components.map(key=>`${key} [${energyUnit}]`),'intake.known','intake.total','intake.complete','energy.configured','activityMode','display','device.zone','device.end',`device.value [${energyUnit}]`,'reasons','sourceAttribution'];
    rows=calculateTrends(state,from,to).map(day=>[day.date,day.logged,day.complete,...energyFields.map(key=>energy(day.energy[key])),...components.map(key=>energy(day.energy.components[key])),day.nutrientCoverage.calories.known,day.nutrientCoverage.calories.total,day.nutrientCoverage.calories.complete,day.energy.configured,day.energy.activityMode,day.energy.display,day.energy.device?.zone,day.energy.device?.end,energy(day.energy.device?.value),day.energy.reasons.map(energyReasonText).join(' | '),day.energy.attributions.join('\n')]);
  }else if(kind==='diary'||kind==='exercises'){
    const entries=state.entries.filter(within),summaries=new Map();
    for(const entry of entries)if(!summaries.has(entry.date))summaries.set(entry.date,calculateSummary(state,entry.date));
    if(kind==='diary'){
      fields=['date','time','group','id','name','foodId','recipeId','mealId','mealItems','recipeOverride','amount','quantity','unit','portionId','portionLabel','grams','milliliters','source',...nutrientColumns(energyUnit),...carbohydrateColumns(false),...carbohydratePairColumns(false),'sourceAttribution'];
      rows=[...summaries.values()].flatMap(summary=>summary.entries.map(entry=>{
        const resource=entry.foodId?state.foods.find(item=>item.id===entry.foodId):entry.recipeId?state.recipes.find(item=>item.id===entry.recipeId):state.meals.find(item=>item.id===entry.mealId);
        return [entry.date,entry.time,entry.group,entry.id,entry.name,entry.foodId,entry.recipeId,entry.mealId,entry.mealItems?JSON.stringify(entry.mealItems):'',entry.recipeOverride?JSON.stringify(entry.recipeOverride):'',entry.amount,entry.quantity,entry.unit,entry.portionId,entry.portionLabel,entry.grams,entry.milliliters,sourceText(resource?.source),...nutrientCells(entry.nutrients,entry.coverage,energyUnit),...carbohydrateCells(entry.carbohydrate),...carbohydratePairCells(entry.carbohydrates),entry.attributions.join('\n')];
      }));
    }else{
      fields=['date','time','group','id','name','duration [min]',`energyBurned [${energyUnit}]`];
      const foodIds=new Map([...summaries].map(([day,summary])=>[day,new Set(summary.entries.map(entry=>entry.id))]));
      rows=entries.filter(entry=>!foodIds.get(entry.date).has(entry.id)).map(entry=>{
        const measured=[entry.caloriesBurned,entry.exerciseCalories,entry.calories].some(value=>typeof value==='number'&&Number.isFinite(value)&&value>=0);
        const measuredEnergy=measured?calculateSummary({...state,entries:[entry]},entry.date).energy.exercise:null;
        return [entry.date,entry.time,entry.group,entry.id,entry.name,entry.duration,energy(measuredEnergy)];
      });
    }
  }else if(kind==='biometrics'){
    fields=['date','time','group','id','type','value','unit','source'];
    rows=state.biometrics.filter(within).map(record=>[record.date,record.time,record.group,record.id,record.type,record.value,record.unit,sourceText(record.source)]);
  }else{
    fields=['date','time','group','id','text'];
    rows=state.notes.filter(within).map(record=>[record.date,record.time,record.group,record.id,record.text]);
  }
  // Keep record order within each day. Every report uses ascending calendar dates.
  rows.sort((left,right)=>left[0].localeCompare(right[0]));
  return {csv:serializeCsv(fields,rows),filename:`nourish-${kind}-${from}-to-${to}.csv`};
}
