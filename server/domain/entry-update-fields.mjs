import {resourceReference} from './resource-reference.mjs';
import {isQuantityUnit} from './quantity-units.mjs';
import {canonicalFoodQuantityEntry} from './food-quantity.mjs';

/** Merge source quantities once. A serving edit replaces measured units, and a
 * source replacement cannot inherit another resource's occurrence override. */
export function mergeEntryUpdate(old,patch){
 const reference=resourceReference(patch),oldReference=resourceReference(old),changedReference=reference&&(reference!==oldReference||patch[reference]!==old[reference]);
 const base={...old};
 if(changedReference){delete base.mealItems;delete base.recipeOverride;}
 if(reference){for(const key of ['foodId','recipeId','mealId'])if(key!==reference)delete base[key];delete base.nutrients;delete base.carbohydrateBasis;}
 if(Object.hasOwn(patch,'nutrients')&&!Object.hasOwn(patch,'carbohydrateBasis'))delete base.carbohydrateBasis;
 if(changedReference||(patch.amount!==undefined&&patch.quantity===undefined)){
  for(const key of ['quantity','unit','portionId','portionLabel','grams','milliliters'])delete base[key];
  if(changedReference)delete base.amount;
 }
 if((reference||oldReference)==='recipeId'&&patch.quantity!==undefined){
  for(const key of ['amount','grams','milliliters','portionLabel'])delete base[key];
  if(isQuantityUnit(patch.unit)||patch.unit==='batch'||changedReference)delete base.portionId;
 }
 const merged={...base,...patch};
 if(patch.quantity!==undefined&&patch.unit===undefined&&!changedReference)merged.unit=old.unit;
 return canonicalFoodQuantityEntry(merged);
}
