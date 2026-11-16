import {digest} from './data-codec.mjs';
import {date as calendarDate} from './domain/calendar.mjs';
import {parseEnergyPolicy,parseEnergyExpenditure,projectRestingAge} from './domain/energy-policy.mjs';
import {parseNutrientReferencePolicy,effectiveNutrientReferencePolicy,projectNutrientReferences,nutrientReferenceOptions,NUTRIENT_REFERENCE_SET} from './domain/nutrient-references.mjs';
import {parseBodyCompositionPolicy,bodyMetricOptions,projectBodyComposition,bodyMassIndex} from './domain/body-composition.mjs';
import {createBiometricLibrary,biometricEntryForPair} from './domain/biometric-library.mjs';
import {calculateSummary} from './domain/nutrition.mjs';

export const profileSettingsCommandFields={
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
 if(action.type==='profileSettings.energy'){
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
 const measurements=Object.fromEntries(['weight','height','bodyFat'].map(kind=>{const value=composition[kind];return [kind,{status:value.status,metric:value.metric,value:value.status==='known'?value.reading.value:null,unit:value.metric?.unit??null,date:value.reading?.date??null,choice:value.metric?biometricEntryForPair(library,value.metric.type,value.metric.unit):null}];}));
 return {revision:digest(state),date,energy,referenceSet:NUTRIENT_REFERENCE_SET,references,referenceOptions:nutrientReferenceOptions,referenceProjection,body,bodyOptions:bodyMetricOptions(state),composition,effectiveEnergy:summary.energy,profile:{demographics,measurements,bmi:bodyMassIndex(composition.weightKg,composition.heightCm)}};
}
