import {isWeightUnit} from './weight-units.mjs';

export const isWeightType=type=>['weight','Weight'].includes(type);
const definitions={
 weight:{matches:row=>isWeightType(row.type)&&isWeightUnit(row.unit),configured:state=>state.settings?.dashboard?.weightMetric},
 bodyFat:{matches:row=>['body fat','Body fat'].includes(row.type)&&row.unit==='%',configured:state=>state.settings?.bodyComposition?.bodyFatMetric},
 waist:{matches:row=>row.type==='waist size'&&['cm','in'].includes(row.unit),configured:()=>null},
};
/** Match the Dashboard convention: explicit source first, otherwise the latest known source at the selected date. Never merge identities. */
export function bodyChartSource(state,role,date){
 const definition=definitions[role];
 const records=(state.biometrics??[]).filter(row=>definition.matches(row)&&Number.isFinite(row.value)&&row.date<=date).toSorted((a,b)=>(a.date+(a.time??'')).localeCompare(b.date+(b.time??'')));
 const latest=records.at(-1),metric=definition.configured(state)??(latest?{kind:'biometric',type:latest.type,unit:latest.unit}:null);
 return {metric,records:metric?records.filter(row=>row.type===metric.type&&row.unit===metric.unit):[]};
}
export function weightSeries(state,date){return bodyChartSource(state,'weight',date)}
