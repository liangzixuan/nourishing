import {CaptureValidationError} from './capture-errors.js';
import {isProfileGuidance,formatProfileGuidance,PRINT_PROFILE_VERSION} from './../server/profile-guidance.mjs';
import {formatMessage} from './message-format.js';
import {weightUnits} from './../server/weight-units.mjs';
const invalid=()=>{throw new CaptureValidationError('profileReport');};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
export function validatePrintProfile(profile,calendar){
  if(!exact(profile,['version','date','name','age','sex','height','weight','bmi','resting','stored','notice'])||profile.version!==PRINT_PROFILE_VERSION||profile.date!==calendar.today||(profile.name!==null&&typeof profile.name!=='string')||!isProfileGuidance(profile.notice,'notice'))invalid();
  for(const key of ['age','sex','height','weight','bmi','resting']){
    const row=profile[key];if(!exact(row,['value','unit','basis'])||!isProfileGuidance(row.basis,key))invalid();
    const units={age:['years'],sex:[''],height:['cm','m','in','ft'],weight:weightUnits,bmi:['kg/m²'],resting:['kcal/day']};
    if(!units[key].includes(row.unit))invalid();
    if(key==='sex'){if(row.value!==null&&!['male','female'].includes(row.value))invalid();}
    else if(row.value!==null&&(!Number.isFinite(row.value)||(key==='age'?row.value<0:row.value<=0)))invalid();
  }
  if(profile.bmi.value!==null&&(profile.height.value===null||profile.weight.value===null))invalid();
  if(!profile.stored||typeof profile.stored!=='object'||Array.isArray(profile.stored))invalid();
  for(const [key,value]of Object.entries(profile.stored))if(['age','height','weight'].includes(key)?!Number.isFinite(value)||value<=0:!['activity','goal','units'].includes(key)||typeof value!=='string')invalid();
}
export const printProfileLabels={age:'Age',sex:'Sex (equation input)',height:'Current height',weight:'Current weight',bmi:'BMI',resting:'BMR / resting energy'};

export const printProfileNote=(note,language='en')=>language==='en'?note.text:formatProfileGuidance(note,(key,values)=>formatMessage(language,'profileGuidance.'+key,values));
