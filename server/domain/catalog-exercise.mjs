import {estimateExercise} from './exercise-estimate.mjs';
import {parseExerciseFields} from './diary-record-fields.mjs';
import {projectBodyComposition,parseBodyCompositionPolicy} from './body-composition.mjs';
import {date as calendarDate} from './calendar.mjs';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};

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
 return parseExerciseFields({date:input.date,time:input.time,group:input.group,name:activity.description,duration:input.duration,calories,exerciseBasis:{version:1,edition:calculation.source.edition,code:activity.code,description:activity.description,met:activity.met,weightKg:weight.kilograms,weightSource:weight.source,minutes:input.duration,estimatedKcal:calculation.netKcal,enteredKcal:calories,source:activity.source,date:input.date}},state.settings.groups);
}
