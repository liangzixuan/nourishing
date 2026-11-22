import {date as calendarDate} from './calendar.mjs';
import {maternalStage} from './profile-demographics.mjs';
import {calendarAge} from './calendar-age.mjs';
import {parseWeightGoal,projectWeightGoal} from './weight-goal.mjs';

const fail=message=>{throw Object.assign(new Error(message),{status:400});};
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const known=value=>finite(value)&&value>=0;
const own=(value,key)=>Object.hasOwn(value??{},key);
function fields(value,keys,label){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!own(value,key)))fail(`Choose the required ${label} fields only.`);
}
function numeric(value,label,{minimum=0,positive=false}={}){
  if(!finite(value)||Math.abs(value)>1000000||(positive?value<=minimum:value<minimum))fail(`Enter a valid ${label}.`);
  return value;
}
function bool(value,label){if(typeof value!=='boolean')fail(`Choose ${label}.`);return value;}
function zone(value){
  if(typeof value!=='string'||!value||value!==value.trim()||/^[+-]/.test(value)||value.length>100)fail('Choose an explicit Health Connect IANA time zone.');
  try{new Intl.DateTimeFormat('en',{timeZone:value});}catch{fail('Choose a valid Health Connect IANA time zone.');}
  return value;
}
function restingValue(resting,weightKg=resting.weightKg,age=resting.age,heightCm=resting.heightCm){return resting.mode==='custom'?resting.kcal:weightKg===null||heightCm===null||age===null?null:10*weightKg+6.25*heightCm-5*age+(resting.sex==='male'?5:-161);}

function parseResting(value){
  if(value?.mode==='custom'){
    fields(value,['mode','kcal'],'custom resting energy');return {mode:'custom',kcal:numeric(value.kcal,'resting kcal',{positive:true})};
  }
  if(!['mifflin-st-jeor','mifflin-st-jeor-birthday'].includes(value?.mode))fail('Choose custom resting energy or Mifflin-St Jeor.');
  const birthday=value.mode==='mifflin-st-jeor-birthday';
  fields(value,['mode','adultScope','sex',birthday?'birthDate':'age','heightCm','weightKg'],'Mifflin-St Jeor inputs');
  if(value.adultScope!==true||!['male','female'].includes(value.sex))fail('Confirm the healthy adult scope and choose an equation.');
  let ageInput;
  if(birthday){const birthDate=calendarDate(value.birthDate);if(birthDate<'0001-01-01')fail('Choose a birth date in year 1 or later.');ageInput={birthDate};}
  else ageInput={age:numeric(value.age,'age',{minimum:19})};
  const resting={mode:value.mode,adultScope:true,sex:value.sex,...ageInput,heightCm:numeric(value.heightCm,'height in cm',{positive:true}),weightKg:numeric(value.weightKg,'weight in kg',{positive:true})};
  if(!birthday&&(!known(restingValue(resting))||restingValue(resting)===0))fail('These inputs do not produce a positive resting energy estimate.');
  return resting;
}

/** Completed calendar years on the viewed date. February 29 advances March 1 in a non-leap year. */
export function projectRestingAge(resting,date){
  calendarDate(date);if(resting===null||resting===undefined)return null;resting=parseResting(resting);
  if(resting.mode==='custom')return null;
  if(resting.mode==='mifflin-st-jeor')return {source:'manual',date,years:resting.age,reasons:[]};
  const reasons=['calendar-age'];
  const age=calendarAge(resting.birthDate,date);
  if(age===null)return {source:'birth-date',date,years:null,reasons:[...reasons,'before-birth']};
  const {years}=age;
  if(years<19)reasons.push('age-outside-adult');
  return {source:'birth-date',date,years,reasons};
}

/** One owner for both active and retained inactive target choices. */
export function parseEnergyTarget(value){
  let target;
  if(value?.mode==='fixed'){
    fields(value,['mode','includeAboveBaseline'],'fixed energy target');target={mode:'fixed',includeAboveBaseline:bool(value.includeAboveBaseline,'whether to add energy above baseline')};
  }else if(value?.mode==='calculated'){
    fields(value,['mode','adjustmentKcal','includeAboveBaseline'],'calculated energy target');target={mode:'calculated',adjustmentKcal:numeric(value.adjustmentKcal,'signed calorie adjustment',{minimum:-1000000}),includeAboveBaseline:bool(value.includeAboveBaseline,'whether to add energy above baseline')};
  }else if(value?.mode==='weight-goal'){
    fields(value,['mode','goal','includeAboveBaseline'],'weight-goal energy target');const goal=parseWeightGoal(value.goal);if(goal===null)fail('Enter explicit weight-goal inputs.');target={mode:'weight-goal',goal,includeAboveBaseline:bool(value.includeAboveBaseline,'whether to add energy above baseline')};
  }else fail('Choose a fixed, calculated or weight-goal energy target.');
  return target;
}

