import {ReportEnergyChart,energyChartMarkup} from './report-mobile-source/report-energy-chart.js';
import {MobileReportNutrientDetail,validateReportNutrientDetail} from './report-mobile-source/mobile-report-nutrient-detail.js';
import {request} from './diary-api.js';
import {nutrientDisplayName,nutrientGroupName} from './report-source/public/nutrient-language.js';
import {carbohydrateDisplayLabel} from './report-source/public/carbohydrate-description.js';
import {escape as e,symbol,bottomNavigation,ranges,rangeLabel,resolveRange} from './dashboard-source/discover-ui.js';
import {displayValue,displayUnit} from './dashboard-source/energy-display.js';
const number=value=>Number.isFinite(value)?value.toLocaleString('en',{maximumFractionDigits:1}):'—';
const day=value=>new Date(value+'T12:00:00Z').toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
const rangeText=options=>`${day(options.from)} – ${day(options.to)}`;
const action=(label,id,extra='')=>`<button type="button" class="dc-button" data-report-action="${id}" ${extra}>${label}</button>`;

// Adapt the original MobileNutritionReport markup to the authenticated cloud capture.
export function mountMobileReport({root,value,onApply,onPrint}){
 let capture=value,disposed=false,busy=false;const stack=[],charts=[new ReportEnergyChart('consumed'),new ReportEnergyChart('expenditure')];
 root.classList.add('nutrition-report-mobile');
 const options=()=>capture.report.options;
 function render(){
  const {report,energyUnit:unit}=capture;
  const nutrients=report.nutrients.filter(row=>row.visible),net=report.carbohydrates.net.summary;if(net.visible)nutrients.push({...net,id:'netCarbohydrate'});
  const groups=new Map();for(const row of nutrients){if(!groups.has(row.category))groups.set(row.category,[]);groups.get(row.category).push(row);}
  const macros=[report.nutrients.find(row=>row.id==='protein'),{...report.carbohydrate.summary,name:carbohydrateDisplayLabel(report.carbohydrate.definition)},report.nutrients.find(row=>row.id==='fat')].filter(Boolean);
  const macroDetails=`<div class="report-macro-details"><h3>Macronutrients</h3><div class="mobile-report-macro-list">${macros.map(row=>`<div data-mobile-macro="${e(row.id)}"><span>${e(nutrientDisplayName(row))}</span><strong>${number(row.mean)}${row.mean===null?'':' '+e(row.unit)}</strong></div>`).join('')}</div></div>`;
  root.innerHTML=`<div class="mobile-report-toolbar">${action(`<span>Daily Average: ${e(rangeText(options()))}</span>${symbol('chevron_right')}`,'dates')}<p role="status"></p></div><div class="mobile-report-overview">${report.energy.summary.filter(row=>['consumed','expenditure','remaining'].includes(row.id)).map(row=>row.id==='consumed'?energyChartMarkup(report.energy,unit,'consumed',macroDetails):row.id==='expenditure'?energyChartMarkup(report.energy,unit,'expenditure'):`<section class="dc-card report-energy-chart report-remaining" data-report-energy-kind="remaining"><div class="report-energy-heading"><h2>Remaining</h2></div><div class="report-energy-ring"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46"/></svg><div class="report-energy-center"><strong>${number(displayValue(row.mean,'kcal',unit))}</strong>${row.mean===null?'':`<span>${e(unit)}</span>`}</div></div></section>`).join('')}</div>`+[...groups].map(([category,rows])=>`<details class="dc-card mobile-report-nutrients" data-mobile-category="${e(category)}"><summary class="mobile-report-category"><h2>${e(nutrientGroupName(category))}</h2>${symbol('expand_more')}</summary><div>${rows.map(row=>`<div data-mobile-nutrient="${e(row.id)}"><button type="button" class="dc-button" data-report-nutrient="${e(row.id)}"><span>${e(nutrientDisplayName(row))}</span><strong>${number(displayValue(row.mean,row.unit,unit))}${row.mean===null?'':' '+e(displayUnit(row.unit,unit))}</strong></button>${row.percentOfMeanTarget===null?'':`<progress max="100" value="${Math.min(100,Math.max(0,row.percentOfMeanTarget))}" aria-label="${e(nutrientDisplayName(row))} target" aria-valuetext="${number(row.percentOfMeanTarget)}%"></progress>`}</div>`).join('')}</div></details>`).join('');
  root.querySelector('[data-report-action=dates]').onclick=openDates;
  root.querySelectorAll('[data-report-nutrient]').forEach(button=>button.onclick=()=>openNutrient(button.dataset.reportNutrient));
  for(const chart of charts)void chart.render(root,report.energy);
 }
 function back(){const dialog=stack.pop();if(!dialog)return;dialog.reportDetail?.dispose();dialog.close();dialog.remove();}
 function dispose(){disposed=true;while(stack.length)back();for(const chart of charts)chart.clear();root.classList.remove('nutrition-report-mobile');}
 function dialog(title,screen,html){
  const node=document.createElement('dialog');node.className='dc-overlay mobile-report-dialog';node.dataset.mobileReport=screen;node.setAttribute('aria-label',title);
  node.innerHTML=`<header class="dc-dialog-header">${action(symbol('arrow_back_ios_new'),'back','aria-label="Back"')}<h2>${e(title)}</h2><span class="dc-header-end"></span></header><div class="dc-dialog-body">${html}<p class="dc-error" role="alert"></p></div>`;
  node.addEventListener('cancel',event=>{event.preventDefault();back();});node.addEventListener('click',event=>{if(event.target.closest('[data-report-action=back]'))return back();if(event.target===node){const rect=node.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)back();}});
  document.body.append(node);stack.push(node);node.showModal();return node;
 }
 function openNutrient(nutrient){
  if(disposed||busy)return;const expected=capture,selected=structuredClone(options());
  const row=nutrient==='netCarbohydrate'?capture.report.carbohydrates.net.summary:capture.report.nutrients.find(row=>row.id===nutrient);if(!row)return;
  const node=dialog(nutrientDisplayName(row),'nutrient','');node.classList.add('mobile-report-nutrient-dialog');
  node.querySelector('[data-report-action=back]').setAttribute('aria-label','Close nutrient details');
  node.reportDetail=new MobileReportNutrientDetail({dialog:node,nutrient,options:selected,unit:capture.energyUnit,language:capture.language??'en',
   request:(path,init)=>request(path,JSON.parse(init.body),init.signal),accept:bundle=>{
    if(disposed||busy||capture!==expected||!node.isConnected)return null;
    if(bundle?.version!==1||Object.keys(selected).some(key=>bundle.report?.options?.[key]!==selected[key]))throw Error('The report changed. Reload nutrient details.');
    const detail=validateReportNutrientDetail(bundle.detail,bundle.report,nutrient),opened=[...root.querySelectorAll('[data-mobile-category][open]')].map(el=>el.dataset.mobileCategory),scroll=root.scrollTop;
    capture={...capture,report:bundle.report,energyUnit:bundle.energyUnit??capture.energyUnit};node.reportDetail.unit=capture.energyUnit;render();for(const category of opened){const group=[...root.querySelectorAll('[data-mobile-category]')].find(el=>el.dataset.mobileCategory===category);if(group)group.open=true;}root.scrollTop=scroll;
    return {report:bundle.report,detail};
   },help:html=>dialog('Target details','nutrient-help',html).classList.add('mobile-report-nutrient-help')});
 }
 async function apply(patch,node){
  if(busy||disposed)return false;busy=true;node.querySelectorAll('button,input,select').forEach(control=>control.disabled=true);node.querySelector('[role=alert]').textContent='';
  try{const next=await onApply({...options(),...patch});if(disposed)return false;capture=next;render();syncSettings();return true;}
  catch(error){syncSettings();if(node.isConnected)node.querySelector('[role=alert]').textContent=error.message;return false;}
  finally{busy=false;if(node.isConnected)node.querySelectorAll('button,input,select').forEach(control=>control.disabled=false);}
 }
 function syncSettings(){const node=stack.find(node=>node.dataset.mobileReport==='settings');if(!node)return;const o=options();node.querySelector('[data-report-setting-range]').textContent=selectedRangeLabel();node.querySelector('[name=dayFilter]').value=o.dayFilter;node.querySelector('[name=includeToday]').checked=o.includeToday;node.querySelector('[name=includeSupplements]').checked=o.includeSupplements;}
 function selectedRangeLabel(){const o=options(),today=capture.report.calendar.today,preset=ranges.find(([choice])=>{if(['all','custom'].includes(choice))return false;const r=resolveRange(choice,today,{},{});return r.from===o.from&&r.to===o.to;});return preset?rangeLabel(preset[0]):'Custom Range';}
 function openSettings(){
  if(disposed)return;const o=options(),node=dialog('Report Settings','settings',`<div class="dc-group"><div class="dc-row">${action('<strong>Date Range</strong><span data-report-setting-range></span>'+symbol('chevron_right'),'dates')}</div><label class="dc-row"><span>Days Displayed</span><select name="dayFilter" aria-label="Days Displayed">${[['all','All'],['nonempty','Non-Empty'],['complete','Completed']].map(([key,label])=>`<option value="${key}" ${o.dayFilter===key?'selected':''}>${label}</option>`).join('')}</select></label><label class="dc-row"><span>Include Supplements</span><input type="checkbox" name="includeSupplements" aria-label="Include Supplements" role="switch" class="dc-switch" ${o.includeSupplements?'checked':''}></label></div><details class="mobile-report-options"><summary>More</summary><label class="dc-row"><span>Include Today</span><input type="checkbox" name="includeToday" aria-label="Include Today" role="switch" class="dc-switch" ${o.includeToday?'checked':''}></label>${action('Print Report','print')}${action('Refresh','refresh')}</details>`);
  node.querySelector('[data-report-action=dates]').onclick=openDates;node.querySelector('[data-report-action=print]').onclick=()=>{while(stack.length)back();onPrint(structuredClone(options()));};node.querySelector('[data-report-action=refresh]').onclick=()=>apply({},node);
  node.addEventListener('change',event=>{const target=event.target;if(target.name)void apply({[target.name]:target.type==='checkbox'?target.checked:target.value},node);});
  node.insertAdjacentHTML('beforeend','<nav class="dc-bottom" aria-label="Main navigation">'+bottomNavigation('nutrition-report')+'</nav>');
  node.querySelectorAll('[data-discover^="shell-"]').forEach(button=>button.onclick=()=>{const id={dashboard:'discover-tab',diary:'diary-tab',foods:'foods-tab',more:'settings-tab',add:'add-food'}[button.dataset.discover.slice(6)];if(id){while(stack.length)back();document.getElementById(id)?.click();}});syncSettings();
 }
 function openDates(){
  if(disposed)return;const node=dialog('Date Range','dates','<div class="dc-group">'+ranges.filter(([id])=>id!=='all'||capture.availableRange).map(([id])=>`<div class="dc-row">${action(e(rangeLabel(id)),'range',`data-range="${id}"`)}</div>`).join('')+'</div>');
  node.querySelectorAll('[data-range]').forEach(button=>button.onclick=async()=>{const choice=button.dataset.range;if(choice==='custom')return openCustom();const range=choice==='all'?capture.availableRange:resolveRange(choice,capture.report.calendar.today,{},{});if(await apply(range,node)&&stack.at(-1)===node)back();});
 }
 function openCustom(){
  const o=options(),node=dialog('Custom Range','custom',`<form class="dc-date-fields"><label>From<input type="date" name="from" aria-label="From" required value="${e(o.from)}"></label><label>To<input type="date" name="to" aria-label="To" required value="${e(o.to)}"></label><button type="submit" class="dc-button dc-pill">Apply</button></form>`);
  node.querySelector('form').onsubmit=async event=>{event.preventDefault();const form=event.target,patch={from:form.elements.from.value,to:form.elements.to.value};if(patch.from>patch.to){node.querySelector('[role=alert]').textContent='Choose an end date after the start date.';return;}if(await apply(patch,node)&&stack.at(-1)===node){back();if(stack.at(-1)?.dataset.mobileReport==='dates')back();}};
 }
 render();return {openSettings,dispose};
}
