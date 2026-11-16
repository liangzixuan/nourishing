import {catalog,entryFacts} from './domain/nutrition.mjs';
import {recipeWeight} from './domain/recipe-weight.mjs';
import {availableQuantityUnits} from './domain/quantity-units.mjs';
import {recipeForEntry} from './domain/recipe-entry.mjs';
import {mealForEntry} from './domain/meal-entry.mjs';
import {digest} from './data-codec.mjs';
import {invalid} from './request-errors.mjs';
export const libraryKinds=['food','recipe','meal'];
export function libraryView(state){
 return {revision:digest(state),energyUnit:state.settings.energyUnit??'kcal',nutrients:catalog.map(({id,name,unit,group,category})=>({id,name,unit,group,category})),items:libraryKinds.flatMap(kind=>state[kind+'s'].filter(row=>!row.readOnly).map(({id,name,retired})=>({id,name,kind,retired:!!retired,favorite:(state.settings.favorites??[]).some(ref=>ref.kind===kind&&ref.id===id)})))};
}
export function libraryItem(state,kind,resource,entry){
 if(!libraryKinds.includes(kind)||!resource)invalid('This library item no longer exists.');
 if(entry&&entry[kind+'Id']!==resource.id)invalid('Choose the entry’s saved item.');
 const item=entry&&kind==='recipe'?recipeForEntry(resource,entry):entry&&kind==='meal'?mealForEntry(resource,entry):resource;
 const grams=kind==='recipe'?recipeWeight(item,state).grams:kind==='food'?item.grams:null;
 const volume=kind==='recipe'?item.batchVolumeMl:kind==='food'?item.milliliters:null;
 const options=[['servings',kind==='meal'?'meal':item.serving??'serving'],...availableQuantityUnits({grams,milliliters:volume}).map(unit=>[unit.id,unit.label]),...(kind==='recipe'?[['batch','Full recipe']]:[]),...(item.portions??[]).map(p=>['portion:'+p.id,p.label])];
 const ingredients=(item.ingredients??item.items??[]).map(row=>{const childKind=row.recipeId?'recipe':'food',child=state[childKind+'s'].find(r=>r.id===row[childKind+'Id']);return {...row,name:child?.name??'Missing ingredient'};});
 return {kind,resource,options,ingredients,nutrients:catalog.map(({id,name,unit,category})=>({id,name,unit,category})),energyUnit:state.settings.energyUnit??'kcal',facts:entryFacts(state,{[kind+'Id']:resource.id,amount:1,...(entry??{})})};
}
