/** A visual estimate is source evidence, never a measured or confirmed amount. */
export const PHOTO_PORTION_SCHEMA={type:'object',additionalProperties:false,required:['grams','lowerGrams','upperGrams','reason'],properties:{grams:{type:'number',exclusiveMinimum:0,maximum:1000000},lowerGrams:{type:'number',exclusiveMinimum:0,maximum:1000000},upperGrams:{type:'number',exclusiveMinimum:0,maximum:1000000},reason:{type:'string',minLength:1,maxLength:500}}};
export function photoPortionEstimate(value){
  const keys=['grams','lowerGrams','upperGrams','reason'];
  const valid=value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key))&&['grams','lowerGrams','upperGrams'].every(key=>typeof value[key]==='number'&&Number.isFinite(value[key])&&value[key]>0&&value[key]<=1000000)&&value.lowerGrams<=value.grams&&value.grams<=value.upperGrams&&value.lowerGrams<value.upperGrams&&typeof value.reason==='string'&&value.reason.trim()&&value.reason.length<=500;
  if(!valid)throw Object.assign(new Error('Photo portion estimates need a positive weight, an enclosing range and an explanation of uncertainty.'),{status:400});
  return {grams:value.grams,lowerGrams:value.lowerGrams,upperGrams:value.upperGrams,reason:value.reason};
}
export const photoPortionEvidence=row=>row.portionEstimate===undefined?{}:{portionEstimate:photoPortionEstimate(row.portionEstimate)};
