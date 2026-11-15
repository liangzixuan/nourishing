import {sourceDefaultHiddenNutrients} from './source-nutrient-registry.mjs';
import {catalog} from './nutrient-catalog.mjs';
import {NET_CARBOHYDRATE_TARGET_ID} from './carbohydrate-policy.mjs';
import {date as calendarDate} from './calendar.mjs';
import {resolveNutrientMaximums} from './nutrient-upper-limits.mjs';

const fail=message=>{throw Object.assign(new Error(message),{status:400});};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const measured=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
export const nutrientDisplayOptions=Object.freeze([...catalog.map(({id,name,unit})=>Object.freeze({id,name,unit})),Object.freeze({id:NET_CARBOHYDRATE_TARGET_ID,name:'Net carbohydrate',unit:'g'})]);
const ids=new Set(nutrientDisplayOptions.map(item=>item.id));

/** Visibility and explicit maxima are independent of daily intake targets. */
export function parseNutrientDisplayPolicy(value){
  if(value===undefined||value===null)return null;
  if(!object(value)||Object.keys(value).length!==3||!['version','hidden','maximums'].every(key=>Object.hasOwn(value,key)))fail('Choose the required nutrient-display fields only.');
  if(value.version!==1||!Array.isArray(value.hidden)||!object(value.maximums))fail('Choose version 1 with explicit hidden nutrients and maximums.');
  const hidden=Array.from(value.hidden);
  if(hidden.some(id=>!ids.has(id))||new Set(hidden).size!==hidden.length)fail('Choose each known hidden nutrient once.');
  const maximums=Object.fromEntries(Object.entries(value.maximums).map(([id,maximum])=>{
    if(!ids.has(id)||maximum!==null&&!measured(maximum))fail('Each maximum must use a known nutrient and a finite nonnegative number, or null.');
    return [id,maximum];
  }));
  return {version:1,hidden,maximums};
}

/** Explicit policies own the complete hidden list; omission uses source defaults. */
export function resolveHiddenNutrients(value){const policy=parseNutrientDisplayPolicy(value);return [...(policy?.hidden??sourceDefaultHiddenNutrients)];}

/** Compare unrounded recorded intake. These comparisons do not establish safety. */
export function projectNutrientDisplay({policy,upperPolicy,referencePolicy,modes,date,totals,targets,coverage,complete,carbohydrate,carbohydrates}){
  calendarDate(date);policy=parseNutrientDisplayPolicy(policy);
  const fact=id=>{
    const net=id===NET_CARBOHYDRATE_TARGET_ID,netFacts=carbohydrates?.net,active=!net||netFacts?.definition!==null&&netFacts?.definition!==undefined;
    const source=active?(net?netFacts?.coverage:coverage?.[id]):null;
    const measuredCoverage=source?{known:source.known,total:source.total,complete:source.complete}:{known:0,total:0,complete:false};
    const candidate=active?(net?netFacts?.value:totals?.[id]):null;
    const value=!active||!measured(candidate)||measuredCoverage.total===0&&complete!==true?null:candidate;
    return {active,value,coverage:measuredCoverage,target:net?netFacts?.target:targets?.[id]};
  };
  const thresholds={},minimums={};
  // A partial nonnegative sum can meet a minimum, but cannot establish that
  // intake is below it. An unset Net definition never borrows a Total value or target.
  for(const id of ids){const {active,value,coverage:measuredCoverage,target}=fact(id);minimums[id]=!active?'unknown':!measured(target)?'not-set':value===null?'unknown':value>=target?'met':measuredCoverage.complete===true?'below':'unknown';}
  const resolved=resolveNutrientMaximums(policy,upperPolicy,referencePolicy,date,modes);
  for(const [id,limit]of resolved.maximums){
    const {maximum}=limit;
    if(maximum===null)continue;
    const observed=fact(id),value=limit.comparisonSupported?observed.value:null;
    const measuredCoverage=limit.comparisonSupported?observed.coverage:{known:0,total:observed.coverage.total,complete:false};
    const status=value===null?'unknown':value>maximum?'above':measuredCoverage.complete===true?'within':'partial';
    thresholds[id]={maximum,value,status,coverage:measuredCoverage,...(limit.origin==='population-ul'?{reference:limit.source,intakeBasis:limit.intakeBasis,comparisonSupported:limit.comparisonSupported,...(!limit.comparisonSupported?{reason:'restricted-form-unmeasured'}:{})}:{})};
  }
  return {version:1,date,hidden:resolveHiddenNutrients(policy),thresholds,minimums,referenceMaximums:resolved.projection.references.map(row=>({...row,overridden:resolved.maximums.get(row.id)?.origin==='custom'}))};
}
