import {SLEEP_STAGES} from './sleep-contract.mjs';
import {parseHealthExerciseContext} from './health-exercise.mjs';
import {parseHealthTemperatureContext,validateHealthVital} from './health-vitals.mjs';
import {parseHealthPressureContext,PRESSURE_COMPONENTS} from './health-pressure.mjs';
import {parseHealthGlucoseContext} from './health-glucose.mjs';
import { date, captureCalendar } from './calendar.mjs';

const invalid=message=>{throw Object.assign(new Error(message),{status:400});};
const aggregateMetrics={steps:{type:'Steps',unit:'count',prefix:'steps'},'active-calories':{type:'Active energy',unit:'kcal',prefix:'active-energy-daily'}};
const string=(value,name,max=1000)=>{if(typeof value!=='string'||!value.trim()||value.length>max)invalid(`Invalid Health Connect ${name}.`);return value;};
export function healthTimestamp(value,name){string(value,name,100);if(!/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value)))invalid(`Invalid Health Connect ${name}.`);const calendar=new Date(value.slice(0,10)+'T12:00:00Z');if(calendar.toISOString().slice(0,10)!==value.slice(0,10))invalid(`Invalid Health Connect ${name}.`);return value;}
// Health Connect Instant values carry nanoseconds. Preserve their original offset
// and precision while comparing instants independently of display formatting.
export function healthInstant(value){const fraction=(value.match(/\.(\d+)(?:Z|[+-])/)?.[1]||'').padEnd(9,'0');return BigInt(Date.parse(value))*1000000n+BigInt(fraction.slice(3));}
export {SLEEP_STAGES} from './sleep-contract.mjs';
// A nested stage list cannot exceed the Health Connect export's record budget.
export const MAX_SLEEP_STAGES=100000;
export function parseSleepStages(value,{start,end}={}){
  if(value===undefined)return undefined;
  healthTimestamp(start,'sleep start');healthTimestamp(end,'sleep end');
  const first=healthInstant(start),last=healthInstant(end);
  if(last<first||!Array.isArray(value)||value.length>MAX_SLEEP_STAGES)invalid('Invalid Health Connect sleep stage list.');
  let previous=first;
  return Array.from(value,span=>{
    if(!span||typeof span!=='object'||Array.isArray(span)||Object.keys(span).sort().join(',')!=='end,stage,start'||!SLEEP_STAGES.includes(span.stage))invalid('Invalid Health Connect sleep stage.');
    healthTimestamp(span.start,'stage start');healthTimestamp(span.end,'stage end');
    const left=healthInstant(span.start),right=healthInstant(span.end);
    if(left<first||right>last||right<=left||left<previous)invalid('Sleep stages must be ordered, nonoverlapping positive intervals within their session.');
    previous=right;return {start:span.start,end:span.end,stage:span.stage};
  });
}
export function healthSource(value){
  if(!value||value.kind!=='health-connect'||value.version!==1)invalid('Invalid Health Connect provenance.');
  const result={kind:'health-connect',version:1,id:string(value.id,'record ID'),app:string(value.app,'source app'),recordId:string(value.recordId,'native record ID'),exportedAt:healthTimestamp(value.exportedAt,'export time'),zone:string(value.zone,'time zone',100)};
  try{new Intl.DateTimeFormat('en',{timeZone:result.zone});}catch{invalid('Invalid Health Connect time zone.');}
  if(value.lastModifiedAt!==undefined)result.lastModifiedAt=healthTimestamp(value.lastModifiedAt,'modification time');
  for(const key of ['start','end'])if(value[key]!==undefined){healthTimestamp(value[key],key);result[key]=value[key];}
  if(result.start&&result.end&&healthInstant(result.end)<healthInstant(result.start))invalid('Health Connect interval ends before it starts.');
  if(Object.hasOwn(value,'exerciseContext'))result.exerciseContext=parseHealthExerciseContext(value.exerciseContext);
  if(Object.hasOwn(value,'temperatureContext'))result.temperatureContext=parseHealthTemperatureContext(value.temperatureContext);
  if(Object.hasOwn(value,'pressureContext'))result.pressureContext=parseHealthPressureContext(value.pressureContext);
  if(Object.hasOwn(value,'glucoseContext'))result.glucoseContext=parseHealthGlucoseContext(value.glucoseContext);
  if(Object.hasOwn(value,'sleepStages'))result.sleepStages=parseSleepStages(value.sleepStages,result);
  if(value.aggregation!==undefined){
    const tag=value.aggregation;
    if(!tag||typeof tag!=='object'||Array.isArray(tag)||Object.keys(tag).sort().join(',')!=='date,kind,metric'||tag.kind!=='daily-total'||!Object.hasOwn(aggregateMetrics,tag.metric))invalid('Invalid Health Connect aggregation metadata.');
    const day=date(tag.date),metric=aggregateMetrics[tag.metric],identity=`${metric.prefix}:${day}:${result.zone}`;
    if(result.id!==identity||result.recordId!==identity||result.app!=='Health Connect aggregate'||result.lastModifiedAt!==undefined)invalid('Invalid Health Connect daily aggregate identity.');
    if(!result.start||!result.end)invalid('Health Connect daily totals require their query interval.');
    const start=healthInstant(result.start),end=healthInstant(result.end),localDay=milliseconds=>captureCalendar(new Date(milliseconds),result.zone).today;
    // Checking the preceding millisecond also handles zones whose day starts
    // after midnight because of an offset transition. Preserve source offsets.
    if(start%1000000n!==0n||localDay(Number(start/1000000n))!==day||localDay(Number(start/1000000n)-1)===day)invalid('Health Connect daily total must start at the beginning of its local date.');
    if(end<=start||end>healthInstant(result.exportedAt))invalid('Invalid Health Connect daily total interval.');
    if(localDay(Number(end/1000000n))!==day&&(end%1000000n!==0n||localDay(Number(end/1000000n)-1)!==day))invalid('Health Connect daily total extends beyond its local date.');
    result.aggregation={kind:'daily-total',metric:tag.metric,date:day};
  }
  return result;
}

