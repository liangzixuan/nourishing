import {portionTranslationFields} from './measure-translations.mjs';
const messages={"limit": "A recipe can have at most 1,000 named portions.", "object": "Each recipe portion must be an object.", "identity": "Recipe portion IDs must be nonblank and unique.", "label": "A recipe portion needs a label of up to 500 characters.", "basis": "Choose a batch fraction, measured weight or measured volume for each recipe portion.", "fields": "Recipe portion fields must match their selected basis."};
const invalid=(recipePortionCode,recipePortionDetails={})=>{const {field,max}=recipePortionDetails;throw Object.assign(Error(recipePortionCode==='range'?`Recipe portion ${field} must be from 0.000001 to ${max}.`:messages[recipePortionCode]),{status:400,recipePortionCode,recipePortionDetails});};
export function recipeServingFields(resource){
 const result={};
 if(resource.serving!==undefined){if(typeof resource.serving!=='string'||!resource.serving.trim()||resource.serving.length>500)invalid('label');result.serving=resource.serving.trim();}
 if(resource.servingBasis!==undefined){if(!['batch','weight','volume'].includes(resource.servingBasis))invalid('basis');result.servingBasis=resource.servingBasis;}
 return result;
}
export function parseRecipePortions(value){
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>1000)invalid('limit');
 const seen=new Set();return value.map(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row))invalid('object');
  if(typeof row.id!=='string'||!row.id.trim()||row.id.length>200||seen.has(row.id))invalid('identity');seen.add(row.id);
  if(typeof row.label!=='string'||!row.label.trim()||row.label.length>500)invalid('label');
  if(!['batch','weight','volume'].includes(row.basis))invalid('basis');
  const field=row.basis==='batch'?'portionsPerBatch':row.basis==='volume'?'milliliters':'grams',max=row.basis==='batch'?100000:10000000;
  if(Object.keys(row).some(key=>!['id','label','basis',field,'quantity','translations'].includes(key)))invalid('fields');
  if(typeof row[field]!=='number'||!Number.isFinite(row[field])||row[field]<0.000001||row[field]>max)invalid('range',{field,max});
  if(row.quantity!==undefined&&(typeof row.quantity!=='number'||!Number.isFinite(row.quantity)||row.quantity<0.000001||row.quantity>100000))invalid('range',{field:'quantity',max:100000});
  return {id:row.id,label:row.label.trim(),basis:row.basis,[field]:row[field],...(row.quantity===undefined?{}:{quantity:row.quantity}),...portionTranslationFields(row)};
 });
}
