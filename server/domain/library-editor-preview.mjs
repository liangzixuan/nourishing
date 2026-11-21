import {prepareLibraryDraft,validateLibraryDraft} from './library-editor-draft.mjs';
import {parseReferencedQuantity} from './resource-quantity.mjs';
import {calculateSelectionNutrition} from './nutrition.mjs';
import {recipePreview} from './library-item-view.mjs';
import {foodEditorLabelView} from '../food-editor.mjs';
import {objectKeys,fail} from './workspace-validation.mjs';
import {date as parseDate} from './calendar.mjs';
export function validateLibraryPreview(input){
 objectKeys(input,['kind','draft','date','quantity','labelView'],'Library preview');
 if(!['food','recipe','meal'].includes(input.kind)||input.labelView!==undefined&&(input.kind!=='food'||!input.labelView||typeof input.labelView!=='object'||Array.isArray(input.labelView)))fail('Choose a library item and label view.');
 return validateLibraryDraft(input.kind,input.draft,{editing:true});
}
export function previewLibraryResource(state,kind,resource,day,quantity={amount:1}){
 const date=parseDate(day);objectKeys(quantity,['amount','quantity','unit','portionId'],'Library preview quantity');
 const id=crypto.randomUUID(),collection=kind+'s',candidate={...state,[collection]:[...state[collection],{...resource,id}]};
 const item={...parseReferencedQuantity(candidate,{...quantity,[kind+'Id']:id}).source,id:crypto.randomUUID(),date};
 candidate.entries=[...state.entries,item];
 return {version:1,resource,nutrition:calculateSelectionNutrition(candidate,date,[item.id])};
}
export function previewLibraryEditor(state,input,resource){
 validateLibraryPreview(input);
 const result=previewLibraryResource(state,input.kind,resource??prepareLibraryDraft(state,input.kind,input.draft),input.date,input.quantity);
 return {...result,...(input.kind==='recipe'?{recipe:recipePreview(state,result.resource,input.quantity)}:{}),...(input.labelView?{labelView:foodEditorLabelView(result.resource,input.labelView)}:{})};
}
