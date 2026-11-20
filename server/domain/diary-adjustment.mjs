import {diaryAdjustmentWarningCodes} from './diary-adjustment-guidance.mjs';
import {contentDigest} from './content-digest.mjs';
import {collectResourceDependencies} from './resource-dependencies.mjs';
import {adjustmentSource,adjustmentDraft,adjustmentProjection,adjustmentRevisionFacts} from './diary-adjustment-model.mjs';
import {parseRecipeOverride} from './recipe-entry.mjs';
import {act} from './workspace.mjs';
import {saveIdentity} from './review-save-store.mjs';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const basisFields=kind=>kind==='recipe'?['basis']:[];
function fields(input,required){if(!input||typeof input!=='object'||Array.isArray(input)||required.some(key=>!Object.hasOwn(input,key))||Object.keys(input).some(key=>!required.includes(key)))fail('Supply only the required diary adjustment fields.');}
function selection(state,input,kind){const source=adjustmentSource(state,input,kind);return {entry:source.entry,revision:contentDigest(adjustmentRevisionFacts(state,source))};}
function recipeChange(input){return parseRecipeOverride({version:1,ingredients:input.items,...input.basis});}
function entryChange(input,kind){return kind==='recipe'?{recipeOverride:recipeChange(input)}:{mealItems:input.items,amount:1};}
export function readDiaryAdjustment(state,input,kind='meal'){
 fields(input,['date','id']);const {entry,revision}=selection(state,input,kind);
 return {...adjustmentDraft(state,entry,kind),revision};
}
function evaluate(state,input,scope,kind){
 fields(input,['date','id','revision','items',...basisFields(kind)]);const {entry,revision}=selection(state,input,kind);
 if(input.revision!==revision)fail('The diary entry or its sources changed. Reopen the adjustment and review it again.',409);
 const {items,basis,afterEntry,before,after}=adjustmentProjection(state,entry,input,kind),dependencies=collectResourceDependencies(state,[afterEntry]);
 return {id:entry.id,date:entry.date,revision,items,...(basis?{basis}:{}),scope,reviewToken:contentDigest({scope,revision,items,...(basis?{basis}:{}),dependencies}),before,after,warnings:[...diaryAdjustmentWarningCodes[kind]]};
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
