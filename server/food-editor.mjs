import {vitaminActivityDefinition,parseVitaminActivityForms} from './domain/vitamin-activity.mjs';
import {normalizeLibraryDraft} from './domain/library-normalization.mjs';
import {projectFoodLabelDraft,projectFoodManualDraft,foodLabelRows} from './domain/food-label-draft.mjs';
import {labelProfiles} from './domain/nutrition-label.mjs';
import {prepareNamedPortions} from './domain/named-portions.mjs';
import {catalog} from './domain/nutrition.mjs';
import {availableQuantityUnits} from './domain/quantity-units.mjs';
const fail=message=>{throw Object.assign(Error(message),{status:400,code:400,publicMessage:message});};
const fields=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))fail('Choose supported food editor fields only.');};
const measures=['serving','grams','milliliters','portions'];
export function prepareFoodEditorDraft(state,payload){
 const {nutrientEdits=[],...draft}=payload;
 if(!Array.isArray(nutrientEdits))fail('Supply ordered nutrient edits.');
 const saved=draft.id?state.foods.find(row=>row.id===draft.id):null;if(draft.id&&!saved)fail('This library item no longer exists.');
 const base={...saved,...draft};if(Object.hasOwn(draft,'portions'))base.portions=prepareNamedPortions('food',draft.portions,saved?.portions??[]);
 let food=normalizeLibraryDraft(state,'food',base);
 for(const edit of nutrientEdits){
  if(edit?.kind==='manual'){
   fields(edit,['kind','values']);fields(edit.values,catalog.map(row=>row.id));
   food=normalizeLibraryDraft(state,'food',projectFoodManualDraft(food,edit.values));
  }else if(edit?.kind==='label'){
   fields(edit,['kind','profile','quantity','values','basis']);fields(edit.basis,measures);
   const basis={...edit.basis};if(Object.hasOwn(basis,'portions'))basis.portions=prepareNamedPortions('food',basis.portions);
   const reference=normalizeLibraryDraft(state,'food',{...food,...basis});
   const converted=projectFoodLabelDraft(reference,{profile:edit.profile,quantity:edit.quantity,values:edit.values});
   food=normalizeLibraryDraft(state,'food',{...food,nutrients:converted.nutrients,source:converted.source});
  }else fail('Choose a supported nutrient edit.');
 }
 return food;
}
// Label provenance owns authored shares. Do not infer vitamin forms from nutrient ratios.
function authoredVitaminForms(source,id){
 if(source?.labelEditVersion===1&&Array.isArray(source.labelEdits)){
  for(const edit of [...source.labelEdits].reverse())if(Object.hasOwn(edit.values??{},id))return edit.values[id]?.forms;
  return authoredVitaminForms(source.originalSource,id);
 }
 return source?.labelVersion===1?source.original?.values?.[id]?.forms:undefined;
}
function activityProjection(food,row){
 const definition=vitaminActivityDefinition(row.id);if(!definition)return {...row,forms:[],knownForms:null};
 let knownForms=null;try{knownForms=parseVitaminActivityForms(row.id,authoredVitaminForms(food.source,row.id));}catch{}
 return {...row,forms:definition.forms.map(({id,name})=>({id,name})),knownForms};
}
export function foodEditorLabelView(food,input){
 fields(input,['profile','quantity','units']);
 const profile=labelProfiles.find(row=>row.id===input.profile);if(!profile)fail('Choose a supported nutrition label format.');if(input.units!==undefined)fields(input.units,profile.rows.map(row=>row.id));
 for(const [id,unit]of Object.entries(input.units??{})){const row=profile.rows.find(row=>row.id===id),allowed=id==='vitaminD'?['µg','IU']:row.energyUnits?['kcal','kJ']:[row.defaultInputUnit??row.unit];if(!allowed.includes(unit))fail('Choose a supported label unit.');}
 return {profile:input.profile,rows:foodLabelRows(food,input).map(row=>activityProjection(food,row)),profiles:labelProfiles.map(profile=>({id:profile.id,population:profile.population,rows:profile.rows})),options:[['servings',food.serving],...availableQuantityUnits(food).map(unit=>[unit.id,unit.label]),...food.portions.map(portion=>['portion:'+portion.id,portion.label])]};
}
