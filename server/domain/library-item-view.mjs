import {foodCategories,foodTags} from './food-taxonomy.mjs';
import {resolveRecipeQuantity} from './recipe-quantity.mjs';
import {catalog,entryFacts} from './nutrition.mjs';
import {recipeWeight,ingredientWeightGrams} from './recipe-weight.mjs';
import {availableQuantityUnits} from './quantity-units.mjs';
import {recipeForEntry} from './recipe-entry.mjs';
import {mealForEntry} from './meal-entry.mjs';
import {invalid} from '../request-errors.mjs';
import {libraryKinds,libraryItems} from './library-list.mjs';
export {libraryKinds};
export function libraryItem(state,kind,resource,entry){
 if(!libraryKinds.includes(kind)||!resource)invalid('This library item no longer exists.');
 if(entry&&entry[kind+'Id']!==resource.id)invalid('Choose the entry’s saved item.');
 const item=entry&&kind==='recipe'?recipeForEntry(resource,entry):entry&&kind==='meal'?mealForEntry(resource,entry):resource;
 const options=libraryQuantityOptions(state,kind,item);
 const ingredients=libraryIngredientRows(state,item.ingredients??item.items??[]);
 return {kind,resource,options,ingredients,nutrients:catalog.map(({id,name,unit,category})=>({id,name,unit,category})),energyUnit:state.settings.energyUnit??'kcal',facts:entryFacts(state,{[kind+'Id']:resource.id,amount:1,...(entry??{})})};
}
export function libraryIngredientRows(state,items){
 return items.map(row=>{
  const key=row.recipeId?'recipeId':'foodId',collection=row.recipeId?state.recipes:state.foods;
  return libraryIngredientRow(state,row,collection.find(item=>item.id===row[key]));
 });
}

export function libraryIngredientRow(state,row,child){
 if(!child)return {...row,name:'Missing ingredient',source:null,options:null,grams:null};
 const kind=row.recipeId?'recipe':'food',weight=kind==='recipe'?recipeWeight(child,state).grams:child.grams;
 const grams=ingredientWeightGrams(row,child,weight);
 const options=libraryQuantityOptions(state,kind,child,weight);
 return {...row,name:child.name,source:child.source??null,options,grams};
}

export function libraryQuantityOptions(state,kind,item,grams=kind==='recipe'?recipeWeight(item,state).grams:kind==='food'?item.grams:null){
 const volume=kind==='recipe'?item.batchVolumeMl:kind==='food'?item.milliliters:null;
 return [['servings',kind==='meal'?'meal':item.serving??'serving'],...availableQuantityUnits({grams,milliliters:volume}).map(unit=>[unit.id,unit.label]),...(kind==='recipe'?[['batch','Full recipe']]:[]),...(item.portions??[]).map(p=>['portion:'+p.id,p.label])];
}

export function recipePreview(state,resource,quantity={amount:1}){
 const weight=recipeWeight(resource,state),originalWeight=recipeWeight({...resource,cookedWeightGrams:null},state);
 // Adapt a serving multiplier to the canonical full-recipe quantity resolver.
 const resolved=resolveRecipeQuantity(resource,quantity.quantity===undefined?{quantity:(quantity.amount??1)/resource.servings,unit:'batch'}:quantity,state);
 return {weight,originalWeight,options:libraryQuantityOptions(state,'recipe',resource),quantity:{grams:resolved.grams??null,milliliters:resolved.milliliters??null,amount:quantity.quantity===undefined?(quantity.amount??1):resolved.amount}};
}

export function libraryCollectionView(state,revision){
 return {revision,taxonomy:{categories:foodCategories,tags:foodTags},energyUnit:state.settings.energyUnit??'kcal',nutrients:catalog.map(({id,name,unit,group,category})=>({id,name,unit,group,category})),items:libraryItems(state)};
}
