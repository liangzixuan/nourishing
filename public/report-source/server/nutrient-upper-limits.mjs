import {modeReferenceSelection,activeNutrientMaximums} from './nutrient-target-modes.mjs';
import {date as calendarDate} from './calendar.mjs';
import {resolveNutrientReferencePopulation,nutrientReferenceBand,referenceBandKey} from './nutrient-references.mjs';
import {NUTRIENT_UPPER_LIMIT_SET,nutrientUpperLimitData} from './nutrient-upper-limit-data.mjs';
export {NUTRIENT_UPPER_LIMIT_SET} from './nutrient-upper-limit-data.mjs';
const fail=message=>{throw Object.assign(Error(message),{status:400});};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export const nutrientUpperLimitOptions=Object.freeze(nutrientUpperLimitData.filter(row=>row.catalogId).map(({rows,...row})=>Object.freeze(row)));
const ids=new Set(nutrientUpperLimitOptions.map(row=>row.id));
const rows=new Map(nutrientUpperLimitData.map(row=>[row.id,new Map(row.rows.map(value=>[value.group+'|'+referenceBandKey(value.ageLabel),value]))]));
export function parseNutrientUpperLimitPolicy(value){
  if(value===undefined||value===null)return null;
  if(!object(value)||Object.keys(value).sort().join(',')!=='nutrients,referenceSet,version'||value.version!==1||value.referenceSet!==NUTRIENT_UPPER_LIMIT_SET||!Array.isArray(value.nutrients)||Array.from(value.nutrients).some(id=>!ids.has(id))||new Set(value.nutrients).size!==value.nutrients.length)fail('Choose the supported upper-limit reference set and unique nutrient IDs.');
  return {version:1,referenceSet:NUTRIENT_UPPER_LIMIT_SET,nutrients:[...value.nutrients]};
}
export function effectiveNutrientUpperLimitPolicy(input,modes){
 const policy=parseNutrientUpperLimitPolicy(input),nutrients=modeReferenceSelection(policy?.nutrients,modes,'maximum',[...ids]);return policy===null&&!nutrients.length?null:{version:1,referenceSet:NUTRIENT_UPPER_LIMIT_SET,nutrients};
}
export function projectNutrientUpperLimits(input,referencePolicy,date,modes){
  calendarDate(date);const policy=effectiveNutrientUpperLimitPolicy(input,modes);
  const base={version:1,date,referenceSet:NUTRIENT_UPPER_LIMIT_SET,status:'disabled',selected:[],references:[]};
  if(policy===null)return base;
  const population=resolveNutrientReferencePopulation(referencePolicy,date),{group}=population;
  const status=population.policy===null?'profile-required':group===null?'unsupported':'known';
  const references=policy.nutrients.map(id=>{
    const option=nutrientUpperLimitOptions.find(row=>row.id===id),band=nutrientReferenceBand(population,id);
    const row=group===null?null:rows.get(id).get(group.name+'|'+referenceBandKey(band));
    if(group!==null&&!row)throw Error('An upper-limit source row is missing.');
    const maximum=row?.value??null;
    return {id,maximum,status:status!=='known'?status:maximum===null?'not-determined':'known',comparisonSupported:option.comparisonSupported,intakeBasis:option.intakeBasis,source:{...option.source,...(row?{group:row.group,ageLabel:row.ageLabel}:{})}};
  });
  return {...base,status,selected:[...policy.nutrients],references};
}

/** One owner selects custom overrides versus population limits. Null is explicit. */
export function resolveNutrientMaximums(displayPolicy,upperPolicy,referencePolicy,date,modes){
  const projection=projectNutrientUpperLimits(upperPolicy,referencePolicy,date,modes);
  const maximums=new Map(projection.references.map(row=>[row.id,{...row,origin:'population-ul'}]));
  for(const [id,maximum]of Object.entries(activeNutrientMaximums(displayPolicy,modes)))maximums.set(id,{id,maximum,status:maximum===null?'disabled':'known',origin:'custom',comparisonSupported:true,intakeBasis:'configured-total'});
  return {projection,maximums};
}
