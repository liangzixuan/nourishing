import {MEAL_DIETS,MEAL_CATEGORIES,MEAL_EXCLUSIONS,mealReference,mealReferenceList,mealReferenceKey,mealTags} from './meal-suggestion-policy.mjs';
export const MEAL_OPTIONS_VERSION=1;
const requireFact=value=>{if(!value)throw Error('Meal preference response is incomplete or unsupported.');};
const fields=(value,keys)=>requireFact(value&&typeof value==='object'&&!Array.isArray(value)&&keys.length===Object.keys(value).length&&keys.every(key=>Object.hasOwn(value,key)));
export function parseMealSuggestionOptions(value){
  try{
    fields(value,['version','diets','categories','exclusions','custom','lessOften','excluded','templateCount']);
    requireFact(value.version===MEAL_OPTIONS_VERSION);
    for(const [field,choices]of [['diets',MEAL_DIETS],['categories',MEAL_CATEGORIES],['exclusions',MEAL_EXCLUSIONS]])requireFact(Array.isArray(value[field])&&JSON.stringify(value[field])===JSON.stringify(choices));
    requireFact(Number.isSafeInteger(value.templateCount)&&value.templateCount>=0&&Array.isArray(value.custom)&&Array.isArray(value.excluded));
    mealReferenceList(value.lessOften);
    for(const row of value.custom){
      requireFact(row&&typeof row.available==='boolean'&&typeof row.name==='string');mealReference(row.ref);
      if(row.available){
        fields(row,['ref','name','revision','tags','tagStatus','available']);
        requireFact(typeof row.revision==='string'&&/^[a-f0-9]{64}$/.test(row.revision)&&['unknown','reviewed','changed-since-review'].includes(row.tagStatus));
        if(row.tagStatus==='reviewed')mealTags(row.tags);else requireFact(row.tags===null);
      }else{fields(row,['ref','name','available','reason']);requireFact(typeof row.reason==='string');}
    }
    requireFact(new Set(value.custom.map(row=>mealReferenceKey(row.ref))).size===value.custom.length);
    for(const row of value.excluded){fields(row,['ref','name','available']);mealReference(row.ref,{template:true});requireFact(typeof row.name==='string'&&typeof row.available==='boolean');}
    requireFact(new Set(value.excluded.map(row=>mealReferenceKey(row.ref))).size===value.excluded.length);
    return value;
  }catch(error){throw Object.assign(new Error('Meal preference response is incomplete or unsupported.',{cause:error}),{mealOptionsCode:'invalid-options'});}
}
