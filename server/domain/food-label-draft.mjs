import Big from 'big.js';
import {labelProfiles,prepareNutritionLabel} from './nutrition-label.mjs';
import {resolveFoodQuantity,parseServingAmount} from './food-quantity.mjs';
import {convertVitaminD} from './vitamin-d-units.mjs';
import {convertEnergy} from './energy-units.mjs';
import {vitaminActivityDefinition} from './vitamin-activity.mjs';

const Decimal=Big();Decimal.DP=340;
const invalid=message=>{throw Object.assign(Error(message),{status:400});};
const profileFor=id=>{const profile=labelProfiles.find(row=>row.id===id);if(!profile)invalid('Choose a supported nutrition label format.');return profile;};
const object=(value,keys,name)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))invalid('Invalid '+name+'.');};
function basisFor(food,quantity={amount:1}){
 object(quantity,['amount','quantity','unit','portionId'],'label serving');
 if(quantity.quantity!==undefined&&Object.hasOwn(quantity,'amount'))invalid('Choose one label serving basis.');
 if(quantity.quantity===undefined&&(quantity.unit!==undefined||quantity.portionId!==undefined))invalid('Choose an amount for the measured label serving.');
 const resolved=resolveFoodQuantity(food,quantity),factor=resolved?.amount??parseServingAmount(quantity.amount??1);
 if(!(factor>0))invalid('The nutrition label serving must be greater than zero.');
 const grams=resolved?.grams??(Number.isFinite(food.grams)?food.grams*factor:null),milliliters=resolved?.milliliters??(Number.isFinite(food.milliliters)?food.milliliters*factor:null);
 const column=quantity.unit==='g'&&quantity.quantity===100?'100g':quantity.unit==='mL'&&quantity.quantity===100?'100ml':'portion';
 const serving=column==='100g'?'100 g':column==='100ml'?'100 mL':quantity.unit==='portion'?quantity.quantity+' recorded portion(s)':quantity.quantity!==undefined?quantity.quantity+' '+quantity.unit:factor===1?(food.serving||'1 serving'):factor+' serving(s)';
 return {factor,grams,milliliters,column,serving,label:resolved?.portionLabel??food.serving??'1 serving'};
}
const scaled=(value,factor,divide=false)=>{
 const decimal=new Decimal(value),result=Number((divide?decimal.div(factor):decimal.times(factor)).toString());
 if(!Number.isFinite(result)||value>0&&result===0)invalid('The label measurement is outside the supported numeric range.');
 return result;
};
// A prior label conversion owns its output until another authored measurement replaces it.
function ownsActivity(source,inputId,outputId,current){
 if(!Number.isFinite(current)||source?.labelActivityOverrides?.includes(outputId))return false;
 const matches=(derivation,factor=1)=>derivation?.method==='vitamin-activity-conversion'&&derivation.inputId===inputId&&Number.isFinite(derivation.value)&&factor>0&&scaled(derivation.value,factor,true)===current;
 if(source?.labelEditVersion===1&&Array.isArray(source.labelEdits)){
  for(const edit of [...source.labelEdits].reverse()){
   if(edit.cleared?.includes(outputId))return false;
   const authored=edit.derivations?.find(row=>row.id===outputId);
   if(authored)return matches(authored,edit.basis?.factor??1);
  }
  return ownsActivity(source.originalSource,inputId,outputId,current);
 }
 if(source?.labelVersion===1)return matches(source.derivations?.find(row=>row.id===outputId));
 return false;
}
/** Retain explicit manual activity ownership, including an overwrite with the same value. */
export function projectFoodManualDraft(food,values){
 const result=structuredClone(food),activityIds=new Set(['vitaminA','vitaminE']);
 for(const [id,value]of Object.entries(values)){
  if(value===null)delete result.nutrients[id];
  else{if(typeof value!=='number'||!Number.isFinite(value)||value<0)invalid('Enter a nonnegative nutrient amount.');result.nutrients[id]=value;}
 }
 if(result.source?.labelVersion===1||result.source?.labelEditVersion===1){
  const overrides=new Set(result.source.labelActivityOverrides??[]);
  for(const id of Object.keys(values))if(activityIds.has(id))overrides.add(id);
  if(overrides.size)result.source.labelActivityOverrides=[...overrides];
 }
 return result;
}
function labelInput(food,profile,basis,values){return {profile:profile.id,population:profile.populationId??'adult-4-plus',...(profile.servingBasis?{basis:basis.column}:{}),name:food.name||'Food draft',serving:basis.serving,grams:basis.grams===null?null:String(basis.grams),values};}

/** Only authored fields are applied. Merely choosing another display format
 * cannot round, clear or reinterpret previously recorded measurements. */
