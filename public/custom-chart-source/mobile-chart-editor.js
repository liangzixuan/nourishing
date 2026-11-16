import {escape as e} from '../html.js';
import {chartPickerOptions} from './chart-picker-options.js';
import {mobileChartEditorMessages} from './messages.js';
const message=(_language,key)=>mobileChartEditorMessages.en[key],identity=metric=>JSON.stringify(metric),category=metric=>['biometric','score'].includes(metric.kind)?metric.kind:'nutrient';
const img=(path,cls='')=>`<img class="${cls}" src="${path}" alt="">`;
/** This editor owns presentation and drafts; the existing chart action owns validation and persistence. */
export class MobileChartEditor {
 constructor({form,chart,options}){
  Object.assign(this,{form,chart:structuredClone(chart),language:'en',options});this.m=key=>message('en',key);this.abort=new AbortController();this.manualName=!!chart.id;
  this.form.innerHTML=`<input type="hidden" name="id" value="${e(chart.id??'')}"><input type="hidden" name="primary"><input type="hidden" name="secondary"><input type="hidden" name="days" value="${e(chart.days)}">${chart.visible?'<input type="hidden" name="visible" value="1">':''}${chart.cycleOverlay?'<input type="hidden" name="cycleOverlay" value="1">':''}<label class="mce-name"><strong>${e(this.m('name'))}</strong><input name="name" aria-label="Chart Name" required maxlength="200" value="${e(chart.name)}"></label><div data-mce-axes></div><footer class="mce-save"><button type="submit" data-mce-save>${e(this.m('save'))}</button></footer>`;
  this.form.dataset.mobileChartEditor='';this.renderAxes();const signal=this.abort.signal;
  form.elements.name.addEventListener('input',()=>{this.manualName=true},{signal});
  form.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;const axis=button.closest('[data-mce-axis]')?.dataset.mceAxis;
   if(button.hasAttribute('data-mce-add-axis')){this.chart.secondary={kind:'biometric',type:'weight',unit:'kg'};this.renderAxes()}
   if(button.hasAttribute('data-mce-remove-axis')){this.chart.secondary=null;this.renderAxes()}
   if(button.dataset.mceCategory){const kind=button.dataset.mceCategory,current=this.chart[axis];if(category(current)!==kind){const choice=this.options.find(row=>category(row.metric)===kind&&row.metric.unit!==null);if(choice){this.chart[axis]=structuredClone(choice.metric);this.renderAxes()}}}
   if(button.dataset.mcePick)this.openPicker(axis,button.dataset.mcePick);

  },{signal});
 }
 label(metric){return this.options.find(row=>identity(row.metric)===identity(metric))?.name??metric.type??metric.id??metric.kind;}
 renderAxes(){
  const html=axis=>{const metric=this.chart[axis];if(!metric)return '';const kind=category(metric);return `<section data-mce-axis="${axis}"><h3>${e(this.m(axis))}${axis==='secondary'?`<button type="button" data-mce-remove-axis aria-label="${e(this.m('remove'))}">${img('/custom-chart-source/close.svg')}</button>`:''}</h3><div class="mce-categories" role="group" aria-label="${e(this.m(axis))}">${['biometric','nutrient','score'].map(id=>`<button type="button" data-mce-category="${id}" aria-pressed="${kind===id}">${e(this.m(id))}</button>`).join('')}</div><div class="mce-axis-card"><button type="button" class="mce-row" data-mce-pick="metric"><strong>${e(this.m(kind))}</strong><span>${e(this.label(metric))}${img('/custom-chart-source/chevron-right.svg','mce-dropdown')}</span></button>${kind==='biometric'?`<button type="button" class="mce-row" data-mce-pick="unit"><strong>${e(this.m('unit'))}</strong><span>${e(metric.unit??this.m('chooseUnit'))}${img('/custom-chart-source/chevron-right.svg','mce-dropdown')}</span></button>`:''}</div></section>`};
  this.form.querySelector('[data-mce-axes]').innerHTML=html('primary')+html('secondary')+(!this.chart.secondary?`<button type="button" class="mce-add-axis" data-mce-add-axis>${e(this.m('add'))}</button>`:'');
  this.form.elements.primary.value=identity(this.chart.primary);this.form.elements.secondary.value=this.chart.secondary?identity(this.chart.secondary):'';
  if(!this.manualName)this.form.elements.name.value=[this.chart.primary,this.chart.secondary].filter(Boolean).map(metric=>this.label(metric)).join(' + ');
 }
 openPicker(axis,field){
  this.closePicker();this.pickerAnchor=this.form.querySelector(`[data-mce-axis=${axis}] [data-mce-pick=${field}]`);const metric=this.chart[axis],kind=category(metric),popup=document.createElement('dialog');this.picker=popup;popup.className='mce-metric-picker';popup.setAttribute('aria-label',this.m(field==='unit'?'unit':kind));
  const choices=chartPickerOptions(this.options,metric,field);
  popup.innerHTML=`<h2>${e(this.m(field==='unit'?'unit':kind))}</h2>${field==='metric'?`<input type="search" data-mce-search placeholder="${e(this.m('search'))}" aria-label="${e(this.m('search'))}">`:''}<div class="mce-picker-choices"></div>`;
  const list=popup.querySelector('.mce-picker-choices'),render=()=>{const search=(popup.querySelector('input')?.value??'').toLocaleLowerCase(this.language),filtered=choices.filter(row=>(field==='unit'?row.metric.unit:this.label(row.metric)).toLocaleLowerCase(this.language).includes(search));list.innerHTML=filtered.map(row=>`<button type="button" data-mce-choice="${e(identity(row.metric))}">${e(field==='unit'?row.metric.unit:this.label(row.metric))}</button>`).join('')||`<p>${e(this.m('noMatches'))}</p>`};render();popup.querySelector('input')?.addEventListener('input',render);
  popup.addEventListener('click',event=>{const button=event.target.closest('[data-mce-choice]');if(button){this.chart[axis]=JSON.parse(button.dataset.mceChoice);this.closePicker();this.renderAxes();this.form.querySelector(`[data-mce-axis=${axis}] [data-mce-pick=${field}]`)?.focus();return}if(event.target===popup){const box=popup.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)this.closePicker()}});
  popup.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.closePicker()}});
  popup.addEventListener('cancel',event=>{event.preventDefault();event.stopPropagation();this.closePicker()});document.body.append(popup);popup.showModal();popup.querySelector('input,button')?.focus();
 }
 setSaving(saving){for(const control of this.form.querySelectorAll('input,button:not([data-discover])'))control.disabled=saving}
 closePicker(){this.picker?.close();this.picker?.remove();this.picker=null;if(this.pickerAnchor?.isConnected)this.pickerAnchor.focus();this.pickerAnchor=null}
 back(){if(!this.picker)return false;this.closePicker();return true}
 dispose(){this.closePicker();this.abort.abort()}
}
