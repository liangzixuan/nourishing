import {blankBiometricDraft,parseBiometricDraft} from './biometric-entry.js';
import {biometricCatalogLabel,biometricCategoryLabel,biometricSearchText} from './biometric-catalog-language.js';
import {formatMessage} from './message-format.js';
import {escape as e,symbol} from './discover-ui.js';
import {AnchoredMenu} from './anchored-menu.js';
import {usesCompoundWeight} from './weight-entry.js';
import {usesSleepDuration} from './sleep-duration.js';
import {usesStoolScale,stoolTypes,stoolUnit} from '../offline-source/server/stool-scale.mjs';

const categories={Body:'human-male-height',Cardio:'heart-pulse',Labs:'test-tube',Mental:'head-heart'};
const order={Body:['bicep-size','body-fat','body-temp-variation','body-temperature','bust-size','calf-size','chest-size','fat-free-mass','forearm-size','height','hip-size','neck-size','recovery','skeletal-muscle-mass','skin-temperature','stool','thigh-size','total-body-water','upper-arm-size','waist-size','weight','wrist-size'],Cardio:['blood-pressure','heart-rate','heart-rate-variability-hrv','oxygen-saturation-spo2','pulse-wave-velocity','respiration-rate','resting-heart-rate','v02-max'],Labs:['25-hydroxy-vitamin-d','blood-glucose','c-reactive-protein','ferritin','hdl-cholesterol','hematocrit','hemoglobin','hemoglobin-a1c','insulin','ketones-blood','ketones-breath','ketones-urine','ldl-cholesterol','oxygen-saturation-spo2','total-cholesterol','triglycerides'],Mental:['energy-level','mood','sleep','sleep-score']};
const icon=name=>`<img src="/record-source/biometric-icons/${name}.svg" alt="" aria-hidden="true">`;
const icons={'fat-free-mass':'scale-bathroom','skeletal-muscle-mass':'human-male-height',weight:'scale-bathroom',height:'human-male-height','body-fat':'water-percent','body-temp-variation':'thermometer','body-temperature':'thermometer','skin-temperature':'thermometer','total-body-water':'water-percent',stool:'toilet',recovery:'restore','blood-pressure':'blood-bag','heart-rate':'heart-pulse','heart-rate-variability-hrv':'heart-pulse','resting-heart-rate':'heart-pulse','pulse-wave-velocity':'heart-pulse','respiration-rate':'lungs','blood-glucose':'diabetes',insulin:'needle','energy-level':'lightning-bolt',mood:'emoticon-happy',sleep:'bed','sleep-score':'sleep'};
const metricIcon=metric=>icons[metric.selection.id]||(metric.categories.includes('Body')?'tape-measure':metric.categories.includes('Labs')?'test-tube':metric.categories.includes('Cardio')?'heart-pulse':'chart-bell-curve');

