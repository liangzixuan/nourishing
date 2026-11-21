import {estimateExercise} from './exercise-estimate.mjs';
import {parseExerciseFields} from './diary-record-fields.mjs';
import {projectBodyComposition,parseBodyCompositionPolicy} from './body-composition.mjs';
import {date as calendarDate} from './calendar.mjs';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
export const walkingEfforts=Object.freeze({'17170':'light','17190':'moderate','17200':'hard','17220':'veryHard'});

function allowedCode(basis,code){
 return basis&&(basis.code===code||Object.hasOwn(walkingEfforts,basis.code)&&Object.hasOwn(walkingEfforts,code));
}

// The creation basis never changes. Keep the selected activity's source facts for offline edits.
export function exerciseSelection(activity,useEstimate){
 return {code:activity.code,description:activity.description,met:activity.met,useEstimate};
}
export function parseExerciseSelection(selection,basis){
 if(!selection||Object.keys(selection).length!==4||!allowedCode(basis,selection.code)||typeof selection.useEstimate!=='boolean'||typeof selection.description!=='string'||!selection.description.trim()||selection.description.length>1000||!Number.isFinite(selection.met)||selection.met<=0)fail('Invalid saved exercise selection.');
 return exerciseSelection(selection,selection.useEstimate);
}

export function savedExerciseSettings(record){
 const basis=record.exerciseBasis;
 if(!basis)return null;
 const selection=record.exerciseSelection??basis;
 if(record.name!==selection.description)return null;
 const activity={code:selection.code,description:selection.description,met:selection.met,source:basis.source};
 const estimate=estimateExercise(activity,{weightKg:basis.weightKg,minutes:record.duration});
 const useEstimate=(selection.useEstimate??(basis.enteredKcal===basis.estimatedKcal))&&record.caloriesBurned===estimate.netKcal;
 return {activity,useEstimate,weight:{status:'known',kilograms:basis.weightKg,source:'recorded'}};
}

export function correctedCatalogExercise(record,changes,groups,chosen){
 const saved=savedExerciseSettings(record),basis=record.exerciseBasis;
 if(!saved||!allowedCode(basis,changes.code)||typeof changes.useEstimate!=='boolean')fail('Choose an activity from this saved exercise.');
 const keys=['date','time','group','duration','code','useEstimate',...(changes.useEstimate?[]:['calories'])];
 if(Object.keys(changes).length!==keys.length||keys.some(key=>!Object.hasOwn(changes,key)))fail('Supply the required exercise calculation fields.');
 const activity=changes.code===saved.activity.code?saved.activity:chosen;
 if(!activity||activity.code!==changes.code||activity.source!==basis.source)fail('Reopen the saved exercise to choose this effort.');
 const estimate=estimateExercise(activity,{weightKg:basis.weightKg,minutes:changes.duration});
 return {...parseExerciseFields({...changes,name:activity.description,calories:changes.useEstimate?estimate.netKcal:changes.calories},groups),exerciseSelection:exerciseSelection(activity,changes.useEstimate)};
}

export function resolveExerciseWeight(state,date){
 calendarDate(date);const policy=parseBodyCompositionPolicy(state.settings.bodyComposition);
 if(policy?.weightMetric){const projection=projectBodyComposition(state.biometrics??[],policy,date);return projection.weight.status==='known'?{status:'known',kilograms:projection.weightKg,source:'biometric',reading:projection.weight.reading,metric:projection.weight.metric}:{status:'unknown',kilograms:null,source:'biometric',reason:projection.weight.status}}
 const kilograms=state.profile.weight;return Number.isFinite(kilograms)&&kilograms>0?{status:'known',kilograms,source:'profile'}:{status:'unknown',kilograms:null,source:'profile',reason:'missing'};
}

export function catalogExerciseRecord(state,input,activity){
 const allowed=['date','time','group','code','duration','weightKg','useEstimate','calories'];
 if(!input||Object.keys(input).some(key=>!allowed.includes(key))||typeof input.useEstimate!=='boolean')fail('Choose the required catalogue exercise fields only.');
 const weight=resolveExerciseWeight(state,input.date);if(weight.status!=='known')fail('Choose a usable weight before estimating exercise.',409);
 if(input.weightKg!==weight.kilograms)fail('Your weight changed. Reopen this exercise to refresh its estimate.',409);
 if(!activity||activity.code!==input.code)fail('Choose a matching catalogue exercise.');
 const calculation=estimateExercise(activity,{minutes:input.duration,weightKg:weight.kilograms}),calories=input.useEstimate?calculation.netKcal:input.calories;
 return {...parseExerciseFields({date:input.date,time:input.time,group:input.group,name:activity.description,duration:input.duration,calories,exerciseBasis:{version:1,edition:calculation.source.edition,code:activity.code,description:activity.description,met:activity.met,weightKg:weight.kilograms,weightSource:weight.source,minutes:input.duration,estimatedKcal:calculation.netKcal,enteredKcal:calories,source:activity.source,date:input.date}},state.settings.groups),exerciseSelection:exerciseSelection(activity,input.useEstimate)};
}
