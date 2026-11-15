import {DiaryRecordError} from './diary-record-errors.mjs';
import {isStoolScaleMetric,parseStoolType} from './stool-scale.mjs';
import {date} from './../../report-source/server/calendar.mjs';
export const exerciseLimits=Object.freeze({minimumMinutes:0.01,maximumMinutes:1440,maximumKcal:50000});
export const waterLimits=Object.freeze({minimumMl:0.01,maximumMl:20000});
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
const failRecord=code=>{throw new DiaryRecordError(code);};
export function requiredRecordGroup(value,groups){if(typeof value!=='string'||!groups.includes(value))failRecord('group');return value;}
export function text(value,name,max=10000){if(typeof value!=='string'||!value.trim()||value.length>max)fail(`${name} must be nonempty text (up to ${max} characters).`);return value.trim();}
export function time(value){if(value!==undefined&&value!==''&&(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)))failRecord('time');return value||'';}
export function parseFoodDiaryFields(input,groups){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==3||!['date','time','group'].every(key=>Object.hasOwn(input,key)))failRecord('foodFields');
 if(typeof input.time!=='string')failRecord('timeField');
 requiredRecordGroup(input.group,groups);
 return {date:date(input.date),time:time(input.time),group:input.group};
}
export function optionalRecordGroup(input,groups){
 if(!Object.hasOwn(input,'group'))return {};
 const group=input.group===null?null:biometricIdentity(input.group,'Group',100);
 if(group!==null&&groups&&!groups.includes(group))failRecord('optionalGroup');
 return {group};
}
export function parseNoteFields(input){return {date:date(input.date),text:text(input.text,'Note',100000),time:time(input.time)};}
export function parseExerciseFields(input,groups){
 requiredRecordGroup(input.group,groups);
 return {date:date(input.date),name:text(input.name,'Exercise',300),duration:number(input.duration,'Minutes',exerciseLimits.minimumMinutes,exerciseLimits.maximumMinutes),caloriesBurned:number(input.calories,'Energy',0,exerciseLimits.maximumKcal),kind:'exercise',group:input.group,time:time(input.time),amount:1,...(input.exerciseBasis===undefined?{}:{exerciseBasis:parseExerciseBasis(input.exerciseBasis)})};
}
/** Historical creation facts: corrections change diary fields, never this snapshot. */
export function parseExerciseBasis(value){
 const keys=['version','edition','code','description','met','weightKg','weightSource','minutes','estimatedKcal','enteredKcal','source','date'];
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key))||value.version!==1)fail('Choose a complete exercise calculation snapshot.');
 if(typeof value.code!=='string'||!/^\d{5}$/.test(value.code)||!['profile','biometric'].includes(value.weightSource)||typeof value.source!=='string'||!value.source.startsWith('https://pacompendium.com/'))fail('Invalid exercise calculation source.');
 return {version:1,edition:text(value.edition,'Exercise edition',100),code:value.code,description:text(value.description,'Source activity',1000),met:number(value.met,'Source MET',Number.MIN_VALUE,Number.MAX_VALUE),weightKg:number(value.weightKg,'Calculation weight',Number.MIN_VALUE,Number.MAX_VALUE),weightSource:value.weightSource,minutes:number(value.minutes,'Calculation minutes',exerciseLimits.minimumMinutes,exerciseLimits.maximumMinutes),estimatedKcal:number(value.estimatedKcal,'Estimated energy',0,Number.MAX_VALUE),enteredKcal:number(value.enteredKcal,'Entered energy',0,exerciseLimits.maximumKcal),source:text(value.source,'Exercise source',2048),date:date(value.date)};
}
export function number(value,name,min=0,max=10000000){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail(`${name} must be a number from ${min} to ${max}.`);return value;}
export function biometricIdentity(value,label,max){if(typeof value!=='string'||!value.trim()||value.length>max)fail(`${label} must be nonempty text up to ${max} characters.`);return value;}
export function parseBiometricFields(input){return {date:date(input.date),type:biometricIdentity(input.type,'Biometric',100),value:isStoolScaleMetric(input.type,input.unit)?parseStoolType(input.value):number(input.value,'Value',-1000000,1000000),unit:biometricIdentity(input.unit||'unit','Unit',30),time:time(input.time)};}
