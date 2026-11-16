import {catalog} from './report-source/server/nutrient-catalog.mjs';
import {projectDiaryTarget} from './report-source/server/diary-display.mjs';
import {convertEnergy} from './report-source/server/energy-units.mjs';
import {nutrientDisplayName,nutrientGroupName} from './report-source/public/nutrient-language.js';
import {offlineMessage} from './offline-language.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderOfflineMacros(summary,settings={},language='en'){
 if(settings.showMacros===false)return '';
 const unit=settings.energyUnit??'kcal',mode=summary.diaryDisplay.policy.macroDisplay==='remaining'?'remaining':'value',number=value=>Number.isFinite(value)?new Intl.NumberFormat(language,{maximumFractionDigits:1}).format(value):'—';
 return summary.diaryDisplay.macros.map(row=>`<span>${esc(number(row.unit==='kcal'?convertEnergy(row[mode],'kcal',unit):row[mode]))} ${esc(row.unit==='kcal'?unit:row.unit)} <small>${esc(nutrientDisplayName(row,language))}</small></span>`).join(' · ');
}
export function renderOfflineNutrition(summary,settings={},language='en',day=summary){
 const t=(key,values)=>offlineMessage(language,key,values),unit=settings.energyUnit??'kcal',hidden=new Set(summary.nutrientDisplay.hidden),number=value=>Number.isFinite(value)?new Intl.NumberFormat(language,{maximumFractionDigits:2}).format(value):'—';
 const value=(n,row,mode='value')=>{const raw=row[mode];return number(n.unit==='kcal'?convertEnergy(raw,'kcal',unit):raw);};
 const facts={totals:summary.totals,targets:summary.targets,coverage:summary.nutrientCoverage,complete:summary.complete,carbohydrate:summary.carbohydrate,carbohydrates:summary.carbohydrates};
 const groups=new Map();for(const n of [...catalog,{id:'netCarbohydrate',name:'Net carbohydrate',unit:'g',group:'Carbohydrates'}]){if(hidden.has(n.id))continue;const group=n.group??'General';if(!groups.has(group))groups.set(group,[]);groups.get(group).push(n);}
 const energy=settings.showEnergy===false?'':`${summary.scope==='selection'?`<small>${esc(offlineMessage(language,'offlineDiary.day'))}</small>`:''}<div class="offline-energy">${[[t("accountCloud.offlineConsumed"),day.energy.consumed],[t("mobileMacroEnergy.exercise"),day.energy.exercise],[t("accountCloud.offlineTarget"),day.energy.target],[t("accountCloud.offlineRemaining"),day.energy.remaining]].map(([label,n])=>`<div><small>${esc(label)}</small><strong>${esc(number(convertEnergy(n,'kcal',unit)))} ${unit}</strong></div>`).join('')}</div>`;
 const macro=settings.showMacros===false?'':`<div class="offline-macros">${summary.diaryDisplay.macros.map(row=>`<div><small>${esc(nutrientDisplayName(row,language))}</small><strong>${esc(value(row,row,summary.diaryDisplay.policy.macroDisplay==='remaining'?'remaining':'value'))} ${row.unit==='kcal'?unit:esc(row.unit)}</strong></div>`).join('')}</div>`;
 return `<details class="offline-nutrition"><summary>${esc(t("accountCloud.nutritionSummary"))}</summary>${energy}${macro}${[...groups].map(([group,nutrients])=>`<details><summary>${esc(nutrientGroupName(group,language))}</summary><table><thead><tr><th>${esc(t("foodPrint.nutrient"))}</th><th>${esc(t("accountCloud.offlineConsumed"))}</th><th>${esc(t("accountCloud.offlineTarget"))}</th></tr></thead><tbody>${nutrients.map(n=>{const row=projectDiaryTarget({id:n.id,...facts}),coverage=row.coverage,maximum=summary.nutrientDisplay.thresholds[n.id]?.maximum;return `<tr data-nutrient="${n.id}"><th>${esc(nutrientDisplayName(n,language))}${coverage?.total&&!coverage.complete?`<small>${coverage.known}/${coverage.total}</small>`:''}</th><td>${esc(value(n,row))} ${n.unit==='kcal'?unit:esc(n.unit)}</td><td>${esc(value(n,row,'target'))}${Number.isFinite(maximum)?`<small>≤ ${esc(number(n.unit==='kcal'?convertEnergy(maximum,'kcal',unit):maximum))}</small>`:''}</td></tr>`;}).join('')}</tbody></table></details>`).join('')}</details>`;
}
