import {parseProfileDemographics} from './domain/profile-demographics.mjs';
import {calendarAge} from './domain/calendar-age.mjs';
import {date as calendarDate} from './domain/calendar.mjs';
import {parseEnergyPolicy,projectRestingAge} from './domain/energy-policy.mjs';
import {effectiveNutrientReferencePolicy,projectNutrientReferences,nutrientReferenceOptions,NUTRIENT_REFERENCE_SET} from './domain/nutrient-references.mjs';
import {parseBodyCompositionPolicy,bodyMetricOptions,projectBodyComposition,bodyMassIndex} from './domain/body-composition.mjs';
import {createBiometricLibrary,biometricEntryForPair} from './domain/biometric-library.mjs';
import {calculateSummary} from './domain/nutrition.mjs';

export function projectProfileSettings(state,date,revision){
 calendarDate(date);
 const energy=parseEnergyPolicy(state.settings.energyPolicy),references=effectiveNutrientReferencePolicy(state.settings.nutrientReferences,state.settings.nutrientTargetModes),body=parseBodyCompositionPolicy(state.settings.bodyComposition);
 const summary=calculateSummary(state,date),composition=projectBodyComposition(state.biometrics??[],body,date),referenceProjection=projectNutrientReferences(references,date),restingAge=projectRestingAge(energy?.resting,date),library=createBiometricLibrary(state);
 const demographics=restingAge?{source:'energy',age:restingAge.years,sex:energy.resting.sex,birthDate:energy.resting.birthDate??null}:references?{source:'references',age:referenceProjection.age?.years??null,sex:references.sex,birthDate:references.birthDate}:{source:null,age:null,sex:null,birthDate:null};
 const personal=parseProfileDemographics(state.settings.profileDemographics);
 if(personal&&!demographics.source){if(personal.birthDate){demographics.birthDate=personal.birthDate;demographics.age=calendarAge(personal.birthDate,date)?.years??null;}if(personal.sex)demographics.sex=personal.sex;demographics.source='profile';}
 const measurements=Object.fromEntries(['weight','height','bodyFat'].map(kind=>{const value=composition[kind];return [kind,{status:value.status,metric:value.metric,value:value.status==='known'?value.reading.value:null,unit:value.metric?.unit??null,date:value.reading?.date??null,choice:value.metric?biometricEntryForPair(library,value.metric.type,value.metric.unit):null}];}));
 return {revision,date,energy,referenceSet:NUTRIENT_REFERENCE_SET,references,referenceOptions:nutrientReferenceOptions,referenceProjection,body,bodyOptions:bodyMetricOptions(state),composition,effectiveEnergy:summary.energy,profile:{demographics,measurements,bmi:bodyMassIndex(composition.weightKg,composition.heightCm)}};
}
