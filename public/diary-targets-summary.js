import {uiLanguage,t} from './app-language.js';
import {coreText} from './core-cloud-messages.js';
import {escape as e} from './html.js';
import {displayUnit,displayValue} from './dashboard-source/energy-display.js';
import {nutrientDisplayName} from './report-source/public/nutrient-language.js';
import {appendShellNavigation} from './app-shell.js';

export function openDiaryTargetsSummary({diary,today,initialId,show,close,content,onOpen}){
 const language=uiLanguage(),unit=diary.energyUnit??'kcal';
 const {energy,diaryDisplay,macroTargets,targetAssignment}=diary.summary;
 const rows=diaryDisplay.macros;
 let selected=rows.find(row=>row.id===initialId)??rows[0];
 if(!selected)return;
 const label=key=>coreText('diary.'+key);
 const amount=(value,u,digits=0)=>Number.isFinite(value)
  ?displayValue(value,u,unit).toLocaleString(language,{maximumFractionDigits:digits})+' '+displayUnit(u,unit):'—';
 const textRow=(key,value)=>`<div><dt>${e(key)}</dt><dd>${e(value)}</dd></div>`;
 const action=(name,caption)=>`<button type="button" data-target-link="${name}">${e(caption)}</button>`;
 const gear=(name,caption)=>`<button type="button" data-target-link="${name}" aria-label="${e(caption)}"><img src="/record-source/biometric-icons/cog-outline.svg" alt=""></button>`;
 const weekday=new Intl.DateTimeFormat(language,{weekday:'long',timeZone:'UTC'}).format(new Date(diary.date+'T12:00:00Z'));
 const macroName=row=>nutrientDisplayName(row,language);
 const template=targetAssignment?.name??(targetAssignment?.source==='daily-custom'?label('customTarget'):t('mobileMacroScheduler.defaults'));
 const macros=rows.filter(row=>row.id!=='calories');
 const details=macros.map(row=>{
  const key=['fat','protein'].includes(row.id)?row.id:'carbohydrate';
  const pct=macroTargets?.mode==='ratios'&&macroTargets.basis==='percent'?macroTargets.values?.[key]:null;
  return macroName(row)+' '+(Number.isFinite(pct)?pct.toLocaleString(language)+'%':amount(row.target,row.unit,1));
 }).join(' · ');
 const method=macroTargets?.mode;
 const methodLabel=['fixed','ratios','keto'].includes(method)?' – '+t('templateEditor.'+method):'';
 show(`<section class="ds-dialog ds-energy ds-targets"><header class="sheet-header"><button type="button" data-close aria-label="${e(t('mobileDisplay.back'))}">‹</button><h2 id="sheet-title">${e(label('targetsSummary'))}</h2>${gear('macros',label('editTargets'))}</header>
  <article class="ds-target-card"><div class="ds-target-tabs" role="group" aria-label="${e(label('macros'))}">${rows.map(row=>`<button type="button" data-target-tab="${e(row.id)}">${e(macroName(row))}</button>`).join('')}</div><div data-target-values></div>${action('sources','')}${action('report',label('dailyReport'))}</article>
  <h3 class="ds-target-section">${e(label('templates'))}${gear('scheduler',t('mobileMacroScheduler.title'))}</h3><div class="ds-target-template"><strong>${e(coreText('diary.scheduledFor',{day:weekday}))}</strong><div>${e(template+methodLabel)}</div><small>${e(details)}</small><div><small>${e(t('templateEditor.customEnergy'))} · ${e(energy.targetSource==='fixed'?amount(energy.targetBaseline,'kcal'):t('mobileMacroScheduler.notSet'))}</small></div></div>
  <h3 class="ds-target-section">${e(label('customTarget'))}</h3>${action('day',label(diary.date===today?'editTodayMacros':'editDayMacros'))}</section>`);
 const root=content.querySelector('.ds-targets');
 appendShellNavigation(content,original=>{close();original.click();});
 function render(){
  const row=selected,isEnergy=row.id==='calories';
  const value=isEnergy?energy.consumed:row.value??(row.coverage?.total===0?0:null);
  const remaining=isEnergy?energy.remaining:row.remaining??(row.coverage?.total===0?row.target:null);
  const pct=Number.isFinite(value)&&row.target>0?Math.round(100*value/row.target):null;
  root.querySelectorAll('[data-target-tab]').forEach(tab=>tab.setAttribute('aria-pressed',String(tab.dataset.targetTab===row.id)));
  const breakdown=isEnergy?textRow(label('baseEnergyTarget'),amount(energy.targetBaseline,row.unit))+
   textRow(label('aboveBaseline'),amount(Number.isFinite(energy.target)&&Number.isFinite(energy.targetBaseline)?energy.target-energy.targetBaseline:null,row.unit))+
   textRow(label('totalTarget'),amount(row.target,row.unit)):textRow(t('mobileDiary.target'),amount(row.target,row.unit));
  root.querySelector('[data-target-values]').innerHTML=`<div class="ds-target-reading"><strong>${e(macroName(row))}</strong> · ${e(amount(value,row.unit,1))} / ${e(amount(row.target,row.unit,1))}<span>${pct===null?'—':pct+'%'}</span></div>
  <progress max="100" value="${Math.min(100,Math.max(0,pct??0))}" aria-label="${e(macroName(row))}"></progress><dl>${breakdown}${textRow(t('mobileDiary.consumed'),Number.isFinite(value)?'− '+amount(value,row.unit):'—')}${textRow(t('mobileDiary.remaining'),amount(remaining,row.unit))}</dl>`;
  root.querySelector('[data-target-link="sources"]').textContent=coreText('diary.topSources',{name:macroName(row)});
 }
 render();
 root.onclick=event=>{
  const tab=event.target.closest('[data-target-tab]');
  if(tab){selected=rows.find(row=>row.id===tab.dataset.targetTab);render();return;}
  const link=event.target.closest('[data-target-link]');
  if(link)onOpen(link.dataset.targetLink,selected.id);
 };
}
