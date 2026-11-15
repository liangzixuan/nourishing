import {catalogIdentity} from './catalog-source.mjs';

export const consumedComponents=Object.freeze([['protein','Protein'],['carbohydrate','Carbs'],['fat','Fat'],['alcohol','Alcohol'],['unattributed','Unattributed']]);
const keys=consumedComponents.map(([id])=>id),methods=['sourceFactors','generalFactors','unattributed','zeroEnergy','unknownEnergy'];
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const known=value=>finite(value)&&value>=0;
const values=()=>Object.fromEntries(keys.map(id=>[id,0]));
const counts=()=>Object.fromEntries(methods.map(id=>[id,0]));
const close=(a,b)=>Math.abs(a-b)<=Math.max(.0001,Math.abs(b)*1e-10);
const invalid=()=>{throw Error('The captured consumed breakdown is incomplete. Generate a fresh report.');};

/** Estimated allocation of a food's published calories, never a new measurement.
 * Missing macro amounts or incomplete published factors leave energy unattributed. */
export function foodConsumedEnergy(record,totalCarbohydrate,measurements=record.nutrients??{}){
 const nutrients=measurements,calories=nutrients.calories,result={total:known(calories)?calories:null,values:values(),methods:counts(),reasons:{}};
 const finish=(method,reason)=>{result.methods[method]=1;if(reason)result.reasons[reason]=1;return result;};
 if(result.total===null)return finish('unknownEnergy','missing-energy');
 if(result.total===0)return finish('zeroEnergy');
 const unavailable=reason=>{result.values.unattributed=result.total;return finish('unattributed',reason);};
 const grams={protein:nutrients.protein,carbohydrate:totalCarbohydrate,fat:nutrients.fat,alcohol:nutrients.alcohol};
 if(Object.values(grams).some(value=>!known(value)))return unavailable('missing-macronutrient');
 const source=record.source,capture=source?.calorieConversionFactors;
 const published=record.readOnly===true&&catalogIdentity(source)?.provider==='usda'&&capture?.records?.length>0;
 const factors=published?capture.values:{protein:4,carbohydrate:4,fat:9};
 if(published&&(capture.version!==1||capture.unit!=='kcal/g'||!factors||['protein','carbohydrate','fat'].some(id=>grams[id]>0&&(!known(factors[id])||capture.reasons?.[id]!==null))))return unavailable('incomplete-calorie-factor');
 let weights={protein:grams.protein*(factors.protein??0),carbohydrate:grams.carbohydrate*(factors.carbohydrate??0),fat:grams.fat*(factors.fat??0),alcohol:grams.alcohol*6.93};
 if(!published&&known(nutrients.fiber)){
  const adjusted=Math.max(0,grams.carbohydrate-nutrients.fiber)*4,other=weights.protein+weights.fat+weights.alcohol;
  if(Math.abs(calories-other-adjusted)<=Math.abs(calories-other-weights.carbohydrate))weights.carbohydrate=adjusted;
 }
 const sum=Object.values(weights).reduce((total,value)=>total+value,0);
 if(!known(sum)||sum===0)return unavailable('no-usable-macro-energy');
 for(const [id,weight]of Object.entries(weights))result.values[id]=result.total*(weight/sum);
 return finish(published?'sourceFactors':'generalFactors');
}

/** Called by the same quantity/recipe/meal owner as the nutrient measurements. */
export function combineConsumedEnergy(results,scale=1){
 const result={total:0,values:values(),methods:counts(),reasons:{}};let totalKnown=false,leaves=0;
 for(const row of results.filter(Boolean)){
  if(row.total!==null){result.total+=row.total*scale;totalKnown=true;}
  for(const id of keys)result.values[id]+=row.values[id]*scale;
  for(const id of methods){result.methods[id]+=row.methods[id];leaves+=row.methods[id];}
  for(const [reason,count]of Object.entries(row.reasons))result.reasons[reason]=(result.reasons[reason]??0)+count;
 }
 if(leaves&&!totalKnown)result.total=null;
 return result;
}

export function captureConsumedBreakdown(days){
 const measured=days.filter(day=>finite(day.energy.consumed)),combined=combineConsumedEnergy(measured.map(day=>day.consumedEnergy));
 let total=0;for(const day of measured){if(!day.consumedEnergy||!finite(day.consumedEnergy.total)||!close(day.consumedEnergy.total,day.energy.consumed))invalid();total+=day.energy.consumed;}
 const mean=measured.length?total/measured.length:null;
 const partition=total>0&&Object.values(combined.values).every(known);
 return {version:1,method:'food-level-atwater-allocation-v1',unit:'kcal',eligibleDays:days.length,knownDays:measured.length,mean,methods:combined.methods,reasons:combined.reasons,
  components:consumedComponents.map(([id,name])=>({id,name,mean:measured.length?combined.values[id]/measured.length:null,percent:partition?combined.values[id]/total*100:null}))};
}

export function validateConsumedBreakdown(value,summary){
 if(!value||value.version!==1||value.method!=='food-level-atwater-allocation-v1'||value.unit!=='kcal'||value.eligibleDays!==summary.eligibleDays||value.knownDays!==summary.knownDays||!Array.isArray(value.components)||value.components.length!==keys.length)invalid();
 if(value.knownDays===0){if(value.mean!==null||summary.mean!==null)invalid();}else if(!finite(value.mean)||!finite(summary.mean)||!close(value.mean,summary.mean))invalid();
 if(!value.methods||Object.keys(value.methods).length!==methods.length||methods.some(id=>!Number.isSafeInteger(value.methods[id])||value.methods[id]<0)||!value.reasons||Object.values(value.reasons).some(count=>!Number.isSafeInteger(count)||count<0))invalid();
 let sum=0;const partition=value.mean>0&&value.components.every(row=>known(row?.mean));
 for(const [index,[id,name]]of consumedComponents.entries()){
  const row=value.components[index];if(!row||row.id!==id||row.name!==name)invalid();
  if(!value.knownDays){if(row.mean!==null||row.percent!==null)invalid();continue;}
  if(!finite(row.mean))invalid();sum+=row.mean;
  if(!partition){if(row.percent!==null)invalid();}else if(!known(row.percent)||!close(row.percent,row.mean/value.mean*100))invalid();
 }
 if(value.knownDays&&!close(sum,value.mean))invalid();return value;
}
