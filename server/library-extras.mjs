import {digest} from './data-codec.mjs';
import {favoriteItems} from './domain/library-list.mjs';

export const libraryExtrasCommandFields={
 'favorite.set':['kind','id','enabled'],
};
const fail=message=>{throw Object.assign(Error(message),{status:400});};
function fields(input,allowed){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!allowed.includes(key)))fail('Choose the supported fields only.');}
function favorite(input){fields(input,libraryExtrasCommandFields['favorite.set']);if(!['food','recipe','meal'].includes(input.kind)||typeof input.id!=='string'||!input.id||input.id.length>1000||typeof input.enabled!=='boolean')fail('Choose a food, recipe or meal.');return input;}

export function favoriteView(state){
 return {revision:digest(state),items:favoriteItems(state)};
}

export function prepareLibraryExtrasCommand(state,action){
 if(action.type==='favorite.set'){favorite(action.payload);return action;}
 return action;
}
export function libraryExtrasCatalogReferences(action){return action.type==='favorite.set'&&favorite(action.payload).kind==='food'&&action.payload.enabled?[action.payload.id]:[];}
