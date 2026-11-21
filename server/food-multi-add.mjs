import {parseReferencedQuantity,parseCompositeItems} from './domain/resource-quantity.mjs';
import {collectResourceDependencies} from './domain/resource-dependencies.mjs';
import {expandResourceQuantity} from './domain/resource-expansion.mjs';
import {parseFoodDiaryFields} from './domain/diary-record-fields.mjs';
import {assertDiaryDaysEditable} from './domain/diary-day-status.mjs';
import {isActiveLibraryItem} from './domain/library-status.mjs';
import {recipeNutrition} from './domain/nutrition.mjs';
import {contentDigest} from './domain/content-digest.mjs';
import {digest} from './data-codec.mjs';
import {act,catalogFoodForWorkspace,addCatalogFood,text} from './domain/workspace.mjs';

const fail=(message,status=400)=>{throw Object.assign(Error(message),{status,code:status,publicMessage:message});};
const fields=(input,required,optional=[])=>{
 if(!input||typeof input!=='object'||Array.isArray(input)||required.some(key=>!Object.hasOwn(input,key))||Object.keys(input).some(key=>![...required,...optional].includes(key)))fail('Supply the selected items and their supported fields only.');
};
const references={foods:'foodId',recipes:'recipeId',meals:'mealId'};
function destination(input){
 if(input?.kind==='diary'){fields(input,['kind']);return {kind:'diary'};}
 fields(input,['kind','name','servings']);if(input.kind!=='recipe')fail('Choose Add to Diary or Create Recipe.');
 if(typeof input.servings!=='number'||!Number.isFinite(input.servings)||input.servings<0.001||input.servings>100000)fail('Enter a recipe yield from 0.001 to 100,000 servings.');
 return {kind:'recipe',name:text(input.name,'Recipe name',300),servings:input.servings};
}

/** Review explicit selections. Recognition matching and quantity inference do
 * not apply here: source units and IDs are resolved by the diary's parser. */
function evaluate(state,input,{catalogFoods=new Map(),owner}){
 validateFoodMultiInput(input);if(typeof owner!=='string'||!owner)fail('Sign in to review selected foods.',401);const target=destination(input.destination);
 const candidate=structuredClone(state),entries=[];
 const rows=input.rows.map(row=>{
  const id=row.id.trim();let {kind,id:itemId}=row.selection;
  if(kind==='catalog'){
   const installed=catalogFoods.get(itemId);if(!installed)fail('A selected catalog food is no longer available.',409);
   const food=catalogFoodForWorkspace(candidate.foods,installed);addCatalogFood(candidate,food);kind='foods';itemId=food.id;
  }

  const {date,group,time,...quantity}=row.entry,diary=parseFoodDiaryFields({date,group,time},state.settings.groups);
  const parsed=parseReferencedQuantity(candidate,{...quantity,[references[kind]]:itemId});
  if(!isActiveLibraryItem(parsed.resource))fail('A selected item was retired. Choose an active item.',409);
  const entry={...diary,...parsed.source};entries.push(entry);
  return {id,selection:{...row.selection},name:parsed.resource.name,entry,serving:parsed.resource.serving??null};
 });
 if(target.kind==='diary')assertDiaryDaysEditable(state,entries.map(row=>row.date));
 const dependencies=collectResourceDependencies(candidate,entries);if(dependencies.missing.length)fail('A selected item has a missing ingredient. Restore its source before saving.',409);
 const ingredients=entries.flatMap(row=>expandResourceQuantity(candidate,row,{target:'items'}).map(item=>item.source));
 // The reusable-item format owns its ingredient limit and quantity validation.
 if(target.kind==='recipe')parseCompositeItems(candidate,ingredients);
 const nutrition=recipeNutrition(candidate,{servings:1,ingredients}),perServing=target.kind==='recipe'?recipeNutrition(candidate,{servings:target.servings,ingredients}):null;
 const alwaysExpandMeals=state.settings.alwaysExpandMeals===true;
 const reviewToken=contentDigest({owner,destination:target,rows,dependencies,...(target.kind==='diary'?{alwaysExpandMeals}:{})});
 return {candidate,review:{version:1,revision:digest(state),destination:target,rows,entries,items:ingredients,canSave:true,reviewToken,totals:nutrition.nutrients,coverage:nutrition.coverage,attributions:nutrition.attributions,perServing:perServing?{totals:perServing.nutrients,coverage:perServing.coverage}:null}};
}

/** Validate reference shape before reading any remote catalog facts. */
function parseFoodMultiInput(input,{saving=false}={}){
 fields(input,saving?['destination','rows','confirmed','reviewToken']:['destination','rows']);destination(input.destination);
 if(!Array.isArray(input.rows)||!input.rows.length)fail('Select at least one item.');
 if(saving&&(input.confirmed!==true||typeof input.reviewToken!=='string'||!/^[a-f0-9]{64}$/.test(input.reviewToken)))fail('Review and confirm the selected items.');
 const ids=new Set();
 for(const row of input.rows){
  fields(row,['id','selection','entry']);const id=text(row.id,'Selection row ID',100);if(ids.has(id))fail('Each selected row needs its own ID.');ids.add(id);
  fields(row.selection,['kind','id']);if(!['catalog','foods','recipes','meals'].includes(row.selection.kind)||typeof row.selection.id!=='string'||!row.selection.id.trim()||row.selection.id.length>1000)fail('Choose a catalog food or saved food, recipe or meal.');
  fields(row.entry,['date','group','time'],['amount','quantity','unit','portionId']);
  if(Object.hasOwn(row.entry,'amount')===Object.hasOwn(row.entry,'quantity'))fail('Choose either a serving amount or a measured quantity.');
 }
 return input;
}
export function validateFoodMultiInput(input,options){try{return parseFoodMultiInput(input,options);}catch(error){if(error.status===400)throw Object.assign(error,{code:400,publicMessage:error.message});throw error;}}
export function foodMultiCatalogReferences(input){return input.rows.filter(row=>row.selection.kind==='catalog').map(row=>row.selection.id);}
function writeReviewedSelection(candidate,review){
 if(review.destination.kind==='diary'){
  const start=candidate.entries.length;
  for(const entry of review.entries)act(candidate,'entry.add',entry);
  return {entries:candidate.entries.slice(start)};
 }
 const resource=act(candidate,'recipe.save',{name:review.destination.name,servings:review.destination.servings,ingredients:review.items});
 return {recipes:[candidate.recipes.find(row=>row.id===resource.id)]};
}

export function previewFoodMultiAdd(state,input,context){
 const {candidate,review}=evaluate(state,input,context);
 const records=writeReviewedSelection(candidate,review);
 const foods=candidate.foods.slice(state.foods.length);
 return {...review,projection:{...records,...(foods.length?{foods}:{})}};
}

export function applyFoodMultiAdd(state,input,context){
 validateFoodMultiInput(input,{saving:true});
 const {candidate,review}=evaluate(state,{destination:input.destination,rows:input.rows},context);
 if(review.reviewToken!==input.reviewToken)fail('Selected items changed. Review them again.',409);
 const records=writeReviewedSelection(candidate,review);
 const foods=candidate.foods.slice(state.foods.length);
 if(foods.length)records.foods=foods;
 Object.assign(state,candidate);
 return records.entries?{entryIds:records.entries.map(row=>row.id),records}:{kind:'recipe',id:records.recipes[0].id,records};
}
