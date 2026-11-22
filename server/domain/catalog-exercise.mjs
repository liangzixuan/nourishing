import {weightKilogramsPerUnit} from './weight-units.mjs';
import {walkingEfforts,walkingPreset} from './general-walking.mjs';
import {estimateExercise} from './exercise-estimate.mjs';
import {parseExerciseFields} from './diary-record-fields.mjs';
import {projectBodyComposition,parseBodyCompositionPolicy} from './body-composition.mjs';
import {date as calendarDate} from './calendar.mjs';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
// Retain the recorded speed scale when opening or replaying older entries.
export const priorWalkingEfforts=Object.freeze({'17170':'light','17200':'moderate','17220':'hard','17230':'veryHard'});
const earlierWalkingEfforts=Object.freeze({'17170':'light','17190':'moderate','17200':'hard','17220':'veryHard'});

function walkingChoices(basis,generalWalking){
 if(generalWalking===false)return null;
 if(generalWalking===true&&walkingPreset(basis.code))return walkingEfforts;
 const efforts=generalWalking===true?priorWalkingEfforts:earlierWalkingEfforts;
 return Object.hasOwn(efforts,basis.code)?efforts:null;
}
function allowedCode(basis,code,generalWalking){
 if(!basis)return false;
 const efforts=walkingChoices(basis,generalWalking);
 return efforts?Object.hasOwn(efforts,code):generalWalking!==true&&basis.code===code;
}

// The creation basis never changes. Keep the selected activity's source facts for offline edits.
function exerciseSelection(activity,useEstimate,generalWalking){
 return {code:activity.code,description:activity.description,met:activity.met,useEstimate,...(generalWalking===undefined?{}:{generalWalking})};
}
export function parseExerciseSelection(selection,basis){
 const hasPreset=selection&&Object.hasOwn(selection,'generalWalking');
 if(!selection||Object.keys(selection).length!==(hasPreset?5:4)||(hasPreset&&typeof selection.generalWalking!=='boolean')||!allowedCode(basis,selection.code,selection.generalWalking)||typeof selection.useEstimate!=='boolean'||typeof selection.description!=='string'||!selection.description.trim()||selection.description.length>1000||!Number.isFinite(selection.met)||selection.met<=0)fail('Invalid saved exercise selection.');
 const preset=walkingPreset(selection.code);
 if(preset&&(selection.generalWalking!==true||selection.met!==preset.met||selection.description!==preset.description))fail('Invalid saved walking effort.');
 return exerciseSelection(selection,selection.useEstimate,selection.generalWalking);
}

export function savedExerciseSettings(record){
 const basis=record.exerciseBasis;
 if(!basis)return null;
 const selection=record.exerciseSelection??basis;
 if(record.name!==selection.description)return null;
 const activity={code:selection.code,description:selection.description,met:selection.met,source:basis.source,edition:basis.edition};
 const estimate=estimateExercise(activity,{weightKg:basis.weightKg,minutes:record.duration});
 const useEstimate=(selection.useEstimate??(basis.enteredKcal===basis.estimatedKcal))&&record.caloriesBurned===estimate.netKcal;
 const unit=basis.weightUnit??'kg';
 const reading={value:basis.weightKg/Number(weightKilogramsPerUnit[unit]),unit};
 return {activity,useEstimate,efforts:walkingChoices(basis,selection.generalWalking),weight:{status:'known',kilograms:basis.weightKg,source:'recorded',reading}};
}

export function correctedCatalogExercise(record,changes,groups,chosen){
 const saved=savedExerciseSettings(record),basis=record.exerciseBasis;
 const generalWalking=record.exerciseSelection?.generalWalking;
 if(!saved||!allowedCode(basis,changes.code,generalWalking)||typeof changes.useEstimate!=='boolean')fail('Choose an activity from this saved exercise.');
 const keys=['date','time','group','duration','code','useEstimate',...(changes.useEstimate?[]:['calories'])];
 if(Object.keys(changes).length!==keys.length||keys.some(key=>!Object.hasOwn(changes,key)))fail('Supply the required exercise calculation fields.');
 const activity=changes.code===saved.activity.code?saved.activity:walkingPreset(changes.code)??chosen;
 if(!activity||activity.code!==changes.code||activity.source!==basis.source)fail('Reopen the saved exercise to choose this effort.');
 const estimate=estimateExercise(activity,{weightKg:basis.weightKg,minutes:changes.duration});
 return {...parseExerciseFields({...changes,name:activity.description,calories:changes.useEstimate?estimate.netKcal:changes.calories},groups),exerciseSelection:exerciseSelection(activity,changes.useEstimate,generalWalking)};
}

export function resolveExerciseWeight(state,date){
 calendarDate(date);const policy=parseBodyCompositionPolicy(state.settings.bodyComposition);
 if(policy?.weightMetric){const projection=projectBodyComposition(state.biometrics??[],policy,date);return projection.weight.status==='known'?{status:'known',kilograms:projection.weightKg,source:'biometric',reading:projection.weight.reading,metric:projection.weight.metric}:{status:'unknown',kilograms:null,source:'biometric',reason:projection.weight.status}}
 const kilograms=state.profile.weight;return Number.isFinite(kilograms)&&kilograms>0?{status:'known',kilograms,source:'profile'}:{status:'unknown',kilograms:null,source:'profile',reason:'missing'};
}

export function catalogExerciseRecord(state,input,activity){
 const allowed=['date','time','group','code','duration','weightKg','useEstimate','calories','generalWalking'];
 if(!input||Object.keys(input).some(key=>!allowed.includes(key))||typeof input.useEstimate!=='boolean')fail('Choose the required catalogue exercise fields only.');
 if(walkingPreset(input.code)&&input.generalWalking!==true)fail('Choose a General Walking effort.');
 if(Object.hasOwn(input,'generalWalking')&&(typeof input.generalWalking!=='boolean'||input.generalWalking&&!walkingPreset(input.code)&&!Object.hasOwn(priorWalkingEfforts,input.code)))fail('Choose a valid General Walking effort.');
 const weight=resolveExerciseWeight(state,input.date);if(weight.status!=='known')fail('Choose a usable weight before estimating exercise.',409);
 if(input.weightKg!==weight.kilograms)fail('Your weight changed. Reopen this exercise to refresh its estimate.',409);
 if(!activity||activity.code!==input.code)fail('Choose a matching catalogue exercise.');
 activity=walkingPreset(input.code)??activity;
 const calculation=estimateExercise(activity,{minutes:input.duration,weightKg:weight.kilograms}),calories=input.useEstimate?calculation.netKcal:input.calories;
 return {...parseExerciseFields({date:input.date,time:input.time,group:input.group,name:activity.description,duration:input.duration,calories,exerciseBasis:{version:1,edition:calculation.source.edition,code:activity.code,description:activity.description,met:activity.met,weightKg:weight.kilograms,weightSource:weight.source,...(weight.reading?{weightUnit:weight.reading.unit}:{}),minutes:input.duration,estimatedKcal:calculation.netKcal,enteredKcal:calories,source:activity.source,date:input.date}},state.settings.groups),exerciseSelection:exerciseSelection(activity,input.useEstimate,input.generalWalking)};
}
