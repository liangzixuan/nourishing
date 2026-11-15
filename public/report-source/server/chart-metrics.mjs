import {mergeSourceAttributions} from './catalog-source.mjs';
import {carbohydrateDefinition,netCarbohydrateDefinition,carbohydrateLabel,carbohydrateDescription,parseCarbohydrateDefinition} from './carbohydrate-policy.mjs';
import {parseCompletenessMetric,completenessScope} from './completeness-metric.mjs';
import {catalog,iterateTrendDays} from './nutrition.mjs';
import {parseBiometricMetric,matchesBiometric} from './biometric-metrics.mjs';
import {nutritionScoreDefinitions} from './nutrition-score-policy.mjs';
export {biometricObservations} from './biometric-metrics.mjs';

const nutrients=new Map(catalog.map(metric=>[metric.id,metric])),dayMilliseconds=86400000;
const scores=new Map(nutritionScoreDefinitions.map(score=>[score.id,score]));
const energyMetrics={expenditure:'Estimated energy expenditure',target:'Effective energy target',remaining:'Energy remaining to target',balance:'Energy balance'};
const invalid=message=>{throw Object.assign(new Error(message),{status:400});};
function fields(value,allowed,name){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key)))invalid(`${name} contains invalid fields.`);}
function exactText(value,name,max){if(typeof value!=='string'||!value.trim()||value.length>max)invalid(`${name} must be nonempty text up to ${max} characters.`);return value;}
function calendar(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))invalid('Chart dates must use YYYY-MM-DD.');
  const instant=Date.parse(value+'T00:00:00Z');if(!Number.isFinite(instant)||new Date(instant).toISOString().slice(0,10)!==value)invalid('Choose a real calendar date for the chart.');return instant;
}
export function parseMetric(input){
  if(input?.kind==='data-completeness'){
    const metric=parseCompletenessMetric(input);
    if(metric.scope==='nutrient'&&!nutrients.has(metric.id)||metric.scope==='group'&&!scores.has(metric.id))invalid('Choose a known food-data completeness nutrient or group.');
    return metric;
  }
  fields(input,['kind',...(['nutrient','energy','score'].includes(input?.kind)?['id']:input?.kind==='carbohydrate'?['mode']:input?.kind==='data-completeness'?[]:['type','unit'])],'Chart metric');
  if(input.kind==='score'){if(!scores.has(input.id))invalid('Choose a known nutrition progress score.');return {kind:'score',id:input.id};}
  if(input.kind==='energy'){if(!Object.hasOwn(energyMetrics,input.id))invalid('Choose a known energy metric.');return {kind:'energy',id:input.id};}
  if(input.kind==='carbohydrate'){if(Object.hasOwn(input,'mode')&&!['total','net'].includes(input.mode))invalid('Choose Total or Net carbohydrate, or omit mode to follow tracking.');return {kind:'carbohydrate',...(Object.hasOwn(input,'mode')?{mode:input.mode}:{})};}
  if(input.kind==='nutrient'){
    if(!nutrients.has(input.id))invalid('Choose a known nutrient metric.');return {kind:'nutrient',id:input.id};
  }
  if(input.kind!=='biometric')invalid('Choose a nutrient or biometric metric.');
  return parseBiometricMetric(input);
}
export function metricIdentity(metric){return JSON.stringify(parseMetric(metric));}
export function metricInfo(metric){
  const parsed=parseMetric(metric);if(parsed.kind==='nutrient'){const info=nutrients.get(parsed.id);return {name:info.name,unit:info.unit,reviewRequired:false};}
  if(parsed.kind==='energy')return {name:energyMetrics[parsed.id],unit:'kcal',reviewRequired:false};
  if(parsed.kind==='score')return {name:scores.get(parsed.id).name,unit:'%',reviewRequired:false};
  if(parsed.kind==='data-completeness')return {name:parsed.scope==='nutrient'?nutrients.get(parsed.id).name+' food-data completeness':parsed.scope==='group'?scores.get(parsed.id).name.replace(/ target progress$/,'')+' food-data completeness':parsed.scope==='carbohydrate'?(parsed.mode==='total'?'Total carbohydrate':parsed.mode==='net'?'Net carbohydrate':'Tracked carbohydrate')+' food-data completeness':'Food-data completeness',unit:'%',reviewRequired:false};
  if(parsed.kind==='carbohydrate')return {name:parsed.mode==='total'?'Total carbohydrate':parsed.mode==='net'?'Net carbohydrate':'Tracked carbohydrate',unit:'g',reviewRequired:false};
  return {name:parsed.type,unit:parsed.unit,reviewRequired:parsed.unit===null};
}
export function metricOptions(state){
  const options=catalog.map(info=>({metric:{kind:'nutrient',id:info.id},name:info.name,unit:info.unit})),seen=new Set(options.map(option=>JSON.stringify(option.metric)));
  const definition=carbohydrateDefinition(state.settings);options.push({metric:{kind:'carbohydrate'},name:carbohydrateLabel(definition)+' (tracked)',unit:'g'});
  for(const mode of ['total','net']){const metric={kind:'carbohydrate',mode};options.push({metric,...metricInfo(metric)});}
  for(const [id,name]of Object.entries(energyMetrics))options.push({metric:{kind:'energy',id},name,unit:'kcal'});
  for(const {id,name}of nutritionScoreDefinitions)options.push({metric:{kind:'score',id},name,unit:'%'});
  options.push({metric:{kind:'data-completeness'},name:'Food-data completeness',unit:'%'});
  for(const {id}of catalog.filter(row=>row.id!=='carbs')){const metric={kind:'data-completeness',scope:'nutrient',id},{name,unit}=metricInfo(metric);options.push({metric,name,unit});}
  for(const {id}of nutritionScoreDefinitions.filter(row=>row.id!=='overall')){const metric={kind:'data-completeness',scope:'group',id},{name,unit}=metricInfo(metric);options.push({metric,name,unit});}
  options.push({metric:{kind:'data-completeness',scope:'carbohydrate'},name:carbohydrateLabel(definition)+' food-data completeness (tracked)',unit:'%'});
  for(const mode of ['total','net']){const metric={kind:'data-completeness',scope:'carbohydrate',mode};options.push({metric,...metricInfo(metric)});}
  const add=(type,unit)=>{
    if(unit===null||unit===undefined)return;
    let metric;try{metric=parseMetric({kind:'biometric',type,unit});}catch(error){if(error.status===400)return;throw error;}
    const key=JSON.stringify(metric);if(seen.has(key))return;seen.add(key);options.push({metric,name:metric.type,unit:metric.unit});
  };
  for(const row of state.biometrics??[])add(row.type,row.unit);
  for(const definition of state.settings?.customBiometrics??[])if(definition&&typeof definition==='object')add(definition.name,definition.unit);
  return options;
}
export function carbohydrateMetricDefinition(settings,metric){const parsed=parseMetric(metric);if(parsed.kind!=='carbohydrate')invalid('Choose a carbohydrate metric.');return parsed.mode==='net'?netCarbohydrateDefinition(settings):parsed.mode==='total'?{mode:'total',excluded:[]}:carbohydrateDefinition(settings);}
/** Callers use parsed metrics; facts come from the nutrition owner. */
export function carbohydrateMetricFacts(day,metric){return metric.mode?day?.carbohydrates?.[metric.mode]:day?.carbohydrate;}
function matchingBiometrics(day,metric){return (day?.biometrics??[]).filter(row=>matchesBiometric(row,metric));}
function completenessSelection(day,metric){
  const capture=day?.dataCompleteness;if(!capture)return null;
  if(!metric.scope)return capture.overall;
  if(metric.scope==='group')return capture.groups.find(row=>row.id===metric.id)??null;
  const id=completenessScope(metric,carbohydrateMetricFacts(day,metric)?.definition).componentId,row=capture.nutrients.find(row=>row.id===id);
  return row?{componentIds:[id],percent:row.percent}:null;
}
function valueForMetric(day,metric){
  if(metric.kind==='data-completeness'){const value=completenessSelection(day,metric)?.percent;return Number.isFinite(value)?value:null;}
  if(metric.kind==='score'){const value=day?.scores?.find(score=>score.id===metric.id)?.value;return Number.isFinite(value)?value:null;}
  if(metric.kind==='energy'){const value=day?.energy?.[metric.id];return Number.isFinite(value)?value:null;}
  if(metric.kind==='nutrient'){const value=day?.totals?.[metric.id];return Number.isFinite(value)?value:null;}
  if(metric.kind==='carbohydrate'){const value=carbohydrateMetricFacts(day,metric)?.value;return Number.isFinite(value)?value:null;}
  const selected=matchingBiometrics(day,metric).at(-1);
  return Number.isFinite(selected?.value)?selected.value:null;
}
export function metricValue(day,metric){return valueForMetric(day,parseMetric(metric));}
export function metricAverage(rows,metric){
  if(!Array.isArray(rows))invalid('Chart values require daily rows.');const parsed=parseMetric(metric),values=rows.map(row=>valueForMetric(row,parsed)).filter(value=>value!==null);
  return values.length?values.reduce((total,value)=>total+value,0)/values.length:null;
}
function trackedDefinition(rows,metric={kind:'carbohydrate'}){
  const definitions=rows.map(row=>carbohydrateMetricFacts(row,metric)).filter(row=>row&&Object.hasOwn(row,'definition')).map(row=>row.definition===null?null:parseCarbohydrateDefinition(row.definition));
  if(definitions.some(value=>JSON.stringify(value)!==JSON.stringify(definitions[0])))invalid('A carbohydrate chart requires one captured definition.');
  if(metric.mode&&definitions.some(value=>value!==null&&value.mode!==metric.mode))invalid('The captured carbohydrate mode does not match the selected metric.');
  return definitions[0];
}
export function projectMetricSeries(rows,metric){
  if(!Array.isArray(rows))invalid('Chart values require daily rows.');
  const parsed=parseMetric(metric),series={id:JSON.stringify(parsed),metric:parsed,info:metricInfo(parsed),values:rows.map(row=>valueForMetric(row,parsed))};
  if(parsed.kind==='carbohydrate'){
    const definition=trackedDefinition(rows,parsed);
    if(definition){series.definition=definition;series.description=carbohydrateDescription(series.definition);series.info={...series.info,name:carbohydrateLabel(series.definition)};}
    else if(definition===null){series.definition=null;series.description='Net carbohydrate definition is not set.';}
    series.coverage=rows.map(row=>{const value=carbohydrateMetricFacts(row,parsed)?.coverage;return value?{...value}:null;});series.reasons=rows.map(row=>{const value=carbohydrateMetricFacts(row,parsed)?.reasons;return value?{...value}:null;});
  }
  if(parsed.kind==='score'){
    const captures=rows.map(row=>row?.scores?.find(score=>score.id===parsed.id)).filter(Boolean);
    const methods=new Set(captures.map(score=>score.method).filter(Boolean));if(methods.size>1)invalid('A score chart requires one captured calculation method.');
    series.method=captures[0]?.method??scores.get(parsed.id).method;
    if(series.method.startsWith('public-web-'))series.displays=rows.map(row=>{const display=row?.scores?.find(score=>score.id===parsed.id)?.display;return display?{...display}:null;});
    if(series.method.startsWith('public-web-')&&parsed.id!=='dataQuality')series.confidences=rows.map(row=>{const confidence=row?.scores?.find(score=>score.id===parsed.id)?.confidence;return confidence?structuredClone(confidence):null;});
    if(parsed.id==='keto')series.gates=rows.map(row=>{const gate=row?.scores?.find(score=>score.id===parsed.id)?.gate;return gate?{...gate}:null;});
    series.coverage=rows.map(row=>{const coverage=row?.scores?.find(score=>score.id===parsed.id)?.coverage;return coverage?{...coverage}:null;});
    series.description='Daily local progress under the current target rules. Unknown days remain gaps. '+(scores.get(parsed.id).description);
  }
  if(parsed.kind==='data-completeness'){
    series.method='local-food-leaf-completeness-v1';series.denominator='food-leaf-occurrences';
    series.description=`Daily local food availability ${['nutrient','carbohydrate'].includes(parsed.scope)?'for the selected nutrient, independently of target enablement':'under current target and configured-limit membership'}. Counts are food or ingredient occurrences, not source-quality weights. Water logs are excluded. Unknown days remain gaps; zero percent is recorded missing food data.`;
    if(parsed.scope==='carbohydrate'){
      const definition=trackedDefinition(rows,{kind:'carbohydrate',...(parsed.mode?{mode:parsed.mode}:{})});
      if(definition!==undefined){const scope=completenessScope(parsed,definition);series.definition=scope.definition;series.info={...series.info,name:scope.name};series.description+=' '+(scope.definition===null?'Net carbohydrate definition is not set. No food contribution has a usable Net value.':carbohydrateDescription(scope.definition));}
    }
    series.completeness=rows.map(row=>{
      const capture=row?.dataCompleteness,selected=completenessSelection(row,parsed);if(!capture||!selected)return null;
      const componentIds=[...selected.componentIds],byId=new Map(capture.nutrients.map(nutrient=>[nutrient.id,nutrient]));
      return {componentIds,nutrients:componentIds.map(id=>{const {known,total,percent}=byId.get(id);return {id,known,total,percent};})};
    });
  }
  series.attributions=['nutrient','carbohydrate','energy','score','data-completeness'].includes(parsed.kind)?mergeSourceAttributions(...rows.filter((row,index)=>series.values[index]!==null).map(row=>row.attributions)):[];
  return series;
}
export function projectChart(rows,primary,secondary=null,range){
  if(!Array.isArray(rows))invalid('Chart values require daily rows.');fields(range,['from','to'],'Chart range');const start=calendar(range.from),end=calendar(range.to),count=(end-start)/dayMilliseconds+1;
  if(count<1||count>3660)invalid('Choose a chart projection range from 1 to 3660 days.');
  const byDate=new Map(rows.map(row=>[row.date,row])),window=Array.from({length:count},(_,index)=>{const date=new Date(start+index*dayMilliseconds).toISOString().slice(0,10);return byDate.get(date)??{date};});
  return {dates:window.map(row=>row.date),primary:projectMetricSeries(window,primary),secondary:secondary===null?null:projectMetricSeries(window,secondary),range:{from:range.from,to:range.to}};
}
export function parseChart(input){
  fields(input,['version','id','name','primary','secondary','days','visible','cycleOverlay'],'Chart');
  if(input.version!==2)invalid('Use a version 2 chart definition.');
  const name=exactText(input.name,'Chart name',200).trim(),primary=parseMetric(input.primary),secondary=input.secondary===null?null:parseMetric(input.secondary);
  if(!Number.isInteger(input.days)||input.days<1||input.days>366)invalid('Chart days must be an integer from 1 to 366.');
  if(typeof input.visible!=='boolean')invalid('Chart visibility must be true or false.');
  if(Object.hasOwn(input,'cycleOverlay')&&typeof input.cycleOverlay!=='boolean')invalid('Cycle overlay visibility must be true or false.');
  return {version:2,...(Object.hasOwn(input,'id')?{id:exactText(input.id,'Chart ID',1000)}:{}),name,primary,secondary,days:input.days,visible:input.visible,...(Object.hasOwn(input,'cycleOverlay')?{cycleOverlay:input.cycleOverlay}:{})};
}
export function chartRange(chart,to){
  const parsed=parseChart(chart),end=calendar(to),from=new Date(end-(parsed.days-1)*dayMilliseconds).toISOString().slice(0,10);calendar(from);return {from,to};
}
// Chart rows retain the facts consumed by metric projection and the daily table.
// Project while iterating so unused full daily display/target captures are not retained.
function chartDay(day){
  const {date,logged,complete,totals,biometrics,carbohydrate,carbohydrates}=day;
  const component=row=>({componentIds:row.componentIds,percent:row.percent});
  return {date,attributions:day.attributions,logged,complete,totals,biometrics:structuredClone(biometrics),carbohydrate,carbohydrates:Object.fromEntries(Object.entries(carbohydrates).map(([mode,row])=>[mode,structuredClone({definition:row.definition,value:row.value,coverage:row.coverage,reasons:row.reasons})])),
    energy:Object.fromEntries(Object.keys(energyMetrics).map(id=>[id,day.energy[id]])),
    scores:day.scores.map(({id,value,coverage,gate,display,confidence})=>({id,value,coverage,...(gate?{gate:{...gate}}:{}),...(display?{display:{...display}}:{}),...(confidence?{confidence:structuredClone(confidence)}:{})})),
    dataCompleteness:{overall:component(day.dataCompleteness.overall),
      groups:day.dataCompleteness.groups.map(row=>({id:row.id,...component(row)})),
      nutrients:day.dataCompleteness.nutrients.map(({id,known,total,percent})=>({id,known,total,percent}))}};
}
export function createChartFacts(state,input){
  fields(input,['from','to'],'Chart range');const {from,to}=input,start=calendar(from),end=calendar(to);
  if(end<start)invalid('The chart end date must be on or after the start date.');
  const charts=(state.charts??[]).map(parseChart);let loadedFrom=from;
  for(const chart of charts)if(chart.visible){const range=chartRange(chart,to);if(range.from<loadedFrom)loadedFrom=range.from;}
  if((end-calendar(loadedFrom))/dayMilliseconds+1>3660)invalid('A chart view can include at most 3660 daily rows.');
  return {version:1,range:{from,to},loadedRange:{from:loadedFrom,to},rows:Array.from(iterateTrendDays(state,loadedFrom,to),chartDay),charts};
}
