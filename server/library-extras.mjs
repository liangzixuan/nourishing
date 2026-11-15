import {digest} from './data-codec.mjs';
import {prepareNutritionLabel,labelProfiles} from './domain/nutrition-label.mjs';
import {vitaminActivityDefinition} from './domain/vitamin-activity.mjs';
import {previewLibraryDraft} from './domain/workspace.mjs';
import {isActiveLibraryItem} from './domain/library-status.mjs';

export const libraryExtrasCommandFields={
 'favorite.set':['kind','id','enabled'],
 'food.label.save':['label'],
};
const fail=message=>{throw Object.assign(Error(message),{status:400});};
function fields(input,allowed){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!allowed.includes(key)))fail('Choose the supported fields only.');}
function favorite(input){fields(input,libraryExtrasCommandFields['favorite.set']);if(!['food','recipe','meal'].includes(input.kind)||typeof input.id!=='string'||!input.id||input.id.length>1000||typeof input.enabled!=='boolean')fail('Choose a food, recipe or meal.');return input;}
function label(input){fields(input,['label']);return prepareNutritionLabel(input.label);}

export function favoriteView(state){
 const items=(state.settings.favorites??[]).flatMap(ref=>{const item=state[ref.kind+'s']?.find(row=>row.id===ref.id);return item&&isActiveLibraryItem(item)?[{id:item.id,kind:ref.kind,name:item.name,serving:item.serving??null,favorite:true}]:[];});
 return {revision:digest(state),items};
}
export function nutritionLabelView(state){return {revision:digest(state),profiles:labelProfiles.map(profile=>({...structuredClone(profile),rows:profile.rows.map(row=>({...structuredClone(row),forms:vitaminActivityDefinition(row.id)?.forms.map(({id,name})=>({id,name}))??[]}))}))};}
export function nutritionLabelPreview(state,input){fields(input,['label','date']);const prepared=label({label:input.label});return {revision:digest(state),name:prepared.name,serving:prepared.serving,grams:prepared.grams,nutrition:previewLibraryDraft(state,{kind:'food',draft:prepared,date:input.date}).nutrition};}

/** Only raw label readings enter the request. Nutrients and provenance are derived here. */
export function prepareLibraryExtrasCommand(state,action){
 if(action.type==='favorite.set'){favorite(action.payload);return action;}
 if(action.type==='food.label.save')return {type:'food.save',payload:label(action.payload)};
 return action;
}
export function libraryExtrasCatalogReferences(action){return action.type==='favorite.set'&&favorite(action.payload).kind==='food'&&action.payload.enabled?[action.payload.id]:[];}
