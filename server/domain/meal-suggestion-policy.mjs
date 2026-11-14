const fail=message=>{throw Object.assign(Error(message),{status:400});};
const exact=(value,required,optional=[])=>{if(!value||typeof value!=='object'||Array.isArray(value)||required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>![...required,...optional].includes(key)))fail('Meal suggestion settings contain missing or unsupported fields.');};
export const MEAL_DIETS=Object.freeze(['vegan','vegetarian','pescatarian','gluten-free']);
export const MEAL_CATEGORIES=Object.freeze(['breakfast','lunch','dinner','dessert','snack']);
export const MEAL_EXCLUSIONS=Object.freeze(['milk','egg','fish','shellfish','peanut','tree-nut','wheat','soy','sesame']);
const kinds=['foods','recipes','meals'];
export function mealReference(input,{template=false}={}){
  exact(input,['kind','id']);
  if(!(template?[...kinds,'template']:kinds).includes(input.kind)||typeof input.id!=='string'||!input.id.trim()||input.id.length>1000)fail('Choose a valid meal suggestion reference.');
  return {kind:input.kind,id:input.id};
}
export const mealReferenceKey=ref=>JSON.stringify([ref.kind,ref.id]);
export function mealChoices(value,choices,label){
  if(!Array.isArray(value)||value.some(item=>typeof item!=='string'||!choices.includes(item))||new Set(value).size!==value.length)fail(`Choose distinct supported ${label}.`);
  return [...value];
}
export function mealTags(input){
  exact(input,['diets','categories','exclusions']);
  return {diets:mealChoices(input.diets,MEAL_DIETS,'diets'),categories:mealChoices(input.categories,MEAL_CATEGORIES,'meal categories'),exclusions:mealChoices(input.exclusions,MEAL_EXCLUSIONS,'ingredient exclusions')};
}
export function mealReferenceList(input){
  if(!Array.isArray(input))fail('Meal suggestion references must be a list.');
  const result=input.map(ref=>mealReference(ref,{template:true}));
  if(new Set(result.map(mealReferenceKey)).size!==result.length)fail('Meal suggestion references must be distinct.');
  return result;
}
export function parseMealSuggestionPolicy(input){
  if(input===undefined)return {version:1,tags:[],lessOften:[],excluded:[]};
  exact(input,['version','tags','lessOften'],['excluded']);
  if(input.version!==1||!Array.isArray(input.tags))fail('Use version 1 meal suggestion settings.');
  const tags=input.tags.map(row=>{
    exact(row,['ref','revision','tags']);
    if(typeof row.revision!=='string'||!/^[a-f0-9]{64}$/.test(row.revision))fail('Review tags against the current food or meal revision.');
    return {ref:mealReference(row.ref),revision:row.revision,tags:mealTags(row.tags)};
  });
  if(new Set(tags.map(row=>mealReferenceKey(row.ref))).size!==tags.length)fail('Assign tags once per saved food, recipe or meal.');
  return {version:1,tags,lessOften:mealReferenceList(input.lessOften),excluded:mealReferenceList(input.excluded===undefined?[]:input.excluded)};
}
export function parseMealSuggestionFilters(input={}){
  exact(input,[],['diets','categories','exclusions','includeCustom','includeUnknownTags']);
  const {diets=[],categories=[],exclusions=[],includeCustom=false,includeUnknownTags=false}=input;
  const tags=mealTags({diets,categories,exclusions});
  if(typeof includeCustom!=='boolean'||typeof includeUnknownTags!=='boolean')fail('Choose explicit custom-food and unknown-tag options.');
  return {...tags,includeCustom,includeUnknownTags};
}
