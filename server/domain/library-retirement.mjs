import {inspectLibraryUses} from './library-references.mjs';
const invalid=(message,status=400)=>{throw Object.assign(Error(message),{status});};
function inputFields(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))invalid('Supply the reviewed library retirement fields.');}
export function previewLibraryRetirement(state,input){inputFields(input,['kind','id']);return inspectLibraryUses(state,input).view;}
export function applyLibraryRetirement(state,input){
 inputFields(input,['kind','id','retired','fingerprint','confirmed']);if(input.confirmed!==true||typeof input.retired!=='boolean'||typeof input.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(input.fingerprint))invalid('Review and confirm the library visibility change.');
 const {item,view}=inspectLibraryUses(state,input);if(view.retired===input.retired)return view;
 if(view.fingerprint!==input.fingerprint)invalid('The item or its uses changed. Review retirement again.',409);
 if(input.retired)item.retired=true;else delete item.retired;
 return {...view,retired:input.retired};
}