/** One owner for reviewed expenditure inputs, independent of the intake target. */
export function parseEnergyExpenditure(value){
  fields(value,['resting','baseline','activity','thermicEffect'],'energy expenditure');
  const resting=parseResting(value.resting);let baseline,activity;
  if(value.baseline?.mode==='custom'){
    fields(value.baseline,['mode','kcal'],'custom baseline activity');baseline={mode:'custom',kcal:numeric(value.baseline.kcal,'baseline activity kcal')};
  }else if(value.baseline?.mode==='multiplier'){
    fields(value.baseline,['mode','factor'],'baseline activity factor');if(![0,0.2,0.375,0.5,0.9].includes(value.baseline.factor))fail('Choose a supported baseline activity factor.');baseline={mode:'multiplier',factor:value.baseline.factor};
  }else fail('Choose custom baseline activity or an activity factor.');
  if(value.activity?.mode==='manual'){fields(value.activity,['mode'],'manual activity');activity={mode:'manual'};}
  else if(value.activity?.mode==='health-connect'){fields(value.activity,['mode','zone'],'Health Connect activity');activity={mode:'health-connect',zone:zone(value.activity.zone)};}
  else fail('Choose manual or Health Connect activity.');
  return {resting,baseline,activity,thermicEffect:bool(value.thermicEffect,'whether to include the thermic effect of food')};
}

/** Reviewed settings only. Omission never derives inputs from the profile. */
export function parseEnergyPolicy(value){
  if(value===undefined||value===null)return null;
  fields(value,['version','resting','baseline','activity','thermicEffect','target','display'],'energy policy');
  if(value.version!==1)fail('Choose a version 1 energy policy.');
  const {resting,baseline,activity,thermicEffect}=value;
  const expenditure=parseEnergyExpenditure({resting,baseline,activity,thermicEffect}),target=parseEnergyTarget(value.target);
  if(!['remaining','balance'].includes(value.display))fail('Choose remaining or balance display.');
  return {version:1,...expenditure,target,display:value.display};
}

const nullable=value=>finite(value)?value:null;
const sumKnown=values=>values.every(known)?nullable(values.reduce((sum,value)=>sum+value,0)):null;
const difference=(a,b)=>a===null||b===null?null:nullable(a-b);