/** Bind source semantics once, before records enter the workspace. */
export function healthMeasurementSource(value,row){
  const source=healthSource(value),tag=source.aggregation;
  validateHealthVital(source,row);
  if(source.exerciseContext!==undefined&&(row.type!=='Exercise duration'||row.unit!=='min'||!Number.isFinite(row.value)||row.value<=0||tag||!source.start||!source.end||healthInstant(source.end)<=healthInstant(source.start)||!source.lastModifiedAt||source.id!=='exercise-duration:'+source.recordId))invalid('Exercise context requires a positive native Exercise duration interval and matching identity.');
  if(source.pressureContext!==undefined){const component=source.pressureContext.component,metric=PRESSURE_COMPONENTS[component];if(row.type!==metric.type||row.unit!=='mmHg'||!Number.isFinite(row.value)||row.value<metric.minimum||row.value>300||tag||!source.start||source.end!==undefined||!source.lastModifiedAt||source.id!=='blood-pressure:'+source.recordId+':'+component)invalid('Invalid native blood-pressure component, source identity or value.');}
  if(['Systolic','Diastolic'].includes(row.type)&&source.pressureContext===undefined)invalid('Health Connect pressure requires native component context.');
  if(row.type==='Blood glucose'&&(row.unit!=='mmol/L'||typeof row.value!=='number'||!Number.isFinite(row.value)||row.value<0||row.value>50||source.glucoseContext===undefined||tag))invalid('Health Connect glucose requires a 0 to 50 mmol/L value and native context.');
  if(source.glucoseContext!==undefined&&row.type!=='Blood glucose')invalid('Native glucose context requires a Blood glucose record.');
  if(row.type==='Height'&&(row.unit!=='cm'||typeof row.value!=='number'||!Number.isFinite(row.value)||row.value<0||row.value>300))invalid('Health Connect height must be between 0 and 300 cm.');
  if(row.type==='Body fat'&&(row.unit!=='%'||typeof row.value!=='number'||!Number.isFinite(row.value)||row.value<0||row.value>100))invalid('Health Connect body fat must be between 0 and 100%.');
  if(source.sleepStages!==undefined&&(!['sleep','Sleep'].includes(row.type)||row.unit!=='h'||tag))invalid('Sleep stages require a Sleep measurement in hours.');
  if(tag){
    const metric=aggregateMetrics[tag.metric];
    if(row.type!==metric.type||row.unit!==metric.unit||row.date!==tag.date||row.time!=='00:00'||typeof row.value!=='number'||!Number.isFinite(row.value)||row.value<0||(tag.metric==='steps'&&!Number.isSafeInteger(row.value)))invalid('Health Connect daily total does not match its measurement.');
  }
  return source;
}
