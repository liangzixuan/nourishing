import {resourceReference} from './resource-reference.mjs';

/** Return the referenced source graph without cloning or projecting its facts.
 * Each typed identity is visited once, including missing and cyclic references.
 * Callers decide whether a missing source is fatal or partial coverage. */
export function collectResourceDependencies(state,entries){
  const collections=['foods','recipes','meals'],result={foods:[],recipes:[],meals:[],missing:[]};
  const indices=new Map(collections.map(collection=>[collection,new Map((state[collection]??[]).map(row=>[row.id,row]))]));
  const seen=new Map(collections.map(collection=>[collection,new Set()]));
  const expanded=new Map(collections.map(collection=>[collection,new Set()]));
  const pending=entries.slice().reverse();
  const visit=(collection,id,skipChildren=false)=>{
    const first=!seen.get(collection).has(id);seen.get(collection).add(id);
    const resource=indices.get(collection).get(id);
    if(!resource){if(first)result.missing.push({collection,id});return;}
    if(first)result[collection].push(resource);
    if(skipChildren||expanded.get(collection).has(id))return;expanded.get(collection).add(id);
    const children=collection==='recipes'?resource.ingredients:collection==='meals'?resource.items:[];
    for(let index=(children?.length??0)-1;index>=0;index--)pending.push(children[index]);
  };
  const references=row=>{
    const reference=resourceReference(row);
    if(reference){const ownItems=reference==='mealId'&&row.mealItems!==undefined||reference==='recipeId'&&row.recipeOverride!==undefined;visit({foodId:'foods',recipeId:'recipes',mealId:'meals'}[reference],row[reference],ownItems);if(ownItems){const items=reference==='mealId'?row.mealItems:row.recipeOverride.ingredients;for(let index=items.length-1;index>=0;index--)pending.push(items[index]);}}
  };
  while(pending.length)references(pending.pop());
  return result;
}

const invalid=message=>{throw Object.assign(Error(message),{status:400});};
const validId=id=>typeof id==='string'&&id.trim()&&id.length<=1000;

/** Child-first order is shared by admission, imports and mass calculations.
 * Iterative traversal evaluates a reused child once and detects back edges.
 * Missing sources may remain unknown for diagnostic measurement views only. */
export function orderRecipeDependencies(state,roots=state.recipes??[],{allowMissing=false}={}){
  const recipes=new Map((state.recipes??[]).map(row=>[row.id,row]));
  for(const root of roots)if(root.id!==undefined)recipes.set(root.id,root);
  const foods=new Set((state.foods??[]).map(row=>row.id)),status=new Map(),ordered=[];
  for(const root of roots){
    const stack=[{recipe:root,exit:false}];
    while(stack.length){
      const {recipe,exit}=stack.pop();
      if(exit){status.set(recipe,2);ordered.push(recipe);continue;}
      if(status.get(recipe)===2)continue;
      if(status.get(recipe)===1)invalid('Recipes cannot contain themselves or form a cycle.');
      status.set(recipe,1);stack.push({recipe,exit:true});
      if(!Array.isArray(recipe.ingredients))invalid('Recipe ingredients must be an array.');
      for(let index=recipe.ingredients.length-1;index>=0;index--){
        const row=recipe.ingredients[index],reference=resourceReference(row);
        if(!['foodId','recipeId'].includes(reference)||!validId(row[reference])||Object.keys(row).some(key=>['foodId','recipeId','mealId'].includes(key)&&key!==reference))invalid('Each recipe ingredient needs exactly one valid food or recipe ID.');
        const child=reference==='recipeId'?recipes.get(row.recipeId):null;
        if(reference==='foodId'? !foods.has(row.foodId):!child){if(!allowMissing)invalid('A recipe ingredient source does not exist.');continue;}
        if(child)stack.push({recipe:child,exit:false});
      }
    }
  }
  return ordered;
}

/** Each containing recipe occurs once, even when several ingredient paths
 * reach the same source. The selected recipe itself is not a containing use. */
export function recipeAncestors(state,reference,id){
  const parents=new Map();
  for(const recipe of state.recipes??[])for(const row of recipe.ingredients??[]){
    const key=resourceReference(row);if(!key)continue;
    const identity=JSON.stringify([key,row[key]]);
    if(!parents.has(identity))parents.set(identity,[]);
    parents.get(identity).push(recipe);
  }
  const found=new Map(),pending=[[reference,id]],seen=new Set();
  while(pending.length){
    const identity=JSON.stringify(pending.pop());if(seen.has(identity))continue;seen.add(identity);
    for(const parent of parents.get(identity)??[]){
      if(reference==='recipeId'&&parent.id===id)continue;
      found.set(parent.id,parent);pending.push(['recipeId',parent.id]);
    }
  }
  return (state.recipes??[]).filter(row=>found.has(row.id));
}
