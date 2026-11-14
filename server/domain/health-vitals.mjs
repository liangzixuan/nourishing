const invalid=message=>{throw Object.assign(Error(message),{status:400});};
export const HEALTH_VITALS=Object.freeze(Object.fromEntries(Object.entries({
 'Body temperature':{unit:'°C',prefix:'body-temperature',minimum:0,maximum:100},
 'Body water mass':{unit:'kg',prefix:'body-water-mass',minimum:0,maximum:1000},
 'Resting heart rate':{unit:'bpm',prefix:'resting-heart-rate',minimum:0,maximum:300,whole:true},
 'HRV (RMSSD)':{unit:'ms',prefix:'hrv-rmssd',minimum:1,maximum:200},
 'Oxygen saturation':{unit:'%',prefix:'oxygen-saturation',minimum:0,maximum:100},
 'Respiratory rate':{unit:'brpm',prefix:'respiratory-rate',minimum:0,maximum:1000}
}).map(([type,spec])=>[type,Object.freeze(spec)])));
export function parseHealthTemperatureContext(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).join(',')!=='measurementLocation'||!Number.isInteger(value.measurementLocation)||value.measurementLocation<0||value.measurementLocation>2147483647)invalid('Invalid native Health Connect temperature location.');
 return {measurementLocation:value.measurementLocation};
}
const locations=['Unknown temperature location','Armpit','Finger','Forehead','Mouth','Rectum','Temporal artery','Toe','Ear','Wrist','Vagina'];
export const healthTemperatureContextLabels=Object.freeze(Object.fromEntries(locations.map((label,code)=>['location.'+code,label])));
const temperatureMessage=(key,{code})=>healthTemperatureContextLabels[key]??('Unknown temperature location code '+code);
export function describeHealthTemperatureContext(value,message=temperatureMessage){const {measurementLocation:code}=parseHealthTemperatureContext(value),key='location.'+code;return message(Object.hasOwn(healthTemperatureContextLabels,key)?key:'location.unknown',{code});}
export function validateHealthVital(source,row){
 if(Object.hasOwn(HEALTH_VITALS,row.type)){
  const spec=HEALTH_VITALS[row.type];
  if(row.unit!==spec.unit||!Number.isFinite(row.value)||row.value<spec.minimum||row.value>spec.maximum||spec.whole&&!Number.isInteger(row.value)||source.aggregation||!source.start||source.end!==undefined||!source.lastModifiedAt||source.id!==spec.prefix+':'+source.recordId)invalid('Invalid native '+row.type+' value, unit or source identity.');
  if(row.type==='Body temperature'&&source.temperatureContext===undefined)invalid('Native body temperature requires its recorded measurement location.');
 }
 if(source.temperatureContext!==undefined&&row.type!=='Body temperature')invalid('Native temperature location requires a Body temperature record.');
}