export function projectFoodLabelDraft(food,input){
 object(input,['profile','quantity','values'],'food label edit');
 const profile=profileFor(input.profile),basis=basisFor(food,input.quantity);
 if(!input.values||typeof input.values!=='object'||Array.isArray(input.values))invalid('Supply the label nutrient entries.');
 if(!Object.keys(input.values).length)return structuredClone(food);
 const values=structuredClone(input.values),raw=labelInput(food,profile,basis,values);
 let prepared;
 try{prepared=prepareNutritionLabel(raw);}catch(error){if(error.nutritionLabelCode!=='empty')throw error;prepared={nutrients:{},source:{derivations:[]}};}
 const result=structuredClone(food),nutrients={...result.nutrients},removed=new Set();
 for(const [id,value]of Object.entries(values)){
  const row=profile.rows.find(row=>row.id===id); // The label parser validated the row and its fields.
  if(Object.hasOwn(value,'amount'))removed.add(row.nutrientId??id);
  if(Object.hasOwn(value,'percent'))removed.add(row.percentId);
  const activity=vitaminActivityDefinition(row.id);
  if(activity&&ownsActivity(result.source,row.id,activity.id,nutrients[activity.id]))removed.add(activity.id);
 }
 for(const id of removed)delete nutrients[id];
 for(const [id,value]of Object.entries(prepared.nutrients)){nutrients[id]=scaled(value,basis.factor,true);removed.delete(id);}
 const aggregateInputs={},aggregateDerivations=[];
 for(const {aggregate,owner} of labelProfiles.flatMap(owner=>owner.aggregates.map(aggregate=>({aggregate,owner})))){
  if(!aggregate.components.some(id=>Object.hasOwn(values[id]??{},'amount')))continue;
  if(!aggregate.components.every(id=>Number.isFinite(nutrients[id]))){delete nutrients[aggregate.id];removed.add(aggregate.id);continue;}
  const inputs=Object.fromEntries(aggregate.components.map(id=>[id,{amount:String(nutrients[id])}]));
  const derived=prepareNutritionLabel(labelInput(food,owner,basisFor(food),inputs));
  nutrients[aggregate.id]=derived.nutrients[aggregate.id];removed.delete(aggregate.id);
  aggregateInputs[aggregate.id]=inputs;
  aggregateDerivations.push({...derived.source.derivations.find(row=>row.id===aggregate.id),profile:owner.id,basis:'recorded-serving'});
 }
 result.nutrients=nutrients;
 const prior=result.source,isEdit=prior?.labelEditVersion===1&&Array.isArray(prior.labelEdits)&&Object.hasOwn(prior,'originalSource');
 const overrides=(prior?.labelActivityOverrides??[]).filter(id=>!Object.hasOwn(prepared.nutrients,id)&&!removed.has(id));
 result.source={name:'User-edited nutrition label',userModified:true,labelEditVersion:1,...(overrides.length?{labelActivityOverrides:overrides}:{}),originalSource:isEdit?prior.originalSource:prior??'User-provided label or manual entry',labelEdits:[...(isEdit?prior.labelEdits:[]),{profile:profile.id,quantity:structuredClone(input.quantity??{amount:1}),basis,values,derivations:prepared.source.derivations,...(aggregateDerivations.length?{aggregateInputs,aggregateDerivations}:{}),cleared:[...removed]}]};
 if(new TextEncoder().encode(JSON.stringify(result.source)).byteLength>32768)invalid('Food provenance exceeds 32 KiB.');
 return result;
}

/** Display values are projections of canonical facts, not newly authored label
 * entries. Input conversion remains owned by prepareNutritionLabel. */
export function foodLabelRows(food,{profile:profileId,quantity={amount:1},units={}}){
 const profile=profileFor(profileId),basis=basisFor(food,quantity);
 const percentAllowed=!profile.percentPerPortion||basis.column==='portion';
 const references=percentAllowed?prepareNutritionLabel(labelInput(food,profile,basis,Object.fromEntries(profile.rows.filter(row=>row.dailyValue!==null).map(row=>[row.id,{percent:'100',unit:units[row.id]??row.defaultInputUnit??row.unit}])))).nutrients:{};
 return profile.rows.map(row=>{
  const unit=units[row.id]??row.defaultInputUnit??row.unit,value=food.nutrients?.[row.nutrientId??row.id];
  let amount='';
  if(row.amountAllowed&&Number.isFinite(value)){
   let displayed=scaled(value,basis.factor);
   if(row.id==='vitaminD')displayed=convertVitaminD(displayed,'µg',unit);
   else if(row.energyDivisor&&unit==='kJ')displayed=Number(new Decimal(displayed).times(row.energyDivisor).toString());
   else if(row.energyUnits)displayed=convertEnergy(displayed,'kcal',unit);
   else if(row.factor)displayed=Number(new Decimal(displayed).div(row.factor).toString());
   amount=String(displayed);
  }
  const percentValue=food.nutrients?.[row.percentId],reference=references[row.percentId];
  const percent=percentAllowed&&Number.isFinite(percentValue)&&reference>0?new Decimal(percentValue).times(basis.factor).times(100).div(reference).toString():'';
  return {...row,amount,percent,unit,percentAllowed};
 });
}
