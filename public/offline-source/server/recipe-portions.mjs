import {parseRecipePortions} from './../../report-source/server/recipe-portion-schema.mjs';
import {recipeWeight} from './../../report-source/server/recipe-weight.mjs';
import {parseVolume} from './../../report-source/server/food-quantity.mjs';
const invalid=message=>{throw Object.assign(Error(message),{status:400});};
export function recipePortionFields(recipe,context={}){
 const portions=parseRecipePortions(recipe.portions);
 const volume=parseVolume(recipe.batchVolumeMl,'Measured full-recipe volume',10000000);
 if(portions.some(portion=>portion.basis==='volume')&&volume===null)invalid('Volume-based recipe portions need a measured full-recipe volume.');
 if(portions.some(portion=>portion.basis==='weight')&&recipeWeight(recipe,context).grams===null)invalid('Weight-based recipe portions need complete ingredient weights or a measured cooked batch weight.');
 return portions.length?{portions}:{};
}
