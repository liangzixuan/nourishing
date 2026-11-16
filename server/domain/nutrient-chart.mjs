import {captureNutrientChartReadings} from './glucose-timeline.mjs';

/** Sparse diary-clock buckets. Missing times never acquire an invented midnight. */
export function groupedNutrientSeries(state,range,days,metric,grouping){
 if(!['hour','minute'].includes(grouping))throw Object.assign(Error('Choose Hour or Minute grouping.'),{status:400});
 const captured=captureNutrientChartReadings(state,range,metric),eligibleDates=new Set(days.map(day=>day.date)),width=grouping==='hour'?60:1;
 const readings=captured.readings.filter(row=>eligibleDates.has(row.date)),untimed=[],buckets=new Map();
 for(const row of readings){
  if(!row.eligible)continue;if(!row.position){untimed.push(row);continue;}
  const offset=Math.floor(row.position.offsetMinutes/width)*width,time=grouping==='hour'?row.time.slice(0,2)+':00':row.time;
  if(!buckets.has(offset))buckets.set(offset,{date:row.date,time,offsetMinutes:offset,value:null,coverage:{known:0,total:0,complete:true},records:[]});
  const bucket=buckets.get(offset);bucket.records.push({collection:row.collection,id:row.id});
  const coverage=row.coverage??{known:0,total:1,complete:false};bucket.coverage.known+=coverage.known;bucket.coverage.total+=coverage.total;bucket.coverage.complete&&=coverage.complete;
  if(typeof row.value==='number'&&Number.isFinite(row.value))bucket.value=(bucket.value??0)+row.value;
 }
 const ordered=[...buckets.values()].sort((a,b)=>a.offsetMinutes-b.offsetMinutes),points=[];
 for(const bucket of ordered){
  const previous=points.at(-1);
  if(previous&&bucket.offsetMinutes-previous.offsetMinutes>width){
   const offsetMinutes=previous.offsetMinutes+width,iso=new Date(Date.parse(range.from+'T00:00:00Z')+offsetMinutes*60000).toISOString();
   points.push({date:iso.slice(0,10),time:iso.slice(11,16),offsetMinutes,value:null,gap:true});
  }
  points.push(bucket);
 }
 const capture={...captured,readings,untimed,buckets:ordered,grouping,clock:'recorded-diary-date-and-time'};
 return {id:'primary',name:captured.info.name,unit:captured.info.unit,axis:'left',metric:captured.metric,points,capture};
}
