import {uiLanguage,t,createUITranslator} from '../app-language.js';
import {escape as e,symbol} from '../dashboard-source/discover-ui.js';
import {displayValue,displayUnit} from '../dashboard-source/energy-display.js';
import {mobileNutrientGroups,orderedNutrientRows,mobileNutrientName} from '../mobile-nutrient-groups.js';
import {sourceNutrients} from '../report-source/server/source-nutrient-registry.mjs';
import {nutrientGroupName} from '../report-source/public/nutrient-language.js';
import {scoreDisplayName} from '../report-source/public/score-language.js';
import {balanceDisplayName,renderNutrientBalanceCards} from '../report-source/public/nutrient-balance-view.js';
import {defaultDiaryDisplayPolicy} from '../report-source/server/diary-display.mjs';
import {defaultNutritionScoreIds} from '../report-source/server/nutrition-score-policy.mjs';
const messages={
 en:{additional:'More nutrients',noData:'No data',energy:'Energy (Consumed)',macros:'Macronutrient Targets',highlights:'Highlighted Targets',scores:'Nutrition Scores',balances:'Nutrient Balance'},
 fr:{additional:'Autres nutriments',noData:'Aucune donnée',energy:'Énergie (consommée)',macros:'Objectifs de macronutriments',highlights:'Objectifs en évidence',scores:'Scores nutritionnels',balances:'Équilibre des nutriments'},
 de:{additional:'Weitere Nährstoffe',noData:'Keine Daten',energy:'Energie (aufgenommen)',macros:'Makronährstoffziele',highlights:'Hervorgehobene Ziele',scores:'Ernährungsbewertungen',balances:'Nährstoffverhältnisse'},
 'pt-BR':{additional:'Mais nutrientes',noData:'Sem dados',energy:'Energia (consumida)',macros:'Metas de macronutrientes',highlights:'Metas em destaque',scores:'Pontuações nutricionais',balances:'Equilíbrio de nutrientes'},
};
const label=createUITranslator(messages);
export const reportNumber=(value,digits=1)=>Number.isFinite(value)?value.toLocaleString(uiLanguage(),{maximumFractionDigits:digits}):'—';
const percent=value=>Number.isFinite(value)?reportNumber(value)+'%':'—';
const bar=(value,name)=>`<progress max="100" value="${Number.isFinite(value)?Math.min(100,Math.max(0,value)):0}" aria-label="${e(name)}" aria-valuetext="${e(percent(value))}"></progress>`;
export function reportSection(id,title,body,expanded,extra=''){
 return `<details class="dc-card mobile-report-nutrients" data-report-section="${e(id)}" ${extra} ${(expanded.get(id)??true)?'open':''}><summary class="mobile-report-category"><h2>${e(title)}</h2>${symbol('expand_more')}</summary>${body}</details>`;
}
const parents=new Map(sourceNutrients.map(row=>[row.id,row.parentId]));
function reportDepth(id){
 const parent=parents.get(id);
 return parent?1+reportDepth(parent):0;
}
export function reportNutrientRow(row,unit,{compact=false,grouped=false}={}){
 const name=grouped&&row.id==='calories'?label('energy'):mobileNutrientName(row,uiLanguage());
 const amount=row.mean===null?label('noData'):reportNumber(displayValue(row.mean,row.unit,unit))+' '+displayUnit(row.unit,unit);
 return `<div data-mobile-nutrient="${e(row.id)}" ${grouped?`data-depth="${reportDepth(row.id)}"`:''}><button type="button" class="dc-button" data-report-nutrient="${e(row.id)}"><span>${e(name)}${compact?'':` <small>· ${e(amount)}</small>`}</span><strong>${percent(row.percentOfMeanTarget)}</strong></button>${bar(row.percentOfMeanTarget,name)}</div>`;
}
export function reportTargetSections(capture,expanded){
 const {report,energyUnit:unit}=capture,rows=new Map(report.nutrients.map(row=>[row.id,row]));rows.set('netCarbohydrate',report.carbohydrates.net.summary);
 const macroIds=['calories','protein',report.carbohydrate.definition.mode==='net'?'netCarbohydrate':'carbs','fat'];
 const highlights=(capture.display?.highlighted??defaultDiaryDisplayPolicy.highlighted).map(id=>rows.get(id)).filter(row=>row?.visible);
 const split=Math.ceil(highlights.length/2),highlightColumns=[highlights.slice(0,split),highlights.slice(split)];
 const scores=(capture.display?.scores??defaultNutritionScoreIds).map(id=>report.scores.summary.find(row=>row.id===id)).filter(Boolean);
 return reportSection('macros',label('macros'),`<div class="report-target-list">${macroIds.map(id=>reportNutrientRow(rows.get(id),unit)).join('')}</div>`,expanded)+
  reportSection('highlights',label('highlights'),`<div class="report-target-grid">${highlights.length?highlightColumns.map(column=>`<div class="report-highlight-column">${column.map(row=>reportNutrientRow(row,unit,{compact:true})).join('')}</div>`).join(''):`<p>${e(t('diaryDisplay.empty'))}</p>`}</div>`,expanded)+
  reportSection('scores',label('scores'),`<div class="report-target-grid">${scores.map(row=>{const name=scoreDisplayName(row,uiLanguage());return `<div><button type="button" class="dc-button" data-report-score="${e(row.id)}"><span>${e(name)}</span><strong>${percent(row.mean)}</strong></button>${bar(row.mean,name)}</div>`;}).join('')}</div>`,expanded);
}
const defaultIds=new Set(Object.values(mobileNutrientGroups).flat());
function visibleReportRows(report){
 return [...report.nutrients,report.carbohydrates.net.summary].filter(row=>row.visible);
}
export function reportNutrientGroups(capture,expanded){
 const byId=new Map(visibleReportRows(capture.report).map(row=>[row.id,row]));
 const groups=Object.keys(mobileNutrientGroups).map(group=>{
  const members=orderedNutrientRows(byId,group);
  if(!members.length)return '';
  const category=group[0].toUpperCase()+group.slice(1);
  const title=group==='protein'?mobileNutrientName({id:'protein',name:'Protein'},uiLanguage()):nutrientGroupName(category,uiLanguage());
  return reportSection('group:'+category,title,`<div class="report-target-list">${members.map(row=>reportNutrientRow(row,capture.energyUnit,{grouped:true})).join('')}</div>`,expanded,`data-mobile-category="${category}"`);
 }).join('');
 return `<div class="dc-card report-nutrient-groups">${groups}</div>`;
}
export function reportAdditionalNutrients(capture,expanded){
 const extras=visibleReportRows(capture.report).filter(row=>!defaultIds.has(row.id));
 if(!extras.length)return '';
 const id='additional',title=label('additional');
 return `<details class="dc-card mobile-report-nutrients" data-report-section="${id}" ${expanded.get(id)?'open':''}><summary class="mobile-report-category"><h2>${e(title)}</h2>${symbol('expand_more')}</summary><div class="report-target-list">${extras.map(row=>reportNutrientRow(row,capture.energyUnit)).join('')}</div></details>`;
}
// Gauge scales are display bounds; reference bands and values come from the captured balance.
const scales={'omega6-omega3':25,'zinc-copper':20,'potassium-sodium':12,'calcium-magnesium':6,'calcium-oxalate':2};
const pairOrder=Object.keys(scales);
const point=fraction=>{const angle=(150+240*fraction)*Math.PI/180;return [60+44*Math.cos(angle),58+44*Math.sin(angle)];};
const arc=(start,end)=>{const a=point(start),b=point(end);return `M ${a.join(' ')} A 44 44 0 ${end-start>.75?1:0} 1 ${b.join(' ')}`;};
export function reportBalanceSection(capture,expanded){
 const value=capture.report.balances,hidden=new Set(value.policy?.hidden??[]),rows=[...pairOrder.map(id=>value.pairs.find(row=>row.id===id)),value.pral,value.calciumAbsorption].filter(row=>row&&!hidden.has(row.id));
 const rendered=rows.map(row=>{const max=scales[row.id],name=balanceDisplayName(row,uiLanguage()),known=Number.isFinite(row.value),needle=known&&max?point(Math.min(1,Math.max(0,row.value/max))):null;
  const gauge=max?`<svg class="report-balance-gauge" viewBox="0 0 120 100" aria-hidden="true"><path class="report-gauge-track" d="${arc(0,1)}"/><path class="report-gauge-band" d="${arc(Math.min(1,row.reference.low/max),Math.min(1,(row.reference.high??max)/max))}"/>${needle?`<path class="report-gauge-needle" d="M 60 58 L ${needle.join(' ')}"/><circle cx="60" cy="58" r="4" class="report-gauge-center"/>`:''}<text x="4" y="89">0</text><text x="116" y="89" text-anchor="end">${max}</text></svg>`:'';
  return `<button type="button" class="dc-button report-balance" data-report-balance="${e(row.id)}" aria-label="${e(name+': '+reportNumber(row.value,3))}">${gauge}<strong data-balance-value>${reportNumber(row.value,3)}${max?'':` ${e(row.unit)}`}</strong><span class="report-balance-name">${e(name)}</span></button>`;
 });
 return reportSection('balances',label('balances'),`<div class="report-balance-grid">${rendered.filter((_,index)=>scales[rows[index].id]).join('')}</div><div class="report-balance-extras">${rendered.filter((_,index)=>!scales[rows[index].id]).join('')}</div>`,expanded);
}
export function reportBalanceDetail(capture,id){
 const value=capture.report.balances;
 return renderNutrientBalanceCards({...value,policy:{version:1,hidden:value.displayOptions.map(row=>row.id).filter(other=>other!==id)}},{language:uiLanguage()}).replace(/ style="([^"]*)"/g,' data-balance-style="$1"');
}
export function reportScoreDetail(row){
 return `<section class="report-detail-facts"><p>${e(row.description)}</p><strong>${percent(row.mean)}</strong><dl>${[['mobileReport.knownDays',row.knownDays+' / '+row.eligibleDays],['mobileReport.partialDays',row.partialDays]].map(([key,value])=>`<div><dt>${e(t(key))}</dt><dd>${e(value)}</dd></div>`).join('')}</dl>${row.confidence?`<p>${e(t('scoreReport.confidence'))}: ${percent(row.confidence.value)}</p>`:''}</section>`;
}
