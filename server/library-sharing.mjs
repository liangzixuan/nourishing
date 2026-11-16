import {act,exportSharedItem} from './domain/workspace.mjs';
import {digest} from './data-codec.mjs';
import {createFoodPrintCapture} from './domain/food-print.mjs';
export const librarySharingCommandFields={'share.import':['kind','item','foods','recipes','notice']};
const fail=message=>{throw Object.assign(Error(message),{status:400,code:400,publicMessage:message});};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
export function validateSharedImport(input){if(!object(input)||Object.keys(input).some(key=>!librarySharingCommandFields['share.import'].includes(key))||!['food','recipe','meal'].includes(input.kind)||!object(input.item)||input.foods!==undefined&&!Array.isArray(input.foods)||input.recipes!==undefined&&!Array.isArray(input.recipes)||input.notice!==undefined&&typeof input.notice!=='string')fail('Choose a shared food, recipe or meal JSON file.');return input;}
export function exportLibraryItem(state,input){return exportSharedItem(state,input);}
export function applySharedImport(state,input){
 validateSharedImport(input);const before=Object.fromEntries(['foods','recipes','meals'].map(key=>[key,state[key].length]));
 act(state,'share.import',input);
 const collection=input.kind+'s',item=state[collection].length>before[collection]?state[collection].at(-1):state[collection].find(row=>row.id===input.item.id);
 return {kind:input.kind,id:item.id,counts:Object.fromEntries(Object.keys(before).map(key=>[key,state[key].length-before[key]]))};
}
export function previewSharedImport(state,input){const candidate=structuredClone(state),result=applySharedImport(candidate,input);return {revision:digest(state),kind:result.kind,name:candidate[result.kind+'s'].find(row=>row.id===result.id).name,counts:result.counts};}
export function previewFoodPrint(state,input,{now=new Date()}={}){return {capture:createFoodPrintCapture(state,input,now),energyUnit:state.settings.energyUnit??'kcal',language:state.settings.appLanguage??'en'};}
