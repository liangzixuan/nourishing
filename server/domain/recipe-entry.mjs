import {parseCompositeSources} from './composite-source.mjs';
import {parseCookedWeightGrams} from './recipe-weight.mjs';
import {parseVolume} from './food-quantity.mjs';
import {parseRecipePortions} from './recipe-portion-schema.mjs';
const fail=message=>{throw Object.assign(Error(message),{status:400});};

/** A diary-only recipe definition owns its batch measurements and ingredients.
 * Library identity, name and provenance still belong to the saved recipe. */
export function parseRecipeOverride(input){
 const keys=['version','ingredients','servings','cookedWeightGrams','batchVolumeMl','portions'];
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==keys.length||keys.some(key=>!Object.hasOwn(input,key))||input.version!==1)fail('Supply the complete version-one recipe adjustment.');
 if(typeof input.servings!=='number'||!Number.isFinite(input.servings)||input.servings<=0||input.servings>100000)fail('Adjusted recipe yield must be greater than zero and no more than 100,000 servings.');
 return {version:1,ingredients:parseCompositeSources(input.ingredients),servings:input.servings,cookedWeightGrams:parseCookedWeightGrams(input.cookedWeightGrams),batchVolumeMl:parseVolume(input.batchVolumeMl,'Adjusted full-recipe volume',10000000),portions:parseRecipePortions(input.portions)};
}
export function recipeForEntry(recipe,entry){return recipe&&entry.recipeOverride!==undefined?{...recipe,...entry.recipeOverride}:recipe;}
export function recipeEntryFields(row){
 if(!Object.hasOwn(row,'recipeOverride'))return {};
 if(!row.recipeId)fail('Only a recipe diary entry can own a recipe adjustment.');
 return {recipeOverride:parseRecipeOverride(row.recipeOverride)};
}
export function recipeOverrideFrom(recipe){return parseRecipeOverride({version:1,ingredients:recipe.ingredients,servings:recipe.servings,cookedWeightGrams:recipe.cookedWeightGrams??null,batchVolumeMl:recipe.batchVolumeMl??null,portions:recipe.portions??[]});}
