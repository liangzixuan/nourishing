import {parseChart} from './chart-metrics.mjs';

const fail=message=>{throw Object.assign(Error(message),{status:400});};
function legacyMetric(value){
  if(typeof value!=='string'||!value)fail('The old chart has an unsupported metric. Keep its original file and review the definition.');
  return value.startsWith('bio:')?{kind:'biometric',type:value.slice(4),unit:null}:{kind:'nutrient',id:value};
}
// This one-way boundary consumes old records. Runtime consumers use V2 only.
export function normalizeChart(record){
  if(record?.version===2)return {chart:parseChart(record),changed:false};
  if(!record||typeof record!=='object'||Array.isArray(record)||Object.keys(record).some(key=>!['id','name','x','y','range'].includes(key)))fail('This chart format is unsupported. Keep its original file and review the definition.');
  if(!Number.isInteger(record.range)||record.range<1||record.range>366)fail('The old chart range must be a whole number from 1 to 366 days. Its source was kept; review that definition before importing.');
  return {chart:parseChart({version:2,...(record.id!==undefined?{id:record.id}:{}),name:record.name,primary:legacyMetric(record.x),secondary:record.y?legacyMetric(record.y):null,days:record.range,visible:true}),changed:true};
}
export function canonicalizeCharts(state){
  const normalized=state.charts.map(normalizeChart),changed=normalized.filter(item=>item.changed).length;
  state.charts=normalized.map(item=>item.chart);return {examined:normalized.length,changed};
}
export function migrateCharts(store){
  const preview=canonicalizeCharts(store.read());if(!preview.changed)return {...preview,recoverySnapshotId:null};
  let result;store.update(state=>{const facts=canonicalizeCharts(state);result={...facts,recoverySnapshotId:store.backup()};});return result;
}
