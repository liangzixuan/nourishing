import {digest} from './data-codec.mjs';
import {act,catalogFoodForWorkspace,addCatalogFood} from './domain/workspace.mjs';
import {validateFoodMultiInput,evaluateFoodMultiReview,prepareFoodMultiReview} from './domain/food-multi-review.mjs';
export {validateFoodMultiInput,foodMultiCatalogReferences} from './domain/food-multi-review.mjs';

function reviewContext(state,{owner,catalogFoods=new Map()}){
 return {owner,revision:digest(state),resolveCatalog(candidate,id){
  const installed=catalogFoods.get(id);
  if(!installed){const message='A selected catalog food is no longer available.';throw Object.assign(Error(message),{status:409,code:409,publicMessage:message});}
  const food=catalogFoodForWorkspace(candidate.foods,installed);addCatalogFood(candidate,food);return food.id;
 }};
}
export function previewFoodMultiAdd(state,input,context){
 return prepareFoodMultiReview(state,input,reviewContext(state,context));
}

function writeReviewedSelection(candidate,review){
 if(review.destination.kind==='diary'){
  const start=candidate.entries.length;
  for(const entry of review.entries)act(candidate,'entry.add',entry);
  return {entries:candidate.entries.slice(start)};
 }
 const resource=act(candidate,'recipe.save',{name:review.destination.name,servings:review.destination.servings,ingredients:review.items});
 return {recipes:[candidate.recipes.find(row=>row.id===resource.id)]};
}

export function applyFoodMultiAdd(state,input,context){
 validateFoodMultiInput(input,{saving:true});
 const {candidate,review}=evaluateFoodMultiReview(state,{destination:input.destination,rows:input.rows},{...reviewContext(state,context),expectedToken:input.reviewToken});
 const writable=structuredClone(candidate),records=writeReviewedSelection(writable,review);
 const foods=candidate.foods.slice(state.foods.length);
 if(foods.length)records.foods=foods;
 Object.assign(state,writable);
 return records.entries?{entryIds:records.entries.map(row=>row.id),records}:{kind:'recipe',id:records.recipes[0].id,records};
}
