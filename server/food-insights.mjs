import {catalog as nutrients} from './domain/nutrition.mjs';
import {rankNutrient} from './domain/catalog-insights.mjs';
import {mealSuggestionOptions,suggestMeals,previewSuggestedMeal,previewSuggestedIngredient,resolveMealIngredient,applyMealSuggestionPreference} from './domain/meal-suggestions.mjs';
import {libraryItem} from './library-view.mjs';
import {availableQuantityUnits} from './domain/quantity-units.mjs';
import {MEAL_LIBRARY} from './domain/meal-suggestion-library.mjs';
import {catalogQuery,matchesCatalogQuery} from './domain/usda-catalog.mjs';
import {catalogIdentity,compactFoodSource,catalogSourceAliases} from './domain/catalog-source.mjs';
import {catalogSourceId,foodSourceFacts} from './domain/food-catalog-identity.mjs';
import {contentDigest} from './domain/content-digest.mjs';
import {resolvedCarbohydrateValues} from './domain/carbohydrate-values.mjs';
import {digest} from './data-codec.mjs';
import {createCatalogSearchIndex} from './catalog-search-index.mjs';

const invalid=message=>{throw Object.assign(Error(message),{status:400,code:400,publicMessage:message});};
const known=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const exact=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))invalid('Unsupported food insight fields.');};
/** Public, immutable catalog facts only. The caller owns generation/digest checks and caching. */
export function createInsightCatalog(foods,{metadata={},sourceFactDigests={},nutrientIds,searchVersion=1}={}){
 if(!Array.isArray(foods))throw Error('A verified catalog projection is required.');
 if(nutrientIds!==undefined&&(!Array.isArray(nutrientIds)||nutrientIds.some(id=>typeof id!=='string'||!id)||new Set(nutrientIds).size!==nutrientIds.length))throw Error('Invalid catalog nutrient dictionary.');
 const index=new Map(),categories=new Map(),search=new Map();
 for(const food of foods){
  if(!food||typeof food.id!=='string'||!food.id||typeof food.name!=='string'||!food.nutrients||index.has(food.id))throw Error('Invalid catalog projection identity.');
  if(Array.isArray(food.nutrients)){
   if(!nutrientIds||food.nutrients.length%2)throw Error('Invalid compact catalog nutrients.');
   const seen=new Set();
   for(let i=0;i<food.nutrients.length;i+=2){const key=food.nutrients[i];if(!Number.isSafeInteger(key)||key<0||key>=nutrientIds.length||seen.has(key))throw Error('Invalid compact catalog nutrient index.');seen.add(key);}
  }
  index.set(food.id,food);search.set(food.id,[food.name,...(food.translations??[]).map(row=>row.name),...catalogSourceAliases(food.source)].join(' '));
  if(food.sample!==true&&food.category?.id){const prior=categories.get(food.category.id);categories.set(food.category.id,{id:food.category.id,name:food.category.name,foodCount:(prior?.foodCount??0)+1});}
 }
 // The full catalog keeps its packed values. Only selected facts cross into
 // domain calculations, which continue to receive their normal object shape.
 function valuesFor(food,selected){
  if(!Array.isArray(food.nutrients))return selected?Object.fromEntries([...selected].filter(id=>Object.hasOwn(food.nutrients,id)).map(id=>[id,food.nutrients[id]])):food.nutrients;
  const entries=[];
  for(let i=0;i<food.nutrients.length;i+=2){const id=nutrientIds[food.nutrients[i]];if(!selected||selected.has(id))entries.push([id,food.nutrients[i+1]]);}
  return Object.fromEntries(entries);
 }
 const searchIndex=createCatalogSearchIndex(foods,metadata,valuesFor);
 let cachedClientIndex=null;
 function clientSearchIndex(){
  if(cachedClientIndex)return cachedClientIndex;
  const sources=[],sourceMap=new Map(),catIds=[],catMap=new Map(),rows=[];
  for(const food of foods){
   if(food.sample===true)continue;
   const src=compactFoodSource(food.source);
   const srcKey=JSON.stringify([src?.datasetId??'',src?.dataset??'',src?.provider??'',src?.name??'']);
   let srcIdx=sourceMap.get(srcKey);
   if(srcIdx===undefined){srcIdx=sources.length;sourceMap.set(srcKey,srcIdx);sources.push({datasetId:src?.datasetId??'',dataset:src?.dataset??'',provider:src?.provider??'',name:src?.name??''});}
   const catId=food.category?.id??'';
   let catIdx=catMap.get(catId);
   if(catIdx===undefined){catIdx=catIds.length;catMap.set(catId,catIdx);catIds.push(catId);}
   const aliases=[...(food.translations??[]).map(r=>r.name),...catalogSourceAliases(food.source)].filter(Boolean).join(' ');
   const priority=src?.datasetId==='usda-foundation'?0:src?.datasetId==='usda-sr-legacy'?1:2;
   rows.push([food.id,food.name,food.serving??'',srcIdx,catIdx,priority,aliases]);
  }
  const datasets=(metadata.datasets??[]).filter(d=>d.foodCount>0).map(({id,name})=>({id,name}));
  cachedClientIndex={version:1,generation:metadata.generation??'',datasets,sources,categories:catIds,rows};
  return cachedClientIndex;
 }
 return {
  searchWorkspace(query,options){if(searchVersion!==1)throw Object.assign(Error('Food search is being prepared.'),{code:503,publicMessage:'Food search is being prepared.'});return searchIndex.search(query,options);},
  clientSearchIndex,
  disposeSearch:()=>searchIndex.dispose(),
  get(id){const food=index.get(id);return !food?null:Array.isArray(food.nutrients)?{...food,nutrients:valuesFor(food)}:food;},
  status:()=>({...metadata,available:true,foodCount:foods.length}),
  categories:()=>[...categories.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id)),
  identicalSnapshotIds(saved){return new Set(saved.filter(food=>food.readOnly===true&&catalogIdentity(food.source)&&sourceFactDigests[catalogSourceId(food)]===contentDigest(foodSourceFacts(food))).map(food=>food.id));},
  projectInsights(selected,{query='',portions='none'}={}){
   if(!['none','first','all'].includes(portions)||!Array.isArray(selected)||!selected.length||selected.some(id=>!nutrients.some(n=>n.id===id)))invalid('Choose supported nutrient and serving options.');
   const parsed=catalogQuery(query),ids=new Set([...selected,'calories']),needed=new Set(ids);
   if(ids.has('carbs')){needed.add('availableCarbs');needed.add('fiber');}
   return foods.filter(food=>food.sample!==true&&matchesCatalogQuery(search.get(food.id),parsed)).map(food=>{
    const values=resolvedCarbohydrateValues(valuesFor(food,needed));
    const available=(food.portions??[]).filter(row=>typeof row.id==='string'&&row.id&&typeof row.label==='string'&&row.label&&known(row.grams)&&row.grams>0);
    return {id:food.id,name:food.name,serving:food.serving,grams:food.grams??null,...(food.milliliters!==undefined?{milliliters:food.milliliters}:{}),category:food.category??null,nutrients:Object.fromEntries([...ids].filter(id=>known(values[id])).map(id=>[id,values[id]])),portions:portions==='none'?[]:portions==='first'?available.slice(0,1):available,source:compactFoodSource(food.source)};
   });
  }
 };
}
export function foodInsightOptions(state){return {revision:digest(state),groups:state.settings.groups,energyUnit:state.settings.energyUnit??'kcal',nutrients:nutrients.map(({id,name,unit,category})=>({id,name,unit,category})),suggestions:{...mealSuggestionOptions(state),templates:MEAL_LIBRARY.map(({ref,name})=>({ref,name}))}};}
export function foodOracle(state,foodCatalog,input){
 exact(input,['nutrient','basis','query','offset','limit','categoryMode','categoryIds','includeUncategorized']);
 return rankNutrient({...input,foods:state.foods,foodCatalog,favorites:state.settings.favorites,entries:state.entries});
}
export function foodSuggestions(state,foodCatalog,input){return suggestMeals({state,foodCatalog,input});}
export function previewFoodSuggestion(state,foodCatalog,input){return previewSuggestedMeal({state,foodCatalog,input});}
export function previewFoodInsightIngredient(state,foodCatalog,input){return previewSuggestedIngredient({state,foodCatalog,input});}
export function resolveFoodInsightIngredient(state,foodCatalog,input){
 const result=resolveMealIngredient({state,foodCatalog,input}),r=result.resource;
 const quantityOptions=input.selection.kind==='catalog'?[['servings',r.serving??'Serving'],...availableQuantityUnits(r).map(unit=>[unit.id,unit.label]),...(r.portions??[]).map(p=>['portion:'+p.id,p.label])]:libraryItem(state,result.kind.slice(0,-1),r).options;
 return {...result,quantityOptions};
}
export const foodInsightCommandFields={'foodSuggestion.preference':['action','ref','revision','tags','lessOften','excluded']};
export function prepareFoodInsightCommand(state,action){
 if(!Object.hasOwn(foodInsightCommandFields,action.type))return action;
 const projected={...state,settings:{...state.settings}};
 applyMealSuggestionPreference(projected,action.payload);
 return {type:'settings.save',payload:{mealSuggestions:projected.settings.mealSuggestions}};
}
