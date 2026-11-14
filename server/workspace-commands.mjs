import {act,captureCatalogFood,previewLibraryDraft} from './domain/workspace.mjs';
import {parseCompositeSources} from './domain/composite-source.mjs';
export const invalid=message=>{throw Object.assign(Error(message),{code:400,publicMessage:message});};
const fields={
 'entry.add':['foodId','recipeId','mealId','date','time','group','amount','quantity','unit','portionId'],
 'entry.update':['id','date','time','group','amount','quantity','unit','portionId'],
 'entry.delete':['id'],
 'day.complete':['date','completed'],
 'note.add':['date','time','group','text'],
 'note.delete':['id'],
 'food.save':['id','name','serving','grams','milliliters','barcode','nutrients','notes'],
 'recipe.save':['id','name','servings','ingredients','instructions','cookedWeightGrams','batchVolumeMl'],
 'meal.save':['id','name','items'],
 'food.delete':['id'],'recipe.delete':['id'],'meal.delete':['id']
};
export function validateAction(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['type','payload'].includes(k)))invalid('Invalid diary action.');
 const allowed=Object.hasOwn(fields,input.type)?fields[input.type]:null,p=input.payload;
 if(!allowed||!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!allowed.includes(k)))invalid('Invalid diary fields.');
 if(p.id!==undefined&&(typeof p.id!=='string'||!p.id||p.id.length>1000))invalid('Choose a record.');
 if(input.type.endsWith('.delete')&&!p.id)invalid('Choose a record.');
 if(['recipe.save','meal.save'].includes(input.type)){
  const items=p[input.type==='recipe.save'?'ingredients':'items'];
  if(items!==undefined)try{parseCompositeSources(items);}catch(error){throw Object.assign(error,{code:400,publicMessage:error.message});}
 }
 if(input.type==='entry.add'&&['foodId','recipeId','mealId'].filter(k=>typeof p[k]==='string'&&p[k].length>0).length!==1)invalid('Choose a food.');
 if(['entry.update','entry.delete','note.delete'].includes(input.type)&&(typeof p.id!=='string'||!p.id||p.id.length>1000))invalid('Choose a record.');
 return input;
}
export function parseCommand(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['requestId','revision','type','payload'].includes(k)))invalid('Invalid diary action.');
 if(typeof input.requestId!=='string'||typeof input.revision!=='string'||!/^[a-zA-Z0-9-]{16,64}$/.test(input.requestId)||!/^[a-f0-9]{64}$/.test(input.revision))invalid('Refresh the diary and try again.');
 validateAction({type:input.type,payload:input.payload});return input;
}
export function applyWorkspaceCommand(state,input){
 validateAction(input);
 try{return act(state,input.type,libraryPayload(state,input));}catch(error){if([400,404,409].includes(error.status))throw Object.assign(error,{code:error.status,publicMessage:error.message});throw error;}
}
function libraryPayload(state,{type,payload}){
 if(!['food.save','recipe.save','meal.save'].includes(type)||!payload.id)return payload;
 const item=state[type.split('.')[0]+'s'].find(row=>row.id===payload.id);
 if(!item)invalid('This library item no longer exists.');
 return {...item,...payload};
}
export function catalogReferences({type,payload}){
 const rows=type==='entry.add'?[payload]:type==='recipe.save'?(payload.ingredients??[]):type==='meal.save'?(payload.items??[]):[];
 return [...new Set(rows.map(row=>row.foodId).filter(id=>typeof id==='string'))];
}
export async function readActionFoods(input,readCatalog){
 const ids=catalogReferences(input),foods=new Map();
 for(let i=0;i<ids.length;i+=4){for(const [id,food] of await Promise.all(ids.slice(i,i+4).map(async id=>[id,await readCatalog(id)])))foods.set(id,food);}
 return foods;
}
export function captureActionFoods(state,input,foods){
 const action=structuredClone(input),replacements=new Map();
 for(const id of catalogReferences(action)){const food=foods.get(id);if(food)replacements.set(id,captureCatalogFood(state,food).id);}
 const rows=action.type==='entry.add'?[action.payload]:action.type==='recipe.save'?(action.payload.ingredients??[]):action.type==='meal.save'?(action.payload.items??[]):[];
 for(const row of rows)if(replacements.has(row.foodId))row.foodId=replacements.get(row.foodId);
 return action;
}
export function validateLibraryPreview(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['kind','draft','date'].includes(key))||!['food','recipe','meal'].includes(input.kind))invalid('Choose a library item.');
 return validateAction({type:input.kind+'.save',payload:input.draft});
}
export function previewLibrary(state,input){
 const action=validateLibraryPreview(input);
 try{return previewLibraryDraft(state,{...input,draft:libraryPayload(state,action)});}catch(error){if([400,404,409].includes(error.status))throw Object.assign(error,{code:error.status,publicMessage:error.message});throw error;}
}
