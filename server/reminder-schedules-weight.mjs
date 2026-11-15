// Adapted from cronometer-local/server/weight-reminder.mjs; only import paths changed.
import {isWeightUnit,weightUnits} from './domain/weight-units.mjs';
import {Temporal} from '@js-temporal/polyfill';
import {date} from './domain/calendar.mjs';
import {parseBiometricMetric,matchesBiometric} from './domain/biometric-metrics.mjs';
import {bodyMetricOptions} from './domain/body-composition.mjs';
import {biometricCatalogDefinition} from './domain/biometric-library.mjs';

export function parseWeightReminderMetric(input){
  const metric=parseBiometricMetric(input);
  if(!isWeightUnit(metric.unit))throw Object.assign(Error('Choose the exact weight metric recorded in kg, lb, lbs or st.'),{status:400});
  return metric;
}
export function weightReminderMetricOptions(state){
  const type=biometricCatalogDefinition('weight').type,options=weightUnits.map(unit=>({metric:{kind:'biometric',type,unit},name:type,unit})),seen=new Set(options.map(row=>JSON.stringify(row.metric)));
  for(const row of bodyMetricOptions(state).weight){const key=JSON.stringify(row.metric);if(!seen.has(key)){seen.add(key);options.push(row);}}
  return options;
}
/** The recorded diary date is explicit. It does not claim an original entry timestamp. */
export function weightReminderBasis(workspace,metric,through){
  date(through);parseWeightReminderMetric(metric);if(!Array.isArray(workspace.biometrics))return {status:'unknown',lastDate:null,dueDate:null};
  let latest=null;
  for(const row of workspace.biometrics){
    if(!matchesBiometric(row,metric))continue;
    try{date(row.date);}catch(error){if(error.status===400)return {status:'unknown',lastDate:null,dueDate:null};throw error;}
    if(row.date<=through&&(latest===null||row.date>latest))latest=row.date;
  }
  if(latest===null)return {status:'empty',lastDate:null,dueDate:null};
  const dueDate=Temporal.PlainDate.from(latest).add({days:7}).toString();
  return {status:'known',lastDate:latest,dueDate};
}
