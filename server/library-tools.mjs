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
