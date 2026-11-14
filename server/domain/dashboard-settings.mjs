import {parseMetric} from './chart-metrics.mjs';

export const dashboardWidgetKeys=Object.freeze(['energy','weight','fasting','nutrition','coach','streaks','sleep','glucose','cycle']);
const invalid=message=>{throw Object.assign(new Error(message),{status:400});};
const fields=(value,keys,name)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||Object.keys(value).some(key=>!keys.includes(key)))invalid(`${name} must contain exactly ${keys.join(', ')}.`);};

export function defaultDashboardSettings(){return {widgets:Object.fromEntries(dashboardWidgetKeys.map(key=>[key,!['glucose','cycle'].includes(key)])),weightMetric:null};}
export function parseDashboardSettings(input){
  fields(input,['widgets','weightMetric'],'Dashboard settings');
  const presentKeys=dashboardWidgetKeys.filter(key=>!['streaks','sleep','glucose','cycle'].includes(key)||Object.hasOwn(input.widgets??{},key));fields(input.widgets,presentKeys,'Dashboard widgets');
  const widgets={};for(const key of presentKeys){if(typeof input.widgets[key]!=='boolean')invalid('Dashboard widget visibility must be boolean.');widgets[key]=input.widgets[key];}
  let weightMetric=null;
  if(input.weightMetric!==null){weightMetric=parseMetric(input.weightMetric);if(weightMetric.kind!=='biometric')invalid('Choose an exact biometric series for the dashboard weight card.');}
  return {widgets,weightMetric};
}
/** Omission projects defaults without asserting or storing a preference. */
export function projectDashboardSettings(input){if(input===undefined)return defaultDashboardSettings();const parsed=parseDashboardSettings(input);return {...parsed,widgets:{streaks:true,sleep:true,glucose:false,cycle:false,...parsed.widgets}};}
