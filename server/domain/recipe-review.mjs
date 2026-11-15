import {compactFoodSource} from './catalog-source.mjs';
import { parseIngredientLine, convertIngredient } from './recipe-ingredients.mjs';
import { validateIngredientSource } from './recipe-ingredient-source.mjs';
import { validateRdfaSource } from './recipe-rdfa.mjs';
import { validatePlainRecipeSource } from './recipe-plain-text.mjs';
import { validateJsonLdSource } from './recipe-jsonld.mjs';
import { matchIngredient, assessIngredientMatch } from './recipe-matching.mjs';
import { interpretRecipeYield } from './recipe-yield.mjs';
import { recipeNutrition } from './nutrition.mjs';
import { act, normalizeLibraryDraft, readLibraryCatalogIngredient } from './workspace.mjs';
import { parseReferencedQuantity } from './resource-quantity.mjs';
import {foodReviewContext,foodReviewIssues} from './reviewed-foods.mjs';

const invalid = message => { throw Object.assign(new Error(message), {status:400}); };
function object(value,name) { if(!value||typeof value!=='object'||Array.isArray(value))invalid(`${name} must be an object.`);return value; }
function text(value,name,max=10000) { if(typeof value!=='string'||!value.trim()||value.length>max)invalid(`${name} must be nonempty text up to ${max} characters.`);return value; }
function lines(value) { if(!Array.isArray(value)||!value.length||value.length>1000)invalid('A recipe must contain 1 to 1,000 ingredient lines.');return value.map(x=>text(x,'Ingredient line')); }
function servings(value) { if(typeof value!=='number'||!Number.isFinite(value)||value<0.001||value>100000)invalid('Enter a serving count from 0.001 to 100,000.');return value; }
function reference(value) { object(value,'Food selection');if(!['catalog','library'].includes(value.kind))invalid('Choose a catalog or library food.');return {kind:value.kind,id:text(value.id,'Food ID',200)}; }
function boolean(value,name) { if(value!==undefined&&typeof value!=='boolean')invalid(`${name} must be true or false.`);return value===true; }
function sameReference(a,b) { return a?.kind===b?.kind&&a?.id===b?.id; }
function ingredientSource(food,conversion){return parseReferencedQuantity({foods:[food]},{foodId:food.id,...conversion.sourceQuantity},{allowedReferences:['foodId']}).source;}
function foodSummary(food) {
  const source=typeof food.source==='object'?food.source:{name:food.source||'User-provided food'};
  return {id:food.id,name:food.name,serving:food.serving,grams:food.grams,...(food.milliliters!==undefined?{milliliters:food.milliliters}:{}),portions:food.portions||[],readOnly:food.readOnly===true,sample:food.sample===true,
    source:compactFoodSource(source)};
}
/** One application boundary owns matching, conversion and nutrition preview. */
export function evaluateRecipeReview(input,{foodCatalog,foods}, {initial=false}={}) {
  object(input,'Recipe');
  const originals=lines(input.originalIngredients??input.ingredients);
  if(input.jsonldSource!==undefined)validateJsonLdSource(input.jsonldSource,originals,input.ingredientSource);
  const plainTextSource=input.plainTextSource===undefined?null:validatePlainRecipeSource(input.plainTextSource,originals);
  const sourceConfirmed=boolean(input.sourceConfirmed,'Extracted ingredient confirmation');
  const sourceRowsFacts=input.ingredientSource===undefined?null:validateIngredientSource(input.ingredientSource,originals).rows;
  const yieldCount=servings(input.servings);
  const requested=input.rows;
  if(!initial&&(!Array.isArray(requested)||requested.length!==originals.length))invalid('Keep every source ingredient line in the review.');
  const sourceRows=initial?originals.map((original,index)=>({id:String(index),original})):requested;
  const names=new Set(),context=foodReviewContext(foodCatalog,foods),resolvedFoods=new Map(),recipeItems=[];
  const rawYield=interpretRecipeYield(input.recipeYield);
  const yieldConfirmed=boolean(input.yieldConfirmed,'Yield confirmation');
  const yieldReview={...rawYield,confirmed:yieldConfirmed};
  const matchingCache=new Map();
  let knownIngredientCount=0,totalIngredientCount=0;
  const rows=sourceRows.map((requestedRow,index)=>{
    object(requestedRow,'Ingredient review');
    if(requestedRow.id!==String(index)||names.has(requestedRow.id))invalid('Ingredient review IDs must keep their source order.');
    names.add(requestedRow.id);
    const original=text(requestedRow.original,'Ingredient line');
    const sourceIngredient=sourceRowsFacts?.[index].sourceIngredient;
    const parsed=sourceIngredient&&original===originals[index]?sourceRowsFacts[index].parsed:parseIngredientLine(original,String(index));
    if(sourceIngredient&&parsed.isGroupHeader)invalid('A structured ingredient cannot be removed by changing it to a section heading.');
    const excluded=boolean(requestedRow.excluded,'Ingredient exclusion');
    const confirmed=boolean(requestedRow.confirmed,'Ingredient confirmation');
    const override=requestedRow.override===undefined?null:requestedRow.override;
    if(override!==null)object(override,'Quantity correction');
    if(excluded||parsed.isGroupHeader)return {id:String(index),original,parsed,...(sourceIngredient?{sourceIngredient}:{}),excluded,candidates:[],selection:null,selectedFood:null,confirmed:false,override:null,match:{status:'exact',requiresConfirmation:false,reasons:[]},conversion:{status:'resolved',grams:null,amount:null,method:excluded?'excluded':'group-header',portionId:null,reason:{code:excluded?'excluded':'group-header'},options:[],issues:[]},status:excluded?'excluded':'header',issues:[]};
    totalIngredientCount++;
    const matchKey=JSON.stringify({...parsed,id:undefined});
    if(!matchingCache.has(matchKey))matchingCache.set(matchKey,matchIngredient(parsed,{foodCatalog,foods,limit:5,supportsQuantity:parsed.quantity!==null&&!parsed.issues.length?ref=>{
      const food=context.get(ref);return convertIngredient(parsed,food,{original:context.original(food)}).status==='resolved';
    }:undefined}));
    const suggested=matchingCache.get(matchKey);
    let selection;
    if(initial)selection=suggested.selection;
    else selection=requestedRow.selection===null?null:reference(requestedRow.selection);
    const candidates=[...suggested.candidates];
    let selectedFood=null,match={status:'suggested',requiresConfirmation:true,reasons:[{code:'choose-food',values:{}}]};
    let conversion={status:'needs-review',grams:null,amount:null,method:null,portionId:null,reason:{code:'choose-food'},options:[],issues:[]};
    let food=null;
    if(selection){
      selection=reference(selection);food=context.get(selection);selectedFood=foodSummary(food);
      match=assessIngredientMatch(parsed,food);
      conversion=convertIngredient(parsed,food,{original:context.original(food),override});
      if(conversion.status==='resolved'&&(typeof conversion.amount!=='number'||!Number.isFinite(conversion.amount)||conversion.amount<=0))invalid('The ingredient quantity could not be calculated.');
    }
    const needsConfirmation=Boolean(selection&&match.requiresConfirmation&&!confirmed);
    const ready=Boolean(selection&&conversion.status==='resolved'&&!needsConfirmation);
    const status=!selection?'unmatched':conversion.status!=='resolved'?'quantity-needed':needsConfirmation?'needs-review':'ready';
    if(food&&conversion.status==='resolved'){
      knownIngredientCount++;
      resolvedFoods.set(food.id,food);recipeItems.push(ingredientSource(food,conversion));
    }else recipeItems.push({foodId:`unresolved-recipe-line:${index}`,amount:1});
    const issues=foodReviewIssues({parsed,conversion,match});
    if(selection&&!candidates.some(x=>sameReference(x.ref,selection)))candidates.push({ref:selection,name:food.name,serving:food.serving,grams:food.grams,source:selectedFood.source,status:match.status,reasons:match.reasons});
    return {id:String(index),original,parsed,...(sourceIngredient?{sourceIngredient}:{}),candidates:[...candidates],selection,selectedFood,confirmed,override:override?structuredClone(override):null,match,conversion,status,issues};
  });
  const unresolvedCount=rows.filter(row=>!['ready','header','excluded'].includes(row.status)).length;
  const yieldNeedsConfirmation=yieldReview.requiresConfirmation&&!yieldConfirmed;
  const sourceNeedsConfirmation=plainTextSource!==null&&!sourceConfirmed;
  const canSave=totalIngredientCount>0&&unresolvedCount===0&&!yieldNeedsConfirmation&&!sourceNeedsConfirmation;
  let preview=null;
  if(totalIngredientCount){
    const calculationState={foods:[...resolvedFoods.values()]};
    const recipe={servings:yieldCount,ingredients:recipeItems};
    const serving=recipeNutrition(calculationState,recipe),batch=recipeNutrition(calculationState,{...recipe,servings:1});
    preview={attributions:serving.attributions,status:knownIngredientCount<totalIngredientCount?'partial':canSave?'ready':'provisional',perServing:serving.nutrients,totals:batch.nutrients,coverage:serving.coverage,knownIngredientCount,totalIngredientCount,servings:yieldCount};
  }
  return {rows,canSave,unresolvedCount,preview,yieldReview,...(plainTextSource?{sourceReview:{format:plainTextSource.format,requiresConfirmation:true,confirmed:sourceConfirmed}}:{})};
}

