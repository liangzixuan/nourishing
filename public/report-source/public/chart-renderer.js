import {chartSeriesDescription} from './chart-description.js';
import {formatMessage} from './message-format.js';
import {metricDisplayName} from './metric-language.js';
import {mergeSourceAttributions,validateSourceAttributions} from './../server/catalog-source.mjs';
import {renderSourceAttributions} from './source-attribution.js';
import {cycleOverlayMarkup} from './cycle-overlay-renderer.js';
import {validScoreGate,formatScoreGate,formatScoreDisplay,formatScoreConfidence,requiresScoreConfidence} from './score-gate.js';
import {displayUnit,displayValue} from './energy-display.js';
import {parseEnergyUnit} from './../server/energy-units.mjs';

// Native biometric units identify the recorded series and must remain exact.
export const chartDisplayUnit=(metric,unit,energyUnit='kcal')=>['nutrient','energy','exercise'].includes(metric?.kind)?displayUnit(unit,energyUnit):unit;
export const chartDisplayValue=(value,metric,unit,energyUnit='kcal')=>['nutrient','energy','exercise'].includes(metric?.kind)?displayValue(value,unit,energyUnit):value;

const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const invalid=(language='en')=>{throw Error(formatMessage(language,'chartText.incomplete'));};
const percent=value=>value===null||typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100;
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
function validateCompleteness(series,length,language){
  let metric,scope;try{metric=parseCompletenessMetric(series.metric);scope=metric.scope==='carbohydrate'&&series.definition===undefined?null:completenessScope(metric,series.definition);}catch{invalid(language);}
  if(metric.scope!=='carbohydrate'&&Object.hasOwn(series,'definition')||series.id!==JSON.stringify(metric)||series.method!=='local-food-leaf-completeness-v1'||series.denominator!=='food-leaf-occurrences'||typeof series.description!=='string'||series.description.length>10000||series.info.unit!=='%'||!Array.isArray(series.completeness)||series.completeness.length!==length||!series.values.every(percent))invalid(language);
  for(let index=0;index<length;index++){
    const capture=series.completeness[index],value=series.values[index];
    if(capture===null){if(value!==null)invalid(language);continue;}
    if(!exact(capture,['componentIds','nutrients'])||!Array.isArray(capture.componentIds)||capture.componentIds.some(id=>typeof id!=='string'||!id.trim()||id.length>1000)||new Set(capture.componentIds).size!==capture.componentIds.length||!Array.isArray(capture.nutrients)||capture.nutrients.length!==capture.componentIds.length)invalid(language);
    if(!scope||scope.componentId!==null&&(capture.componentIds.length!==1||capture.componentIds[0]!==scope.componentId))invalid(language);
    for(let i=0;i<capture.nutrients.length;i++){
      const row=capture.nutrients[i];
      if(!exact(row,['id','known','total','percent'])||row.id!==capture.componentIds[i]||!Number.isSafeInteger(row.known)||!Number.isSafeInteger(row.total)||row.known<0||row.total<row.known||!percent(row.percent)||(row.total===0)!==(row.percent===null))invalid(language);
    }
    const defined=capture.componentIds.length>0&&capture.nutrients.every(row=>row.percent!==null);
    if(defined!==(value!==null))invalid(language);
  }
}
const completenessFacts=(capture,language)=>capture.nutrients.map(row=>formatMessage(language,'chartText.fact',{id:row.id,known:row.known,total:row.total,value:row.percent===null?formatMessage(language,'chartText.unknownFact'):row.percent+'%'}));
function completenessTables(series,dates,presentation,language){
  const m=(key,values)=>formatMessage(language,'chartText.'+key,values);
  const captures=[...new Map(series.filter(row=>row?.metric?.kind==='data-completeness').map(row=>[row.id,row])).values()];
  return captures.map(row=>{
    const content=`<p data-chart-completeness-method>${escape(m('method',{description:chartSeriesDescription(row,language),method:row.method}))}</p><div class="table-wrap"><table data-chart-completeness-table><caption>${escape(formatMessage(language,'metric.capturedFoodData',{name:metricDisplayName(row,{language})}))}</caption><thead><tr><th>${escape(m('date'))}</th><th>${escape(m('completeness'))}</th><th>${escape(m('components'))}</th></tr></thead><tbody>${dates.map((date,index)=>{const capture=row.completeness[index];return `<tr data-completeness-date="${escape(date)}"><td>${escape(date)}</td><td>${row.values[index]===null?m('unknown'):escape(row.values[index])+'%'}</td><td>${capture===null?m('notCaptured'):capture.componentIds.length?presentation==='print'?escape(completenessFacts(capture,language).join('; ')):`<details data-chart-components><summary>${escape(m('componentCount',{count:capture.componentIds.length}))}</summary><ul>${completenessFacts(capture,language).map(fact=>`<li>${escape(fact)}</li>`).join('')}</ul></details>`:m('noComponents')}</td></tr>`;}).join('')}</tbody></table></div>`;
    return presentation==='print'?`<section data-chart-completeness>${content}</section>`:`<details data-chart-completeness><summary>${escape(m('foodData'))}</summary>${content}</details>`;
  }).join('');
}
function tickFormatter(low,high){
  const step=(high-low)/4,digits=Math.max(0,Math.ceil(-Math.log10(step))+1);
  return value=>{if(value===0)return '0';const magnitude=Math.abs(value);if(magnitude>=10000||magnitude<0.001){const [mantissa,exponent]=value.toExponential(2).split('e');return `${Number(mantissa)}e${Number(exponent)}`;}return value.toLocaleString(undefined,{maximumFractionDigits:digits});};
}

