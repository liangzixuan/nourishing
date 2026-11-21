import {createCycleOverlay} from './cycle-overlay-capture.mjs';
import {mobileCycleOverlay} from './mobile-cycle-overlay.mjs';
import {captureCgmTargetRange} from './cgm-target-range.mjs';
import {captureCgmWindow} from './cgm-hour-window.mjs';
import {captureLipidPanel} from './lipid-chart.mjs';
import {captureCalciumChart} from './calcium-chart.mjs';
import {groupedNutrientSeries} from './nutrient-chart.mjs';
import {mobileChartBiometric,mobileChartMetric,sleepStageOptions} from './mobile-chart-metrics.mjs';
import {displayChartSeries} from './chart-display-units.mjs';
import {date,captureCalendar} from './calendar.mjs';
import {mobileChartTemplates,parseMobileChartSettings,mobileChartDisplayDefaults} from './mobile-chart-settings.mjs';
import {iterateTrendDays} from './nutrition.mjs';
import {parseChart,projectMetricSeries} from './chart-metrics.mjs';
import {consumedComponents} from './consumed-energy.mjs';
import {createSleepView} from './sleep.mjs';
import {SLEEP_STAGES} from './health-records.mjs';
import {createGlucoseKetoneView,glucoseConcentrationUnits} from './glucose-ketones.mjs';
import {createBloodPressureView} from './blood-pressure.mjs';
import {createGlucoseTimelineView,captureFastingChartRows} from './glucose-timeline.mjs';