export function prepareRecipeReview(draft,context) {
  return {...draft,review:evaluateRecipeReview({...draft,originalIngredients:draft.ingredients},context,{initial:true})};
}

/** Resolve a reviewed import without saving foods or assigning a recipe identity. */
export function prepareReviewedRecipeDraft(state,input,{foodCatalog}) {
  const review=evaluateRecipeReview(input,{foodCatalog,foods:state.foods});
  if(!review.canSave)invalid('Resolve every ingredient match and quantity, confirm the serving yield and any extracted ingredient list before saving.');
  const selectedFoods=new Map(),sources=new Map();
  const ingredients=review.rows.filter(row=>row.status==='ready').map(row=>{
    const selection=row.selection.kind==='catalog'?readLibraryCatalogIngredient(state,{catalogId:row.selection.id},foodCatalog):{food:state.foods.find(x=>x.id===row.selection.id)};
    const {food,catalogSource}=selection;
    selectedFoods.set(food.id,food);if(catalogSource)sources.set(food.id,catalogSource);
    return ingredientSource(food,row.conversion);
  });
  const importReview={version:1,originalIngredients:lines(input.originalIngredients??input.ingredients),recipeYield:input.recipeYield??null,reviewedServings:input.servings,yieldConfirmed:input.yieldConfirmed===true,modifiedAfterImport:false,
    ...(input.ingredientSource===undefined?{}:{ingredientSource:structuredClone(input.ingredientSource)}),
    ...(input.jsonldSource===undefined?{}:{jsonldSource:validateJsonLdSource(input.jsonldSource,input.originalIngredients??input.ingredients,input.ingredientSource)}),
    ...(input.rdfaSource===undefined?{}:{rdfaSource:validateRdfaSource(input.rdfaSource)}),
    ...(input.plainTextSource===undefined?{}:{plainTextSource:validatePlainRecipeSource(input.plainTextSource,input.originalIngredients??input.ingredients),sourceConfirmed:input.sourceConfirmed===true}),
    rows:review.rows.map(row=>({id:row.id,original:row.original,parsed:row.parsed,excluded:row.excluded===true,selection:row.selection,foodName:row.selectedFood?.name||null,source:row.selectedFood?.source||null,confirmed:row.confirmed,override:row.override,match:row.match,conversion:row.conversion,status:row.status}))};
  const existingIds=new Set(state.foods.map(food=>food.id));
  const context={...state,foods:[...state.foods,...[...selectedFoods.values()].filter(food=>!existingIds.has(food.id))]};
  const draft=normalizeLibraryDraft(context,'recipe',{name:text(input.name,'Recipe name',300),servings:input.servings,ingredients,instructions:typeof input.instructions==='string'?input.instructions:'',source:typeof input.source==='string'?input.source:'',importReview});
  return {version:1,draft,foods:structuredClone([...selectedFoods.values()]),catalogSources:[...sources.values()],review};
}

/** Called inside Store.update so imported foods and recipe save share a transaction. */
export function saveReviewedRecipe(state,input,{foodCatalog}) {
  const prepared=prepareReviewedRecipeDraft(state,input,{foodCatalog});
  const saved=act(state,'recipe.save',{...prepared.draft,catalogSources:prepared.catalogSources},{foodCatalog});
  return {recipeId:saved.id,review:prepared.review};
}
