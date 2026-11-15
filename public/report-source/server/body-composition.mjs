import {BODY_PROJECTION_VERSION,captureBodyGuidance} from './body-guidance.mjs';
import {isWeightUnit,weightKilogramsPerUnit} from './weight-units.mjs';
import Big from './../vendor/big.js/7.0.1/big.mjs';
import {date as calendarDate} from './calendar.mjs';
import {parseBiometricMetric,matchesBiometric} from './biometric-metrics.mjs';

const fail=message=>{throw Object.assign(new Error(message),{status:400});};
const Decimal=Big();Decimal.DP=340;
const time=value=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const heightFactors=Object.freeze({cm:'1',m:'100',in:'2.54',ft:'30.48'});
const keys=['version','weightMetric','bodyFatMetric','heightMetric','useForResting','useHeightForResting','useForKeto'];
/** BMI arithmetic only; callers own measurement selection and display rounding. */
export function bodyMassIndex(weightKg,heightCm){
  if(!Number.isFinite(weightKg)||!Number.isFinite(heightCm)||weightKg<=0||heightCm<=0)return null;
  const metres=heightCm/100,value=weightKg/metres/metres;
  return Number.isFinite(value)&&value>0?value:null;
}
export function parseBodyCompositionPolicy(value){
  if(value===null||value===undefined)return null;
  if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))fail('Choose the required body-composition fields only.');
  if(value.version!==2||typeof value.useForResting!=='boolean'||typeof value.useHeightForResting!=='boolean'||typeof value.useForKeto!=='boolean')fail('Choose version 2 and explicit body-composition calculation switches.');
  const weightMetric=value.weightMetric===null?null:parseBiometricMetric(value.weightMetric),bodyFatMetric=value.bodyFatMetric===null?null:parseBiometricMetric(value.bodyFatMetric),heightMetric=value.heightMetric===null?null:parseBiometricMetric(value.heightMetric);
  if(weightMetric&&!isWeightUnit(weightMetric.unit))fail('Choose a weight metric recorded in kg, lb, lbs or st.');
  if(bodyFatMetric&&bodyFatMetric.unit!=='%')fail('Choose a body-fat metric recorded in %.');
  if(heightMetric&&!Object.hasOwn(heightFactors,heightMetric.unit))fail('Choose a height metric recorded in cm, m, in or ft.');
  if(value.useForResting&&!weightMetric)fail('Select a weight metric for resting energy.');
  if(value.useHeightForResting&&!heightMetric)fail('Select a height metric for resting energy.');
  if(value.useForKeto&&(!weightMetric||!bodyFatMetric))fail('Select weight and body-fat metrics for keto calculations.');
  return {version:2,weightMetric,bodyFatMetric,heightMetric,useForResting:value.useForResting,useHeightForResting:value.useHeightForResting,useForKeto:value.useForKeto};
}
/** Canonical policy only. Retain invalid values so latest readings stay unknown. */
export function isBodyCompositionInput(row,policy){
  if(!policy)return false;
  return Boolean(((policy.useForResting||policy.useForKeto)&&matchesBiometric(row,policy.weightMetric))||(policy.useForKeto&&matchesBiometric(row,policy.bodyFatMetric))||(policy.useHeightForResting&&matchesBiometric(row,policy.heightMetric)));
}
export function bodyMetricOptions(state){
  const result={weight:[],bodyFat:[],height:[]},seen=new Set();
  const add=(type,unit)=>{
    const group=isWeightUnit(unit)?'weight':unit==='%'?'bodyFat':Object.hasOwn(heightFactors,unit)?'height':null;if(!group)return;
    let metric;try{metric=parseBiometricMetric({kind:'biometric',type,unit});}catch(error){if(error.status===400)return;throw error;}
    const key=JSON.stringify(metric);if(seen.has(key))return;seen.add(key);result[group].push({metric,name:metric.type,unit:metric.unit});
  };
  add('Weight','kg');add('Weight','lb');add('Body fat','%');
  for(const unit of Object.keys(heightFactors))add('Height',unit);
  for(const row of state.biometrics??[])add(row?.type,row?.unit);
  for(const row of state.settings?.customBiometrics??[])add(row?.name,row?.unit);
  return result;
}

/** Saved order resolves ties. Time is descriptive and never selects a reading. */
export function projectBodyComposition(biometrics,policy,date){
  calendarDate(date);policy=parseBodyCompositionPolicy(policy);if(!Array.isArray(biometrics))fail('Body composition requires biometric records.');
  const reasons=[];
  const selected=(metric,kind,valid)=>{
    if(!metric)return {status:'unselected',metric:null,reading:null};
    let latest=null,malformed=false;
    for(const row of biometrics){
      if(!matchesBiometric(row,metric))continue;
      try{calendarDate(row.date);}catch(error){if(error.status!==400)throw error;malformed=true;continue;}
      if(row.date<=date&&(!latest||row.date>=latest.date))latest=row;
    }
    if(malformed)reasons.push(captureBodyGuidance('invalidDate.'+kind));
    if(!latest){reasons.push(captureBodyGuidance('empty.'+kind));return {status:'empty',metric,reading:null};}
    if(!Number.isFinite(latest.value)||!valid(latest.value)){reasons.push(captureBodyGuidance('invalid.'+kind));return {status:'invalid',metric,reading:null};}
    return {status:'known',metric,reading:{date:latest.date,...(time(latest.time)?{time:latest.time}:{}),value:latest.value,unit:metric.unit}};
  };
  const weight=selected(policy?.weightMetric,'weight',value=>value>0&&value<=1000000),bodyFat=selected(policy?.bodyFatMetric,'bodyFat',value=>value>=0&&value<=100),height=selected(policy?.heightMetric,'height',value=>value>0&&value<=1000000);
  const kg=weight.status==='known'?new Decimal(weight.reading.value).times(weightKilogramsPerUnit[weight.metric.unit]):null;
  const weightKg=kg===null?null:Number(kg.toString()),bodyFatPercent=bodyFat.reading?.value??null;
  const heightCm=height.status==='known'?Number(new Decimal(height.reading.value).times(heightFactors[height.metric.unit]).toString()):null;
  const leanMassKg=kg===null||bodyFatPercent===null?null:Number(kg.times(new Decimal(1).minus(new Decimal(bodyFatPercent).div(100))).toString());
  if(weight.reading&&bodyFat.reading&&weight.reading.date!==bodyFat.reading.date)reasons.push(captureBodyGuidance('differentDates'));
  return {version:BODY_PROJECTION_VERSION,date,weight,bodyFat,height,weightKg,bodyFatPercent,heightCm,leanMassKg,reasons};
}