const shift=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const known=value=>typeof value==='number'&&Number.isFinite(value);
const fail=message=>{throw Object.assign(Error(message),{status:400});};
function rangeFor(state,prefs,to){
 if(prefs.range==='custom')return {from:prefs.from,to:prefs.to};
 const end=prefs.includeToday?to:shift(to,-1);
 if(prefs.range==='all'){
  const dates=['entries','biometrics','notes'].flatMap(key=>(state[key]??[]).map(row=>row.date)).filter(day=>typeof day==='string'&&day<=end).sort();
  return {from:dates[0]??shift(end,-6),to:end};
 }
 return {from:shift(end,1-Number(prefs.range)),to:end};
}
function metricSeries(state,days,metric,id,axis='left',to){
 const source=metric.kind==='biometric'&&metric.unit===null?mobileChartBiometric(state,metric.type,null,to):metric;
 const capture=projectMetricSeries(days,source);
 return {id,name:capture.info.name,unit:capture.info.unit,axis,metric,points:days.map((day,i)=>({date:day.date,value:capture.values[i]})),capture};
}
function valueSeries(days,id,name,unit,read,axis='left'){
 return {id,name,unit,axis,points:days.map(day=>({date:day.date,value:read(day)}))};
}
function sleepSeries(state,range,days,selection){
 const capture=createSleepView(state,range);
 // The sleep projection resolves conflicts between contributing sessions. A
 // separate source with only a sleep score does not invalidate those hours.
 const byDate=new Map(capture.days.filter(day=>day.sessionHours!==null).map(day=>[day.date,[]]));
 for(const row of capture.sessions)if(row.eligible)byDate.get(row.date)?.push(row);
 const stages=selection?[selection.stage]:SLEEP_STAGES;
 const series=stages.map(stage=>valueSeries(days,stage,stage,'h',day=>{
  const values=(byDate.get(day.date)??[]).map(row=>row.stages?.durations[stage]);
  return values.length&&values.every(known)?values.reduce((a,b)=>a+b,0):null;
 }));
 if(selection){
  const option=sleepStageOptions.find(row=>row.metric.stage===selection.stage);
  return {series:[{...series[0],...option,id:'primary',displayUnits:['h']}],capture};
 }
 return {series,capture,plot:'stacked-bars'};
}
function builtIn(state,descriptor,days,clock){
 const {id,settings:p,range}=descriptor,weight=mobileChartMetric(state,id,'primary',p,range.to);
 if(id==='energy')return {plot:'stacked-bars',series:consumedComponents.map(([key,name])=>valueSeries(days,key,name,'kcal',day=>known(day.energy.consumed)?day.consumedEnergy.values[key]:null)),capture:{method:'food-level-atwater-allocation-v1',days:days.map(day=>({date:day.date,...day.consumedEnergy}))}};
 if(id==='metric')return {stageOptions:sleepStageOptions,...(weight.kind==='sleep-stage'?sleepSeries(state,range,days,weight):{series:[metricSeries(state,days,weight,'primary','left',range.to)]})};
 if(id==='nutrient'){
  const metric=mobileChartMetric(state,id,'primary',p,range.to);
  if(p.grouping==='day')return {series:[metricSeries(state,days,metric,'primary')]};
  const series=groupedNutrientSeries(state,range,days,metric,p.grouping);
  return {series:[series],timing:{grouping:p.grouping,untimedCount:series.capture.untimed.length}};
 }
 if(id==='score')return {series:[metricSeries(state,days,mobileChartMetric(state,id,'primary',p,range.to),'primary')]};
 if(id==='weight-fat'||id==='weight-waist')return {series:[metricSeries(state,days,weight,'primary','left',range.to),metricSeries(state,days,mobileChartMetric(state,id,'secondary',p,range.to),'secondary','right',range.to)]};
 if(id==='lipids')return captureLipidPanel(days,p.primaryUnit);
 if(id==='sleep')return sleepSeries(state,range,days);
 if(id==='calcium')return captureCalciumChart(days);
 if(id==='gki'){
  const capture=createGlucoseKetoneView(state,range,{...clock,eligibleDates:days.map(day=>day.date),displayUnit:p.secondaryUnit});
  return {series:[['gki','Glucose Ketone Index','left'],['glucose','Blood Glucose','right'],['ketones','Ketones (Blood)','right']].map(([id,name,axis])=>({id,name,axis,...capture.series[id]})),axisUnits:[{key:'secondaryUnit',unit:capture.series.glucose.unit,choices:[...glucoseConcentrationUnits]}],capture,status:capture.status};
 }
 if(id==='pressure'){
  const capture=createBloodPressureView(state,range,{...clock,eligibleDates:days.map(day=>day.date)});
  return {series:['systolic','diastolic','pulse'].map(role=>({id:role,name:role,unit:role==='pulse'?'bpm':'mmHg',axis:role==='pulse'?'right':'left',points:capture.pairs.map(pair=>({date:pair.systolic.date,time:pair[role]?.time??pair.systolic.time,pairId:JSON.stringify([pair.systolic.id,pair.diastolic.id]),recordId:pair[role]?.id??null,value:pair[role]?.value??null}))})),capture,status:capture.status};
 }
 if(id==='cgm'){
  const targetRange=captureCgmTargetRange(p.targetRange,p.primaryUnit??state.settings?.glucoseTimeline?.displayUnit??'mg/dL');
  const capture=createGlucoseTimelineView(state,{...range,...(p.compare?{compare:p.compare}:{})},{...clock,hours:p.hours,displayUnit:targetRange.active.unit,targetRange:p.targetRange});
  const series=['glucose',...(p.showInsulin&&capture.policy?.insulin?['insulin']:[])].map(id=>({id,name:id==='glucose'?'Glucose':'Insulin',unit:capture.series[id].unit,axis:id==='insulin'?'right':'left',plot:id==='insulin'?'bars':'lines',points:capture.series[id].points.map(point=>({...point,date:point.position.date,time:point.position.time}))}));
  const compared=capture.comparison,readings=new Map(compared?.readings.map(row=>[row.id,row])??[]);
  const comparison=p.showCompare&&compared?{id:'comparison',metric:compared.metric,name:compared.info.name,unit:compared.info.unit,axis:'left',plot:'points',points:compared.points.map(point=>({...point,date:point.position.date,time:point.position.time,coverage:readings.get(point.recordId)?.coverage??null})),untimedCount:compared.readings.filter(row=>!row.position).length}:null;
  return {series,comparison,targetRange,capture,status:capture.status,axisUnits:[{key:'primaryUnit',unit:capture.policy?.displayUnit??p.primaryUnit??'mg/dL',choices:[...glucoseConcentrationUnits]}]};
 }
 throw Error('Unimplemented mobile chart template: '+id);
}
/** Owns the mobile chart capture. Health and nutrition values come only from their established owners. */
export function createMobileChartView(state,input,clock={}){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['to','card','surface'].includes(key)))fail('Choose a chart end date and optional card.');
 if(input.surface!==undefined&&!['charts','dashboard'].includes(input.surface))fail('Choose Charts or Dashboard as the chart surface.');
 const to=date(input.to),calendar=captureCalendar(clock.now,clock.timeZone),preferences=parseMobileChartSettings(state.settings?.mobileCharts,state);
 if(input.card!==undefined&&!mobileChartTemplates.some(row=>row.id===input.card)&&!(state.charts??[]).some(row=>'custom:'+row.id===input.card))fail('Choose an existing chart.');
 const descriptors=mobileChartTemplates.map(template=>({kind:'builtin',...template,settings:preferences.charts[template.id],range:template.id==='cgm'?captureCgmWindow(preferences.charts.cgm.hours,clock).range:rangeFor(state,preferences.charts[template.id],to)}));
 for(const source of state.charts??[]){const chart=parseChart(source),settings={...mobileChartDisplayDefaults,range:String(chart.days),...preferences.custom[chart.id],visible:chart.visible};descriptors.push({kind:'custom',id:'custom:'+chart.id,chartId:chart.id,name:chart.name,settings,range:rangeFor(state,settings,to),definition:chart});}
 const selected=descriptors.filter(row=>input.card?row.id===input.card:input.surface==='dashboard'?row.settings.showOnDashboard:row.settings.visible);
 for(const row of selected)if(row.range.from>row.range.to||(Date.parse(row.range.to)-Date.parse(row.range.from))/86400000>=3660)fail('Choose a chart date range of 1 to 3660 days.');
 // Calculate each needed date once even when the visible cards use different windows.
 const cache=new Map();for(const row of selected){const missing=[];let from=null,last=null;
  for(let day=row.range.from;day<=row.range.to;day=shift(day,1)){if(!cache.has(day)){if(from===null)from=day;last=day}else if(from!==null){missing.push({from,to:last});from=null}}
  if(from!==null)missing.push({from,to:last});for(const span of missing)for(const day of iterateTrendDays(state,span.from,span.to))cache.set(day.date,day);
 }
 const cycleEnabled=descriptor=>descriptor.kind==='custom'?descriptor.definition.cycleOverlay===true:descriptor.settings.showCycle;
 const cycleCards=selected.filter(cycleEnabled);
 const cycleCapture=cycleCards.length?createCycleOverlay(state,{from:cycleCards.map(c=>c.range.from).sort()[0],to:cycleCards.map(c=>c.range.to).sort().at(-1)},{now:new Date(calendar.asOf),timeZone:calendar.timeZone}):null;
 const cards=selected.map(descriptor=>{
  const filter=descriptor.id==='cgm'?'all':descriptor.settings.dayFilter;
  const days=[...cache.values()].filter(day=>day.date>=descriptor.range.from&&day.date<=descriptor.range.to&&(descriptor.settings.includeToday!==false||day.date!==calendar.today)&&(filter==='all'||(filter==='complete'?day.complete:day.logged||day.complete))).sort((a,b)=>a.date.localeCompare(b.date));
  const data=descriptor.kind==='custom'?{series:[metricSeries(state,days,descriptor.definition.primary,'primary','left',descriptor.range.to),...(descriptor.definition.secondary?[metricSeries(state,days,descriptor.definition.secondary,'secondary','right',descriptor.range.to)]:[])]}:builtIn(state,descriptor,days,clock);
  const targetMetric=data.series[0]?.metric;let target=descriptor.settings.targetLine&&targetMetric?.kind==='nutrient'?valueSeries(days,'target','Daily Target',data.series[0].unit,day=>known(day.targets[targetMetric.id])?day.targets[targetMetric.id]:null):null;
  if(target)target=displayChartSeries({...target,metric:targetMetric},descriptor.settings.primaryUnit);
  if(target&&descriptor.id==='calcium'){
   const upper=valueSeries(days,'target-upper','Target maximum','mg',day=>known(day.nutrientDisplay.thresholds.calcium?.maximum)?day.nutrientDisplay.thresholds.calcium.maximum:null);
   target.upper=upper.points.some(point=>known(point.value))?upper:null;
  }
  data.series=data.series.map(series=>series.metric?.kind==='sleep-stage'?series:displayChartSeries(series,descriptor.settings[series.id+'Unit']));
  const fasting=descriptor.id==='cgm'?(descriptor.settings.showFasting?{rows:data.capture.fasts}:null):descriptor.settings.showFasting&&!['energy','sleep'].includes(descriptor.id)?captureFastingChartRows(state,descriptor.range,clock):null;
  const cycleOverlayEnabled=cycleEnabled(descriptor),cycle=cycleOverlayEnabled?{cycleOverlay:mobileCycleOverlay(cycleCapture,descriptor.range,days.map(day=>day.date),data.capture?.window)}:{};
  return {...descriptor,dates:days.map(day=>day.date),plot:'lines',...data,target,fasting,cycleOverlayEnabled,...cycle};
 });
 // An observation can explicitly record an unknown or unsupplied phase.
 const hasRecordedPhases=(state.cycleRecords??[]).some(row=>row.metric==='phase'&&row.date<calendar.today);
 return {version:1,to,calendar,hasRecordedPhases,preferences,catalog:descriptors.map(({definition,...row})=>row),cards};
}