/** Draw the shared owner's projected numeric/null series. No metric lookup,
 * daily aggregation, resource conversion or application state belongs here.
 * Energy display converts only explicit nutrition/energy metric metadata. */
export function renderChart(data,{presentation='screen',energyUnit='kcal',language='en'}={}){
  const m=(key,values)=>formatMessage(language,'chartText.'+key,values);
  if(!data||!Array.isArray(data.dates)||data.dates.length>3660||data.dates.some(date=>typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))||!data.range||!['screen','print'].includes(presentation))invalid(language);
  parseEnergyUnit(energyUnit);
  const {dates,range}=data;const calendarProjection=data.axis==='calendar-projection';if(data.axis!==undefined&&!calendarProjection)invalid(language);if(calendarProjection&&(dates.length<2||dates[0]!==range.from||dates.at(-1)!==range.to||dates.some((date,i)=>!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||i>0&&date<=dates[i-1])))invalid(language);let {primary,secondary=null}=data;
  for(const series of [primary,secondary].filter(s=>s?.metric?.id==='keto'&&s.metric.kind==='score')){if(!Array.isArray(series.gates)||series.gates.length!==dates.length)invalid(language);for(let i=0;i<dates.length;i++){if(series.gates[i]===null){if(series.values[i]!==null||series.coverage?.[i]!==null)invalid(language);}else if(!validScoreGate({id:'keto',method:series.method,value:series.values[i],coverage:series.coverage[i],gate:series.gates[i],display:series.displays?.[i],confidence:series.confidences?.[i]}))invalid(language);}}
  for(const series of [primary,secondary].filter(Boolean))if(!series.info||typeof series.info.name!=='string'||series.info.name.length>1000||(series.info.unit!==null&&(typeof series.info.unit!=='string'||series.info.unit.length>1000))||!Array.isArray(series.values)||series.values.length!==dates.length||series.values.some(value=>value!==null&&!Number.isFinite(value)))invalid(language);
  for(const series of [primary,secondary].filter(s=>s?.metric?.kind==='score'&&s.method?.startsWith('public-web-'))){const needsConfidence=requiresScoreConfidence(series.method,series.metric.id);if(needsConfidence?(!Array.isArray(series.confidences)||series.confidences.length!==dates.length):Object.hasOwn(series,'confidences'))invalid(language);if(!Array.isArray(series.displays)||series.displays.length!==dates.length)invalid(language);for(let i=0;i<dates.length;i++){if(series.values[i]===null){if(series.displays[i]!==null||needsConfidence&&series.confidences[i]!==null)invalid(language);}else if(!validScoreGate({id:series.metric.id,method:series.method,value:series.values[i],display:series.displays[i],coverage:series.coverage?.[i],...(needsConfidence?{confidence:series.confidences[i]}:{}),...(series.metric.id==='keto'?{gate:series.gates?.[i]}:{})}))invalid(language);}}
  for(const series of [primary,secondary].filter(series=>series?.metric?.kind==='score'))if(typeof series.method!=='string'||typeof series.description!=='string'||!Array.isArray(series.coverage)||series.coverage.length!==dates.length||series.coverage.some(row=>row!==null&&(!row||!Number.isInteger(row.known)||!Number.isInteger(row.total)||row.known<0||row.total<row.known||typeof row.complete!=='boolean')))invalid(language);
  for(const series of [primary,secondary].filter(series=>series?.metric?.kind==='data-completeness'))validateCompleteness(series,dates.length,language);
  if(!primary)invalid(language);
  const name=series=>`${metricDisplayName(series,{language})} (${series.info.reviewRequired?m('unitRequired'):series.info.unit})`;
  if(primary.info.reviewRequired||secondary?.info.reviewRequired)return `<p class="chart-review-required">${escape(m('review'))}</p>`;
  const present=series=>series&&({...series,sourceValues:series.values,sourceUnit:series.info.unit,info:{...series.info,unit:chartDisplayUnit(series.metric,series.info.unit,energyUnit)},values:series.values.map(value=>chartDisplayValue(value,series.metric,series.info.unit,energyUnit))});
  primary=present(primary);secondary=present(secondary);
  const values=primary.values,secondaryValues=secondary?.values||[];
  const credits=renderSourceAttributions(mergeSourceAttributions(...[primary,secondary].filter(Boolean).map(series=>validateSourceAttributions(series.attributions))));
  const capturedTables=completenessTables([primary,secondary],dates,presentation,language);
  if(!values.some(Number.isFinite)&&!secondaryValues.some(Number.isFinite))return `<div class="empty"><h3>${escape(m('empty'))}</h3><p>${escape(m('emptyHelp'))}</p></div>`+credits+capturedTables+cycleOverlayMarkup(data.cycleOverlay,{language,range,dates,presentation,axis:calendarProjection?'calendar-projection':'calendar'}).details;
  const width=680,height=225,pad={l:72,r:secondary?72:22,t:20,b:35},span=(Date.parse(range.to+'T00:00:00Z')-Date.parse(range.from+'T00:00:00Z'))/86400000,offset=date=>(Date.parse(date+'T00:00:00Z')-Date.parse(range.from+'T00:00:00Z'))/86400000,x=index=>pad.l+(calendarProjection?offset(dates[index])/span:index/Math.max(1,dates.length-1))*(width-pad.l-pad.r);
  const axis=values=>{const known=values.filter(Number.isFinite),low=Math.min(0,...known),high=Math.max(1,...known)*1.15;return {low,high,label:tickFormatter(low,high),y:value=>height-pad.b-(value-low)/(high-low)*(height-pad.t-pad.b)};};
  const primaryAxis=axis(values),secondaryAxis=axis(secondaryValues);
  const overlay=cycleOverlayMarkup(data.cycleOverlay,{language,range,dates,presentation,axis:calendarProjection?'calendar-projection':'calendar',plot:{left:pad.l,right:width-pad.r,top:pad.t,bottom:height-pad.b,x,bounds:row=>({left:pad.l+Math.max(0,offset(row.date)-0.5)/span*(width-pad.l-pad.r),right:pad.l+Math.min(span,offset(row.date)+0.5)/span*(width-pad.l-pad.r)})}});
  const paths=(values,y,color,kind)=>{const segments=[];let segment='';values.forEach((value,index)=>{if(!Number.isFinite(value)){if(segment)segments.push(segment);segment='';return;}segment+=`${segment?'L':'M'}${x(index).toFixed(1)},${y(value).toFixed(1)} `;});if(segment)segments.push(segment);return segments.map(path=>`<path class="${kind==='primary'?'line':'secondary-line'}" d="${path}" fill="none" stroke="${color}" stroke-width="2.5"/>`).join('');};
  const points=(series,y,color,kind)=>series.values.map((value,index)=>{
    if(!Number.isFinite(value))return '';
    const score=series.metric?.kind==='score',coverage=score?series.coverage[index]:null,complete=series.metric?.kind==='data-completeness'?series.completeness[index]:null;
    const attributes=score?` data-score-method="${escape(series.method)}"${coverage?` data-coverage-known="${coverage.known}" data-coverage-total="${coverage.total}" data-coverage-complete="${coverage.complete}"`:''}`:complete?` data-completeness-method="${escape(series.method)}" data-completeness-denominator="${escape(series.denominator)}" data-completeness-components="${escape(JSON.stringify(complete.componentIds))}"`:'';
    const detail=score?`; ${coverage?m('coverage',{known:coverage.known,total:coverage.total,state:m(coverage.complete?'complete':'partial')}):m('unavailableCoverage')}; ${series.method}${series.gates?.[index]?'; '+formatScoreGate(series.gates[index],language):''}${series.displays?.[index]?'; '+formatScoreDisplay(series.displays[index],language):''}${series.confidences?.[index]?'; '+formatScoreConfidence(series.confidences[index],language):''}`:complete?`; ${completenessFacts(complete,language).join('; ')}; ${series.method}`:'';
    return `<circle data-chart-series="${kind}" data-date="${escape(dates[index])}" data-value="${series.sourceValues[index]}" data-unit="${escape(series.sourceUnit)}" data-display-value="${value}" data-display-unit="${escape(series.info.unit)}"${attributes} cx="${x(index)}" cy="${y(value)}" r="3" fill="white" stroke="${color}"><title>${escape(dates[index])}: ${String(value)} ${escape(series.info.unit)}${escape(detail)}</title></circle>`;
  }).join('');
  const svg=`<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(m('trend',{name:secondary?m('paired',{primary:name(primary),secondary:name(secondary)}):name(primary),from:range.from,to:range.to}))}">${overlay.bands}${[0,.25,.5,.75,1].map(fraction=>{const value=primaryAxis.low+(primaryAxis.high-primaryAxis.low)*fraction,second=secondaryAxis.low+(secondaryAxis.high-secondaryAxis.low)*fraction;return `<line class="gridline" x1="${pad.l}" y1="${primaryAxis.y(value)}" x2="${width-pad.r}" y2="${primaryAxis.y(value)}" stroke="#d7dfd7" stroke-dasharray="3 5"/><text data-axis-tick="primary" x="${pad.l-8}" y="${primaryAxis.y(value)+3}" text-anchor="end" fill="#526459" font-family="Arial,sans-serif" font-size="12">${escape(primaryAxis.label(value))}</text>${secondary?`<text data-axis-tick="secondary" x="${width-pad.r+8}" y="${primaryAxis.y(value)+3}" text-anchor="start" fill="#587746" font-family="Arial,sans-serif" font-size="12">${escape(secondaryAxis.label(second))}</text>`:''}`;}).join('')}${paths(values,primaryAxis.y,'#e56836','primary')}${secondary?paths(secondaryValues,secondaryAxis.y,'#7c9d69','secondary'):''}${points(primary,primaryAxis.y,'#e56836','primary')}${secondary?points(secondary,secondaryAxis.y,'#7c9d69','secondary'):''}${dates.map((date,index)=>(index===0||index===dates.length-1||index===Math.floor(dates.length/2))?`<text x="${x(index)}" y="${height-8}" text-anchor="middle" fill="#526459" font-family="Arial,sans-serif" font-size="12">${escape(date.slice(5))}</text>`:'').join('')}</svg>`;
  return (presentation==='print'?svg:`<div class="chart-plot-region" role="region" tabindex="0" aria-label="${escape(m('plot',{name:name(primary)}))}">${svg}</div><p class="chart-pan-hint mini-note">${escape(m('pan'))}</p>`)+credits+capturedTables+overlay.details;
}
import {parseCompletenessMetric,completenessScope} from './../server/completeness-metric.mjs';
