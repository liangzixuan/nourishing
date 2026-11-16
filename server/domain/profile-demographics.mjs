import {date as calendarDate} from './calendar.mjs';
const fail=message=>{throw Object.assign(Error(message),{status:400});};
/** Only explicitly supplied personal facts belong here; no inferred defaults. */
export function parseProfileDemographics(value){
 if(value===null||value===undefined)return null;
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['birthDate','sex'].includes(key)))fail('Choose birthday or sex only.');
 const result={};
 if(Object.hasOwn(value,'birthDate')){result.birthDate=calendarDate(value.birthDate);if(result.birthDate<'0001-01-01')fail('Choose a valid birthday.');}
 if(Object.hasOwn(value,'sex')){if(!['male','female'].includes(value.sex))fail('Choose male or female.');result.sex=value.sex;}
 return result;
}
