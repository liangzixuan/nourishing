import {parseGlucoseComparisonMetric} from './glucose-timeline.mjs';
import {parseCgmTargetRange} from './cgm-target-range.mjs';
import {cgmHours} from './cgm-hour-window.mjs';
import {date} from './calendar.mjs';
import {parseMetric} from './chart-metrics.mjs';
import {chartDisplayUnits} from './chart-display-units.mjs';
import {mobileChartUnitChoices} from './mobile-chart-metrics.mjs';

export const mobileChartTemplates=Object.freeze([
 ['energy','Energy Consumed (kcal)',true],['metric','Single Metric',true],['nutrient','Single Nutrient',true],
 ['weight-fat','Weight + Body Fat',false],['weight-waist','Weight + Waist Size',false],['gki','Glucose Ketone Index',false],
 ['pressure','Blood Pressure + Heart Rate',false],['lipids','Lipid Panel',false],['score','Single Nutrition Score',true],
 ['sleep','Sleep Stages (hr:min)',true],['cgm','CGM Chart',false],['calcium','Calcium vs Calcium Absorption',false],
].map(([id,name,visible])=>Object.freeze({id,name,visible})));
const fail=message=>{throw Object.assign(Error(message),{status:400});};
const object=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))fail('Invalid mobile chart settings.');};
const rangeChoices=['7','14','21','28','56','90','180','365','all','custom'];
const displayKeys=['range','from','to','dayFilter','includeToday','zoom','showFasting','targetLine','showOnDashboard','primaryUnit','secondaryUnit'];
export const mobileChartDisplayDefaults=Object.freeze({range:'7',from:null,to:null,dayFilter:'all',includeToday:true,zoom:false,showFasting:true,targetLine:true,showOnDashboard:false});
function display(raw,{custom=false}={}){
 const value={...mobileChartDisplayDefaults,...raw};
 const dynamicRange=custom&&typeof value.range==='string'&&/^[1-9]\d*$/.test(value.range)&&Number(value.range)<=3660;
 if(!rangeChoices.includes(value.range)&&!dynamicRange||!['all','nonempty','complete'].includes(value.dayFilter))fail('Choose valid chart dates and days.');
 for(const key of ['includeToday','zoom','showFasting','targetLine','showOnDashboard'])if(typeof value[key]!=='boolean')fail('Chart display switches must be true or false.');
 for(const key of ['primaryUnit','secondaryUnit'])if(Object.hasOwn(raw,key)&&(typeof raw[key]!=='string'||!raw[key].trim()||raw[key].length>100))fail('Choose a chart display unit.');
 for(const key of ['from','to'])if(value[key]!==null)date(value[key]);
 if(value.range==='custom'&&(!value.from||!value.to||value.from>value.to||(Date.parse(value.to)-Date.parse(value.from))/86400000>=3660))fail('Choose a chart date range of 1 to 3660 days.');
 return value;
}
function validateUnits(settings,resolve){
 for(const axis of ['primary','secondary'])if(Object.hasOwn(settings,axis+'Unit')){
  if(!resolve(axis).includes(settings[axis+'Unit']))fail('Choose a display unit supported by this chart metric.');
 }
}
export function parseMobileChartSettings(input,state={}){
 if(input===undefined)input={};object(input,['version','charts','custom']);if(input.version!==undefined&&input.version!==1)fail('Use mobile chart settings version 1.');
 const inputCharts=input.charts??{};object(inputCharts,mobileChartTemplates.map(row=>row.id));
 const charts={};
 for(const template of mobileChartTemplates){
  const raw=inputCharts[template.id]??{};object(raw,template.id==='cgm'?['visible','showCycle','hours','targetRange','showTargetHint','showFasting','showOnDashboard','primaryUnit','showInsulin','showCompare','compare']:['visible','showCycle',...displayKeys,'primary','secondary',...(template.id==='nutrient'?['grouping']:[])]);
  const value=template.id==='cgm'?{visible:template.visible,showFasting:true,showOnDashboard:false,...raw}:display({visible:template.visible,...raw});
  value.showCycle=raw.showCycle??false;if(Object.hasOwn(raw,'showCycle')&&typeof raw.showCycle!=='boolean')fail('Choose a valid cycle overlay switch.');
  for(const key of ['showFasting','showOnDashboard'])if(typeof value[key]!=='boolean')fail('Chart display switches must be true or false.');
  if(template.id==='nutrient'){value.grouping=raw.grouping??'day';if(!['day','hour','minute'].includes(value.grouping))fail('Choose Day, Hour or Minute nutrient grouping.');}
  if(template.id==='cgm'){value.targetRange=parseCgmTargetRange(raw.targetRange);value.showTargetHint=Object.hasOwn(raw,'showTargetHint')?raw.showTargetHint:true;if(typeof value.showTargetHint!=='boolean')fail('Choose a valid target hint switch.');value.hours=Object.hasOwn(raw,'hours')?raw.hours:24;if(!cgmHours.includes(value.hours))fail('Choose 3, 24, 48 or 72 hours.');value.compare=raw.compare===undefined||raw.compare===null?null:parseGlucoseComparisonMetric(raw.compare);value.showInsulin=Object.hasOwn(raw,'showInsulin')?raw.showInsulin:true;if(typeof value.showInsulin!=='boolean')fail('Choose a valid insulin display switch.');value.showCompare=Object.hasOwn(raw,'showCompare')?raw.showCompare:true;if(typeof value.showCompare!=='boolean')fail('Choose a valid comparison display switch.');}
  if(typeof value.visible!=='boolean')fail('Choose valid chart visibility.');
  for(const axis of ['primary','secondary'])if(Object.hasOwn(raw,axis)){
   const allowed=template.id==='metric'||['weight-fat','weight-waist'].includes(template.id)?'biometric':template.id==='nutrient'?'nutrient':template.id==='score'?'score':null;
   if(!allowed||axis==='secondary'&&!['weight-fat','weight-waist'].includes(template.id))fail('This chart does not support that axis.');
   value[axis]=parseMetric(raw[axis]);if(value[axis].kind!==allowed)fail('Choose a metric of the correct chart type.');
   const requiredType=template.id.startsWith('weight-')?(axis==='primary'?'weight':template.id==='weight-fat'?'body fat':'waist size'):null;
   if(requiredType&&value[axis].type!==requiredType)fail('Keep the built-in chart biometric type.');
  }
  validateUnits(value,axis=>mobileChartUnitChoices(state,template.id,axis,value));charts[template.id]=value;
 }
 const custom=input.custom??{};if(!custom||typeof custom!=='object'||Array.isArray(custom))fail('Invalid custom chart display settings.');
 const parsedCustom=Object.fromEntries(Object.entries(custom).map(([id,raw])=>{
  if(!id.trim()||id.length>1000)fail('Invalid custom chart identity.');object(raw,displayKeys);const parsed=display(raw,{custom:true});
  if(parsed.showOnDashboard&&!(state.charts??[]).some(chart=>chart.id===id))fail('Choose an existing chart to show on Dashboard.');
  validateUnits(parsed,axis=>{const metric=(state.charts??[]).find(chart=>chart.id===id)?.[axis];return metric?chartDisplayUnits(metric):[]});
  return [id,Object.fromEntries(Object.keys(raw).map(key=>[key,parsed[key]]))];
 }));
 return {version:1,charts,custom:parsedCustom};
}
