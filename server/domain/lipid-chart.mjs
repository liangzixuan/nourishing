import {lipidUnits,lipidDefinitions,lipidConversionSources,convertLipidValue} from './lipid-units.mjs';

/** A daily lipid panel with one display scale. Keep raw units and exclusions; never derive missing lab results. */
export function captureLipidPanel(days,unit='mmol/L'){
 if(!lipidUnits.includes(unit))throw Object.assign(Error('Choose mmol/L or mg/dL for the lipid panel.'),{status:400});
 const readings=days.flatMap(day=>(day.biometrics??[]).filter(row=>lipidDefinitions.some(definition=>definition.type===row.type)).map((row,sourceOrder)=>{
  const reason=!lipidUnits.includes(row.unit)?'unsupported-unit':!Number.isFinite(row.value)||row.value<0?'invalid-value':null;
  return {recordId:row.id,date:day.date,time:row.time??'',type:row.type,sourceOrder,sourceUnit:row.unit,sourceValue:row.value,unit,value:reason?null:convertLipidValue(row.type,row.value,row.unit,unit),reason};
 }));
 const latest=new Map(readings.map(row=>[JSON.stringify([row.type,row.date]),row]));
 const series=lipidDefinitions.map(({type,name})=>({id:type,name,unit,axis:'left',points:days.map(day=>{
  const selected=latest.get(JSON.stringify([type,day.date]));
  return {date:day.date,value:selected?.value??null,recordId:selected?.recordId??null};
 })}));
 return {series,axisUnits:[{key:'primaryUnit',unit,choices:[...lipidUnits]}],capture:{version:1,selection:'last-saved-reading-per-day',displayUnit:unit,conversion:{sources:[...lipidConversionSources],definitions:lipidDefinitions},readings,excluded:readings.filter(row=>row.reason!==null)}};
}
