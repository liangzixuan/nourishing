import {targetSetupGuidance} from './target-setup-guidance.mjs';
import {isDeepStrictEqual} from 'node:util';

export const targetSources={
  energy:{name:'Health Canada: adult estimated energy requirement equations',url:'https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/equations-estimate-energy-requirement.html',tableDate:'2025-11-19',retrieved:'2026-10-29'},
  macros:{name:'Health Canada: adult macronutrient reference ranges',url:'https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/reference-values-macronutrients.html',tableDate:'2025-11-19',retrieved:'2026-10-29'}
};
const equations={
  male:{inactive:[753.07,-10.83,6.50,14.10],low_active:[581.47,-10.83,8.30,14.94],active:[1004.82,-10.83,6.52,15.91],very_active:[-517.88,-10.83,15.61,19.11]},
  female:{inactive:[584.90,-7.01,5.72,11.71],low_active:[575.77,-7.01,6.60,12.14],active:[710.25,-7.01,6.54,12.34],very_active:[511.83,-7.01,9.07,12.56]}
};
const fail=message=>{throw Object.assign(Error(message),{status:400});};
function numeric(value,label,{min=0,exclusive=false}={}){if(typeof value!=='number'||!Number.isFinite(value)||(exclusive?value<=min:value<min))fail(`Enter a valid ${label}.`);return value;}
const rounded=value=>Math.round(value*100)/100;
export const setupTargetKeys=['calories','protein','carbs','fat'];

export function calculateTargetSetup(value){
  if(!value||typeof value!=='object'||Array.isArray(value))fail('Send target setup inputs.');
  const percentages={};for(const name of ['carbs','protein','fat']){const amount=numeric(value.percentages?.[name],`${name} percentage`);if(amount>100)fail('Macro percentages must be between 0 and 100.');percentages[name]=amount;}
  if(Math.abs(Object.values(percentages).reduce((sum,n)=>sum+n,0)-100)>0.000001)fail('Macro percentages must total 100.');
  let input,calculation,calories;
  if(value.method==='manual'){
    calories=numeric(value.calories,'daily calorie goal',{exclusive:true});
    input={method:'manual',calories,percentages};calculation={method:'User-chosen calorie goal',estimatedMaintenance:null};
  }else if(value.method==='adult_eer'){
    if(value.adultScope!==true)fail('Confirm the healthy-adult calculation scope, or use a custom calorie goal.');
    const age=numeric(value.age,'age',{min:19}),height=numeric(value.height,'height',{exclusive:true}),weight=numeric(value.weight,'weight',{exclusive:true});
    if(!['metric','imperial'].includes(value.units))fail('Choose metric or imperial input units.');
    const coefficients=equations[value.equation]?.[value.activity];if(!coefficients)fail('Choose an adult equation and activity category.');
    const heightCm=value.units==='imperial'?height*2.54:height,weightKg=value.units==='imperial'?weight*0.45359237:weight;
    const [constant,ageFactor,heightFactor,weightFactor]=coefficients;
    const estimate=constant+ageFactor*age+heightFactor*heightCm+weightFactor*weightKg;
    if(!Number.isFinite(estimate)||estimate<=0)fail('These inputs do not produce a positive energy estimate. Check the measurements.');
    calories=Math.round(estimate);
    input={method:'adult_eer',adultScope:true,age,height,weight,units:value.units,equation:value.equation,activity:value.activity,percentages};
    calculation={method:'Adult EER table: estimated maintenance energy',estimatedMaintenance:estimate,heightCm,weightKg,coefficients:{constant,age:ageFactor,heightCm:heightFactor,weightKg:weightFactor}};
  }else fail('Choose a custom calorie goal or the adult energy estimate.');
  const targets={calories,carbs:rounded(calories*percentages.carbs/100/4),protein:rounded(calories*percentages.protein/100/4),fat:rounded(calories*percentages.fat/100/9)};
  if(Object.values(targets).some(n=>!Number.isFinite(n)))fail('The resulting targets are too large to calculate.');
  const referenceRanges={carbs:[45,65],protein:[10,35],fat:[20,35]};
  const outsideReference=Object.keys(percentages).filter(key=>percentages[key]<referenceRanges[key][0]||percentages[key]>referenceRanges[key][1]);
  return {format:'nourish-target-setup-v1',input,targets,calculation,referenceRanges,outsideReference,sources:targetSources,notes:Object.values(targetSetupGuidance)};
}

export function validateTargetSetupRecord(record,targets){
  if(!record||record.format!=='nourish-target-setup-v1'||typeof record.appliedAt!=='string'||!Number.isFinite(Date.parse(record.appliedAt)))fail('Invalid target setup provenance.');
  const calculated=calculateTargetSetup(record.input);
  if(!isDeepStrictEqual(record.targets,calculated.targets)||setupTargetKeys.some(key=>targets[key]!==record.targets[key]))fail('Target setup provenance does not match the baseline targets.');
  // Preserve the recorded facts, equation coefficients and source snapshot.
  if(!isDeepStrictEqual(record.calculation,calculated.calculation)||!isDeepStrictEqual(record.sources,calculated.sources))fail('Target setup calculation or source provenance is invalid.');
  return structuredClone(record);
}
