import {act,catalogFoodForWorkspace} from './domain/workspace.mjs';
import {withoutLibraryStatus} from './domain/library-status.mjs';
import {contentDigest} from './domain/content-digest.mjs';
import {catalog} from './domain/nutrition.mjs';
import {digest} from './data-codec.mjs';
const editable=['name','serving','grams','milliliters','barcode','notes','nutrients'];
const fail=(message,code=400)=>{throw Object.assign(Error(message),{status:code,code,publicMessage:message});};
function exact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))fail('Check the food copy fields.');}
export function validateFoodCopySelection(selection){exact(selection,['kind','id']);if(!['catalog','library'].includes(selection.kind)||typeof selection.id!=='string'||!selection.id.trim()||selection.id.length>1000)fail('Choose the food to copy.');return selection;}
export function validateFoodCopy(input){exact(input,['selection','sourceFingerprint','changes']);validateFoodCopySelection(input.selection);if(typeof input.sourceFingerprint!=='string'||!/^[a-f0-9]{64}$/.test(input.sourceFingerprint))fail('Open the food copy again.');exact(input.changes,editable);}
function resolve(state,selection,{owner,catalogFoods=new Map()}){
 validateFoodCopySelection(selection);if(typeof owner!=='string'||!owner)fail('Please sign in.',401);
 const food=selection.kind==='catalog'?catalogFoods.get(selection.id):state.foods.find(row=>row.id===selection.id);
 if(!food)fail('The original food is no longer available.',409);
 const original=selection.kind==='catalog'?catalogFoodForWorkspace([],food):food;
 return {original,sourceFingerprint:contentDigest({owner,selection,original})};
}
export function foodCopyView(state,selection,context){
 const {original,sourceFingerprint}=resolve(state,selection,context);
 const draft=Object.fromEntries(editable.filter(key=>Object.hasOwn(original,key)).map(key=>[key,structuredClone(original[key])]));
 draft.name=original.name+' (copy)';draft.grams=original.grams??null;draft.milliliters=original.milliliters??null;
 return {selection,sourceFingerprint,revision:digest(state),draft,nutrients:catalog.map(({id,name,unit})=>({id,name,unit}))};
}
export function applyFoodCopy(state,input,context){
 validateFoodCopy(input);const {original,sourceFingerprint}=resolve(state,input.selection,context);
 if(sourceFingerprint!==input.sourceFingerprint)fail('The original food changed. Open a new copy.',409);
 const candidate=structuredClone(state),draft={...withoutLibraryStatus(original),grams:original.grams??null,...structuredClone(input.changes)};
 delete draft.id;delete draft.readOnly;delete draft.sample;
 const saved=act(candidate,'food.save',draft);Object.assign(state,candidate);return saved;
}