/** Single energy arithmetic owner. Inputs are unrounded recorded day facts. */
export function calculateEnergy({policy:input,lifeStage=null,date,consumed,configuredTarget,scheduledTarget={present:false,value:null},exerciseEntries=[],biometrics=[],foodTotals={},foodCoverage={},recordedWeightKg=undefined,recordedHeightCm=undefined}){
  calendarDate(date);
  const policy=parseEnergyPolicy(input),reasons=[];
  if(!Array.isArray(exerciseEntries)||!Array.isArray(biometrics)||!scheduledTarget||typeof scheduledTarget.present!=='boolean')fail('Supply recorded exercise, biometrics and an explicit weekday-target presence.');
  consumed=finite(consumed)?consumed:null;configuredTarget=known(configuredTarget)?configuredTarget:null;
  const exercise=sumKnown(exerciseEntries.map(row=>row?.calories));
  if(exercise===null)reasons.push('exercise-unknown');
  const selectedTarget=scheduledTarget.present?(known(scheduledTarget.value)?scheduledTarget.value:null):configuredTarget;
  if(!policy)return {version:1,baselineExpenditure:null,targetAdjustment:null,targetSource:scheduledTarget.present?'weekday':'fixed',consumed,exercise,target:selectedTarget,remaining:difference(selectedTarget,consumed),expenditure:null,balance:null,configuredTarget,targetBaseline:selectedTarget,aboveBaseline:null,components:{resting:null,baseline:null,adjustedBaseline:null,activity:null,thermicEffect:null},activityMode:'unconfigured',device:null,display:'remaining',configured:false,reasons:[...reasons,'expenditure-unconfigured']};

  const age=projectRestingAge(policy.resting,date),mifflin=age!==null;
  let weightKg=policy.resting.weightKg,heightCm=policy.resting.heightCm;
  if(mifflin&&recordedWeightKg!==undefined){
    if(recordedWeightKg!==null&&(!finite(recordedWeightKg)||recordedWeightKg<=0))fail('Recorded weight must be a positive finite kilogram value or null when unknown.');
    weightKg=recordedWeightKg;
    reasons.push('recorded-weight');
  }
  if(mifflin&&recordedHeightCm!==undefined){
    if(recordedHeightCm!==null&&(!finite(recordedHeightCm)||recordedHeightCm<=0))fail('Recorded height must be a positive finite centimetre value or null when unknown.');
    heightCm=recordedHeightCm;
    reasons.push('recorded-height');
    if(recordedHeightCm===null)reasons.push('recorded-height-missing');
  }
  let resting=mifflin&&(age.years===null||age.years<19)?null:restingValue(policy.resting,weightKg,age?.years,heightCm);
  if(!known(resting)||resting===0){
    resting=null;
    reasons.push(mifflin&&(age.years===null||age.years<19)?'resting-outside-adult':recordedHeightCm!==undefined?'resting-body-unavailable':recordedWeightKg!==undefined?'resting-weight-unavailable':'resting-nonpositive');
  }
  if(resting!==null&&mifflin&&policy.resting.sex==='female'&&maternalStage(lifeStage))resting+=300;
  const baseline=policy.baseline.mode==='custom'?policy.baseline.kcal:policy.baseline.factor===0?0:resting===null?null:nullable(resting*policy.baseline.factor);
  // Activity uses the raw estimate. Daily BMR uses tenths of a kcal.
  if(resting!==null&&mifflin)resting=Math.round(resting*10)/10;
  let adjustedBaseline=null,activity=null,device=null;
  if(policy.activity.mode==='manual'){
    const duration=sumKnown(exerciseEntries.map(row=>row?.duration));
    adjustedBaseline=baseline===0?0:baseline===null||duration===null?null:baseline*Math.max(0,1-duration/960);
    if(baseline>0&&duration===null)reasons.push('duration-missing');
    activity=exercise===null||adjustedBaseline===null?null:nullable(adjustedBaseline+exercise);
  }else{
    const rows=biometrics.filter(row=>row?.date===date&&!row.copiedFrom&&row.type==='Active energy'&&row.unit==='kcal'&&row.source?.kind==='health-connect'&&row.source.version===1&&row.source.zone===policy.activity.zone&&row.source.aggregation?.kind==='daily-total'&&row.source.aggregation.metric==='active-calories'&&row.source.aggregation.date===date);
    if(rows.length!==1||!known(rows[0]?.value)||typeof rows[0]?.source.end!=='string')reasons.push(rows.length>1?'device-ambiguous':'device-missing');
    else{
      const row=rows[0];device={zone:policy.activity.zone,end:row.source.end,value:row.value};
      adjustedBaseline=baseline===null?null:Math.max(0,baseline-row.value);activity=baseline===null?null:Math.max(baseline,row.value);
      reasons.push('device-workouts','device-coverage');
    }
  }
  let thermicEffect=0;
  if(policy.thermicEffect){
    const factors={protein:4*0.25,carbs:4*0.075,fat:9*0.015,alcohol:7*0.16};
    thermicEffect=Object.keys(factors).every(key=>known(foodTotals[key])&&foodCoverage[key]?.complete===true)?nullable(Object.entries(factors).reduce((sum,[key,factor])=>sum+foodTotals[key]*factor,0)):null;
    reasons.push('thermic-factors');
    if(thermicEffect===null)reasons.push('thermic-unknown');
  }
  const expenditure=resting===null||activity===null||thermicEffect===null?null:nullable(resting+activity+thermicEffect),aboveBaseline=expenditure===null||baseline===null?null:Math.max(0,expenditure-resting-baseline);
  const goal=policy.target.mode==='weight-goal'?projectWeightGoal(policy.target.goal,date):null;
  if(goal)reasons.push('weight-goal-approximation');
  const adjustmentKcal=goal?goal.adjustmentKcal:policy.target.adjustmentKcal;
  const baselineExpenditure=resting===null||baseline===null?null:nullable(resting+baseline),targetSource=scheduledTarget.present?'weekday':policy.target.mode,targetAdjustment=scheduledTarget.present||policy.target.mode==='fixed'?null:nullable(adjustmentKcal);
  let targetBaseline=scheduledTarget.present?selectedTarget:policy.target.mode==='fixed'?configuredTarget:resting===null||baseline===null||!finite(adjustmentKcal)?null:nullable(resting+baseline+adjustmentKcal);
  if(targetBaseline!==null&&targetBaseline<0){targetBaseline=null;reasons.push('target-negative');}
  const target=targetBaseline===null||policy.target.includeAboveBaseline&&aboveBaseline===null?null:nullable(targetBaseline+(policy.target.includeAboveBaseline?aboveBaseline:0));
  return {version:1,baselineExpenditure,targetAdjustment,targetSource,consumed,exercise,target,remaining:difference(target,consumed),expenditure,balance:difference(expenditure,consumed),configuredTarget,targetBaseline,aboveBaseline,components:{resting,baseline,adjustedBaseline,activity,thermicEffect},activityMode:policy.activity.mode,device,display:policy.display,configured:true,reasons};
}
