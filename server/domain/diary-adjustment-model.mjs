import {collectResourceDependencies} from './resource-dependencies.mjs';
import {expandResourceQuantity} from './resource-expansion.mjs';
import {parseCompositeItems,parseReferencedQuantity} from './resource-quantity.mjs';
import {recipeForEntry,recipeOverrideFrom,parseRecipeOverride} from './recipe-entry.mjs';
import {assertDiaryDaysEditable} from './diary-day-status.mjs';
import {date as parseDate} from './calendar.mjs';
import {calculateSummary} from './nutrition.mjs';
import {compactFoodSource} from './catalog-source.mjs';

const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>Object.hasOwn(value,key)).map(key=>[key,value[key]]));
/** Revisions bind the occurrence and its nutritional sources. Library notes and
 * other display metadata can be omitted from the device snapshot. */
export function adjustmentRevisionFacts(state,{entry,dependencies}){
 return {
  entry:{...pick(entry,['id','date','time','group','kind']),...parseReferencedQuantity(state,entry,{defaultAmount:1}).source},
  dependencies:{
   foods:dependencies.foods.map(food=>({...pick(food,['id','name','serving','grams','milliliters','nutrients','carbohydrateBasis','portions','classification']),...(food.source===undefined?{}:{source:compactFoodSource(food.source)})})),
   recipes:dependencies.recipes.map(recipe=>pick(recipe,['id','name','servings','cookedWeightGrams','batchVolumeMl','ingredients','portions'])),
   meals:dependencies.meals.map(meal=>pick(meal,['id','name','items'])),
   missing:dependencies.missing,
  },
 };
}
export function adjustmentSource(state,input,kind){
 if(!['meal','recipe'].includes(kind))fail('Choose a recipe or meal adjustment.');
 parseDate(input.date);if(typeof input.id!=='string'||!input.id.trim()||input.id.length>100)fail('Choose a diary entry ID.');
 const matches=state.entries.filter(row=>row.id===input.id);if(matches.length!==1||matches[0].date!==input.date)fail('This diary entry changed or no longer exists. Reload the diary.',409);
 const entry=matches[0];if(entry.kind!=='food'||!entry[kind+'Id'])fail(`Choose a custom ${kind} diary entry.`);
 assertDiaryDaysEditable(state,[entry.date]);
 const dependencies=collectResourceDependencies(state,[entry]);if(dependencies.missing.length)fail('An ingredient is unavailable. Restore its source before adjusting this entry.',409);
 return {entry,dependencies};
}
export function adjustmentDraft(state,entry,kind){
 const resource=state[kind==='recipe'?'recipes':'meals'].find(row=>row.id===entry[kind+'Id']);
 const recipe=kind==='recipe'?recipeForEntry(resource,entry):null,items=recipe?recipe.ingredients:expandResourceQuantity(state,entry,{target:'children'}).map(row=>row.source);
 if(!items.length)fail('This entry has no ingredients to adjust.');
 const {version,ingredients,...basis}=recipe?recipeOverrideFrom(recipe):{};
 return {id:entry.id,date:entry.date,name:resource.name,items,foods:state.foods,recipes:state.recipes,...(recipe?{basis,recipeId:resource.id,quantity:Object.fromEntries(['amount','quantity','unit','portionId'].filter(key=>entry[key]!==undefined).map(key=>[key,entry[key]]))}:{})};
}
/** One quantity parser owns both the local preview and the server adjustment. */
export function adjustmentProjection(state,entry,input,kind){
 if(kind==='recipe'){
  const keys=['servings','cookedWeightGrams','batchVolumeMl','portions'];
  if(!input.basis||typeof input.basis!=='object'||Array.isArray(input.basis)||Object.keys(input.basis).length!==keys.length||keys.some(key=>!Object.hasOwn(input.basis,key)))fail('Supply only the required diary adjustment fields.');
 }
 const items=parseCompositeItems(state,input.items);
 const override=kind==='recipe'?parseRecipeOverride({version:1,ingredients:items,...input.basis}):null;
 const next={...entry,...(override?{recipeOverride:override}:{mealItems:items,amount:1})};
 const parsed=parseReferencedQuantity(state,next,{defaultAmount:1});
 const afterEntry={...next,...parsed.source};
 const {version,ingredients,...basis}=override??{};
 const project=entries=>{const result=calculateSummary({...state,entries,biometrics:[],notes:[]},entry.date);return {values:result.totals,coverage:result.nutrientCoverage,attributions:result.attributions};};
 return {items,...(override?{basis}:{}),afterEntry,before:project([entry]),after:project([afterEntry])};
}
