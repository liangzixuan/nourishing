// Presentation extracted from cronometer-local/public/mobile-charts.js:
// MobileCharts.title, seriesLabel, targetLabel, dateLabel and cardMarkup.
// Cloud adapters keep server-owned values and use SVG swatches for the site CSP.
import {escape as e} from './html.js';
import {cgmColors} from './chart-cgm-source.js';
import {biometricCatalog} from './offline-source/server/biometric-library.mjs';
const colors=['#ff6633','#328f95','#c17ccd','#ffb600','#9ca2b1','#6479d9','#57d599','#c1e5e9'];
export const chartSeriesColor=(series,index,card)=>card?.id==='cgm'&&cgmColors[series.id]?cgmColors[series.id]:({protein:'#57d599',carbohydrate:'#35cada',fat:'#c17ccd',alcohol:'#ffb600',unattributed:'#9ca2b1','total cholesterol':'#ff6633','hdl cholesterol':'#328f95','ldl cholesterol':'#ffb600',triglycerides:'#cf37e6',gki:'#ff6633',glucose:'#328f95',insulin:'#8563a5',ketones:'#bf40bc',rem:'#64cddc',light:'#00b8c7',deep:'#008b91'}[series.id]??colors[index%colors.length]);
export function chartSeriesLabel(series){
 if(series.metric?.kind==='biometric')return biometricCatalog.find(row=>row.type===series.metric.type)?.label??series.name;
 if(['total cholesterol','hdl cholesterol','ldl cholesterol','triglycerides'].includes(series.id))return biometricCatalog.find(row=>row.type===series.id)?.label??series.name;
 return {calcium:'Calcium Intake',absorption:'Calcium Absorption'}[series.id]??series.name;
}
export const chartTitle=card=>card.kind==='custom'?card.name:card.id==='cgm-comparison'?'Compare':card.id==='energy'?'Calories Consumed (kcals)':['metric','nutrient','score'].includes(card.id)&&card.series?.[0]?chartSeriesLabel(card.series[0]):card.name;
export const chartArrow='<svg class="mcl-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const dateLabel=day=>new Date(day+'T12:00:00Z').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
function targetLabel(target){
 const one=points=>{const values=[...new Set(points.map(point=>point.value).filter(Number.isFinite))];return values.length===1?values[0].toLocaleString(undefined,{minimumFractionDigits:1,maximumFractionDigits:1}):null;},low=one(target.points);
 if(target.upper){const high=one(target.upper.points);return low!==null&&high!==null?`Target Range: (${low}–${high})`:'Target Range';}
 return low===null?'Daily Target':`Daily Target: ${low}`;
}
export function chartSourceMarkup(card,active,{detail=false}={}){
 const title=chartTitle(card),empty=card.id==='cgm'&&card.capture?.stats.count===0,known=active.some(series=>series.points.some(p=>Number.isFinite(p.value)));
 const legend=active.map((series,index)=>`<span><svg viewBox="0 0 14 2" aria-hidden="true"><path d="M0 1H14" stroke="${chartSeriesColor(series,index,card)}" stroke-width="2"/></svg>${e(chartSeriesLabel(series))}${series.unit&&!['energy','sleep','lipids'].includes(card.id)?` (${e(series.unit)})`:''}</span>`).join('');
 return `${detail?'':`<button class="mcl-card-title" type="button" data-chart-open="${e(card.id)}"><h2>${e(title)}</h2>${chartArrow}</button>`}<div class="mcl-plot chart-canvas"><canvas data-chart-plot="${e(card.id)}" role="img" aria-label="${e(title)}${known?'':' — No data available'}"></canvas>${empty?'<div class="mcl-cgm-empty"><strong>No CGM Data</strong><span>No glucose readings available</span></div>':''}</div><div class="mcl-legend" ${empty?'hidden':''}>${legend}${card.target?`<span><i class="mcl-target-line"></i>${e(targetLabel(card.target))}</span>`:''}${card.fasting?'<span><i class="mcl-fast-line"></i>Fasting</span>':''}</div>${card.timing?.untimedCount?`<p class="mcl-dates" data-mcl-untimed>${card.timing.untimedCount} readings without a time</p>`:''}<p class="mcl-dates" ${card.id==='cgm'?'hidden':''}>${e(dateLabel(card.range.from))} – ${e(dateLabel(card.range.to))}</p>`;
}
