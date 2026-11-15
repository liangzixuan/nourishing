import {diaryAdjustmentWarningCodes} from './diary-adjustment-guidance.mjs';
import {contentDigest} from './content-digest.mjs';
import {collectResourceDependencies} from './resource-dependencies.mjs';
import {expandResourceQuantity} from './resource-expansion.mjs';
import {parseCompositeItems} from './resource-quantity.mjs';
import {recipeForEntry,recipeOverrideFrom,parseRecipeOverride} from './recipe-entry.mjs';
import {assertDiaryDaysEditable} from './diary-day-status.mjs';
import {calculateSummary} from './nutrition.mjs';
import {act,date as parseDate} from './workspace.mjs';
import {saveIdentity} from './review-save-store.mjs';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const basisFields=kind=>kind==='recipe'?['basis']:[];
function fields(input,required){if(!input||typeof input!=='object'||Array.isArray(input)||required.some(key=>!Object.hasOwn(input,key))||Object.keys(input).some(key=>!required.includes(key)))fail('Supply only the required diary adjustment fields.');}
function selection(state,input,kind){
 if(!['meal','recipe'].includes(kind))fail('Choose a recipe or meal adjustment.');
 parseDate(input.date);if(typeof input.id!=='string'||!input.id.trim()||input.id.length>100)fail('Choose a diary entry ID.');
 const matches=state.entries.filter(row=>row.id===input.id);if(matches.length!==1||matches[0].date!==input.date)fail('This diary entry changed or no longer exists. Reload the diary.',409);
 const entry=matches[0];if(entry.kind!=='food'||!entry[kind+'Id'])fail(`Choose a custom ${kind} diary entry.`);
 assertDiaryDaysEditable(state,[entry.date]);
 const dependencies=collectResourceDependencies(state,[entry]);if(dependencies.missing.length)fail('An ingredient is unavailable. Restore its source before adjusting this entry.',409);
 return {entry,revision:contentDigest({entry,dependencies})};
}
function recipeBasis(recipe){const {version,ingredients,...basis}=recipeOverrideFrom(recipe);return basis;}
function recipeChange(input){fields(input.basis,['servings','cookedWeightGrams','batchVolumeMl','portions']);return parseRecipeOverride({version:1,ingredients:input.items,...input.basis});}
function entryChange(input,kind){return kind==='recipe'?{recipeOverride:recipeChange(input)}:{mealItems:input.items,amount:1};}
export function readDiaryAdjustment(state,input,kind='meal'){
 fields(input,['date','id']);const {entry,revision}=selection(state,input,kind),resource=state[kind==='recipe'?'recipes':'meals'].find(row=>row.id===entry[kind+'Id']);
 const recipe=kind==='recipe'?recipeForEntry(resource,entry):null,items=recipe?recipe.ingredients:expandResourceQuantity(state,entry,{target:'children'}).map(row=>row.source);
 if(!items.length)fail('This entry has no ingredients to adjust.');
 return {id:entry.id,date:entry.date,name:resource.name,revision,items,foods:state.foods,recipes:state.recipes,...(recipe?{basis:recipeBasis(recipe),recipeId:resource.id,quantity:Object.fromEntries(['amount','quantity','unit','portionId'].filter(key=>entry[key]!==undefined).map(key=>[key,entry[key]]))}:{})};
}
function evaluate(state,input,scope,kind){
 fields(input,['date','id','revision','items',...basisFields(kind)]);const {entry,revision}=selection(state,input,kind);
 if(input.revision!==revision)fail('The diary entry or its sources changed. Reopen the adjustment and review it again.',409);
 const items=parseCompositeItems(state,input.items),basis=kind==='recipe'?recipeBasis(recipeChange({...input,items})):null,change={...input,items,...(basis?{basis}:{})},afterState={...state,entries:[...state.entries]};
 act(afterState,'entry.update',{id:entry.id,...entryChange(change,kind)});
 const afterEntry=afterState.entries.find(row=>row.id===entry.id),dependencies=collectResourceDependencies(afterState,[afterEntry]);
 const project=entries=>{const result=calculateSummary({...state,entries,biometrics:[],notes:[]},entry.date);return {values:result.totals,coverage:result.nutrientCoverage,attributions:result.attributions};};
 return {id:entry.id,date:entry.date,revision,items,...(basis?{basis}:{}),scope,reviewToken:contentDigest({scope,revision,items,...(basis?{basis}:{}),dependencies}),before:project([entry]),after:project([afterEntry]),warnings:[...diaryAdjustmentWarningCodes[kind]]};
}
export function previewDiaryAdjustment(state,input,reviewSaves,kind='meal'){return evaluate(state,input,reviewSaves.saveScope(),kind);}
export function saveDiaryAdjustment(store,input,reviewSaves,kind='meal'){
 fields(input,['date','id','revision','items',...basisFields(kind),'confirmed','save']);if(input.confirmed!==true)fail('Confirm the reviewed ingredient changes.');
 const save=saveIdentity(input.save),digest=contentDigest(input),operation=`diary-${kind}-adjustment`;let receipt,replayed=false;
 const state=store.update(state=>{
  receipt=reviewSaves.savedReceipt(operation,save,digest);if(receipt){replayed=true;return;}
  const review=evaluate(state,{date:input.date,id:input.id,revision:input.revision,items:input.items,...(kind==='recipe'?{basis:input.basis}:{})},reviewSaves.saveScope(),kind);
  if(review.reviewToken!==save.reviewToken)fail('The reviewed ingredients changed. Preview them again.',409);
  const recoverySnapshotId=store.retainSnapshot(state);act(state,'entry.update',{id:input.id,...entryChange(review,kind)});
  receipt={operationId:save.operationId,scope:save.scope,entryId:input.id,recoverySnapshotId};reviewSaves.recordSave(operation,save,digest,receipt);
 });
 return {state,receipt,replayed};
}
