import {MobileExerciseEditor} from './mobile-exercise-editor.js';
import {AnchoredMenu} from './anchored-menu.js';
import {escape as e,symbol} from './discover-ui.js';
import {estimateExercise} from './exercise-estimate.mjs';
import {convertEnergy} from '../dashboard-source/energy-units.mjs';

/** The server owns saving and rechecks the weight; this view owns the unsaved estimate. */
export class CatalogExerciseEditor{
 constructor({dialog,message,api,activity,choices,titleKey,efforts,onCustom,manual=false}){
  Object.assign(this,{dialog,message,api,activity,choices,titleKey,efforts,onCustom,manual});this.disposed=false;this.weight=null;this.abort=new AbortController();
  const form=this.form=dialog.querySelector('.me-form'),m=key=>message('exerciseBrowser.'+key);this.m=m;
  form.dataset.form='exercise-catalog';form.elements.name.closest('label').replaceWith(Object.assign(document.createElement('input'),{type:'hidden',name:'name',value:activity.description}));
  form.insertAdjacentHTML('afterbegin','<input type="hidden" name="code"><input type="hidden" name="weightKg"><input type="hidden" name="useEstimate" value="true">');
  const walking=titleKey==='generalWalking',card=form.querySelector('.me-card');
  form.classList.toggle('me-walking',walking);
  if(walking&&form.elements.id.value)form.querySelector('.me-save').textContent=message('common.save');
  const effort=`<strong>${e(m('effort'))}</strong><span class="me-value"><span data-mec-label></span>${symbol('arrow_drop_down')}</span>`;
  const description='<span class="mec-description" data-mec-description></span>';
  card.insertAdjacentHTML('afterbegin',`<button type="button" class="me-row mec-effort" data-mec-effort aria-haspopup="menu" aria-expanded="false">${effort}${walking?description:''}</button>${walking?'':'<p class="mec-description" data-mec-description></p>'}`);
  const source=`<a class="mec-source" data-mec-source target="_blank" rel="noopener">${e(m('source'))}</a>`;
  card.insertAdjacentHTML('beforeend',walking
   ?`<details class="mec-details"><summary><span data-mec-weight></span>${symbol('arrow_drop_down')}</summary>${source}</details>`
   :`<p class="mec-footnote" data-mec-weight></p>${source}`);
  form.querySelector('.me-save').insertAdjacentHTML('beforebegin',`<p role="status" data-mec-status></p><button type="button" class="mec-reset" data-mec-reset hidden>${e(m('useEstimate'))}</button><button type="button" class="mec-custom" data-mec-custom hidden>${e(m('customEntry'))}</button>`);
  this.base=new MobileExerciseEditor({dialog,message});
  form.addEventListener('input',event=>{if(event.target.name==='calories')this.manual=true;this.refresh()},{signal:this.abort.signal});
  form.addEventListener('click',event=>{if(event.target.closest('[data-mec-effort]'))this.openEffort();if(event.target.closest('[data-mec-reset]')){this.manual=false;this.refresh()}if(event.target.closest('[data-mec-custom]'))onCustom({name:this.activity.description,duration:Number(form.elements.duration.value),date:form.elements.date.value,time:form.elements.time.value,group:form.elements.group.value,...(this.manual&&form.elements.calories.value!==''?{caloriesBurned:convertEnergy(Number(form.elements.calories.value),form.dataset.energyUnit,'kcal')}:{})})},{signal:this.abort.signal});
  this.refresh();this.loadWeight();
 }
 label(row){return this.titleKey==='generalWalking'?this.m(this.efforts[row.code]):row.description}
 async loadWeight(){try{const weight=await this.api('/api/exercise-weight?date='+encodeURIComponent(this.form.elements.date.value),{signal:this.abort.signal});if(this.disposed)return;this.weight=weight;this.loaded=true}catch{if(this.disposed)return;this.failed=true;this.loaded=true}this.refresh()}
 refresh(){
  const f=this.form,a=this.activity,m=this.m;f.elements.code.value=a.code;f.elements.name.value=a.description;f.elements.useEstimate.value=String(!this.manual);
  const effortKey=this.titleKey==='generalWalking'?this.efforts[a.code]:null;
  const description=effortKey==='light'||effortKey==='moderate'?m(effortKey+'Description'):a.description;
  f.querySelector('[data-mec-label]').textContent=this.label(a);f.querySelector('[data-mec-description]').textContent=description;f.querySelector('[data-mec-source]').href=a.source;
  if(this.titleKey==='generalWalking'&&this.weight?.status!=='known')f.querySelector('[data-mec-weight]').textContent=m('source');
  const effort=f.querySelector('[data-mec-effort]');effort.hidden=this.choices.length<2&&this.titleKey!=='generalWalking';effort.disabled=this.choices.length<2;f.querySelector('[data-mec-description]').hidden=this.choices.length>1&&this.titleKey!=='generalWalking';effort.querySelector('svg')?.toggleAttribute('hidden',this.choices.length<2);
  let status='',ready=false;
  if(a.conflict)status=m('sourceConflict');else if(this.failed)status=m('estimateUnavailable');else if(this.loaded&&this.weight?.status!=='known')status=m('weightMissing');
  if(this.weight?.status==='known'){
   const kg=this.weight.kilograms;
   const reading=this.weight.reading??{value:kg,unit:'kg'};
   const weightMessage={profile:'weightProfile',biometric:'weightCurrent',recorded:'weightBiometric'}[this.weight.source];
   f.elements.weightKg.value=String(kg);
   f.querySelector('[data-mec-weight]').textContent=m(weightMessage).replace('{{value}}',String(Number(reading.value.toFixed(2)))).replace('{{unit}}',reading.unit);
   try{const estimate=estimateExercise(a,{minutes:Number(f.elements.duration.value),weightKg:kg});if(!this.manual)f.elements.calories.value=convertEnergy(estimate.netKcal,'kcal',f.dataset.energyUnit).toFixed(2);ready=this.manual||estimate.recordable}catch{if(!status&&f.elements.duration.validity.valid)status=m('estimateUnavailable')}
  }
  f.querySelector('[data-mec-status]').textContent=status;f.querySelector('[data-mec-reset]').hidden=!this.manual;f.querySelector('[data-mec-custom]').hidden=!status;this.base.update();f.querySelector('[type=submit]').disabled||=!ready||Boolean(status);
 }
 openEffort(){
  this.menu?.close(false);this.base.menu?.close(false);const origin=this.form.querySelector('[data-mec-effort]');origin.setAttribute('aria-expanded','true');
  this.menu=new AnchoredMenu({origin,anchor:origin,className:'mec-effort-menu',label:this.m('effort'),items:this.choices.map(row=>({id:row.code,label:this.label(row),selected:row.code===this.activity.code})),onChoose:code=>{this.activity=this.choices.find(row=>row.code===code);if(!this.form.elements.id.value)this.manual=false;this.refresh()},onClose:()=>{this.menu=null;origin.setAttribute('aria-expanded','false')}});
 }
 back(){if(this.menu){this.menu.close();return true}return this.base.back()}
 dispose(){this.disposed=true;this.abort.abort();this.menu?.close(false);this.base.dispose()}
}
