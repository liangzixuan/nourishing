import {readDiaryAdjustment,previewDiaryAdjustment} from './domain/diary-adjustment.mjs';
import {parseCompositeSources} from './domain/composite-source.mjs';
import {parseRecipeOverride} from './domain/recipe-entry.mjs';
import {digest} from './data-codec.mjs';

const fail=message=>{throw Object.assign(Error(message),{status:400,code:400,publicMessage:message});};
const exact=(input,fields)=>{if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!fields.includes(key)))fail('Invalid ingredient adjustment fields.');};
export const entryAdjustmentFields={'entry.ingredients.adjust':['kind','date','id','sourceRevision','items','basis']};
export function validateEntryAdjustmentAction({type,payload}){
 if(type!=='entry.ingredients.adjust')fail('Choose an ingredient adjustment.');
 exact(payload,entryAdjustmentFields[type]);if(!['recipe','meal'].includes(payload.kind))fail('Choose a recipe or meal.');
 if(typeof payload.sourceRevision!=='string'||!/^[a-f0-9]{64}$/.test(payload.sourceRevision))fail('Reopen the ingredients.');
 try{parseCompositeSources(payload.items);
 if(payload.kind==='recipe'){exact(payload.basis,['servings','cookedWeightGrams','batchVolumeMl','portions']);parseRecipeOverride({version:1,ingredients:payload.items,...payload.basis});}
 else if(Object.hasOwn(payload,'basis'))fail('Meals do not have a recipe yield.');
 }catch(error){if(error.status===400)throw Object.assign(error,{code:400,publicMessage:error.message});throw error;}
}
export function entryAdjustmentView(state,input){
 exact(input,['kind','date','id']);if(!['recipe','meal'].includes(input.kind))fail('Choose a recipe or meal.');const result=readDiaryAdjustment(state,{date:input.date,id:input.id},input.kind);
 const {foods,recipes,revision,...view}=result;
 const rows=result.items.map(item=>{const kind=item.recipeId?'recipe':'food',id=item[kind+'Id'],resource=state[kind+'s'].find(row=>row.id===id);return {kind,id,name:resource.name,portions:(resource.portions??[]).map(({id,label})=>({id,label}))};});
 return {...view,kind:input.kind,sourceRevision:revision,revision:digest(state),rows};
}
export function previewEntryAdjustment(state,payload){
 validateEntryAdjustmentAction({type:'entry.ingredients.adjust',payload});
 const {kind,sourceRevision,...draft}=payload;
 const review=previewDiaryAdjustment(state,{...draft,revision:sourceRevision},{saveScope:()=> 'cloud-workspace-command'},kind);
 return {before:review.before,after:review.after,items:review.items,...(kind==='recipe'?{basis:review.basis}:{})};
}
export function prepareEntryAdjustmentCommand(state,action){
 validateEntryAdjustmentAction(action);const {kind,id}=action.payload,review=previewEntryAdjustment(state,action.payload);
 return {type:'entry.update',payload:{id,...(kind==='recipe'?{recipeOverride:{version:1,ingredients:review.items,...review.basis}}:{mealItems:review.items,amount:1})}};
}
