import {digest} from './data-codec.mjs';
import {inspectLibraryUses} from './domain/library-references.mjs';
import {previewLibraryRetirement} from './domain/library-retirement.mjs';

export const libraryToolCommandFields={
 'library.portions':['kind','id','portions'],
 'library.retirement':['kind','id','retired','fingerprint','confirmed'],
};
const fail=message=>{throw Object.assign(Error(message),{status:400});};
function fields(value,allowed){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key)))fail('Choose the supported library fields only.');}

export function libraryToolsView(state,input){
 fields(input,['kind','id']);const {item}=inspectLibraryUses(state,input);
 return {revision:digest(state),review:previewLibraryRetirement(state,input),portions:structuredClone(item.portions??[])};
}
export function prepareNamedPortions(kind,portions,existing=[]){
 if(!Array.isArray(portions)||portions.length>1000)fail('Use at most 1,000 named portions.');
 const allowed=kind==='food'?['id','label','grams','milliliters']:['id','label','basis','grams','milliliters','portionsPerBatch','quantity'];
 return portions.map(portion=>{fields(portion,allowed);const translations=existing.find(saved=>saved.id===portion.id)?.translations;return {...portion,...(translations?{translations:structuredClone(translations)}:{})};});
}

/** Server-owned source, translations, nutrients and other metadata never come from this editor. */
export function prepareLibraryToolCommand(state,action){
 if(!Object.hasOwn(libraryToolCommandFields,action.type))return action;
 fields(action.payload,libraryToolCommandFields[action.type]);
 if(action.type==='library.retirement')return action;
 const {kind,id,portions}=action.payload;
 if(!['food','recipe'].includes(kind))fail('Named portions belong to a food or recipe.');
 const {item}=inspectLibraryUses(state,{kind,id});
 const next=prepareNamedPortions(kind,portions,item.portions??[]);
 return {type:kind+'.save',payload:{...item,portions:next}};
}
