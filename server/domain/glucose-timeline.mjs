import {captureCgmTargetRange} from './cgm-target-range.mjs';
import {captureCgmWindow,scopeCgmRows,scopeCgmFasts} from './cgm-hour-window.mjs';
import {timelineGuidance as guidance} from './glucose-timeline-guidance.mjs';
import {mergeSourceAttributions} from './catalog-source.mjs';
import {createCycleOverlay} from './cycle-overlay-capture.mjs';
import {resolveCycleChartOverlays} from './cycle-overlay-settings.mjs';
import {captureCalendar,date as calendarDate,eligibleCalendarDates} from './calendar.mjs';
import {parseNutritionReportOptions} from './nutrition-report.mjs';
import {glucoseConversion,convertGlucoseUnit} from './glucose-ketones.mjs';
import {entryFacts,isExerciseEntry,exerciseEntryFacts} from './nutrition.mjs';
import {healthTimestamp,healthInstant} from './health-records.mjs';
import {parseMetric,metricInfo,metricOptions,carbohydrateMetricDefinition,carbohydrateMetricFacts} from './chart-metrics.mjs';
import {matchesBiometric} from './biometric-metrics.mjs';
import {isLoggedWater,loggedWaterMilliliters} from './water-measurement.mjs';
import {carbohydrateLabel,carbohydrateDescription} from './carbohydrate-policy.mjs';

const invalid=message=>{throw Object.assign(new Error(message),{status:400});};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const scalar=value=>typeof value==='string'||typeof value==='boolean'||finite(value)?value:null;
const validTime=value=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const validId=value=>typeof value==='string'&&!!value.trim()&&value.length<=1000;
const sourceObject=value=>value===undefined||value===null?null:object(value)?structuredClone(value):{invalidValue:structuredClone(value)};
function fields(value,keys){if(!object(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))invalid('Choose the required glucose timeline fields only.');}
function sourceType(value){if(typeof value!=='string'||!value||value!==value.trim()||value.length>100)invalid('Choose an exact biometric type without surrounding spaces.');return value;}

