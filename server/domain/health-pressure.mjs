const invalid=message=>{throw Object.assign(Error(message),{status:400});};
export const PRESSURE_COMPONENTS=Object.freeze({systolic:{type:'Systolic',minimum:20},diastolic:{type:'Diastolic',minimum:10}});
export const healthPressureContextLabels=Object.freeze({
 'position.0':'Unknown position','position.1':'Standing','position.2':'Sitting','position.3':'Lying down','position.4':'Reclining',
 'location.0':'Unknown measurement location','location.1':'Left wrist','location.2':'Right wrist','location.3':'Left upper arm','location.4':'Right upper arm',
 'position.unknown':'Unknown position code {{code}}','location.unknown':'Unknown measurement location code {{code}}'
});
const contextMessage=(key,values={})=>healthPressureContextLabels[key].replace('{{code}}',String(values.code));
export function parseHealthPressureContext(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='bodyPosition,component,measurementLocation'||typeof value.component!=='string'||!Object.hasOwn(PRESSURE_COMPONENTS,value.component)||!['bodyPosition','measurementLocation'].every(key=>Number.isInteger(value[key])&&value[key]>=0&&value[key]<=2147483647))invalid('Invalid native Health Connect pressure context.');
 return {component:value.component,bodyPosition:value.bodyPosition,measurementLocation:value.measurementLocation};
}
export function describeHealthPressureContext(value,message=contextMessage){const c=parseHealthPressureContext(value),label=(kind,code)=>message(Object.hasOwn(healthPressureContextLabels,kind+'.'+code)?kind+'.'+code:kind+'.unknown',{code});return label('position',c.bodyPosition)+' · '+label('location',c.measurementLocation);}
export const healthNativeType=row=>row.source?.pressureContext!==undefined?'Blood pressure':row.type;
export const healthPressureIdentity=row=>JSON.stringify([row.source.app,row.source.recordId]);
// Pair facts exclude the child component and ID, but retain the original clocks.
export function healthPressurePairKey(row){const s=row.source,c=parseHealthPressureContext(s.pressureContext);return JSON.stringify([s.app,s.recordId,s.start,s.end??null,s.lastModifiedAt??null,s.zone,row.date,row.time,c.bodyPosition,c.measurementLocation]);}
export function validateHealthPressurePairs(rows){
 const parents=new Map();
 for(const row of rows)if(row.source?.pressureContext!==undefined){const id=healthPressureIdentity(row);if(!parents.has(id))parents.set(id,[]);parents.get(id).push(row);}
 for(const rows of parents.values())if(rows.length!==2||new Set(rows.map(r=>r.source.pressureContext.component)).size!==2||healthPressurePairKey(rows[0])!==healthPressurePairKey(rows[1]))invalid('A native blood-pressure import requires both components from the same source revision and measurement.');
}
