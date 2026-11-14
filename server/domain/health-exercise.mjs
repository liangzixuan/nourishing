import {HEALTH_EXERCISE_TYPES} from './health-exercise-types.mjs';
const invalid=message=>{throw Object.assign(Error(message),{status:400});};

/** Source session facts; absence and empty text are different native values. */
export function parseHealthExerciseContext(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['exerciseType','title','notes'].includes(k))||!Number.isInteger(value.exerciseType)||value.exerciseType<0||value.exerciseType>2147483647)invalid('Invalid Health Connect exercise context.');
 const result={exerciseType:value.exerciseType};
 for(const key of ['title','notes'])if(Object.hasOwn(value,key)){if(typeof value[key]!=='string')invalid('Invalid native exercise '+key+'.');result[key]=value[key];}
 return result;
}
const exerciseMessage=(key,{code})=>{if(key==='unknown')return 'Unknown exercise type code '+code;const words=HEALTH_EXERCISE_TYPES[code].slice('EXERCISE_TYPE_'.length).toLowerCase().replaceAll('_',' ');return words[0].toUpperCase()+words.slice(1);};
export function describeHealthExerciseType(code,message=exerciseMessage){const value=parseHealthExerciseContext({exerciseType:code}).exerciseType;return message(Object.hasOwn(HEALTH_EXERCISE_TYPES,value)?String(value):'unknown',{code:value});}
