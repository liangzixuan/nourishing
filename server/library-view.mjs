import {foodCategories,foodTags} from './domain/food-taxonomy.mjs';
import {resolveRecipeQuantity} from './domain/recipe-quantity.mjs';
import {catalog,entryFacts} from './domain/nutrition.mjs';
import {recipeWeight} from './domain/recipe-weight.mjs';
import {availableQuantityUnits} from './domain/quantity-units.mjs';
import {recipeForEntry} from './domain/recipe-entry.mjs';
import {mealForEntry} from './domain/meal-entry.mjs';
import {digest} from './data-codec.mjs';
import {invalid} from './request-errors.mjs';
import {libraryKinds,libraryItems} from './domain/library-list.mjs';
export {libraryKinds};
export function libraryView(state){
 return {revision:digest(state),taxonomy:{categories:foodCategories,tags:foodTags},energyUnit:state.settings.energyUnit??'kcal',nutrients:catalog.map(({id,name,unit,group,category})=>({id,name,unit,group,category})),items:libraryItems(state)};
}
export function libraryItem(state,kind,resource,entry){
 if(!libraryKinds.includes(kind)||!resource)invalid('This library item no longer exists.');
 if(entry&&entry[kind+'Id']!==resource.id)invalid('Choose the entry’s saved item.');
 const item=entry&&kind==='recipe'?recipeForEntry(resource,entry):entry&&kind==='meal'?mealForEntry(resource,entry):resource;
 const options=libraryQuantityOptions(state,kind,item);
 const ingredients=(item.ingredients??item.items??[]).map(row=>{const childKind=row.recipeId?'recipe':'food',child=state[childKind+'s'].find(r=>r.id===row[childKind+'Id']);return {...row,name:child?.name??'Missing ingredient',source:child?.source??null,options:child?libraryQuantityOptions(state,childKind,child):null};});
 return {kind,resource,options,ingredients,nutrients:catalog.map(({id,name,unit,category})=>({id,name,unit,category})),energyUnit:state.settings.energyUnit??'kcal',facts:entryFacts(state,{[kind+'Id']:resource.id,amount:1,...(entry??{})})};
}

export function libraryQuantityOptions(state,kind,item){
 const grams=kind==='recipe'?recipeWeight(item,state).grams:kind==='food'?item.grams:null;
 const volume=kind==='recipe'?item.batchVolumeMl:kind==='food'?item.milliliters:null;
 return [['servings',kind==='meal'?'meal':item.serving??'serving'],...availableQuantityUnits({grams,milliliters:volume}).map(unit=>[unit.id,unit.label]),...(kind==='recipe'?[['batch','Full recipe']]:[]),...(item.portions??[]).map(p=>['portion:'+p.id,p.label])];
}

export function recipePreview(state,resource,quantity={amount:1}){
 const weight=recipeWeight(resource,state),originalWeight=recipeWeight({...resource,cookedWeightGrams:null},state);
 // Adapt a serving multiplier to the canonical full-recipe quantity resolver.
 const resolved=resolveRecipeQuantity(resource,quantity.quantity===undefined?{quantity:(quantity.amount??1)/resource.servings,unit:'batch'}:quantity,state);
 return {weight,originalWeight,options:libraryQuantityOptions(state,'recipe',resource),quantity:{grams:resolved.grams??null,milliliters:resolved.milliliters??null,amount:quantity.quantity===undefined?(quantity.amount??1):resolved.amount}};
}
