const invalid=message=>{throw Object.assign(new Error(message),{status:400});};
function exactText(value,name,max){if(typeof value!=='string'||!value.trim()||value.length>max)invalid(`${name} must be nonempty text up to ${max} characters.`);return value;}

/** Identity strings are exact source choices, including their whitespace. */
export function parseBiometricMetric(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['kind','type','unit'].includes(key)))invalid('Chart metric contains invalid fields.');
  if(input.kind!=='biometric')invalid('Choose a biometric metric.');
  const type=exactText(input.type,'Biometric type',100);if(input.unit!==null)exactText(input.unit,'Biometric unit',30);
  return {kind:'biometric',type,unit:input.unit};
}
export function matchesBiometric(row,metric){return metric?.kind==='biometric'&&metric.unit!==null&&row?.type===metric.type&&row?.unit===metric.unit;}

/** All finite readings, ordered by date then saved source order. */
export function biometricObservations(rows,metric){
  if(!Array.isArray(rows))invalid('Biometric observations require daily rows.');const parsed=parseBiometricMetric(metric);
  return rows.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))).flatMap(day=>(day?.biometrics??[]).filter(row=>matchesBiometric(row,parsed)&&Number.isFinite(row.value)).map(row=>({date:day.date,value:row.value,...(typeof row.time==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(row.time)?{time:row.time}:{})})));
}
