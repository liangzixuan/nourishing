import {dc} from './discover-cloud-messages.js';
import {reportTargetSections,reportNutrientGroups,reportAdditionalNutrients,reportBalanceSection,reportBalanceDetail,reportScoreDetail} from './report-mobile-source/report-sections.js';
import {scoreDisplayName} from './report-source/public/score-language.js';
import {balanceDisplayName} from './report-source/public/nutrient-balance-view.js';
import {uiLanguage,t} from './app-language.js';
import {ReportEnergyChart,energyChartMarkup} from './report-mobile-source/report-energy-chart.js';
import {MobileReportNutrientDetail,validateReportNutrientDetail} from './report-mobile-source/mobile-report-nutrient-detail.js';
import {reportNutrientSession} from './report-nutrient-session.js';
import {pushBackHandler} from './back-history.js';
import {mobileNutrientName} from './mobile-nutrient-groups.js';
import {nutrientDisplayName} from './report-source/public/nutrient-language.js';
import {carbohydrateDisplayLabel} from './report-source/public/carbohydrate-description.js';
import {escape as e,symbol,bottomNavigation,ranges,rangeLabel,resolveRange} from './dashboard-source/discover-ui.js';
import {displayValue,displayUnit} from './dashboard-source/energy-display.js';
const number=value=>Number.isFinite(value)?value.toLocaleString(uiLanguage(),{maximumFractionDigits:1}):"—";
const day=value=>new Date(value+'T12:00:00Z').toLocaleDateString(uiLanguage(),{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
const rangeText=options=>`${day(options.from)} – ${day(options.to)}`;
const action=(label,id,extra='')=>`<button type="button" class="dc-button" data-report-action="${id}" ${extra}>${label}</button>`;

// Adapt the original MobileNutritionReport markup to the authenticated cloud capture.
export function mountMobileReport({root,value,onApply,onPrint,rangeSelection={}}){
 let capture=value,disposed=false,busy=false,dialogHistory=null;const expanded=new Map(),stack=[],charts=[new ReportEnergyChart('consumed',uiLanguage()),new ReportEnergyChart('expenditure',uiLanguage())];
 root.classList.add('nutrition-report-mobile');
 const options=()=>capture.report.options;
 function render(){
  for(const node of root.querySelectorAll('[data-report-section]'))expanded.set(node.dataset.reportSection,node.open);
  const {report,energyUnit:unit}=capture;
  const macros=[report.nutrients.find(row=>row.id==="protein"),{...report.carbohydrate.summary,name:carbohydrateDisplayLabel(report.carbohydrate.definition,uiLanguage())},report.nutrients.find(row=>row.id==="fat")].filter(Boolean);
  const macroDetails=`<div class="report-macro-details"><h3>${t('settings.macroLabel')}</h3><div class="mobile-report-macro-list">${macros.map(row=>`<div data-mobile-macro="${e(row.id)}"><span>${e(nutrientDisplayName(row,uiLanguage()))}</span><strong>${number(row.mean)}${row.mean===null?'':' '+e(row.unit)}</strong></div>`).join('')}</div></div>`;
  root.innerHTML=`<div class="mobile-report-toolbar">${action(`<span>${e(t('reportNutrientDetail.average'))}: ${e(rangeText(options()))}</span>${symbol('chevron_right')}`,'dates')}<p role="status"></p></div><div class="mobile-report-body"><div class="mobile-report-overview">${report.energy.summary.filter(row=>['consumed','expenditure','remaining'].includes(row.id)).map(row=>row.id==='consumed'?energyChartMarkup(report.energy,unit,'consumed',macroDetails,uiLanguage()):row.id==='expenditure'?energyChartMarkup(report.energy,unit,'expenditure','',uiLanguage()):`<section class="dc-card report-energy-chart report-remaining" data-report-energy-kind="remaining"><div class="report-energy-heading"><h2>${t('energyReport.remaining')}</h2></div><div class="report-energy-ring"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46"/></svg><div class="report-energy-center"><strong>${number(displayValue(row.mean,'kcal',unit))}</strong>${row.mean===null?'':`<span>${e(unit)}</span>`}</div></div></section>`).join('')}</div>`+reportTargetSections(capture,expanded)+reportNutrientGroups(capture,expanded)+reportBalanceSection(capture,expanded)+reportAdditionalNutrients(capture,expanded)+action(e(t('mobileReport.more')),'options')+'</div>';
  root.querySelector('[data-report-action=options]').onclick=openOptions;
  root.querySelector('[data-report-action=dates]').onclick=openDates;
  root.querySelectorAll('[data-report-nutrient]').forEach(button=>button.onclick=()=>openNutrient(button));
  root.querySelectorAll('[data-report-score]').forEach(button=>button.onclick=()=>{const row=report.scores.summary.find(row=>row.id===button.dataset.reportScore);dialog(scoreDisplayName(row,uiLanguage()),'score',reportScoreDetail(row));});
  root.querySelectorAll('[data-report-balance]').forEach(button=>button.onclick=()=>{const id=button.dataset.reportBalance,row=[...report.balances.pairs,report.balances.pral,report.balances.calciumAbsorption].find(row=>row.id===id);const node=dialog(balanceDisplayName(row,uiLanguage()),'balance',reportBalanceDetail(capture,id));node.querySelectorAll('[data-balance-style]').forEach(element=>{element.style.cssText=element.dataset.balanceStyle;element.removeAttribute('data-balance-style');});});
  for(const chart of charts)void chart.render(root,report.energy);
 }
 function back(){
  const dialog=stack.pop();if(!dialog)return;
  dialog.reportRequest?.abort();dialog.reportDetail?.dispose();dialog.close();dialog.remove();
  if(!stack.length){dialogHistory?.release();dialogHistory=null;}
  if(!disposed)dialog.restoreFocus?.();
 }
 function dispose(){disposed=true;while(stack.length)back();for(const chart of charts)chart.clear();root.classList.remove('nutrition-report-mobile');}
 function dialog(title,screen,html,choice=false){
  const node=document.createElement('dialog');node.className='dc-overlay mobile-report-dialog';node.dataset.mobileReport=screen;node.setAttribute('aria-label',title);
  node.innerHTML=`<header class="dc-dialog-header">${action(symbol(choice?'close':'arrow_back_ios_new'),'back',`aria-label="${e(t(choice?'foodLog.searchClose':'discover.back'))}"`)}<h2>${e(title)}</h2><span class="dc-header-end"></span></header><div class="dc-dialog-body">${html}<p class="dc-error" role="alert"></p></div>`;
  node.addEventListener('cancel',event=>{event.preventDefault();back();});node.addEventListener('click',event=>{if(event.target.closest('[data-report-action=back]'))return back();if(event.target===node){const rect=node.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)back();}});
  document.body.append(node);stack.push(node);node.showModal();
  if(!dialogHistory)dialogHistory=pushBackHandler(()=>{back();if(stack.length)return 'keep';});
  return node;
 }
 function openNutrient(button){
  if(disposed||busy)return;let expected=capture;const selected=structuredClone(options());
  const nutrient=button.dataset.reportNutrient,section=button.closest('[data-report-section]').dataset.reportSection;
  const row=nutrient==='netCarbohydrate'?capture.report.carbohydrates.net.summary:capture.report.nutrients.find(row=>row.id===nutrient);if(!row)return;
  const node=dialog(mobileNutrientName(row,uiLanguage()),'nutrient','');node.classList.add('mobile-report-nutrient-dialog');
  // Accepting current detail replaces the report rows behind the dialog.
  node.restoreFocus=()=>root.querySelector('[data-report-section="'+CSS.escape(section)+'"] [data-report-nutrient="'+CSS.escape(nutrient)+'"]')?.focus({preventScroll:true});
  node.querySelector('[data-report-action=back]').setAttribute('aria-label',dc('closeNutrient'));
  node.reportDetail=new MobileReportNutrientDetail({dialog:node,nutrient,options:selected,unit:capture.energyUnit,language:uiLanguage(),
   session:reportNutrientSession({options:selected,nutrient},capture),accept:bundle=>{
    if(disposed||busy||capture!==expected||!node.isConnected)return null;
    if(bundle?.version!==1||Object.keys(selected).some(key=>bundle.report?.options?.[key]!==selected[key]))throw Error(dc('reportChanged'));
    const detail=validateReportNutrientDetail(bundle.detail,bundle.report,nutrient),opened=[...root.querySelectorAll('[data-mobile-category][open]')].map(el=>el.dataset.mobileCategory),scroll=root.querySelector('.mobile-report-body').scrollTop;
    capture={...capture,report:bundle.report,energyUnit:bundle.energyUnit??capture.energyUnit};expected=capture;node.reportDetail.unit=capture.energyUnit;render();for(const category of opened){const group=[...root.querySelectorAll('[data-mobile-category]')].find(el=>el.dataset.mobileCategory===category);if(group)group.open=true;}root.querySelector('.mobile-report-body').scrollTop=scroll;
    return {report:bundle.report,detail};
   },help:html=>dialog(t('mobileNutrientDetail.help'),'nutrient-help',html).classList.add('mobile-report-nutrient-help')});
 }
 async function apply(patch,node){
  if(busy||disposed)return false;busy=true;const request=new AbortController();node.reportRequest=request;node.querySelectorAll('button:not([data-report-action=back]),input,select').forEach(control=>control.disabled=true);node.querySelector('[role=alert]').textContent='';
  try{const next=await onApply({...options(),...patch},request.signal);if(disposed||request.signal.aborted)return false;capture=next;render();syncSettings();
   for(const screen of stack)screen.querySelector('[role=alert]').textContent='';
   return true;}
  catch(error){syncSettings();if(node.isConnected)node.querySelector('[role=alert]').textContent=error.message;return false;}
  finally{delete node.reportRequest;busy=false;if(node.isConnected)node.querySelectorAll('button,input,select').forEach(control=>control.disabled=false);}
 }
 function rangeFor(id){
  return id==='all'?capture.availableRange:resolveRange(id,capture.report.calendar.today,{},{});
 }
 function rangeId(){
  const {from,to}=options();
  if(rangeSelection.from===from&&rangeSelection.to===to)return rangeSelection.id;
  for(const [id] of ranges){
   if(id==='all'||id==='custom')continue;
   const range=rangeFor(id);
   if(range.from===from&&range.to===to)return id;
  }
  return 'custom';
 }
 const dayLabels=()=>({all:t('mobileReport.filter.all'),nonempty:t('mobileReport.filter.nonempty'),complete:t('fastingHistory.completed')});
 function settingRow(label,id){
  return `<div class="dc-row">${action(`<strong>${e(label)}</strong><span class="report-setting-value"><span data-setting="${id}"></span>${symbol('chevron_right')}</span>`,id)}</div>`;
 }
 function switchRow(label,name){
  return `<label class="dc-row"><span>${e(label)}</span><input type="checkbox" name="${name}" role="switch" class="dc-switch" ${options()[name]?'checked':''}></label>`;
 }
 function syncSettings(){
  for(const node of stack){
   if(node.dataset.mobileReport==='settings'){
    node.querySelector('[data-setting=dates]').textContent=rangeLabel(rangeId(),uiLanguage());
    node.querySelector('[data-setting=days]').textContent=dayLabels()[options().dayFilter];
    node.querySelector('[name=includeSupplements]').checked=options().includeSupplements;
   }
   if(node.dataset.mobileReport==='options')node.querySelector('[name=includeToday]').checked=options().includeToday;
  }
 }
 function openSettings(){
  if(disposed)return;
  const node=dialog(t('discover.title.report-settings'),'settings',`<div class="dc-group">${settingRow(t('discover.title.date-range'),'dates')}${settingRow(t('mobileReport.days'),'days')}${switchRow(t('mobileReport.supplements'),'includeSupplements')}</div>`);
  node.querySelector('[data-report-action=dates]').onclick=openDates;
  node.querySelector('[data-report-action=days]').onclick=openDays;
  node.querySelector('[name=includeSupplements]').onchange=event=>apply({includeSupplements:event.target.checked},node);
  node.insertAdjacentHTML('beforeend',`<nav class="dc-bottom" aria-label="${t('discover.nav.main')}">`+bottomNavigation('nutrition-report',uiLanguage())+'</nav>');
  node.querySelectorAll('[data-discover^="shell-"]').forEach(button=>button.onclick=()=>{const id={dashboard:'discover-tab',diary:'diary-tab',foods:'foods-tab',more:'settings-tab',add:'add-food'}[button.dataset.discover.slice(6)];if(id){while(stack.length)back();document.getElementById(id)?.click();}});syncSettings();
 }
 function openOptions(){
  const html=`<div class="dc-group">${switchRow(t('mobileReport.today'),'includeToday')}<div class="dc-row">${action(dc('printReport'),'print')}</div><div class="dc-row">${action(t('balanceEditor.refresh'),'refresh')}</div></div>`;
  const node=dialog(t('mobileReport.more'),'options',html);
  node.querySelector('[name=includeToday]').onchange=event=>apply({includeToday:event.target.checked},node);
  node.querySelector('[data-report-action=print]').onclick=()=>{back();onPrint(structuredClone(options()));};
  node.querySelector('[data-report-action=refresh]').onclick=()=>apply({},node);
 }
 function choiceRow(id,label,selected){
  return `<div class="dc-row">${action(`<strong>${e(label)}</strong>${symbol('check')}`,'choice',`data-choice="${id}" aria-pressed="${selected}"`)}</div>`;
 }
 function openDays(){
  const choices=Object.entries(dayLabels()).map(([id,label])=>choiceRow(id,label,options().dayFilter===id)).join('');
  const node=dialog(t('mobileReport.days'),'days',`<div class="dc-group">${choices}</div>`,true);
  node.querySelectorAll('[data-choice]').forEach(button=>button.onclick=async()=>{
   const dayFilter=button.dataset.choice;
   if(dayFilter===options().dayFilter||await apply({dayFilter},node))back();
  });
 }
 function openDates(){
  if(disposed)return;
  const selected=rangeId(),o=options(),choices=ranges.filter(([id])=>id!=='all'||capture.availableRange);
  const fields=['from','to'].map(key=>`<label class="dc-row report-custom-date"><strong>${e(t('discover.range.'+key))}</strong><span><span data-date-value aria-hidden="true">${e(o[key])}</span>${symbol('arrow_drop_down')}<input type="date" name="${key}" aria-label="${e(t('discover.range.'+key))}" required value="${e(o[key])}"></span></label>`).join('');
  const node=dialog(t('discover.title.date-range'),'dates',`<form novalidate><div class="dc-group">${choices.map(([id])=>choiceRow(id,rangeLabel(id,uiLanguage()),id===selected)).join('')}<div data-custom-fields ${selected==='custom'?'':'hidden'}>${fields}</div></div><button class="dc-pill" type="submit" hidden>${e(t('nutritionReport.apply'))}</button></form>`,true);
  const form=node.querySelector('form'),inputs=form.elements,fieldsNode=node.querySelector('[data-custom-fields]'),submit=form.querySelector('[type=submit]');
  async function useRange(id,range){
   const changed=range.from!==o.from||range.to!==o.to;
   if(changed&&!await apply(range,node))return;
   Object.assign(rangeSelection,{id,...range});syncSettings();back();
  }
  for(const button of node.querySelectorAll('[data-choice]')){
   button.onclick=()=>{
    const id=button.dataset.choice;
    if(id!=='custom')return useRange(id,rangeFor(id));
    fieldsNode.hidden=false;
    for(const row of node.querySelectorAll('[data-choice]'))row.setAttribute('aria-pressed',String(row===button));
    submit.hidden=false;
    inputs.from.focus({preventScroll:true});fieldsNode.scrollIntoView({block:'nearest'});
   };
  }
  form.oninput=event=>{
   const input=event.target;input.parentElement.querySelector('[data-date-value]').textContent=input.value;
   submit.hidden=false;node.querySelector('[role=alert]').textContent='';
  };
  form.onsubmit=event=>{
   event.preventDefault();const range={from:inputs.from.value,to:inputs.to.value};
   if(!range.from||!range.to||range.from>range.to){
    node.querySelector('[role=alert]').textContent=t('discover.range.invalid');
    return;
   }
   void useRange('custom',range);
  };
 }
 render();return {openSettings,dispose};
}
