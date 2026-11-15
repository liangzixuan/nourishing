import {vitaminActivityDefinition,deriveVitaminActivity} from './vitamin-activity.mjs';
import Big from 'big.js';
import {number,text} from './diary-record-fields.mjs';
import {convertVitaminD} from './vitamin-d-units.mjs';
import {convertEnergy} from './energy-units.mjs';

const Decimal=Big();Decimal.DP=340;
export class NutritionLabelError extends Error{constructor(code,message,details={}){super(message);this.status=400;this.nutritionLabelCode=code;this.details=details;}}
const fail=(code,message,details)=>{throw new NutritionLabelError(code,message,details);};
function labelText(value,name,field,max){try{return text(value,name,max);}catch(error){if(error.status!==400)throw error;fail('text',error.message,{field,max});}}
function labelNumber(value,name,details,min=0,max=10000000){try{return number(value,name,min,max);}catch(error){if(error.status!==400)throw error;fail('number',error.message,{...details,min,max});}}
import {labelProfiles} from './nutrition-label-profiles.mjs';
export {labelProfiles};
const record=(value,keys,name,details)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))fail('record',`Invalid ${name}.`,details);};
function reading(value,name,details){
 if(value===undefined||value==='')return null;
 if(typeof value!=='string'||!value.trim()||! /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))fail('decimal',`${name}: enter a nonnegative decimal number. Keep qualified amounts such as “less than 1” in the label notes.`,details);
 const parsed=Number(value.trim());if(!Number.isFinite(parsed)||(parsed===0&&new Decimal(value.trim()).gt(0)))fail('numericRange',`${name} is outside the supported numeric range.`,details);
 return parsed;
}
export function prepareNutritionLabel(input){
 record(input,['profile','population','basis','name','serving','grams','barcode','notes','values'],'nutrition label',{field:'label'});
 if(new TextEncoder().encode(JSON.stringify(input)).byteLength>32768)fail('provenance','Food provenance exceeds 32 KiB.');
 const profile=labelProfiles.find(p=>p.id===input.profile);if(!profile)fail('profile','Choose a supported nutrition label format.');
 if(input.population!==(profile.populationId??'adult-4-plus'))fail('population',`Confirm the label population: ${profile.population}. Other populations need their own reference values.`,{profileId:profile.id});
 record(input.values,profile.rows.map(row=>row.id),'label nutrient values',{field:'values'});
 const name=labelText(input.name,'Food name','name',500),serving=labelText(input.serving,'Label serving','serving',100),grams=input.grams===''||input.grams===null?null:labelNumber(reading(input.grams,'Serving weight',{field:'grams'}),'Serving weight',{field:'grams'},0.001,100000);
 if(profile.servingBasis){
  if(!['100g','100ml','portion'].includes(input.basis))fail('basis','Choose the label column: per 100 g, per 100 mL or per portion.');
  if(input.basis==='100g'&&(serving!=='100 g'||grams!==100))fail('massBasis','The per-100-g column must use a 100 g serving and weight.');
  if(input.basis==='100ml'&&serving!=='100 mL')fail('volumeBasis','The per-100-mL column must use a 100 mL serving. Enter its mass only if known.');
 }else if(input.basis!==undefined)fail('noBasis','This label format uses the stated serving without a separate column selector.');
 const barcode=input.barcode?labelText(input.barcode,'Barcode','barcode',100):'',notes=input.notes?labelText(input.notes,'Label notes','notes',4000):'';
 const nutrients={},derivations=[];
 for(const row of profile.rows){
  if(!Object.hasOwn(input.values,row.id))continue;
  const value=input.values[row.id],activity=vitaminActivityDefinition(row.id);record(value,['amount','percent','unit',...(activity?['forms']:[])],row.name,{nutrientId:row.id});
  const unit=value.unit??row.defaultInputUnit??row.unit;if(unit!==row.unit&&!(row.id==='vitaminD'&&unit==='IU')&&!(row.energyUnits&&unit==='kJ'))fail('unit',`Unsupported unit for ${row.name}.`,{nutrientId:row.id});
  const nutrientId=row.nutrientId??row.id,nutrientUnit=row.nutrientUnit??row.unit;
  const project=(amount,fromUnit)=>{
   let result;try{result=row.id==='vitaminD'?convertVitaminD(amount,fromUnit,'µg'):row.energyDivisor&&fromUnit==='kJ'?Number(new Decimal(amount).div(row.energyDivisor).toString()):row.energyUnits?convertEnergy(amount,fromUnit,'kcal'):row.factor?Number(new Decimal(amount).times(row.factor).toString()):amount;}catch(error){if(error.status!==400)throw error;fail('conversionRange',error.message,{nutrientId:row.id});}
   if(amount>0&&result===0)fail('numericRange',`${row.name} is outside the supported numeric range.`,{nutrientId:row.id});
   return labelNumber(result,row.name,{nutrientId:row.id});
  };
  const amount=reading(value.amount,row.name,{nutrientId:row.id}),percent=reading(value.percent,`${row.name} % Daily Value`,{nutrientId:row.id,percent:true});
  if(percent!==null&&row.dailyValue===null)fail('noDailyValue',`${row.name} has no Daily Value in this label format.`,{nutrientId:row.id});
  if(percent!==null&&profile.percentPerPortion&&input.basis!=='portion')fail('percentPortion','Australian/New Zealand percentages are per serving. Choose Per portion and copy that serving column.');
  if(amount!==null&&!row.amountAllowed)fail('combinedFat',`${row.name}: enter individual fat amounts and the combined percent Daily Value.`,{nutrientId:row.id});
  if(amount!==null){
   const converted=project(amount,unit);
   nutrients[nutrientId]=converted;
   derivations.push({id:nutrientId,inputId:row.id,inputValue:amount,inputUnit:unit,method:unit===nutrientUnit&&!row.factor?'declared-amount':'unit-conversion',value:converted,unit:nutrientUnit});
  }
  if(percent!==null&&(amount===null||row.percentId!==nutrientId)){
   const dailyValue=row.referenceValues?.[unit]??row.dailyValue,referenceUnit=row.referenceValues?unit:row.referenceUnit??row.unit;
   const exact=new Decimal(percent).times(dailyValue).div(100),amountFromPercent=Number(exact.toString());
   if(amountFromPercent===0&&exact.gt(0))fail('numericRange',`${row.name} is outside the supported numeric range.`,{nutrientId:row.id});
   const converted=project(amountFromPercent,referenceUnit);
   nutrients[row.percentId]=converted;
   derivations.push({id:row.percentId,inputId:row.id,method:'percent-daily-value',percent,dailyValue,referenceUnit,value:converted,unit:nutrientUnit});
  }
  if(activity){
   const converted=deriveVitaminActivity(row.id,nutrients[row.id]??null,value.forms);
   if(converted){nutrients[converted.id]=labelNumber(converted.value,activity.name,{nutrientId:converted.id});derivations.push(converted);}
  }
 }
 for(const aggregate of profile.aggregates){
  if(aggregate.components.every(id=>Object.hasOwn(nutrients,id))){
   const value=labelNumber(Number(aggregate.components.reduce((total,id)=>total.plus(nutrients[id]),new Decimal(0)).toString()),aggregate.id,{nutrientId:aggregate.id});
   nutrients[aggregate.id]=value;
   const previous=derivations.findIndex(fact=>fact.id===aggregate.id);if(previous!==-1)derivations.splice(previous,1);
   derivations.push({id:aggregate.id,method:'sum-declared-amounts',components:[...aggregate.components],value,unit:profile.rows.find(row=>row.id===aggregate.id).unit});
  }
 }
 if(!Object.keys(nutrients).length)fail('empty','Enter at least one numeric label amount or percent Daily Value.');
 const source={name:'User-entered nutrition label',labelVersion:1,profile:profile.id,url:profile.reference,original:structuredClone(input),derivations};
 if(new TextEncoder().encode(JSON.stringify(source)).byteLength>32768)fail('provenance','Food provenance exceeds 32 KiB.');
 return {name,serving,grams,...(input.basis==='100ml'?{milliliters:100}:{}),barcode,nutrients,source,dataQuality:`User-entered ${profile.name} for ${profile.population.toLowerCase()}. Label amounts and percentages can be rounded. Declared amounts take precedence; percent-only amounts are estimates. ${profile.guidance} Original label entries remain in source details if the food is edited.`};
}
