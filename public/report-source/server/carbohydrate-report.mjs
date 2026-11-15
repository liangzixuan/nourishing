import {CARBOHYDRATE_COMPONENTS,parseCarbohydrateDefinition,carbohydrateLabel,carbohydrateDescription} from './carbohydrate-policy.mjs';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const failure=()=>{throw Error('The captured carbohydrate report was incomplete. Read a fresh capture.');};
/** Validate captured facts without consulting live settings or recalculating averages. */
export function validateCarbohydrateCapture(value,{mode='tracked',eligibleDays}={}){
  if(!['tracked','total','net'].includes(mode)||!object(value)||typeof value.description!=='string'||value.unit!=='g'||!object(value.summary)||value.summary.id!==(mode==='tracked'?'trackedCarbohydrate':mode+'Carbohydrate')||value.summary.name!==value.label||value.summary.unit!=='g'||value.summary.category!=='Tracking'||!object(value.reasons))failure();
  const unknown=value.definition===null;
  if(unknown){if(mode!=='net'||value.label!=='Net carbohydrate'||value.description!=='Net carbohydrate definition is not set.')failure();}
  else{let definition;try{definition=parseCarbohydrateDefinition(value.definition);}catch{failure();}if(mode!=='tracked'&&definition.mode!==mode||value.label!==carbohydrateLabel(definition)||value.description!==carbohydrateDescription(definition))failure();}
  for(const[reason,count]of Object.entries(value.reasons))if(!['unconfigured-net-definition','no-carbohydrate-basis','unknown-reported-net-method','conflicting-carbohydrate-paths','negative-derived-value','nonfinite-derived-value',...CARBOHYDRATE_COMPONENTS.map(id=>'missing:'+id)].includes(reason)||!Number.isSafeInteger(count)||count<1)failure();
  const r=value.summary;if(['mean','meanTarget','percentOfMeanTarget'].some(k=>r[k]!==null&&(typeof r[k]!=='number'||!Number.isFinite(r[k])))||['eligibleDays','knownDays','partialDays','unknownDays','zeroByCompletionDays','targetKnownDays'].some(k=>!Number.isSafeInteger(r[k])||r[k]<0)||['reason','targetReason'].some(k=>r[k]!==null&&typeof r[k]!=='string'))failure();
  if(eligibleDays!==undefined&&r.eligibleDays!==eligibleDays||r.knownDays+r.unknownDays!==r.eligibleDays||r.partialDays>r.knownDays||r.zeroByCompletionDays>r.knownDays||r.targetKnownDays>r.knownDays||(r.knownDays===0)!==(r.mean===null)||unknown&&[r.mean,r.meanTarget,r.percentOfMeanTarget].some(v=>v!==null)||unknown&&[r.knownDays,r.partialDays,r.zeroByCompletionDays,r.targetKnownDays].some(v=>v!==0))failure();
  return value;
}
export function validateCarbohydrateReport(value,{eligibleDays,tracked}={}){
  if(!object(value)||Object.keys(value).length!==2||!Object.hasOwn(value,'total')||!Object.hasOwn(value,'net'))failure();
  for(const mode of ['total','net'])validateCarbohydrateCapture(value[mode],{mode,eligibleDays});
  if(value.total.summary.eligibleDays!==value.net.summary.eligibleDays)failure();
  if(tracked){validateCarbohydrateCapture(tracked,{eligibleDays});const selected=value[tracked.definition.mode];if(!same(tracked,{...selected,summary:{...selected.summary,id:'trackedCarbohydrate'}}))failure();}
  return value;
}