/** Mobile presentation; the existing session owns validation, receipts and save recovery. */
export class MobileBiometricPanel{
 constructor({root,session,date,time='',group=null,onSaved,onNotice=()=>{},initialEntry=null}){
  Object.assign(this,{root,session,onSaved,onNotice,initialEntry});this.dialog=root.closest('dialog');this.language=session.language;this.m=(key,values)=>formatMessage(this.language,'mobileBiometric.'+key,values);this.message=session.message;this.abort=new AbortController();this.disposed=false;this.delivered=false;this.saving=false;this.freeUnit=false;
  session.draft??=blankBiometricDraft(date,time,group);this.mode=session.draft.metric||session.draft.custom?'detail':'browse';this.lastTime=session.draft.time;this.category=session.draft.category||'';
  root.addEventListener('click',event=>this.click(event),{signal:this.abort.signal});root.addEventListener('input',event=>this.input(event),{signal:this.abort.signal});
  this.dialog.addEventListener('input',event=>{if(event.target.matches('[data-mb-search]')){session.draft.search=event.target.value;this.renderGrid()}},{signal:this.abort.signal});
  root.addEventListener('submit',event=>{if(!event.target.matches('[data-form=mobile-biometric]'))return;event.preventDefault();event.stopPropagation();void this.save()},{signal:this.abort.signal});
  this.unsubscribe=session.subscribe(()=>this.update());this.update();if(!session.library&&!session.pending)void session.load();
 }
 metric(){return this.session.library?.metrics.find(row=>row.key===this.session.draft.metric)}
 locked(){return this.saving||Boolean(this.session.pending)||this.session.unknown||this.session.imported||this.session.readOnly}
 header(){
  const d=this.session.draft,browse=this.mode==='browse',title=browse?(this.category?biometricCategoryLabel(this.category,this.language):this.m('title')):d.custom?this.m('customTitle'):biometricCatalogLabel(this.metric(),this.language);
  this.dialog.classList.add('mobile-food-editor','mobile-biometric');this.dialog.classList.toggle('mobile-catalog-browser',browse);
  const head=this.dialog.querySelector('.dialog-head');head.querySelector('h2').textContent=(this.session.editing?'Edit ':'')+title;head.querySelector('button').innerHTML=browse&&this.category?'<img src="/record-source/exercise-icons/chevron-left.svg" alt="">':symbol('close');head.querySelector('[data-mb-search-label]')?.remove();
  if(browse&&!this.category)head.insertAdjacentHTML('beforeend',`<label class="mcb-search" data-mb-search-label><img src="/record-source/exercise-icons/magnify.svg" alt=""><input type="search" data-mb-search placeholder="${e(this.m('search'))}" aria-label="${e(this.m('search'))}" value="${e(d.search)}"></label>`);
 }
 render(){
  if(!this.session.library){this.root.innerHTML=`<p class="mb-status" role="status">${e(this.session.error||this.message('loading'))}</p>${this.session.error?`<button type="button" data-mb-reload>${e(this.m('retry'))}</button>`:''}`;return}
  this.menu?.close(false);this.header();this.root.classList.toggle('mcb-content',this.mode==='browse');
  if(this.mode==='browse'){this.root.innerHTML='<div data-mb-grid></div>'+(!this.category?`<div class="mcb-footer"><button type="button" data-mb-custom>+ ${e(this.m('custom'))}</button></div>`:'');this.renderGrid()}else this.renderForm();this.controls();
 }
 renderGrid(){
  const node=this.root.querySelector('[data-mb-grid]');if(!node)return;const d=this.session.draft,library=this.session.library,query=d.search.trim().toLocaleLowerCase(this.language);
  if(!this.category&&!query){node.innerHTML=`<div class="mcb-grid">${Object.entries(categories).map(([name,image])=>`<button type="button" data-mb-category="${name}">${icon(image)}<span>${e(biometricCategoryLabel(name,this.language))}</span></button>`).join('')}</div>`;return}
  const rows=this.category?order[this.category].map(id=>library.metrics.find(row=>row.selection.kind==='catalog'&&row.selection.id===id)).filter(Boolean):library.metrics.filter(row=>biometricSearchText(row,this.language).includes(query));
  node.innerHTML=`<div class="${this.category?'mcb-grid':'mcb-results'}">${rows.map(row=>`<button type="button" data-mb-metric="${e(row.key)}">${this.category?icon(metricIcon(row)):''}<span>${e(biometricCatalogLabel(row,this.language))}${row.selection.kind==='metric'?` · ${e(row.selection.unit)}`:''}</span></button>`).join('')||`<p role="status">${e(this.m('noResults'))}</p>`}</div>`;
 }
 select(key){
  if(this.locked())return;const d=this.session.draft;d.custom=key===null;d.metric=key||'';const metric=this.metric();d.unit=d.custom?'':usesStoolScale(metric)?stoolUnit:usesSleepDuration(metric)?'h':metric.selection.kind==='metric'?metric.selection.unit:metric.units[0]??'';
  for(const field of ['name','value','systolic','diastolic','durationHours','durationMinutes','stonePounds'])d[field]='';this.freeUnit=!metric?.units.length;this.mode='detail';this.session.invalidate();this.render();this.dialog.scrollTop=0;
 }
 renderForm(){
  const d=this.session.draft,metric=this.metric(),sleep=usesSleepDuration(metric,d.custom),stool=usesStoolScale(metric,d.custom),compound=usesCompoundWeight(metric,d.unit,d.custom),pair=metric?.fields.length===2;
  const row=(name,label,extra='',suffix='')=>`<label class="mb-row"><strong>${e(label)}</strong><span class="mb-value"><input name="${name}" value="${e(d[name])}" ${extra}>${suffix?`<span>${e(suffix)}</span>`:''}</span></label>`;
  let fields=d.custom||this.session.editing&&metric?.selection.kind==='metric'?row('name',this.m('name'),'required maxlength="100"'):'';
  if(sleep)fields+=`<div class="mb-row"><strong>${e(this.m('amount'))}</strong><span class="mb-duration"><input name="durationHours" type="number" min="0" step="1" placeholder="0" aria-label="${e(this.message('hours'))}" value="${e(d.durationHours)}"><span>:</span><input name="durationMinutes" type="number" min="0" max="59" step="1" placeholder="00" aria-label="${e(this.message('minutes'))}" value="${e(d.durationMinutes)}"></span></div>`;
  else if(stool)fields+=`<button type="button" class="mb-row" data-mb-stool><strong>${e(this.message('stoolType'))}</strong><span class="mb-value">${e(d.value?this.message('stoolTypeNumber',{value:d.value}):this.message('chooseType'))}${symbol('arrow_drop_down')}</span></button>${d.value?`<img class="mb-stool" src="/record-source/bristol/type-${Number(d.value)}.png" alt="${e(this.message('stoolDescription.'+d.value))}">`:''}`;
  else fields+=(d.custom?[{key:'value'}]:metric.fields).map(field=>row(field.key,compound?this.message('stones'):this.message('field.'+field.key),`${compound?'':'required'} type="text" inputmode="decimal" autocomplete="off"`,pair?d.unit:'')).join('');
  if(compound)fields+=row('stonePounds',this.message('pounds'),'type="text" inputmode="decimal" placeholder="0"');
  if(!pair&&!stool){if(d.custom||this.freeUnit)fields+=row('unit',this.m('unit'),'required maxlength="30"');else fields+=`<button type="button" class="mb-row" data-mb-unit ${sleep?'disabled':''}><strong>${e(this.m('units'))}</strong><span class="mb-value">${e(sleep?this.m('hoursMinutes'):d.unit)}${sleep?'':symbol('arrow_drop_down')}</span></button>`}
  if(this.session.editing)fields+=row('date','Date','type="date" required');
  fields+=`<div class="mb-row"><label for="mb-time">${e(this.m('timestamp'))}</label><span class="mb-value"><input id="mb-time" type="time" name="time" value="${e(d.time)}" ${d.time?'':'readonly tabindex="-1"'}><input type="checkbox" data-mb-time-toggle aria-label="${e(this.m('timestamp'))}" ${d.time?'checked':''}></span></div><button type="button" class="mb-row" data-mb-group><strong>${e(this.m('group'))}</strong><span class="mb-value">${e(d.group||this.message('noGroup'))}${symbol('arrow_drop_down')}</span></button>`;
  this.root.innerHTML=`<form data-form="mobile-biometric"><section class="mb-card">${fields}</section><p data-mb-error role="alert" hidden></p><p data-mb-status role="status" hidden></p><button type="submit" class="mb-save" data-mb-save>${e(this.session.editing?'Save Changes':this.m('add'))}</button><button type="button" class="mb-save" data-mb-check hidden>${e(this.m('check'))}</button></form>`;
 }
 input(event){
  if(this.locked()||!event.target.closest('[data-form=mobile-biometric]'))return;const node=event.target,d=this.session.draft;
  if(node.hasAttribute('data-mb-time-toggle')){const input=this.root.querySelector('[name=time]');if(node.checked){d.time=this.lastTime||new Date().toTimeString().slice(0,5);input.readOnly=false;input.tabIndex=0}else{this.lastTime=d.time;d.time='';input.readOnly=true;input.tabIndex=-1}input.value=d.time}else if(Object.hasOwn(d,node.name))d[node.name]=node.value;
  this.session.invalidate();
 }
 click(event){
  const button=event.target.closest('button');if(!button||!this.root.contains(button))return;
  if(button.hasAttribute('data-mb-check')){void this.session.reconcile();return}if(button.hasAttribute('data-mb-reload')){void this.session.load();return}if(this.locked())return;
  if(button.dataset.mbCategory){this.category=button.dataset.mbCategory;this.session.draft.category=this.category;this.render();this.dialog.scrollTop=0}
  if(button.dataset.mbMetric)this.select(button.dataset.mbMetric);
  if(button.hasAttribute('data-mb-custom'))this.select(null);
  if(button.hasAttribute('data-mb-group'))this.openMenu(button,this.m('group'),[{id:'',label:this.message('noGroup')},...this.session.library.groups.map(group=>({id:group,label:group}))],this.session.draft.group,value=>this.session.draft.group=value);
  if(button.hasAttribute('data-mb-unit')){const metric=this.metric();this.openMenu(button,this.m('units'),[...metric.units.map(unit=>({id:unit,label:unit})),...(metric.allowCustomUnit?[{id:'__custom_unit',label:this.m('otherUnit')}]:[])],this.session.draft.unit,value=>{this.freeUnit=value==='__custom_unit';this.session.draft.unit=this.freeUnit?'':value;this.session.draft.stonePounds=''})}
  if(button.hasAttribute('data-mb-stool'))this.openMenu(button,this.message('stoolType'),stoolTypes.map(row=>({id:String(row.value),label:row.value+' · '+this.message('stoolLabel.'+row.value)})),this.session.draft.value,value=>this.session.draft.value=value);
 }
 openMenu(origin,label,items,current,choose){this.menu?.close(false);origin.setAttribute('aria-expanded','true');this.menu=new AnchoredMenu({origin,anchor:origin,label,className:'mb-menu',items:items.map(item=>({...item,selected:item.id===current})),onChoose:value=>{choose(value);this.session.invalidate();this.renderForm();this.controls()},onClose:()=>{this.menu=null;origin.setAttribute('aria-expanded','false')}})}
 async save(){
  const s=this.session;if(this.locked()||!this.root.querySelector('form').reportValidity())return;let input;try{input=parseBiometricDraft(s.draft,this.metric(),this.language)}catch(error){s.error=error.message;this.update();return}if(!input)return;
  this.saving=true;this.controls();try{await s.save(input)}finally{this.saving=false;if(!this.disposed)this.update()}
 }
 controls(){
  const s=this.session,locked=this.locked();this.root.querySelectorAll('input,button').forEach(node=>node.disabled=locked);const form=this.root.querySelector('form');if(!form)return;
  const save=form.querySelector('[data-mb-save]'),check=form.querySelector('[data-mb-check]');save.hidden=s.unknown;save.disabled=locked||!form.checkValidity();check.hidden=!s.unknown;check.disabled=Boolean(s.pending);
  const unit=form.querySelector('[data-mb-unit]');if(unit&&usesSleepDuration(this.metric(),s.draft.custom))unit.disabled=true;
  const error=form.querySelector('[data-mb-error]');error.textContent=s.error;error.hidden=!s.error;const status=form.querySelector('[data-mb-status]');status.textContent=s.unknown?this.m('unknown'):s.pending?this.message(s.pending==='preview'?'preparing':s.pending==='save'?'saving':'checking'):'';status.hidden=!status.textContent;
 }
 update(){
  if(this.disposed)return;if(this.initialEntry&&this.session.library&&!this.locked()){const {selection,unit}=this.initialEntry;this.initialEntry=null;if(!this.session.draft.metric&&!this.session.draft.custom){const metric=this.session.library.metrics.find(row=>Object.entries(selection).every(([key,value])=>row.selection[key]===value));if(metric){this.select(metric.key);if(unit&&metric.units.includes(unit)){this.session.draft.unit=unit;this.render();this.controls()}return}}}if(this.renderedLibrary!==this.session.library){this.renderedLibrary=this.session.library;this.render()}else if(!this.session.library)this.render();this.controls();
  if(this.session.imported&&!this.delivered){this.delivered=true;queueMicrotask(async()=>{if(this.disposed)return;try{await this.onSaved?.(this.session.result)}catch{if(!this.disposed){this.session.error=this.message('refreshFailed');this.controls()}}})}
 }
 back(){if(this.menu){this.menu.close();return true}if(this.locked())return false;if(this.mode==='detail'){this.mode='browse';this.session.draft.metric='';this.session.draft.custom=false;this.session.invalidate();this.render();return true}if(this.category){this.category='';this.session.draft.category='';this.render();return true}return false}
 dispose(){if(this.disposed)return;this.disposed=true;this.menu?.close(false);this.unsubscribe();this.abort.abort();if(this.session.pending)this.session.stopWaiting();if(this.session.unknown)this.onNotice(this.m('unknown'))}
}
