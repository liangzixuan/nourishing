import {digest} from './data-codec.mjs';
import {previewLibraryRetirement} from './domain/library-retirement.mjs';

export const libraryToolCommandFields={
 'library.retirement':['kind','id','retired','fingerprint','confirmed'],
};
const fail=message=>{throw Object.assign(Error(message),{status:400});};
function fields(value,allowed){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key)))fail('Choose the supported library fields only.');}

export function libraryToolsView(state,input){
 fields(input,['kind','id']);
 return {revision:digest(state),review:previewLibraryRetirement(state,input)};
}
export function prepareNamedPortions(kind,portions,existing=[]){
 if(!Array.isArray(portions)||portions.length>1000)fail('Use at most 1,000 named portions.');
 const allowed=kind==='food'?['id','label','grams','milliliters']:['id','label','basis','grams','milliliters','portionsPerBatch','quantity'];
 return portions.map(portion=>{fields(portion,allowed);const translations=existing.find(saved=>saved.id===portion.id)?.translations;return {...portion,...(translations?{translations:structuredClone(translations)}:{})};});
}
