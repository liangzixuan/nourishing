import {convertGlucoseUnit,glucoseConcentrationUnits} from './glucose-ketones.mjs';
const fail=message=>{throw Object.assign(Error(message),{status:400})};
const fields=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))fail('Choose the required glucose target fields only.')};
const presets=Object.freeze({normal:{unit:'mg/dL',low:70,high:140,fastedHigh:99},diabetic:{unit:'mg/dL',low:80,high:180,fastedHigh:130}});
export function parseCgmTargetRange(input){
 if(input===undefined)return {mode:'normal',custom:null};
 fields(input,['mode','custom']);if(!['normal','diabetic','custom'].includes(input.mode))fail('Choose Normal, Diabetic or Custom Range.');
 const {custom}=input;
 if(custom!==null){
  fields(custom,['unit','low','high','fastedHigh']);if(!glucoseConcentrationUnits.includes(custom.unit))fail('Choose glucose units.');
  const values=Object.fromEntries(['low','high','fastedHigh'].map(key=>[key,convertGlucoseUnit(custom[key],custom.unit,'mg/dL')]));
  if(values.low<55||values.high>200||values.low>=values.high)fail('Choose a lower glucose bound below the upper bound, within 55–200 mg/dL.');
  if(values.fastedHigh<values.low||values.fastedHigh>values.high)fail('Keep the fasting maximum between the lower and upper glucose bounds.');
 }else if(input.mode==='custom')fail('Set the custom glucose range.');
 return {mode:input.mode,custom:custom===null?null:{...custom}};
}
export function captureCgmTargetRange(input,unit){
 const settings=parseCgmTargetRange(input),project=value=>({unit,...Object.fromEntries(['low','high','fastedHigh'].map(key=>[key,convertGlucoseUnit(value[key],value.unit,unit)]))});
 const options={normal:project(presets.normal),diabetic:project(presets.diabetic),custom:project(settings.custom??presets[settings.mode]??presets.normal)};
 const outerLow=convertGlucoseUnit(55,'mg/dL',unit),outerHigh=convertGlucoseUnit(200,'mg/dL',unit),step=unit==='mg/dL'?1:0.1;
 return {mode:settings.mode,active:options[settings.mode],options,outerLow,outerHigh,controls:{min:Math.ceil(outerLow/step)*step,max:Math.floor(outerHigh/step)*step,step}};
}
