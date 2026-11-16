import {dc} from './discover-cloud-messages.js';
import {uiLanguage,t} from './app-language.js';
import {escape as e} from './html.js';
const number=value=>Number.isFinite(value)?value.toLocaleString(uiLanguage(),{maximumFractionDigits:2}):'—';
const metrics=()=>[['cycleDay',t('cycleDisplay.cycleDay')],['phase',t('cycleOverlay.phase')],['temperatureVariation',t('cycleDisplay.temperatureVariation')]];
const phase=()=>({follicular:t('cycleOverlay.phase.follicular'),luteal:t('cycleOverlay.phase.luteal'),menstruation:t('cycleOverlay.phase.menstruation'),ovulation:t('cycleOverlay.phase.ovulation'),unknown:t('health.unknown')});
const action=(kind,label)=>`<button type="button" class="dc-link" data-discover="health-${kind}">${e(label)}</button>`;
const card=(kind,title,body)=>`<article class="dc-card dc-health-card" data-health-card="${kind}"><h2>${title}</h2>${body}${action(kind,dc('viewDetails'))}</article>`;
function cycleValue(metric,row){if(!row)return t('cycleDisplay.noObservation');if(row.value===null)return t('recipeImport.notSupplied');return metric==='phase'?phase()[row.value]??t('health.unknown'):metric==='temperatureVariation'?`${number(row.value)} °C`:number(row.value);}
const sourceName=source=>typeof source?.name==='string'?source.name:typeof source?.provider==='string'?source.provider:'';
function cycleFacts(source,{dates=false}={}){
 const name=metrics().map(([metric])=>source[metric]?.source.name).find(Boolean)||source.sourceId;
 return `<section class="dc-health-source"><h3>${e(name)}</h3><dl>${metrics().map(([metric,label])=>{const row=source[metric];return `<div><dt>${label}</dt><dd>${e(cycleValue(metric,row))}${row?`<small>${dates?`<button type="button" data-health-date="${e(row.date)}">${e(row.date)}</button>`:e(row.date)}</small>`:''}</dd></div>`;}).join('')}</dl></section>`;
}
export function glucoseSamplePlot(view){
 const points=view.readings.filter(row=>row.eligible&&row.position&&Number.isFinite(row.displayValue));if(!points.length)return '';
 let low=Infinity,high=-Infinity,start=Infinity,end=-Infinity;for(const row of points){low=Math.min(low,row.displayValue);high=Math.max(high,row.displayValue);start=Math.min(start,row.position.offsetMinutes);end=Math.max(end,row.position.offsetMinutes);}const span=high-low||1,width=end-start||1;
 return `<div class="dc-health-plot"><svg viewBox="0 0 320 115" role="img" aria-label="${e(dc('glucosePlot',{count:points.length,from:view.range.from,to:view.range.to}))}"><path d="M12 100H308" class="dc-health-axis"/>${points.map(row=>`<circle cx="${12+(row.position.offsetMinutes-start)/width*296}" cy="${92-(row.displayValue-low)/span*76}" r="3"><title>${e(row.date)} ${e(row.time)} · ${number(row.displayValue)} ${e(view.unit)}</title></circle>`).join('')}</svg><div><small>${e(view.range.from)}</small><small>${number(low)}–${number(high)} ${e(view.unit)}</small><small>${e(view.range.to)}</small></div></div>`;
}
function glucoseSummary(view){
 if(view.status==='unconfigured')return `<p class="dc-health-empty">${dc('noGlucoseSource')}</p>`;
 if(!view.stats.count)return `<p class="dc-health-empty">${dc('noGlucoseReadings')}</p>`;
 const latest=view.stats.latest;
 const latestNote=view.stats.latestReason?.code==='latest-duplicate'?dc('sharedTimestamp'):view.stats.latestReason?.code==='no-timed-samples'?t('measurementLog.noTime'):'';
 return `<dl class="dc-health-glucose-summary"><div><dt>${dc('latest')}</dt><dd>${number(latest?.displayValue)} <small>${e(view.unit)}</small>${latest?`<small>${e(latest.date)} ${e(latest.time)}</small>`:latestNote?`<small>${latestNote}</small>`:''}</dd></div><div><dt>${dc('average')}</dt><dd>${number(view.stats.mean)} <small>${e(view.unit)}</small><small>${e(dc('recordedSamples',{count:view.stats.count}))}</small></dd></div></dl>${glucoseSamplePlot(view)}`;
}
export function dashboardHealthCardsMarkup(health){
 return `${health?.glucose?card('glucose',t('glucoseCapture.glucose'),glucoseSummary(health.glucose)):''}${health?.cycle?card('cycle',dc('cycleTracking'),health.cycle.sources.length?health.cycle.sources.map(source=>cycleFacts(source)).join(''):`<p class="dc-health-empty">${dc('noCycle')}</p>`):''}`;
}
/** Uses the shared sheet owner. Closing/outside-tap behavior remains with that owner. */
export function openDashboardHealthCard(kind,health,{show,header,content,onDiary,close=()=>{}}){
 const view=health?.[kind];if(!view||!['glucose','cycle'].includes(kind))return false;
 const title=kind==='glucose'?t('glucoseCapture.glucose'):dc('cycleTracking');
 show(`${header(title)}<section class="dashboard-panel dc-health-details"></section>`);const host=content.querySelector('.dc-health-details');let page=0;
 const rows=kind==='glucose'?[...view.readings].sort((a,b)=>b.date.localeCompare(a.date)||String(b.time).localeCompare(String(a.time))):[];
 function render(){
  if(kind==='cycle')host.innerHTML=view.sources.length?view.sources.map(source=>cycleFacts(source,{dates:!!onDiary})).join(''):`<p>${dc('noCycle')}</p>`;
  else{
   const start=page*50,slice=rows.slice(start,start+50),source=row=>sourceName(row.source);
   host.innerHTML=`${glucoseSummary(view)}${view.stats.count?`<dl class="dc-health-range"><div><dt>${t('dashboard.weight.min')}</dt><dd>${number(view.stats.min)} ${e(view.unit)}</dd></div><div><dt>${t('dashboard.weight.max')}</dt><dd>${number(view.stats.max)} ${e(view.unit)}</dd></div></dl>`:''}${rows.length?`<h3>${dc('recordedReadings')}</h3><ul class="dc-health-readings">${slice.map(row=>`<li><div>${onDiary?`<button type="button" data-health-date="${e(row.date)}">${e(row.date)} ${e(row.time)}</button>`:`<span>${e(row.date)} ${e(row.time)}</span>`}<strong>${number(row.displayValue)} ${e(view.unit)}</strong></div><small>${e(row.type)}${source(row)?' · '+e(source(row)):''}${row.copied?' · '+dc('copiedExcluded'):''}${row.duplicateTimestamp?' · '+dc('sharedTimestamp'):''}${!row.time?' · '+dc('timeMissing'):''}${row.unit!==view.unit?' · '+number(row.value)+' '+e(row.unit):''}</small></li>`).join('')}</ul>${rows.length>50?`<nav class="dc-health-pages" aria-label="${e(dc('glucosePages'))}"><button type="button" data-health-page="previous" ${page===0?'disabled':''}>${t('health.previous')}</button><span>${start+1}–${Math.min(start+50,rows.length)}${t('foodPrint.of')}${rows.length}</span><button type="button" data-health-page="next" ${start+50>=rows.length?'disabled':''}>${t('health.next')}</button></nav>`:''}`:''}${view.excludedCount?`<p>${e(dc('invalidGlucose',{count:view.excludedCount}))}</p>`:''}`;
  }
 }
 host.onclick=event=>{const date=event.target.closest('[data-health-date]')?.dataset.healthDate;if(date&&onDiary){close();onDiary(date);return;}const direction=event.target.closest('[data-health-page]')?.dataset.healthPage;if(direction){page+=direction==='next'?1:-1;render();host.scrollTop=0;}};
 render();return true;
}
