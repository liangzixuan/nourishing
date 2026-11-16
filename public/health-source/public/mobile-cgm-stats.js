import {escape as e} from './discover-ui.js';
import {formatMessage} from './../../report-source/public/message-format.js';
import {cgmBandLegend} from './mobile-cgm-guidance.js';
export const openCgmStatistics=host=>[...host.querySelectorAll('[data-mcl-stat-card][open]')].map(node=>node.dataset.mclStatCard);
/** Native card order; a missing vendor metric never becomes sample SD or a
 * sample fraction. Diagnostic sample summaries stay under the relevant card. */
export function cgmStatistics(card,{language,m,open=[]}){
 const stats=card.capture.stats,empty=stats.count===0,unit=card.capture.policy?.displayUnit??card.targetRange.active.unit,number=value=>value===null?'—':new Intl.NumberFormat(language,{minimumFractionDigits:1,maximumFractionDigits:1}).format(value),label=key=>formatMessage(language,'glucoseTimelineView.'+key);
 const metadata=rows=>'<dl class="mcl-stat-meta">'+rows.map(([key,name,value,u=''])=>`<div><dt>${e(name)}</dt><dd data-mcl-stat="${key}" data-value="${value??''}">${e(value===null?'—':new Intl.NumberFormat(language,{maximumFractionDigits:2}).format(value))}${value===null?'':' '+e(u)}</dd></div>`).join('')+'</dl>';
 const band=stats.inBand,meanMeta=metadata([['count',label('count'),stats.count],['inBand',m('readingsInRange'),band?.fraction===null||!band?null:band.fraction*100,'%']]);
 const cards=[['latest',stats.latest?.displayValue??null,unit],['timeInRange',stats.timeInRange.value,'%'],['mean',stats.mean,unit],['min',stats.min,unit],['max',stats.max,unit],['averageDeviation',null,unit]];
 return `<section data-mcl-stats class="mcl-statistics"><h3>${e(m('statsHeading'))}</h3>${cards.map(([key,value,u])=>{
  const content=`<span class="mcl-stat-label">${e(m('stat'+key))}</span><span class="mcl-stat-value" data-mcl-stat="${key}" data-value="${value??''}" ${empty?`data-empty="true" aria-label="${e(m('noCgmData'))}"`:""}>${e(number(empty?0:value))}<small>${e(u)}</small></span>`;
  if(key==='latest')return `<div class="mcl-stat-card" data-mcl-stat-card="latest">${content}</div>`;
  const kind=key==='timeInRange'?'time':key==='averageDeviation'?'variability':'glucose',extra=key==='mean'?meanMeta:key==='averageDeviation'?metadata([['populationSd',label('populationSd'),stats.populationSd,unit],['cvPercent',label('cvPercent'),stats.cvPercent,'%']]):'';
  return `<details class="mcl-stat-card" data-mcl-stat-card="${key}" ${open.includes(key)?'open':''}><summary>${content}<span aria-hidden="true">⌄</span></summary><div class="mcl-stat-expanded">${cgmBandLegend(card,{language,m,kind})}<p>${e(m('statHelp'+key))}</p>${extra}</div></details>`;
 }).join('')}</section>`;
}
