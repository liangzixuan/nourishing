import {catalog} from './nutrient-catalog.mjs';
const ids=new Set(catalog.map(row=>row.id).filter(id=>!['calories','protein','carbs','fat'].includes(id)));
const own=(value,key)=>Object.hasOwn(value??{},key),object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fail=()=>{throw Object.assign(Error('Choose version 1 nutrient modes with custom or reference daily and maximum choices.'),{status:400});};
export function parseNutrientTargetModes(input){
 if(input==null)return {version:1,nutrients:{}};
 if(!object(input)||Object.keys(input).length!==2||input.version!==1||!object(input.nutrients))fail();
 const nutrients={};for(const [id,fields]of Object.entries(input.nutrients)){
  if(!ids.has(id)||!object(fields)||!Object.keys(fields).length||Object.keys(fields).some(key=>!['daily','maximum'].includes(key)||!['custom','reference'].includes(fields[key])))fail();
  nutrients[id]={...fields};
 }
 return {version:1,nutrients};
}
export function modeReferenceSelection(selected,modes,field,supported){
 const next=new Set(selected??[]),allowed=new Set(supported);
 for(const [id,choice]of Object.entries(parseNutrientTargetModes(modes).nutrients))if(choice[field]&&allowed.has(id)){if(choice[field]==='reference')next.add(id);else next.delete(id);}
 return [...next];
}
export function activeNutrientMaximums(policy,modes){
 const maximums={...policy?.maximums};for(const [id,choice]of Object.entries(parseNutrientTargetModes(modes).nutrients)){
  if(choice.maximum==='reference')delete maximums[id];else if(choice.maximum==='custom'&&!own(maximums,id))maximums[id]=null;
 }
 return maximums;
}
const differs=(a,b,id)=>own(a,id)!==own(b,id)||a?.[id]!==b?.[id];
/** Older editors own their explicit field changes. Inactive custom amounts stay
 * stored when an active-policy form changes only visibility or another nutrient.
 */
export function reconcileNutrientTargetModes(current,next,input,{dailyIds,maximumIds}){
 if(own(input,'nutrientTargetModes'))return parseNutrientTargetModes(input.nutrientTargetModes);
 const modes=parseNutrientTargetModes(current.nutrientTargetModes);
 const oldDaily=new Set(modeReferenceSelection(current.nutrientReferences?.nutrients,modes,'daily',dailyIds)),oldMaximum=new Set(modeReferenceSelection(current.nutrientUpperLimits?.nutrients,modes,'maximum',maximumIds));
 for(const [id,fields]of Object.entries(modes.nutrients)){
  if(own(input,'nutrientReferences')&&(input.nutrientReferences===null||dailyIds.includes(id)&&oldDaily.has(id)!==(next.nutrientReferences?.nutrients.includes(id)??false)))delete fields.daily;
  if(own(input,'nutrientUpperLimits')&&(input.nutrientUpperLimits===null||maximumIds.includes(id)&&oldMaximum.has(id)!==(next.nutrientUpperLimits?.nutrients.includes(id)??false)))delete fields.maximum;
  if(own(input,'nutrientDisplay')){
   if(input.nutrientDisplay===null)delete fields.maximum;
   else if(fields.maximum==='reference'&&!own(next.nutrientDisplay?.maximums,id)&&own(current.nutrientDisplay?.maximums,id))next.nutrientDisplay.maximums[id]=current.nutrientDisplay.maximums[id];
   else if(differs(current.nutrientDisplay?.maximums,next.nutrientDisplay?.maximums,id))delete fields.maximum;
  }
  if(!Object.keys(fields).length)delete modes.nutrients[id];
 }
 return modes;
}
