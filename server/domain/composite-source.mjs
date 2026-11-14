import {resourceReference} from './resource-reference.mjs';
import {parseServingAmount} from './food-quantity.mjs';
import {parseRecipeSourceQuantity} from './recipe-measurement.mjs';
const fail=message=>{throw Object.assign(Error(message),{status:400});};
/** Retain source quantities even in history whose resources no longer exist. */
export function parseCompositeSources(items){
 if(!Array.isArray(items)||!items.length||items.length>1000)fail('Use 1 to 1,000 food or recipe ingredients.');
 return items.map(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(key=>!['foodId','recipeId','amount','quantity','unit','portionId'].includes(key))||['foodId','recipeId'].filter(key=>Object.hasOwn(row,key)).length!==1)fail('Choose exactly one food or recipe and its source quantity.');
  const reference=resourceReference(row),id=row[reference];if(typeof id!=='string'||!id.trim()||id.length>1000)fail('Choose a valid resource ID.');
  if(row.quantity!==undefined){if(reference==='foodId'&&row.unit==='batch')fail('Full batches apply only to recipes.');return {[reference]:id,...parseRecipeSourceQuantity(row)};}
  if(['unit','portionId'].some(key=>Object.hasOwn(row,key)))fail('Measured quantity metadata requires a quantity.');
  return {[reference]:id,amount:parseServingAmount(row.amount)};
 });
}
