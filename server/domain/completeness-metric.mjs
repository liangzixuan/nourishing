import {parseCarbohydrateDefinition,carbohydrateLabel,carbohydrateDescription,NET_CARBOHYDRATE_TARGET_ID} from './carbohydrate-policy.mjs';

const invalid=()=>{throw Object.assign(Error('Choose overall, one nutrient, one group or tracked carbohydrate food-data completeness.'),{status:400});};
/** Shape and canonical scopes only. Live catalog membership belongs to requests. */
export function parseCompletenessMetric(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||input.kind!=='data-completeness'||Object.keys(input).some(key=>!['kind','scope','id','mode'].includes(key)))invalid();
  const count=Object.keys(input).length;
  if(count===1)return {kind:'data-completeness'};
  if(input.scope==='carbohydrate'&&count===2)return {kind:'data-completeness',scope:'carbohydrate'};
  if(input.scope==='carbohydrate'&&count===3&&['total','net'].includes(input.mode))return {kind:'data-completeness',scope:'carbohydrate',mode:input.mode};
  if(count===3&&['nutrient','group'].includes(input.scope)&&typeof input.id==='string'&&input.id.trim()&&input.id.length<=1000){
    if(input.scope==='nutrient'&&['carbs',NET_CARBOHYDRATE_TARGET_ID].includes(input.id)||input.scope==='group'&&input.id==='overall')invalid();
    return {kind:'data-completeness',scope:input.scope,id:input.id};
  }
  invalid();
}

/** Captured identity validation never consults current workspace or catalog data. */
export function completenessScope(input,definition){
  const metric=parseCompletenessMetric(input);
  if(metric.scope==='carbohydrate'){
    if(metric.mode==='net'&&definition===null)return {metric,componentId:NET_CARBOHYDRATE_TARGET_ID,definition:null,name:'Net carbohydrate food-data completeness'};
    const captured=parseCarbohydrateDefinition(definition);
    if(metric.mode&&captured.mode!==metric.mode)invalid();
    return {metric,componentId:captured.mode==='net'?NET_CARBOHYDRATE_TARGET_ID:'carbs',definition:captured,name:carbohydrateLabel(captured)+' food-data completeness'};
  }
  return {metric,componentId:metric.scope==='nutrient'?metric.id:null};
}

/** These two identities describe calculated food availability, not raw source fields. */
export function completenessDefinitionFields(row){
  const mode=row.id==='carbs'?'total':row.id===NET_CARBOHYDRATE_TARGET_ID?'net':null;
  if(!mode){if(Object.hasOwn(row,'definition'))invalid();return [];}
  completenessScope({kind:'data-completeness',scope:'carbohydrate',mode},row.definition);
  if(row.name!==(mode==='total'?'Total carbohydrate':'Net carbohydrate'))invalid();
  return ['definition'];
}
export function completenessDefinitionText(row){
  completenessDefinitionFields(row);
  return !Object.hasOwn(row,'definition')?'':row.definition===null?'Net carbohydrate definition is not set. No food contribution has a usable Net value.':carbohydrateDescription(row.definition);
}
