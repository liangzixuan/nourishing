import {normalizeLibraryDraft,captureCatalogFood} from './domain/workspace.mjs';
import {parseCompositeSources} from './domain/composite-source.mjs';
import {prepareFoodEditorDraft} from './food-editor.mjs';
import {parseRecipePortions} from './domain/recipe-portion-schema.mjs';
import {invalid} from './request-errors.mjs';

export const libraryDraftFields={
 food:['id','name','serving','grams','milliliters','barcode','nutrients','notes','portions','nutrientEdits'],
 recipe:['id','name','servings','ingredients','instructions','source','importReview','cookedWeightGrams','batchVolumeMl','serving','servingBasis','portions','servingTranslations','categoryId','tags'],
 meal:['id','name','items']
};
export function validateLibraryDraft(kind,draft,{editing=false}={}){
 const allowed=Object.hasOwn(libraryDraftFields,kind)?libraryDraftFields[kind]:null;
 if(!allowed||!draft||typeof draft!=='object'||Array.isArray(draft)||Object.keys(draft).some(key=>!allowed.includes(key)))invalid('Choose supported library editor fields only.');
 if(Object.hasOwn(draft,'id')&&(!editing||typeof draft.id!=='string'||!draft.id.trim()||draft.id.length>1000))invalid(editing?'Choose a library item.':'Review an existing item before saving changes.');
 const rows=kind==='recipe'?draft.ingredients:kind==='meal'?draft.items:undefined;
 if(rows!==undefined)try{parseCompositeSources(rows);}catch(error){throw Object.assign(error,{code:400,publicMessage:error.message});}
 return {type:kind+'.save',payload:draft};
}
export function libraryDraftRows(kind,draft){return kind==='recipe'?(draft.ingredients??[]):kind==='meal'?(draft.items??[]):[];}
/** Normalize at one boundary; server-owned source metadata is merged only from the saved item. */
export function prepareLibraryDraft(state,kind,draft){
 if(kind==='food')return prepareFoodEditorDraft(state,draft);
 const saved=draft.id?state[kind+'s'].find(row=>row.id===draft.id):null;
 if(draft.id&&!saved)invalid('This library item no longer exists.');
 const merged={...saved,...draft};
 if(draft.categoryId===null)delete merged.categoryId;
 if(Object.hasOwn(draft,'portions')){
  const portions=Array.isArray(draft.portions)?draft.portions.map(portion=>{
   if(!portion||typeof portion!=='object'||Array.isArray(portion))return portion;
   const prior=saved?.portions?.find(row=>row.id===portion.id);
   return {...portion,...(!Object.hasOwn(portion,'translations')&&prior?.translations?{translations:structuredClone(prior.translations)}:{})};
  }):draft.portions;
  merged.portions=parseRecipePortions(portions);
 }
 return normalizeLibraryDraft(state,kind,merged);
}
/** A detached candidate owns catalog snapshots until the surrounding transaction commits. */
export function captureLibraryDraft(state,kind,input,catalogFoods=new Map()){
 const context=structuredClone(state),draft=structuredClone(input);
 for(const row of libraryDraftRows(kind,draft)){const food=catalogFoods.get(row.foodId);if(food)row.foodId=captureCatalogFood(context,food).id;}
 return {context,draft:prepareLibraryDraft(context,kind,draft)};
}
