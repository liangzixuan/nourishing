import {CYCLE_CAPTURE_VERSION,captureCycleGuidance} from './cycle-guidance.mjs';
import {date,captureCalendar} from './calendar.mjs';
import {parseCycleRecords,cycleMetrics} from './cycle-records.mjs';

const fail=message=>{throw Object.assign(new Error(message),{status:400});};
const metricValue=row=>row?{date:row.date,value:row.value,observedAt:row.observedAt,recordId:row.id,source:structuredClone(row.source)}:null;

/** Source dates are retained. The dashboard selects each metric independently;
 * diary/calendar phase rows never project a phase into today, a gap or a future
 * date. An explicitly unknown newest observation does not fall back to an older
 * known value. Different sources never get combined or ranked. */
export function createCycleView(state,input,{now,timeZone}={}){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='from,to')fail('Choose cycle from and to dates only.');
 const from=date(input.from),to=date(input.to);if(from>to)fail('The cycle end date must not precede its start date.');
 const calendar=captureCalendar(now,timeZone),all=parseCycleRecords(state.cycleRecords),sources=new Map();
 for(const row of all){
  if(!sources.has(row.source.id))sources.set(row.source.id,{sourceId:row.source.id,rows:[]});sources.get(row.source.id).rows.push(row);
 }
 const dashboard=[];
 for(const {sourceId,rows} of sources.values()){
  const latest={};for(const metric of cycleMetrics){
   const eligible=rows.filter(row=>row.metric===metric&&(metric==='phase'?row.date<calendar.today:row.date<=calendar.today)).sort((a,b)=>a.date.localeCompare(b.date));
   latest[metric]=metricValue(eligible.at(-1));
  }
  dashboard.push({sourceId,...latest});
 }
 const records=all.filter(row=>row.date>=from&&row.date<=to).sort((a,b)=>a.date.localeCompare(b.date)||a.source.id.localeCompare(b.source.id)||a.metric.localeCompare(b.metric));
 const days=new Map();
 for(const row of records){
  if(row.date>=calendar.today)continue;
  const key=JSON.stringify([row.date,row.source.id]);
  if(!days.has(key))days.set(key,{date:row.date,sourceId:row.source.id,cycleDay:null,phase:null,temperatureVariation:null});
  days.get(key)[row.metric]=metricValue(row);
 }
 return {version:CYCLE_CAPTURE_VERSION,range:{from,to},calendar,status:all.length?'ready':'empty',dashboard,days:[...days.values()],records:structuredClone(records),rules:["rule.dates", "rule.past", "rule.latest", "rule.temperature", "rule.source"].map(captureCycleGuidance)};
}
