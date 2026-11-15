import {modeReferenceSelection} from './nutrient-target-modes.mjs';
import {REFERENCE_PROJECTION_VERSION,captureReferenceGuidance} from './reference-guidance.mjs';
import {date as calendarDate} from './calendar.mjs';
import {calendarAge} from './calendar-age.mjs';
import {NUTRIENT_REFERENCE_SET,nutrientReferenceData} from './nutrient-reference-data.mjs';
export {NUTRIENT_REFERENCE_SET} from './nutrient-reference-data.mjs';

const fail=message=>{throw Object.assign(new Error(message),{status:400});};
const keys=['version','referenceSet','birthDate','sex','lifeStage','nutrients'];
export const referenceBandKey=value=>value.replaceAll('–','-').replace(/\s+/g,'');
const rows=new Map(nutrientReferenceData.map(item=>[item.id,new Map(item.rows.map(row=>[row.group+'|'+referenceBandKey(row.ageLabel),row]))]));
export const nutrientReferenceOptions=Object.freeze(nutrientReferenceData.map(({id,name,unit,basis,notes,source})=>Object.freeze({id,name,unit,basis,notes,source})));
const ids=new Set(nutrientReferenceOptions.map(item=>item.id));

/** Explicit inputs only; reference selection never changes stored fixed targets. */
export function parseNutrientReferencePolicy(value){
  if(value===undefined||value===null)return null;
  if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))fail('Choose the required nutrient-reference fields only.');
  if(value.version!==1||value.referenceSet!==NUTRIENT_REFERENCE_SET)fail('Choose the supported nutrient reference set.');
  const birthDate=calendarDate(value.birthDate);if(birthDate<'0001-01-01')fail('Choose a birth date in year 1 or later.');
  if(!['male','female'].includes(value.sex)||!['standard','pregnant','lactating'].includes(value.lifeStage))fail('Choose explicit reference sex and life stage.');
  if(value.sex!=='female'&&value.lifeStage!=='standard')fail('Pregnancy and lactation references require the female reference sex.');
  if(!Array.isArray(value.nutrients))fail('Choose an explicit list of reference nutrients.');
  const nutrients=Array.from(value.nutrients);if(nutrients.some(id=>!ids.has(id))||new Set(nutrients).size!==nutrients.length)fail('Choose supported nutrient IDs once each.');
  return {version:1,referenceSet:NUTRIENT_REFERENCE_SET,birthDate,sex:value.sex,lifeStage:value.lifeStage,nutrients};
}

function groupFor(policy,age){
  if(age===null)return null;
  if(policy.lifeStage!=='standard'){
    if(age.years<14||age.years>50)return null;
    return {name:policy.lifeStage==='pregnant'?'Pregnancy':'Lactation',band:age.years<19?'≤18y':age.years<31?'19-30y':'31-50y'};
  }
  if(age.years<1)return {name:'Infants',band:age.months<7?'0-6mo':'7-12mo'};
  if(age.years<9)return {name:'Children',band:age.years<4?'1-3y':'4-8y'};
  return {name:policy.sex==='male'?'Males':'Females',band:age.years<14?'9-13y':age.years<19?'14-18y':age.years<31?'19-30y':age.years<51?'31-50y':age.years<71?'51-70y':'>70y'};
}

/** Shared semantic population owner for intake references and upper limits. */
export function resolveNutrientReferencePopulation(input,date){
  calendarDate(date);const policy=parseNutrientReferencePolicy(input);
  const age=policy===null?null:calendarAge(policy.birthDate,date);
  return {policy,age,group:policy===null?null:groupFor(policy,age)};
}
export function nutrientReferenceBand(population,id){
  return population.group?.name==='Infants'&&['calcium','vitaminD'].includes(id)?population.age.months<6?'0-6mo':'7-12mo':population.group?.band;
}

/** RDA/AI projection with source identity; no raw demographic input leaves it. */
export function effectiveNutrientReferencePolicy(input,modes){
 const policy=parseNutrientReferencePolicy(input);return policy===null?null:{...policy,nutrients:modeReferenceSelection(policy.nutrients,modes,'daily',[...ids])};
}

export function projectNutrientReferences(input,date,modes){
 input=effectiveNutrientReferencePolicy(input,modes);
  const population=resolveNutrientReferencePopulation(input,date),{policy}=population;
  const base={version:REFERENCE_PROJECTION_VERSION,date,referenceSet:NUTRIENT_REFERENCE_SET,age:null,group:null,status:'disabled',selected:[],values:{},references:[],reasons:[]};
  if(policy===null)return base;
  const {age,group}=population,selected=new Set(policy.nutrients);
  const reasons=['population','reviewedStage','adjustments','calendarAge'].map(captureReferenceGuidance);
  if(policy.lifeStage!=='standard')reasons.push(captureReferenceGuidance('maternalAge'));
  if(group===null)reasons.push(captureReferenceGuidance(age===null?'beforeBirth':'unsupportedAge'));
  const references=nutrientReferenceOptions.map(option=>{
    // Calcium and vitamin D retain the source-specific infant footnote boundary.
    const band=nutrientReferenceBand(population,option.id);
    const row=group===null?null:rows.get(option.id).get(group.name+'|'+band);
    if(group!==null&&!row)throw new Error('A normalized nutrient reference source row is missing.');
    const availabilityNote=row?.kind===null?captureReferenceGuidance('notDetermined'):null;
    return {...option,value:row?.value??null,kind:row?.kind??null,source:{...option.source,...(row?{group:row.group,ageLabel:row.ageLabel}:{})},availabilityNote,selected:selected.has(option.id)};
  });
  return {...base,age,group:group===null?null:group.name+' / '+group.band,status:group===null?'unsupported':'known',selected:[...policy.nutrients],values:Object.fromEntries(references.filter(item=>item.selected).map(item=>[item.id,item.value])),references,reasons};
}
