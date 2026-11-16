import {act} from './domain/workspace.mjs';
import {parseProfileDemographics} from './domain/profile-demographics.mjs';
import {calendarAge} from './domain/calendar-age.mjs';
import {digest} from './data-codec.mjs';
import {date as calendarDate} from './domain/calendar.mjs';
import {parseEnergyPolicy,parseEnergyExpenditure,projectRestingAge} from './domain/energy-policy.mjs';
import {parseNutrientReferencePolicy,effectiveNutrientReferencePolicy,projectNutrientReferences,nutrientReferenceOptions,NUTRIENT_REFERENCE_SET} from './domain/nutrient-references.mjs';
import {parseBodyCompositionPolicy,bodyMetricOptions,projectBodyComposition,bodyMassIndex} from './domain/body-composition.mjs';
import {createBiometricLibrary,biometricEntryForPair} from './domain/biometric-library.mjs';
import {calculateSummary} from './domain/nutrition.mjs';

export const profileSettingsCommandFields={
 'profileSettings.demographic':['field','value','date'],
 'profileSettings.measurement':['kind','value','unit','date','time'],
 'profileSettings.energy':['resting','baseline'],
 'profileSettings.references':['policy'],
 'profileSettings.body':['policy'],
};
const fail=message=>{throw Object.assign(Error(message),{status:400});};

/** Narrow edits retain the settings owned by the other target editors. */
export function prepareProfileSettingsCommand(state,action){
 if(!Object.hasOwn(profileSettingsCommandFields,action.type))return action;
 const keys=profileSettingsCommandFields[action.type],p=action.payload;
 if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).length!==keys.length||keys.some(key=>!Object.hasOwn(p,key)))fail('Choose the required profile settings only.');
 let patch;
 if(action.type==='profileSettings.demographic'){
  calendarDate(p.date);if(!['birthDate','sex'].includes(p.field))fail('Choose birthday or sex.');
  const personal=parseProfileDemographics({...state.settings.profileDemographics,[p.field]:p.value});
  if(personal.birthDate&&personal.birthDate>p.date)fail('Birthday cannot be in the future.');
  patch={profileDemographics:personal};
  const energy=parseEnergyPolicy(state.settings.energyPolicy);
  if(energy&&energy.resting.mode!=='custom'){const resting={...energy.resting,[p.field]:p.value};if(p.field==='birthDate'){resting.mode='mifflin-st-jeor-birthday';delete resting.age;}patch.energyPolicy=parseEnergyPolicy({...energy,resting});}
  if(state.settings.nutrientReferences)patch.nutrientReferences=parseNutrientReferencePolicy({...state.settings.nutrientReferences,[p.field]:p.value});
 }else if(action.type==='profileSettings.energy'){
  const previous=parseEnergyPolicy(state.settings.energyPolicy);
  const expenditure=parseEnergyExpenditure({resting:p.resting,baseline:p.baseline,activity:previous?.activity??{mode:'manual'},thermicEffect:previous?.thermicEffect??false});
  patch={energyPolicy:parseEnergyPolicy({version:1,...expenditure,target:previous?.target??{mode:'calculated',adjustmentKcal:0,includeAboveBaseline:false},display:previous?.display??'remaining'})};
 }else if(action.type==='profileSettings.references')patch={nutrientReferences:parseNutrientReferencePolicy(p.policy)};
 else patch={bodyComposition:parseBodyCompositionPolicy(p.policy)};
 return {type:'settings.save',payload:patch};
}

export function profileSettingsView(state,date){
 calendarDate(date);
 const energy=parseEnergyPolicy(state.settings.energyPolicy),references=effectiveNutrientReferencePolicy(state.settings.nutrientReferences,state.settings.nutrientTargetModes),body=parseBodyCompositionPolicy(state.settings.bodyComposition);
 const summary=calculateSummary(state,date),composition=projectBodyComposition(state.biometrics??[],body,date),referenceProjection=projectNutrientReferences(references,date),restingAge=projectRestingAge(energy?.resting,date),library=createBiometricLibrary(state);
 const demographics=restingAge?{source:'energy',age:restingAge.years,sex:energy.resting.sex,birthDate:energy.resting.birthDate??null}:references?{source:'references',age:referenceProjection.age?.years??null,sex:references.sex,birthDate:references.birthDate}:{source:null,age:null,sex:null,birthDate:null};
 const personal=parseProfileDemographics(state.settings.profileDemographics);
 if(personal&&!demographics.source){if(personal.birthDate){demographics.birthDate=personal.birthDate;demographics.age=calendarAge(personal.birthDate,date)?.years??null;}if(personal.sex)demographics.sex=personal.sex;demographics.source='profile';}
 const measurements=Object.fromEntries(['weight','height','bodyFat'].map(kind=>{const value=composition[kind];return [kind,{status:value.status,metric:value.metric,value:value.status==='known'?value.reading.value:null,unit:value.metric?.unit??null,date:value.reading?.date??null,choice:value.metric?biometricEntryForPair(library,value.metric.type,value.metric.unit):null}];}));
 return {revision:digest(state),date,energy,referenceSet:NUTRIENT_REFERENCE_SET,references,referenceOptions:nutrientReferenceOptions,referenceProjection,body,bodyOptions:bodyMetricOptions(state),composition,effectiveEnergy:summary.energy,profile:{demographics,measurements,bmi:bodyMassIndex(composition.weightKg,composition.heightCm)}};
}

/** Profile record and selected series commit together under the workspace receipt. */
export function applyProfileSettingsCommand(state,action){
 if(action.type!=='profileSettings.measurement'){const prepared=prepareProfileSettingsCommand(state,action);return act(state,prepared.type,prepared.payload);}
 const p=action.payload,keys=profileSettingsCommandFields[action.type];
 if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).length!==keys.length||keys.some(k=>!Object.hasOwn(p,k)))fail('Choose the required profile fields only.');
 const units={weight:['kg','lb','lbs','st'],height:['cm','in','m','ft'],bodyFat:['%']};
 if(!Object.hasOwn(units,p.kind)||!units[p.kind].includes(p.unit)||typeof p.value!=='number'||!Number.isFinite(p.value)||p.value<(p.kind==='bodyFat'?0:Number.MIN_VALUE)||p.value>(p.kind==='bodyFat'?100:1000000))fail('Enter a valid measurement and unit.');
 calendarDate(p.date);
 const previous=parseBodyCompositionPolicy(state.settings.bodyComposition),key=p.kind+'Metric',type=previous?.[key]?.type??{weight:'Weight',height:'Height',bodyFat:'Body fat'}[p.kind];
 const policy=parseBodyCompositionPolicy({...previous??{version:2,weightMetric:null,heightMetric:null,bodyFatMetric:null,useForResting:false,useHeightForResting:false,useForKeto:false},[key]:{kind:'biometric',type,unit:p.unit}});
 // Validate and apply on a candidate so a failed field never leaves partial state.
 const candidate=structuredClone(state);act(candidate,'biometric.add',{date:p.date,time:p.time,type,unit:p.unit,value:p.value});act(candidate,'settings.save',{bodyComposition:policy});
 state.biometrics=candidate.biometrics;state.settings=candidate.settings;
 return {kind:'biometric',id:state.biometrics.at(-1).id};
}
