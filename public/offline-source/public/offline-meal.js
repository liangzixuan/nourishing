import {CaptureValidationError} from './../../report-source/public/capture-errors.js';
import {parseCompositeSources} from './../../report-source/server/composite-source.mjs';

/** Retain occurrence sources, not copied nutrient totals or ingredient labels. */
export function mealSourceFields(row){
  if(!Object.hasOwn(row,'mealItems'))return {};
  if(!row.mealId)throw new CaptureValidationError('offlineMealSource');
  return {mealItems:parseCompositeSources(row.mealItems)};
}

export const mealInputsReady=(snapshot,row)=>!row.mealId||snapshot.mealInputsVersion===1;

/** Older captures omitted this field, so absence cannot prove an unadjusted meal. */
export function projectIncompleteMeals(state,snapshot){
  state.entries=state.entries.map(row=>{
    if(mealInputsReady(snapshot,row))return row;
    const {mealId,mealItems,...record}=row;
    return {...record,name:row.name||state.meals.find(meal=>meal.id===mealId)?.name||'Meal',nutrients:{},_mealInputsMissing:true};
  });
}
