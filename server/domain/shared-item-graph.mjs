import {randomUUID} from 'node:crypto';
import {collectResourceDependencies,orderRecipeDependencies} from './resource-dependencies.mjs';

const invalid=message=>{throw Object.assign(Error(message),{status:400});};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

/** Shared files own their complete graph. Local mutable IDs cannot supply or
 * replace an incoming dependency. Catalog snapshots retain their immutable
 * identities; the catalog admission boundary verifies their source facts. */
export function prepareSharedItemGraph(state,input){
 const packet=structuredClone(input),{kind,item,foods,recipes}=packet;
 if(!object(item))invalid('Choose a complete shared item.');
 const identities=new Map([['foods',new Set()],['recipes',new Set()]]);
 for(const [collection,rows]of [['foods',foods],['recipes',recipes]])for(const row of rows){
  if(!object(row)||typeof row.id!=='string'||!row.id.trim()||row.id.length>100)invalid('Each shared dependency needs a valid ID.');
  if(identities.get(collection).has(row.id))invalid('Each shared dependency ID must occur only once.');
  identities.get(collection).add(row.id);
 }
 const rootCollection=kind==='food'?'foods':kind==='recipe'?'recipes':null;
 if(rootCollection&&identities.get(rootCollection).has(item.id))invalid('The shared item cannot also be a dependency.');
 const graph={foods:kind==='food'?[...foods,item]:foods,recipes:kind==='recipe'?[...recipes,item]:recipes,meals:kind==='meal'?[item]:[]};
 orderRecipeDependencies(graph);
 if(kind==='meal'&&!Array.isArray(item.items))invalid('Shared meal items must be an array.');
 const references=kind==='recipe'?item.ingredients:kind==='meal'?item.items:[];
 if(collectResourceDependencies(graph,references).missing.length)invalid('A shared dependency is missing from this file. Export the complete item again.');

 const foodIds=new Map(),recipeIds=new Map(),localFoods=new Set(state.foods.map(row=>row.id)),localRecipes=new Set(state.recipes.map(row=>row.id));
 for(const food of foods)if(!food.readOnly&&localFoods.has(food.id))foodIds.set(food.id,randomUUID());
 for(const recipe of recipes)if(localRecipes.has(recipe.id))recipeIds.set(recipe.id,randomUUID());
 const bind=rows=>{for(const row of rows){if(foodIds.has(row.foodId))row.foodId=foodIds.get(row.foodId);if(recipeIds.has(row.recipeId))row.recipeId=recipeIds.get(row.recipeId);}};
 for(const food of foods)if(foodIds.has(food.id))food.id=foodIds.get(food.id);
 for(const recipe of recipes){if(recipeIds.has(recipe.id))recipe.id=recipeIds.get(recipe.id);bind(recipe.ingredients);}
 bind(references);
 // copiedFrom and importReview describe source history, not live bindings.
 return packet;
}
