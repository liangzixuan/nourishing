import {recipeWeight} from './recipe-weight.mjs';
import {resolveRecipeMeasurement} from './recipe-measurement.mjs';

export function resolveRecipeQuantity(recipe,input={},context={}){
  if(input?.quantity===undefined)return resolveRecipeMeasurement(recipe,input);
  return resolveRecipeMeasurement(recipe,input,recipeWeight(recipe,context).grams);
}
