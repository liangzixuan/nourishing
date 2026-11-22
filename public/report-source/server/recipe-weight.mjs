import {orderRecipeDependencies,collectResourceDependencies} from './resource-dependencies.mjs';
import {resolveRecipeMeasurement} from './recipe-measurement.mjs';
import {resolveFoodQuantity,parseServingAmount} from './food-quantity.mjs';
const invalid=message=>{throw Object.assign(new Error(message),{status:400});};
const known=value=>typeof value==='number'&&Number.isFinite(value);

export function parseCookedWeightGrams(value){
  if(value===null||value===undefined)return null;
  if(!known(value)||value<=0||value>10000000)invalid('Measured cooked recipe weight must be a positive number no greater than 10,000,000 grams.');
  return value;
}

export function ingredientWeightGrams(item,resource,weight){
  const recipe=item.recipeId!==undefined;
  if(item.quantity!==undefined){
    const quantity=recipe?resolveRecipeMeasurement(resource,item,weight):resolveFoodQuantity(resource,item);
    return quantity.quantity===0?0:quantity.grams;
  }
  parseServingAmount(item.amount);
  if(recipe&&(!known(resource.servings)||resource.servings<=0))invalid('Recipe yield must be a positive serving count.');
  return item.amount===0?0:known(weight)&&weight>0?item.amount*weight/(recipe?resource.servings:1):null;
}

/** Evaluate child masses before their parents. A partial ingredient sum is
 * coverage only; a measured cooked mass remains a separate conversion basis. */
export function recipeWeight(recipe,{foods=[],recipes=[]}={}){
  const root=recipe??{ingredients:[]},context={foods,recipes};
  const ordered=orderRecipeDependencies(context,[{...root,ingredients:root.ingredients??[]}],{allowMissing:true});
  const byFood=new Map(foods.map(food=>[food.id,food])),byRecipe=new Map(recipes.map(row=>[row.id,row])),facts=new Map();
  if(root.id!==undefined)byRecipe.set(root.id,ordered.at(-1));
  for(const current of ordered){
    const measuredCookedGrams=parseCookedWeightGrams(current.cookedWeightGrams),items=current.ingredients;
    let measured=0,sum=0;
    for(const item of items){
      const child=item.recipeId!==undefined?byRecipe.get(item.recipeId):null,food=byFood.get(item.foodId);
      if(!child&&!food)continue;
      const weight=child?facts.get(child.id)?.grams??null:food.grams;
      const grams=ingredientWeightGrams(item,child??food,weight);
      if(grams!==null){if(!known(grams))invalid('An ingredient weight exceeds the supported range.');sum+=grams;measured++;}
    }
    if(!Number.isFinite(sum))invalid('The ingredient weight total exceeds the supported range.');
    const complete=items.length>0&&measured===items.length,ingredients={grams:measured>0?sum:null,known:measured,total:items.length,complete};
    const grams=measuredCookedGrams??(complete&&sum>0?sum:null),basis=measuredCookedGrams!==null?'cooked':grams!==null?'ingredients':'unknown';
    facts.set(current.id,{grams,basis,measuredCookedGrams,ingredients});
  }
  return facts.get(root.id);
}

/** Only source measurements and references leave this boundary. Editors do not
 * need nutrients, private notes or source review text to resolve quantities. */
export function recipeWeightContext(recipe,state){
  if(!recipe)return {foods:[],recipes:[]};
  const context={...state,recipes:[...(state.recipes??[]).filter(row=>row.id!==recipe.id),recipe]};
  const graph=collectResourceDependencies(context,recipe.ingredients??[]);
  const foods=graph.foods.map(food=>({id:food.id,grams:food.grams,...(food.milliliters!==undefined?{milliliters:food.milliliters}:{}),...(food.portions?{portions:food.portions.map(({id,grams,milliliters})=>({id,grams,...(milliliters!==undefined?{milliliters}:{})}))}:{})}));
  const recipes=graph.recipes.map(({id,servings,cookedWeightGrams,batchVolumeMl,ingredients,portions})=>({id,servings,cookedWeightGrams,batchVolumeMl,ingredients:structuredClone(ingredients),...(portions?{portions:portions.map(({translations,...portion})=>portion)}:{})}));
  return {foods,recipes};
}
