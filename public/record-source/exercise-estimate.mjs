import {exerciseLimits} from '../offline-source/server/diary-record-fields.mjs';
const fail=message=>{throw Object.assign(new Error(message),{status:400})};

/** Published oxygen-based conversion; source MET is retained, never rewritten. */
export function estimateExercise(activity,{minutes,weightKg}){
 if(activity?.conflict)throw Object.assign(new Error('The official sources disagree on this activity. Enter a custom calorie value instead.'),{status:409});
 if(!Number.isFinite(minutes)||minutes<exerciseLimits.minimumMinutes||minutes>exerciseLimits.maximumMinutes)fail('Choose a duration from 0.01 to 1440 minutes.');
 if(!Number.isFinite(weightKg)||weightKg<=0)fail('Provide a positive measured weight in kilograms.');
 if(!Number.isFinite(activity?.met)||activity.met<=0)fail('Choose a valid source activity.');
 const restingKcal=3.5*weightKg/200*minutes,grossKcal=activity.met*restingKcal,netKcal=Math.max(activity.met-1,0)*restingKcal;
 if(!Number.isFinite(grossKcal)||!Number.isFinite(restingKcal)||!Number.isFinite(netKcal))fail('The exercise inputs exceed the calculation range.');
 return {version:1,method:'net-met-oxygen-v1',source:{edition:activity.edition??'2024 Adult Compendium',code:activity.code,description:activity.description,met:activity.met,url:activity.source},minutes,weightKg,grossKcal,restingKcal,netKcal,recordable:netKcal<=exerciseLimits.maximumKcal};
}

export function exerciseQuery(params,kind){
 const required=kind==='estimate'?['code','minutes','weightKg']:[],allowed=kind==='estimate'?required:['q','heading'];
 if([...params.keys()].some(key=>!allowed.includes(key)||params.getAll(key).length!==1)||required.some(key=>!params.has(key)))fail('Choose the required exercise query fields only.');
 if(kind!=='estimate')return {q:params.get('q')??'',heading:params.get('heading')??null};
 const number=key=>{const text=params.get(key);if(!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text))fail('Provide a numeric '+key+'.');return Number(text)};
 return {code:params.get('code'),minutes:number('minutes'),weightKg:number('weightKg')};
}
