import {metricDisplayName} from './report-source/public/metric-language.js';
import {nutrientDisplayName} from './report-source/public/nutrient-language.js';
import {biometricCatalogLabel} from './record-source/biometric-catalog-language.js';
import {scoreName} from './diary-summary-source/score-labels.js';
import {dc,chartText as cm} from './discover-cloud-messages.js';
import {uiLanguage,t} from './app-language.js';
// Presentation extracted from nourishing-local/public/mobile-charts.js:
// MobileCharts.title, seriesLabel, targetLabel, dateLabel and cardMarkup.
// Cloud adapters keep server-owned values and use SVG swatches for the site CSP.
import {escape as e} from './html.js';
import {cgmColors} from './chart-cgm-source.js';
import {biometricCatalog} from './offline-source/server/biometric-library.mjs';
const colors=['#ff6633','#328f95','#c17ccd','#ffb600','#9ca2b1','#6479d9','#57d599','#c1e5e9'];
export const chartSeriesColor=(series,index,card)=>card?.id==='cgm'&&cgmColors[series.id]?cgmColors[series.id]:({protein:'#57d599',carbohydrate:'#35cada',fat:'#c17ccd',alcohol:'#ffb600',unattributed:'#9ca2b1','total cholesterol':'#ff6633','hdl cholesterol':'#328f95','ldl cholesterol':'#ffb600',triglycerides:'#cf37e6',gki:'#ff6633',glucose:'#328f95',insulin:'#8563a5',ketones:'#bf40bc',rem:'#64cddc',light:'#00b8c7',deep:'#008b91'}[series.id]??colors[index%colors.length]);
export function chartMetricLabel(row){
 if(row.metric?.kind==='score')return scoreName({id:row.metric.id,name:metricDisplayName(row,{language:uiLanguage()})});
 const biometric=row.metric?.kind==='biometric'?biometricCatalog.find(item=>item.type===row.metric.type):null;
 return biometric?biometricCatalogLabel({selection:{kind:'catalog',id:biometric.id},label:row.name??biometric.label},uiLanguage()):metricDisplayName(row,{language:uiLanguage()});
}
export function chartSeriesLabel(series){
 if(series.metric)return chartMetricLabel(series);
 const biometric=biometricCatalog.find(row=>row.type===series.id);
 if(biometric)return biometricCatalogLabel({selection:{kind:'catalog',id:biometric.id},label:series.name},uiLanguage());
 const key={calcium:'calciumIntake',absorption:'calciumAbsorption',glucose:'glucoseSeries',insulin:'insulinSeries',ketones:'ketonesSeries'}[series.id];
 if(key)return cm(key);
 return nutrientDisplayName({id:series.id==='carbohydrate'?'carbs':series.id,name:series.name},uiLanguage());
}
export const chartTitle=card=>card.kind==='custom'?card.name:card.id==='cgm-comparison'?cm('compare'):['metric','nutrient','score'].includes(card.id)&&card.series?.[0]?chartSeriesLabel(card.series[0]):['energy','weight-fat','weight-waist','gki','pressure','lipids','sleep','cgm','calcium'].includes(card.id)?cm(card.id):card.name;
export const chartArrow='<svg class="mcl-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const dateLabel=day=>new Date(day+'T12:00:00Z').toLocaleDateString(uiLanguage(),{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
function targetLabel(target){
 const one=points=>{const values=[...new Set(points.map(point=>point.value).filter(Number.isFinite))];return values.length===1?values[0].toLocaleString(uiLanguage(),{minimumFractionDigits:1,maximumFractionDigits:1}):null;},low=one(target.points);
 if(target.upper){const high=one(target.upper.points);return low!==null&&high!==null?cm('targetRangeValues',{low,high}):dc('targetRange');}
 return low===null?t('mobileOracle.target'):cm('targetValue',{value:low});
}
export function chartSourceMarkup(card,active,{detail=false}={}){
 const title=chartTitle(card),empty=card.id==='cgm'&&card.capture?.stats.count===0,known=active.some(series=>series.points.some(p=>Number.isFinite(p.value)));
 const legend=active.map((series,index)=>`<span><svg viewBox="0 0 14 2" aria-hidden="true"><path d="M0 1H14" stroke="${chartSeriesColor(series,index,card)}" stroke-width="2"/></svg>${e(chartSeriesLabel(series))}${series.unit&&!["energy",'sleep','lipids'].includes(card.id)?` (${e(series.unit)})`:''}</span>`).join('');
 return `${detail?'':`<button class="mcl-card-title" type="button" data-chart-open="${e(card.id)}"><h2>${e(title)}</h2>${chartArrow}</button>`}<div class="mcl-plot chart-canvas"><canvas data-chart-plot="${e(card.id)}" role="img" aria-label="${e(title)}${known?'':' — '+dc('chartNoData')}"></canvas>${empty?`<div class="mcl-cgm-empty"><strong>${e(cm('noCgmData'))}</strong><span>${e(cm('noCgmReadings'))}</span></div>`:''}</div><div class="mcl-legend" ${empty?'hidden':''}>${legend}${card.target?`<span><i class="mcl-target-line"></i>${e(targetLabel(card.target))}</span>`:''}${card.fasting?`<span><i class="mcl-fast-line"></i>${t('capabilities.fasting.name')}</span>`:''}</div>${card.timing?.untimedCount?`<p class="mcl-dates" data-mcl-untimed>${e(cm('untimed',{count:card.timing.untimedCount}))}</p>`:''}<p class="mcl-dates" ${card.id==='cgm'?'hidden':''}>${e(dateLabel(card.range.from))} – ${e(dateLabel(card.range.to))}</p>`;
}
