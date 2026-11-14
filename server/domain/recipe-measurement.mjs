import {parseRecipePortions} from './recipe-portion-schema.mjs';
import {parseVolume,parseMeasuredQuantity} from './food-quantity.mjs';
import {quantityUnit,isQuantityUnit} from './quantity-units.mjs';
const invalid=message=>{throw Object.assign(new Error(message),{status:400});};

/** Source quantities can be retained in expansion history after a recipe is deleted. */
export function parseRecipeSourceQuantity(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))invalid('Recipe quantity must be an object.');
  if(input.quantity===undefined)return null;
  const {quantity:rawQuantity,unit}=input;
  if(!isQuantityUnit(unit)&&!['portion','batch'].includes(unit))invalid('Choose a standard weight or volume unit, a named portion or full recipes.');
  const quantity=parseMeasuredQuantity(rawQuantity);
  if(['amount','grams','milliliters','portionLabel'].some(key=>Object.hasOwn(input,key)))invalid('Recipe quantities cannot include derived servings, grams, millilitres or labels.');
  if(unit!=='portion'&&Object.hasOwn(input,'portionId'))invalid('Only named recipe portions can include a portion ID.');
  if(unit==='portion'&&(typeof input.portionId!=='string'||!input.portionId.trim()||input.portionId.length>200))invalid('Choose a named recipe portion.');
  return {quantity,unit,...(unit==='portion'?{portionId:input.portionId}:{})};
}
/** Named batch fractions and measured weights are distinct facts. Both resolve
 * against the current recipe yield; an unknown batch weight stays unknown. */
export function resolveRecipeMeasurement(recipe,input={},weight=null){
  if(!input||typeof input!=='object'||Array.isArray(input))invalid('Recipe quantity must be an object.');
  // Nutrition views may contain cached display fields. Only the recorded unit,
  // quantity and matching portion identity select the current measurement.
  const source=parseRecipeSourceQuantity({quantity:input.quantity,unit:input.unit,...(input.unit==='portion'?{portionId:input.portionId}:{})});if(!source)return null;
  const {quantity,unit}=source;
  const standard=quantityUnit(unit),measured=standard?quantity*standard.factor:null;
  const volume=parseVolume(recipe.batchVolumeMl,'Measured full-recipe volume',10000000);
  if(typeof recipe.servings!=='number'||!Number.isFinite(recipe.servings)||recipe.servings<=0)invalid('Recipe yield must be a positive serving count.');
  let amount,grams,portionLabel;
  if(unit==='batch'){
    amount=quantity*recipe.servings;grams=weight===null?null:quantity*weight;
  }else if(standard?.basis==='milliliters'){
    if(volume===null)invalid('Recipe millilitre quantities need a measured full-recipe volume.');
    amount=measured*recipe.servings/volume;grams=weight===null?null:measured*weight/volume;
  }else if(standard?.basis==='grams'){
    if(weight===null)invalid('Recipe gram quantities need complete ingredient weights or a measured cooked batch weight.');
    grams=measured;amount=grams*recipe.servings/weight;
  }else{
    const portion=parseRecipePortions(recipe.portions).find(item=>item.id===source.portionId);
    if(!portion)invalid('The selected recipe portion no longer exists.');
    portionLabel=portion.label;
    const count=quantity/(portion.quantity??1);
    if(portion.basis==='batch'){amount=count*recipe.servings/portion.portionsPerBatch;grams=weight===null?null:count*weight/portion.portionsPerBatch;}
    else if(portion.basis==='volume'){if(volume===null)invalid('Volume-based recipe portions need a measured full-recipe volume.');amount=count*portion.milliliters*recipe.servings/volume;grams=weight===null?null:amount*weight/recipe.servings;}
    else{if(weight===null)invalid('Weighed recipe portions need complete ingredient weights or a measured cooked batch weight.');grams=count*portion.grams;amount=grams*recipe.servings/weight;}
  }
  if(!Number.isFinite(amount)||Math.abs(amount)>100000)invalid('The measured recipe quantity exceeds the supported serving range.');
  if(grams!==null&&!Number.isFinite(grams))invalid('The recipe portion weight exceeds the supported range.');
  const milliliters=volume===null?null:amount*volume/recipe.servings;
  if(milliliters!==null&&!Number.isFinite(milliliters))invalid('The recipe portion volume exceeds the supported range.');
  return {...source,grams,amount,...(milliliters!==null?{milliliters}:{}),...(unit==='portion'?{portionLabel}:{})};
}
