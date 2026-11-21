import {fail,objectKeys} from './workspace-validation.mjs';
const fields=(value,allowed)=>objectKeys(value,allowed,'Named portion');
export function prepareNamedPortions(kind,portions,existing=[]){
 if(!Array.isArray(portions)||portions.length>1000)fail('Use at most 1,000 named portions.');
 const allowed=kind==='food'?['id','label','grams','milliliters']:['id','label','basis','grams','milliliters','portionsPerBatch','quantity'];
 return portions.map(portion=>{fields(portion,allowed);const translations=existing.find(saved=>saved.id===portion.id)?.translations;return {...portion,...(translations?{translations:structuredClone(translations)}:{})};});
}
