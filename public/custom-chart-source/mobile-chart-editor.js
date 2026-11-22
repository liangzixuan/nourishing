import {symbol} from '../dashboard-source/discover-ui.js';
import {chartMetricLabel} from '../charts-source-view.js';
import {uiLanguage} from '../app-language.js';
import {escape as e} from '../html.js';
import {chartPickerOptions,standardChartMetric} from './chart-picker-options.js';
import {mobileNutrientName} from '../mobile-nutrient-groups.js';
import {mobileChartEditorMessages} from './messages.js';
export const defaultChartMetrics={biometric:{kind:'biometric',type:'weight',unit:'kg'},nutrient:{kind:'nutrient',id:'calories'},score:{kind:'score',id:'overall'}};
const message=(language,key)=>mobileChartEditorMessages[language][key],identity=metric=>JSON.stringify(metric),category=metric=>['biometric','score'].includes(metric.kind)?metric.kind:'nutrient';
const img=(path,cls='')=>`<img class="${cls}" src="${path}" alt="">`;
const scorePickerNames={metabolism:'Metabolism',plant:'Plant-Based Diet',womens:"Women's Health",mens:"Men's Health"};
/** This editor owns presentation and drafts; the existing chart action owns validation and persistence. */
export class MobileChartEditor {
 constructor({form,chart,options,language=uiLanguage()}){
  Object.assign(this,{form,chart:structuredClone(chart),language,options});this.m=key=>message(language,key);this.abort=new AbortController();this.manualName=!!chart.id;
  this.form.innerHTML=`<input type="hidden" name="id" value="${e(chart.id??'')}"><input type="hidden" name="primary"><input type="hidden" name="secondary"><input type="hidden" name="days" value="${e(chart.days)}">${chart.visible?'<input type="hidden" name="visible" value="1">':''}${chart.cycleOverlay?'<input type="hidden" name="cycleOverlay" value="1">':''}<label class="mce-name"><strong>${e(this.m('name'))}</strong><input name="name" aria-label="${e(this.m('name'))}" required maxlength="200" value="${e(chart.name)}"></label><div data-mce-axes></div><footer class="mce-save"><button type="submit" data-mce-save>${e(this.m('save'))}</button></footer>`;
  this.labels=new Map(this.options.map(row=>[identity(row.metric),this.metricLabel(row)]));
  this.form.dataset.mobileChartEditor='';this.renderAxes();const signal=this.abort.signal;
  form.elements.name.addEventListener('input',()=>{this.manualName=true},{signal});
  form.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;const axis=button.closest('[data-mce-axis]')?.dataset.mceAxis;
   if(button.hasAttribute('data-mce-add-axis')){this.chart.secondary=structuredClone(defaultChartMetrics.biometric);this.renderAxes();this.form.querySelector('[data-mce-axis=secondary] [aria-pressed=true]').focus()}
   if(button.hasAttribute('data-mce-remove-axis')){this.chart.secondary=null;this.renderAxes();this.form.querySelector('[data-mce-add-axis]').focus()}
   if(button.dataset.mceCategory){
    const kind=button.dataset.mceCategory,current=this.chart[axis];
    if(category(current)!==kind){
     const choice=this.options.find(row=>identity(row.metric)===identity(defaultChartMetrics[kind]))??this.options.find(row=>category(row.metric)===kind&&row.metric.unit!==null);
     if(choice){this.chart[axis]=structuredClone(choice.metric);this.renderAxes();this.form.querySelector('[data-mce-axis='+axis+'] [aria-pressed=true]').focus();}
    }
   }
   if(button.dataset.mcePick)this.openPicker(axis,button.dataset.mcePick);

  },{signal});
 }
 metricLabel(row){
  const {metric}=row;
  if(metric.kind==='carbohydrate'&&metric.mode)return this.m(metric.mode==='net'?'netCarbs':'totalCarbs');
  if(metric.kind==='nutrient'&&metric.id!=='carbs'){
   if(metric.id==='deltaTocopherol'&&this.language==='en')return 'Delta Tocopherol';
   return mobileNutrientName({id:metric.id,name:row.name},this.language);
  }
  if(metric.kind==='score'&&this.language==='en'&&scorePickerNames[metric.id])return scorePickerNames[metric.id];
  return chartMetricLabel(row);
 }
 label(metric){return this.labels.get(identity(metric))??metric.type??metric.id??metric.kind;}
 choiceLabel(metric){return metric.kind==='nutrient'&&metric.id==='calories'?this.m('energyConsumed'):this.label(metric);}
 renderAxes(){
  const html=axis=>{const metric=this.chart[axis];if(!metric)return '';const kind=category(metric);
   const hasUnits=kind==='biometric'&&chartPickerOptions(this.options,metric,'unit').length>0;
   const unitRow=hasUnits?`<button type="button" class="mce-row" data-mce-pick="unit"><strong>${e(this.m('unit'))}</strong><span>${e(metric.unit??this.m('chooseUnit'))}${symbol('arrow_drop_down')}</span></button>`:`<div class="mce-row"><strong>${e(this.m('unit'))}</strong><span>${e(this.m('recordedUnit'))}</span></div>`;
   return `<section data-mce-axis="${axis}"><h3>${e(this.m(axis))}${axis==='secondary'?`<button type="button" data-mce-remove-axis aria-label="${e(this.m('remove'))}">${img('/custom-chart-source/close.svg')}</button>`:''}</h3><div class="mce-categories" role="group" aria-label="${e(this.m(axis))}">${['biometric','nutrient','score'].map(id=>`<button type="button" data-mce-category="${id}" aria-pressed="${kind===id}">${e(this.m(id))}</button>`).join('')}</div><div class="mce-axis-card"><button type="button" class="mce-row" data-mce-pick="metric"><strong>${e(this.m(kind==='score'?'nutritionScores':kind))}</strong><span>${e(this.choiceLabel(metric))}${symbol('arrow_drop_down')}</span></button>${kind==='biometric'?unitRow:''}</div></section>`};
  this.form.querySelector('[data-mce-axes]').innerHTML=html('primary')+html('secondary')+(!this.chart.secondary?`<button type="button" class="mce-add-axis" data-mce-add-axis><span aria-hidden="true">+</span>${e(this.m('add'))}</button>`:'');
  this.form.elements.primary.value=identity(this.chart.primary);this.form.elements.secondary.value=this.chart.secondary?identity(this.chart.secondary):'';
  if(!this.manualName)this.form.elements.name.value=[this.chart.primary,this.chart.secondary].filter(Boolean).map(metric=>this.label(metric)).join(' + ');
 }
 openPicker(axis,field){
  this.closePicker();this.pickerAnchor=this.form.querySelector(`[data-mce-axis=${axis}] [data-mce-pick=${field}]`);const metric=this.chart[axis],kind=category(metric),popup=document.createElement('dialog');this.picker=popup;popup.className='mce-metric-picker';popup.setAttribute('aria-label',this.m(field==='unit'?'unit':kind));
  const choices=chartPickerOptions(this.options,metric,field),selectedId=identity(metric);
  const choiceText=row=>field==='unit'?row.metric.unit:this.choiceLabel(row.metric);
  const standard=row=>standardChartMetric(row.metric)||identity(row.metric)===selectedId;
  if(kind==='nutrient'&&field==='metric')choices.sort((a,b)=>choiceText(a).localeCompare(choiceText(b),this.language));
  const label=this.m(field==='unit'?'unit':kind);
  popup.dataset.mcePicker=field==='unit'?'unit':kind;
  // The native score and unit menus fit in one list. All additional supported
  // series remain reachable without mixing source measurements with coverage.
  const searchable=field==='metric'&&kind!=='score';
  const searchBox=searchable?`<input type="search" data-mce-search placeholder="${e(this.m('search'))}" aria-label="${e(this.m('search'))}">`:'';
  const compactSearch=searchable&&kind==='nutrient';
  popup.innerHTML=`<h2>${e(label)}</h2>${compactSearch?`<label class="mce-picker-search">${img('/more-source/icons/magnify.svg')}${searchBox}</label>`:searchBox}<div class="mce-picker-choices"></div>`;
  const list=popup.querySelector('.mce-picker-choices'),search=popup.querySelector('input');
  const editor=this.form.closest('.mobile-chart-editor');
  const position=()=>{
   if(!popup.open)return;
   const rect=this.pickerAnchor.getBoundingClientRect();
   const top=Math.max(8,(editor.querySelector('.sheet-header')?.getBoundingClientRect().bottom??16)-8);
   const bottom=Math.min(innerHeight-8,editor.querySelector('.app-nav')?.getBoundingClientRect().top??innerHeight-8);
   let height=Math.max(48,bottom-top);
   if(kind==='score'&&!expanded){
    // Keep additional supported metrics in the same scrollable list, below the primary choices.
    const standardRows=list.querySelectorAll('[data-mce-choice]');
    const primaryHeight=[...standardRows].reduce((sum,button)=>sum+button.getBoundingClientRect().height,16);
    height=Math.min(height,primaryHeight);
   }
   popup.style.maxHeight=height+'px';
   popup.style.top=Math.max(top,Math.min(rect.bottom,bottom-popup.offsetHeight))+'px';
  };
  let expanded=false;
  const render=()=>{
   const term=search?.value.trim().toLocaleLowerCase(this.language)??'';
   const filtered=choices.filter(row=>!term||choiceText(row).toLocaleLowerCase(this.language).includes(term));
   const button=row=>`<button type="button" data-mce-choice="${e(identity(row.metric))}" aria-pressed="${identity(row.metric)===selectedId}">${e(choiceText(row))}</button>`;
   const common=filtered.filter(standard),other=filtered.filter(row=>!standard(row));
   list.innerHTML=common.map(button).join('')+(other.length&&!term?`<button type="button" data-mce-other aria-expanded="${expanded}">${e(this.m('other'))}</button>`:'')+((expanded||term)?other.map(button).join(''):'')||`<p role="status">${e(this.m('noMatches'))}</p>`;
   position();
   list.querySelector('[data-mce-other]')?.addEventListener('click',()=>{expanded=!expanded;render();list.querySelector('[data-mce-other]').focus({preventScroll:true});});
  };
  render();search?.addEventListener('input',()=>{render();list.scrollTop=0;});
  popup.addEventListener('click',event=>{const button=event.target.closest('[data-mce-choice]');if(button){this.chart[axis]=JSON.parse(button.dataset.mceChoice);this.closePicker();this.renderAxes();this.form.querySelector(`[data-mce-axis=${axis}] [data-mce-pick=${field}]`)?.focus();return}if(event.target===popup){const box=popup.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)this.closePicker()}});
  popup.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.closePicker()}});
  popup.addEventListener('cancel',event=>{event.preventDefault();event.stopPropagation();this.closePicker()});document.body.append(popup);popup.showModal();
  this.reposition=position;window.addEventListener('resize',position);position();
  const selected=list.querySelector('[aria-pressed=true]');
  (compactSearch?selected:search??selected)?.focus({preventScroll:true});
  position();
  if(selected)list.scrollTop=Math.max(0,selected.offsetTop-list.offsetTop-(list.clientHeight-selected.clientHeight)/2);
  if(!search&&!selected)list.querySelector('button')?.focus({preventScroll:true});
  // Keep the expanded search in place when focus moves to a result during a tap.
  if(compactSearch)search.addEventListener('focus',()=>{popup.dataset.searchOpen='true';position();});
  popup.addEventListener('keydown',event=>{
   if(compactSearch&&event.target!==search&&event.key.length===1&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&event.key.trim()){
    event.preventDefault();search.focus();search.value=event.key;render();list.scrollTop=0;return;
   }
   if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key)||event.target===search&&['Home','End'].includes(event.key))return;
   const buttons=[...list.querySelectorAll('button')],current=buttons.indexOf(document.activeElement);
   const index=event.key==='Home'?0:event.key==='End'?buttons.length-1:event.key==='ArrowDown'?Math.min(buttons.length-1,current+1):Math.max(0,current-1);
   if(buttons[index]){event.preventDefault();buttons[index].focus();}
  });
 }
 setSaving(saving){for(const control of this.form.querySelectorAll('input,button:not([data-discover])'))control.disabled=saving}
 closePicker(){if(this.reposition)window.removeEventListener('resize',this.reposition);this.reposition=null;this.picker?.close();this.picker?.remove();this.picker=null;if(this.pickerAnchor?.isConnected)this.pickerAnchor.focus();this.pickerAnchor=null}
 back(){if(!this.picker)return false;this.closePicker();return true}
 dispose(){this.closePicker();this.abort.abort()}
}
