import {parseCompositeSources} from './../../report-source/server/composite-source.mjs';
import {recipeEntryFields,recipeForEntry} from './../../report-source/server/recipe-entry.mjs';
import {recipePortionFields} from './recipe-portions.mjs';
import {orderRecipeDependencies} from './../../report-source/server/resource-dependencies.mjs';
import {mealForEntry} from './../../report-source/server/meal-entry.mjs';
import {resourceReference} from './../../report-source/server/resource-reference.mjs';
import {resolveFoodQuantity,parseServingAmount} from './../../report-source/server/food-quantity.mjs';
import {parseRecipeSourceQuantity} from './../../report-source/server/recipe-measurement.mjs';
import {resolveRecipeQuantity} from './../../report-source/server/recipe-quantity.mjs';

const fail=message=>{throw Object.assign(new Error(message),{status:400});};
const collections={foodId:'foods',recipeId:'recipes',mealId:'meals'};
/** Parse only the reference and its source measurement. The caller owns the
 * enclosing record's allowed metadata; derived display fields are never saved. */
export function parseReferencedQuantity(state,input,{allowedReferences=Object.keys(collections),defaultAmount,reference=resourceReference(input)}={}){
  if(!reference||!allowedReferences.includes(reference))fail('Choose a supported food or recipe reference.');
  const id=input[reference];
  if(typeof id!=='string'||!id.trim()||id.length>1000)fail('Choose a valid resource ID.');
  let resource=(state[collections[reference]]||[]).find(item=>item.id===id);
  if(!resource)fail(`The selected ${reference==='foodId'?'food':reference==='recipeId'?'recipe':'meal'} does not exist.`);
  const source={[reference]:resource.id};
  if(input.mealItems!==undefined){if(reference!=='mealId')fail('Only a meal diary entry can own meal items.');source.mealItems=parseCompositeItems(state,input.mealItems);}
  if(input.recipeOverride!==undefined){Object.assign(source,recipeEntryFields(input));resource=recipeForEntry(resource,source);orderRecipeDependencies(state,[resource]);for(const item of source.recipeOverride.ingredients)parseReferencedQuantity(state,item,{allowedReferences:['foodId','recipeId']});recipePortionFields(resource,state);}
  let resolvedQuantity=null;
  if(input.quantity!==undefined){
    if(reference==='mealId')fail('Meals use serving amounts, not measured quantities.');
    const resolved=reference==='foodId'?resolveFoodQuantity(resource,input):resolveRecipeQuantity(resource,parseRecipeSourceQuantity(input),state);
    resolvedQuantity=resolved;
    source.quantity=resolved.quantity;source.unit=resolved.unit;
    if(resolved.unit==='portion')source.portionId=resolved.portionId;
  }else{
    if(['unit','grams','milliliters','portionId','portionLabel'].some(key=>input[key]!==undefined))fail('Measured quantity metadata requires a quantity.');
    const amount=input.amount===undefined?defaultAmount:input.amount;
    source.amount=parseServingAmount(amount);
  }
  return {source,resource:reference==='mealId'?mealForEntry(resource,source):resource,resolvedQuantity};
}

export function parseCompositeItems(state,items){return parseCompositeSources(items).map(row=>parseReferencedQuantity(state,row,{allowedReferences:['foodId','recipeId']}).source);}