export function parseGlucoseTimelinePolicy(value){
  if(value===undefined||value===null)return null;
  fields(value,['version','glucose','insulin','displayUnit','range']);fields(value.glucose,['type']);
  if(value.version!==1||!['mg/dL','mmol/L'].includes(value.displayUnit))invalid('Choose version 1 and glucose display units.');
  const glucose={type:sourceType(value.glucose.type)};let insulin=null,range=null;
  if(value.insulin!==null){fields(value.insulin,['type','unit']);if(value.insulin.unit!=='U')invalid('Insulin measurements require U units.');insulin={type:sourceType(value.insulin.type),unit:'U'};if(insulin.type===glucose.type)invalid('Choose distinct glucose and insulin source types.');}
  if(value.range!==null){fields(value.range,['low','high']);const {low,high}=value.range;if(!finite(low)||!finite(high)||low<0||high<=low)invalid('Choose a finite nonnegative glucose band with positive width.');range={low,high};}
  return {version:1,glucose,insulin,displayUnit:value.displayUnit,range};
}
function optionsFor(state,policy){
  const options=new Map(),add=(type,unit)=>{try{sourceType(type);}catch{return;}if(!options.has(type))options.set(type,new Set());if(typeof unit==='string'&&unit.trim()&&unit.length<=30)options.get(type).add(unit);};
  for(const row of state.biometrics??[])add(row.type,row.unit);
  for(const row of state.settings?.customBiometrics??[])if(object(row))add(row.name,row.unit);
  if(policy){add(policy.glucose.type);if(policy.insulin)add(policy.insulin.type,'U');}
  return [...options].map(([type,units])=>({type,units:[...units]}));
}
const dayNumber=date=>Date.parse(date+'T00:00:00Z')/86400000;
const rawRecord=(row,sourceOrder)=>({id:scalar(row.id),date:scalar(row.date),time:row.time===undefined?'':scalar(row.time),type:scalar(row.type),unit:scalar(row.unit),value:scalar(row.value),sourceOrder,source:sourceObject(row.source),copiedFrom:sourceObject(row.copiedFrom)});
function sourceDate(value,range,eligible=null){try{calendarDate(value);}catch{return 'invalid';}return value<range.from||value>range.to||eligible&&!eligible.has(value)?'outside':'inside';}
function position(date,time,range,seconds=0){const dayOffset=dayNumber(date)-dayNumber(range.from),minuteOfDay=Number(time.slice(0,2))*60+Number(time.slice(3))+seconds/60;return {date,time,dayOffset,minuteOfDay,offsetMinutes:dayOffset*1440+minuteOfDay};}
const pointOrder=(a,b)=>a.position.offsetMinutes-b.position.offsetMinutes||a.sourceOrder-b.sourceOrder;
function markDuplicates(rows){const counts=new Map();for(const row of rows)if(row.eligible&&row.position){const key=row.position.offsetMinutes;counts.set(key,(counts.get(key)??0)+1);}for(const row of rows)if(row.position&&counts.get(row.position.offsetMinutes)>1){row.duplicateTimestamp=true;row.reasons.push(guidance('duplicate-time'));}}
function statistics(readings,band){
  const rows=readings.filter(row=>row.eligible),values=rows.map(row=>row.displayValue);let mean=0,m2=0,count=0,min=null,max=null;
  for(const value of values){count++;const delta=value-mean;mean+=delta/count;m2+=delta*(value-mean);min=min===null?value:Math.min(min,value);max=max===null?value:Math.max(max,value);}
  const populationSd=count?Math.sqrt(Math.max(0,m2/count)):null,cvPercent=count&&mean>0?populationSd/mean*100:null,timed=rows.filter(row=>row.position).sort(pointOrder),last=timed.at(-1),latest=last&&!last.duplicateTimestamp?last:null;
  return {count,mean:count?mean:null,min,max,populationSd,cvPercent,latest,latestReason:!count?guidance('no-samples'):!last?guidance('no-timed-samples'):last.duplicateTimestamp?guidance('latest-duplicate'):null,inBand:band?{...band,count:values.filter(value=>value>=band.low&&value<=band.high).length,total:count,fraction:count?values.filter(value=>value>=band.low&&value<=band.high).length/count:null}:null,timeInRange:{value:null,reason:guidance('no-continuous-coverage')}};
}
function fastingRows(state,range,calendar,axis,excluded){
  const format=new Intl.DateTimeFormat('en-CA',{timeZone:calendar.timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const placed=value=>{const ms=Date.parse(value),parts=Object.fromEntries(format.formatToParts(new Date(ms)).map(part=>[part.type,part.value]));return position(`${parts.year.padStart(4,'0')}-${parts.month}-${parts.day}`,`${parts.hour}:${parts.minute}`,range,Number(parts.second)+((ms%1000)+1000)%1000/1000);};
  const boundary=(offsetMinutes,end=false)=>({date:end?new Date((dayNumber(range.to)+1)*86400000).toISOString().slice(0,10):range.from,time:'00:00',dayOffset:offsetMinutes/1440,minuteOfDay:0,offsetMinutes});
  const fasts=[];
  for(const [sourceOrder,row] of (state.fasts??[]).entries()){
    const active=row.end===null||row.end===undefined,ending=active?calendar.asOf:row.end;let start,end;
    try{if(!validId(row.id))throw Error();healthTimestamp(row.start,'fast start');healthTimestamp(ending,'fast end');start=healthInstant(row.start);end=healthInstant(ending);if(end<start||end>healthInstant(calendar.asOf))throw Error();}catch{excluded.push({kind:'fast',record:{...rawRecord(row,sourceOrder),start:scalar(row.start),end:scalar(row.end)},reason:'invalid-fast-interval'});continue;}
    let startPosition=placed(row.start),endPosition=placed(ending);const low=Math.min(startPosition.offsetMinutes,endPosition.offsetMinutes),high=Math.max(startPosition.offsetMinutes,endPosition.offsetMinutes);
    if(high<0||low>axis.to||high===0&&end>start||low===axis.to&&end>start)continue;
    const clippedStart=startPosition.offsetMinutes<0,clippedEnd=endPosition.offsetMinutes>axis.to,reasons=[];
    if(end>start&&endPosition.offsetMinutes<=startPosition.offsetMinutes){startPosition=null;endPosition=null;reasons.push(guidance('clock-change'));}
    else{if(clippedStart)startPosition=boundary(0);if(clippedEnd)endPosition=boundary(axis.to,true);}
    fasts.push({id:row.id,start:row.start,end:active?null:row.end,active,goalHours:finite(row.goalHours)?row.goalHours:null,startPosition,endPosition,elapsedHours:Number(end-start)/3600000000000,clippedStart,clippedEnd,reasons});
  }
  return fasts;
}

export function captureFastingChartRows(state,input,clock){
 const range=parseNutritionReportOptions({...input,dayFilter:'all',includeToday:true,includeSupplements:true});
 const calendar=captureCalendar(clock.now,clock.timeZone),axis={to:(dayNumber(range.to)-dayNumber(range.from)+1)*1440},excluded=[];
 return {rows:fastingRows(state,range,calendar,axis,excluded),excluded,calendar};
}
const exerciseMetrics=Object.freeze([{metric:{kind:'exercise',id:'duration'},name:'Exercise duration',unit:'min'},{metric:{kind:'exercise',id:'calories'},name:'Exercise energy',unit:'kcal'}]);
const supportsTimedComparison=metric=>['nutrient','carbohydrate','biometric'].includes(metric.kind)&&!(metric.kind==='biometric'&&metric.unit===null);
export function parseGlucoseComparisonMetric(value){
  if(value?.kind==='exercise'){fields(value,['kind','id']);if(!exerciseMetrics.some(option=>option.metric.id===value.id))invalid('Choose exercise duration or calories.');return {kind:'exercise',id:value.id};}
  const parsed=parseMetric(value);if(!supportsTimedComparison(parsed))invalid('Choose a nutrient, tracked carbohydrate, exact biometric with units, or exercise metric.');return parsed;
}
function comparisonInfo(metric){if(metric.kind!=='exercise')return metricInfo(metric);const option=exerciseMetrics.find(option=>option.metric.id===metric.id);return {name:option.name,unit:option.unit,reviewRequired:false};}
function captureMarkers(state,range,eligible=null){
  const markers={timed:[],untimed:[]},excluded=[],ids=new Map();
  for(const row of state.entries??[])if(sourceDate(row.date,range,eligible)!=='outside'&&validId(row.id))ids.set(row.id,(ids.get(row.id)??0)+1);
  for(const [sourceOrder,row] of (state.entries??[]).entries()){
    const dateState=sourceDate(row.date,range,eligible);if(dateState==='outside')continue;const kind=isExerciseEntry(row)?'exercise':'food';
    if(dateState==='invalid'||!validId(row.id)||ids.get(row.id)>1||row.time!==undefined&&row.time!==''&&!validTime(row.time)){excluded.push({kind,record:rawRecord(row,sourceOrder),reason:dateState==='invalid'?'invalid-date':!validId(row.id)?'invalid-id':ids.get(row.id)>1?'duplicate-id':'invalid-time'});continue;}
    let facts;try{facts=kind==='food'?entryFacts(state,row):null;}catch{excluded.push({kind,record:rawRecord(row,sourceOrder),reason:'invalid-food-quantity'});continue;}
    const exercise=kind==='exercise'?exerciseEntryFacts(row):null;
    const name=facts?.name??row.name??'Exercise';if(typeof name!=='string'||!name.trim()){excluded.push({kind,record:rawRecord(row,sourceOrder),reason:'invalid-entry-name'});continue;}
    const marker={id:row.id,date:row.date,time:row.time??'',sourceOrder,kind,position:row.time?position(row.date,row.time,range):null,name,quantity:facts?Object.fromEntries(['amount','quantity','unit','portionId','portionLabel','grams'].map(key=>[key,facts[key]??null])):null,attributions:facts?.attributions??[],nutrients:facts?.nutrients??null,coverage:facts?.coverage??null,carbohydrate:facts?.carbohydrate??null,carbohydrates:facts?.carbohydrates??null,exercise:exercise?{duration:exercise.duration,caloriesBurned:exercise.calories}:null,source:sourceObject(row.source),copiedFrom:sourceObject(row.copiedFrom)};
    markers[marker.position?'timed':'untimed'].push(marker);
  }
  markers.timed.sort(pointOrder);return {markers,excluded};
}
const comparisonPoints=readings=>readings.filter(row=>row.eligible&&row.position&&finite(row.value)).sort(pointOrder).map(row=>({recordId:row.id,value:row.value,position:row.position}));
function comparisonView(state,metric,range,capture,eligible=null){
  if(!metric)return null;
  const definition=metric.kind==='carbohydrate'?carbohydrateMetricDefinition(state.settings,metric):null,info=definition?{name:carbohydrateLabel(definition),unit:'g',reviewRequired:false}:comparisonInfo(metric),readings=[],excluded=[];
  if(metric.kind==='biometric'){
    const selected=[],ids=new Map();
    for(const [sourceOrder,row] of (state.biometrics??[]).entries())if(matchesBiometric(row,metric)){const dateState=sourceDate(row.date,range,eligible);if(dateState==='outside')continue;selected.push({row,sourceOrder,dateState});if(validId(row.id))ids.set(row.id,(ids.get(row.id)??0)+1);}
    for(const {row,sourceOrder,dateState} of selected){
      const raw=rawRecord(row,sourceOrder);let reason=null;
      if(dateState==='invalid')reason='invalid-date';else if(!validId(row.id))reason='invalid-id';else if(ids.get(row.id)>1)reason='duplicate-id';else if(!finite(row.value))reason='invalid-value';else if(row.time!==undefined&&row.time!==''&&!validTime(row.time))reason='invalid-time';
      if(reason){excluded.push({kind:'biometric',record:raw,reason});continue;}
      const copied=row.copiedFrom!==undefined,reasons=copied?[guidance('copied-comparison')]:[];
      if(!row.time)reasons.push(guidance('untimed'));
      readings.push({id:row.id,date:row.date,time:row.time??'',sourceOrder,name:row.type,value:row.value,unit:row.unit,position:row.time?position(row.date,row.time,range):null,copied,eligible:!copied,reasons,source:raw.source,copiedFrom:raw.copiedFrom,attributions:[],coverage:null});
    }
  }else{
    const kind=metric.kind==='exercise'?'exercise':'food';excluded.push(...capture.excluded.filter(row=>row.kind===kind));
    for(const marker of [...capture.markers.timed,...capture.markers.untimed].filter(row=>row.kind===kind).sort((a,b)=>a.sourceOrder-b.sourceOrder)){
      const tracked=metric.kind==='carbohydrate',carbs=tracked?carbohydrateMetricFacts(marker,metric):null,candidate=metric.kind==='exercise'?marker.exercise[metric.id==='duration'?'duration':'caloriesBurned']:tracked?carbs?.value:marker.nutrients?.[metric.id],coverage=metric.kind==='exercise'?null:tracked?carbs?.coverage??null:marker.coverage?.[metric.id]??null,value=finite(candidate)&&(metric.kind==='exercise'||coverage?.known>0)?candidate:null,reasons=[];
      if(value===null)reasons.push(guidance('unknown-measurement'));else if(coverage&&!coverage.complete)reasons.push(guidance('partial-sum'));
      if(tracked&&value===null)reasons.push(guidance('unresolved-carbohydrate'));
      if(!marker.position)reasons.push(guidance('untimed'));
      const copied=marker.copiedFrom!==null;if(copied)reasons.push(guidance('copied-entry'));
      readings.push({id:marker.id,date:marker.date,time:marker.time,sourceOrder:marker.sourceOrder,name:marker.name,value,unit:info.unit,position:marker.position,copied,eligible:true,reasons,source:marker.source,copiedFrom:marker.copiedFrom,attributions:marker.attributions,coverage});
    }
  }
  const points=comparisonPoints(readings);
  return {metric,info,readings,points,excluded,rules:[...(definition?[{code:'carbohydrate-definition',text:carbohydrateDescription(definition),definition:structuredClone(definition)}]:metric.kind==='carbohydrate'?[guidance('missing-definition')]:[]),guidance('comparison-clock'),guidance('comparison-food'),guidance('comparison-identity'),guidance('comparison-copies'),guidance('comparison-gaps')]};
}

/** Reuse the timed food owner. Nutrient charts also include logged water, as daily intake does. */
export function captureNutrientChartReadings(state,input,selection){
 const range=parseNutritionReportOptions({...input,dayFilter:'all',includeToday:true,includeSupplements:true}),metric=parseGlucoseComparisonMetric(selection);
 if(metric.kind!=='nutrient')invalid('Choose a nutrient for time grouping.');
 const food=comparisonView(state,metric,range,captureMarkers(state,range));
 const readings=food.readings.map(row=>({...row,collection:'entries'})),excluded=food.excluded.map(row=>({...row,collection:'entries'}));
 if(metric.id==='water'){
  const selected=(state.biometrics??[]).map((row,sourceOrder)=>({row,sourceOrder,dateState:sourceDate(row.date,range)})).filter(({row,dateState})=>isLoggedWater(row)&&dateState!=='outside'),ids=new Map();
  for(const {row} of selected)if(validId(row.id))ids.set(row.id,(ids.get(row.id)??0)+1);
  for(const {row,sourceOrder,dateState} of selected){
   const raw=rawRecord(row,sourceOrder),value=loggedWaterMilliliters(row);
   const reason=dateState==='invalid'?'invalid-date':!validId(row.id)?'invalid-id':ids.get(row.id)>1?'duplicate-id':row.time!==undefined&&row.time!==''&&!validTime(row.time)?'invalid-time':value===null?'invalid-water':null;
   if(reason){excluded.push({collection:'biometrics',kind:'water',record:raw,reason});continue;}
   readings.push({...raw,collection:'biometrics',name:row.type,unit:'mL',value,raw,eligible:true,position:row.time?position(row.date,row.time,range):null,coverage:{known:1,total:1,complete:true},attributions:[]});
  }
 }
 return {metric:food.metric,info:food.info,readings,excluded};
}

/** A calendar-positioned sample view. No CGM coverage, interpolation, treatment
 * range or vendor algorithm is inferred from a selected biometric name. */
export function createGlucoseTimelineView(state,input,{now,timeZone,overlayContext='timeline',eligibleDates,displayUnit,hours,targetRange}={}){
  if(!['timeline','dashboard'].includes(overlayContext))invalid('Choose a supported glucose overlay context.');
  const hasComparison=Object.hasOwn(input??{},'compare');fields(input,hasComparison?['from','to','compare']:['from','to']);const compare=hasComparison?parseGlucoseComparisonMetric(input.compare):null,{from,to}=parseNutritionReportOptions({from:input.from,to:input.to,dayFilter:'all',includeToday:true,includeSupplements:true}),range={from,to},calendar=captureCalendar(now,timeZone),policy=parseGlucoseTimelinePolicy(state.settings?.glucoseTimeline),days=dayNumber(to)-dayNumber(from)+1;
  if(displayUnit!==undefined&&!['mg/dL','mmol/L'].includes(displayUnit))invalid('Choose a supported glucose display unit.');
  if(policy&&displayUnit&&displayUnit!==policy.displayUnit){if(policy.range)policy.range={low:convertGlucoseUnit(policy.range.low,policy.displayUnit,displayUnit),high:convertGlucoseUnit(policy.range.high,policy.displayUnit,displayUnit)};policy.displayUnit=displayUnit}
  if(targetRange!==undefined){const band=captureCgmTargetRange(targetRange,policy?.displayUnit??displayUnit??'mg/dL').active;if(policy)policy.range={low:band.low,high:band.high};}
  const window=hours===undefined?null:captureCgmWindow(hours,{now,timeZone});
  if(window&&(window.range.from!==from||window.range.to!==to))invalid('CGM dates must cover the selected hour window.');
  const eligible=eligibleCalendarDates(range,eligibleDates);
  const tickStep=days===1?360:days===2?720:days<=7?1440:Math.ceil(days/7)*1440;
  const axis={kind:'diary-calendar-minutes',from:0,to:days*1440,ticks:Array.from({length:Math.ceil(days*1440/tickStep)},(_,i)=>{const offsetMinutes=i*tickStep,minuteOfDay=offsetMinutes%1440;return {offsetMinutes,date:new Date((dayNumber(from)+Math.floor(offsetMinutes/1440))*86400000).toISOString().slice(0,10),time:`${String(Math.floor(minuteOfDay/60)).padStart(2,'0')}:${String(minuteOfDay%60).padStart(2,'0')}`};})};
  const view={version:3,attributions:[],range,calendar,policy,status:policy?'empty':'unconfigured',options:optionsFor(state,policy),axis,readings:[],insulin:[],excluded:[],markers:{timed:[],untimed:[]},fasts:[],stats:statistics([],policy?.range),series:{glucose:{unit:policy?.displayUnit??null,points:[]},insulin:{unit:'U',points:[]}},conversion:{...glucoseConversion},rules:[guidance('selected-sources'),guidance('diary-clock'),guidance('sample-statistics'),guidance('sample-copies'),guidance('display-band'),guidance('event-clock')]};
  if(window){view.window=window;view.axis={kind:'elapsed-minutes',from:0,to:hours*60,ticks:[]};}
  view.comparisonOptions=[...metricOptions(state).filter(option=>supportsTimedComparison(option.metric)),...exerciseMetrics.map(option=>structuredClone(option))];
  if(compare&&!view.comparisonOptions.some(option=>JSON.stringify(option.metric)===JSON.stringify(compare))){const info=comparisonInfo(compare);view.comparisonOptions.push({metric:compare,name:info.name,unit:info.unit});}
  const markerCapture=policy||compare&&compare.kind!=='biometric'?captureMarkers(state,range,eligible):null;
  if(window&&markerCapture){const scoped=scopeCgmRows(markerCapture.markers.timed,window);markerCapture.markers.timed=scoped.filter(row=>row.position);markerCapture.markers.untimed.push(...scoped.filter(row=>!row.position));}
  view.comparison=comparisonView(state,compare,range,markerCapture,eligible);
  if(window&&view.comparison){view.comparison.readings=scopeCgmRows(view.comparison.readings,window);view.comparison.points=comparisonPoints(view.comparison.readings);}
  view.attributions=mergeSourceAttributions(...(policy?[...markerCapture.markers.timed,...markerCapture.markers.untimed].map(row=>row.attributions):[]),...(view.comparison?.readings??[]).filter(row=>row.value!==null).map(row=>row.attributions));
  const cycleChoices=resolveCycleChartOverlays(state.settings?.cycleChartOverlays).charts;
  view.cycleOverlayCharts={timeline:overlayContext==='dashboard'?cycleChoices.dashboardGlucose:cycleChoices.glucoseTimeline,comparison:overlayContext==='timeline'&&cycleChoices.glucoseComparison};
  view.cycleOverlayEnabled=view.cycleOverlayCharts.timeline||view.cycleOverlayCharts.comparison;
  if(view.cycleOverlayEnabled){const capture=createCycleOverlay(state,range,{now:new Date(calendar.asOf),timeZone:calendar.timeZone});view.cycleOverlay={...capture,observations:capture.observations.map(row=>{const startPosition=position(row.date,'00:00',range);return {...row,startPosition,endPosition:{...startPosition,dayOffset:startPosition.dayOffset+1,offsetMinutes:startPosition.offsetMinutes+1440,date:new Date((dayNumber(row.date)+1)*86400000).toISOString().slice(0,10)}};})};}
  if(!policy)return view;
  const selected=[],ids=new Map();
  for(const [sourceOrder,row] of (state.biometrics??[]).entries()){
    const kind=row.type===policy.glucose.type?'glucose':policy.insulin&&row.type===policy.insulin.type?'insulin':null;if(!kind)continue;const dateState=sourceDate(row.date,range,eligible);if(dateState==='outside')continue;
    selected.push({row,kind,sourceOrder,dateState});if(validId(row.id))ids.set(row.id,(ids.get(row.id)??0)+1);
  }
  for(const {row,kind,sourceOrder,dateState} of selected){
    const raw=rawRecord(row,sourceOrder);let reason=null;
    if(dateState==='invalid')reason='invalid-date';else if(!validId(row.id))reason='invalid-id';else if(ids.get(row.id)>1)reason='duplicate-id';else if(kind==='glucose'?!['mg/dL','mmol/L'].includes(row.unit):row.unit!=='U')reason='unsupported-unit';else if(!finite(row.value))reason='invalid-value';else if(row.value<0||row.value>1000000)reason='out-of-range-value';else if(row.time!==undefined&&row.time!==''&&!validTime(row.time))reason='invalid-time';
    if(reason){view.excluded.push({kind,record:raw,reason});continue;}
    const copied=row.copiedFrom!==undefined,mmolL=kind==='glucose'?convertGlucoseUnit(row.value,row.unit,'mmol/L'):null,displayValue=kind==='insulin'?row.value:convertGlucoseUnit(row.value,row.unit,policy.displayUnit);
    const point={...raw,copied,displayValue,mmolL,position:row.time?position(row.date,row.time,range):null,duplicateTimestamp:false,eligible:!copied,reasons:copied?[guidance('copied-reading')]:[]};
    if(!point.position)point.reasons.push(guidance('untimed'));view[kind==='glucose'?'readings':'insulin'].push(point);
  }
  if(window){view.readings=scopeCgmRows(view.readings,window);view.insulin=scopeCgmRows(view.insulin,window);}
  for(const [kind,rows] of [['glucose',view.readings],['insulin',view.insulin]]){markDuplicates(rows);view.series[kind].points=rows.filter(row=>row.eligible&&row.position).sort(pointOrder).map(row=>({recordId:row.id,value:row.displayValue,position:row.position,duplicateTimestamp:row.duplicateTimestamp}));}
  view.markers=markerCapture.markers;view.excluded.push(...markerCapture.excluded);view.fasts=fastingRows(state,range,calendar,axis,view.excluded);if(window)view.fasts=scopeCgmFasts(view.fasts,window);view.stats=statistics(view.readings,policy.range);
  if(view.readings.length||view.insulin.length||view.excluded.length||view.markers.timed.length||view.markers.untimed.length||view.fasts.length)view.status='ready';return view;
}
