import {date as calendarDate} from './calendar.mjs';
const fail=message=>{throw Object.assign(Error(message),{status:400});};
export const maternalStage=value=>value==='pregnant'||value==='lactating';

/** Resolve the stage for the sex whose equation or profile is in use. */
export function profileLifeStage(settings,sex=settings?.energyPolicy?.resting?.sex??settings?.nutrientReferences?.sex??settings?.profileDemographics?.sex){
 if(sex==='male')return 'standard';
 if(sex!=='female')return null;
 for(const source of [settings?.profileDemographics,settings?.nutrientReferences]){
  if(source?.sex===sex&&(source.lifeStage==='standard'||maternalStage(source.lifeStage)))return source.lifeStage;
 }
 return null;
}
/** Translate one profile picker choice into the inputs used by configured calculations. */
export function profileSexInputs(choice){
 if(maternalStage(choice))return {sex:'female',lifeStage:choice};
 if(choice==='male'||choice==='female')return {sex:choice,lifeStage:'standard'};
 fail('Choose a supported sex and life stage.');
}
/** Only explicitly supplied personal facts belong here; no inferred defaults. */
export function parseProfileDemographics(value){
 if(value===null||value===undefined)return null;
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['birthDate','sex','lifeStage'].includes(key)))fail('Choose birthday or sex only.');
 const result={};
 if(Object.hasOwn(value,'birthDate')){result.birthDate=calendarDate(value.birthDate);if(result.birthDate<'0001-01-01')fail('Choose a valid birthday.');}
 if(Object.hasOwn(value,'sex')){if(!['male','female'].includes(value.sex))fail('Choose male or female.');result.sex=value.sex;}
 if(Object.hasOwn(value,'lifeStage')){
  if(!Object.hasOwn(result,'sex')||(value.lifeStage!=='standard'&&!(result.sex==='female'&&maternalStage(value.lifeStage))))fail('Choose a supported sex and life stage.');
  result.lifeStage=value.lifeStage;
 }
 return result;
}
