import {escape as e} from '../html.js';
import {moreIcon} from '../more-source/menu-view.js';
import {formatMessage} from './message-format.js';
import {mobileNutrientName,orderedNutrientRows,mobileNutrientGroups} from '../mobile-nutrient-groups.js';
import {displayValue,displayUnit} from '../report-source/public/energy-display.js';
import {convertEnergy} from '../report-source/server/energy-units.mjs';
import {LibraryReviewDialog} from './library-review-dialog.js';
const question='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4"/><path d="M12 16v1"/></svg>';
export class MobileNutrientTargets{
 constructor({root,header,date,language,request,save,onNavigate,onNotice,initialNutrient=null}){
  Object.assign(this,{root,header,date,language,request,save,onNavigate,onNotice,initialNutrient});this.m=key=>formatMessage(language,'mobileNutrientTargets.'+key);this.controller=new AbortController();this.category=null;this.advanced=false;this.error='';this.loading=false;this.saving=false;this.unknown=false;this.view=null;this.disposed=false;
  root.addEventListener('click',event=>this.click(event),{signal:this.controller.signal});root.addEventListener('change',event=>void this.change(event),{signal:this.controller.signal});void this.load();
 }
 name(row){return mobileNutrientName(row,this.language)}
 button(label,attrs){return `<button type="button" ${attrs}>${label}</button>`}
 headerTitle(){this.header.querySelector('h1').textContent=this.m(this.category?'group.'+this.category:'title');this.header.querySelector('[data-mt-menu]').hidden=!!this.category;}
 async load(){if(this.disposed)return;this.loading=true;this.error='';this.render();try{const view=await this.request('/api/nutrient-targets?'+new URLSearchParams({date:this.date}),{signal:this.controller.signal});if(this.disposed)return;if(view?.version!==1||view.date!==this.date||!Array.isArray(view.groups)||view.groups.length!==6||!Array.isArray(view.highlighted))throw Error(this.m('failed'));this.view=view;if(this.initialNutrient){this.category=view.groups.find(group=>group.nutrients.some(row=>row.id===this.initialNutrient))?.id??null;this.advanced=!!this.category&&!mobileNutrientGroups[this.category].includes(this.initialNutrient);this.initialNutrient=null;}}catch(error){if(!this.disposed)this.error=error.message||this.m('failed');}finally{this.loading=false;if(!this.disposed)this.render();}}
 render(){
  if(this.disposed)return;this.headerTitle();const scroll=window.scrollY,m=this.m,view=this.view,busy=this.loading||this.saving||this.unknown;
  const status=`<div class="mnt-status" ${!this.error&&!this.loading&&!this.saving?'hidden':''}>${this.error?`<p role="alert">${e(this.error)}</p>${this.button(e(m('reload')),'data-mnt-reload')}`:`<p role="status">${e(m(this.saving?'saving':'loading'))}</p>`}</div>`;
  if(!view){this.root.innerHTML=status;return;}
  const category=view.groups.find(g=>g.id===this.category),rows=view.groups.flatMap(g=>g.nutrients);
  const home=`<h2 class="mnt-section-title">${e(m('group.general'))}</h2><section class="mm-group mnt-categories">${view.groups.map(g=>this.button(`<span>${e(m('group.'+g.id))}</span>${moreIcon('chevron-right','mm-chevron')}`,`class="mm-row" data-mnt-category="${g.id}"`)).join('')}</section><h2 class="mnt-section-title">${e(m('highlights'))}</h2><details class="mm-group mnt-highlights" open><summary><span>${e(m('selected'))}</span>${moreIcon('chevron-right','mm-chevron')}</summary>${view.highlighted.map(id=>rows.find(row=>row.id===id)).filter(Boolean).map(row=>this.button(`<span>${e(this.name(row))}</span>${moreIcon('chevron-right','mm-chevron')}`,`class="mm-row" data-mnt-highlight="${e(row.id)}"`)).join('')}${this.button(e(m('edit')),'class="mnt-edit" data-mnt-edit-highlights')}</details>`;
  this.root.innerHTML=`<div ${!busy&&!this.error?'data-mnt-ready':''}>${status}<fieldset class="mnt-editor" ${busy||this.error?'disabled':''}>${category?`<section class="mnt-cards" data-mnt-group="${e(category.id)}">${this.categoryCards(category)}</section>`:home}</fieldset></div>`;
  window.scrollTo(0,scroll);
 }
 categoryCards(group){
  const byId=new Map(group.nutrients.map(row=>[row.id,row]));
  const standard=orderedNutrientRows(byId,group.id);
  const ids=new Set(mobileNutrientGroups[group.id]);
  const additional=group.nutrients.filter(row=>!ids.has(row.id));
  const rows=standard.map(row=>this.card(row)).join('');
  if(!additional.length)return rows;
  return rows+`<button class="mnt-edit" type="button" data-mnt-advanced aria-expanded="${this.advanced}">${e(this.m('additional'))}</button>`+(this.advanced?additional.map(row=>this.card(row)).join(''):'');
 }
 card(row){
  const m=this.m,unit=displayUnit(row.unit,this.view.energyUnit),name=this.name(row);
  const input=(key,value,disabled)=>`<label class="mnt-number ${value===null?'mnt-empty':''}"><span>${e(m(key))}</span><input type="number" inputmode="decimal" min="0" step="any" placeholder="${e(m(key))}" aria-label="${e(m(key)+' · '+name)}" data-mnt-field="${key}" value="${e(displayValue(value,row.unit,this.view.energyUnit)??'')}" ${disabled?'disabled':''}></label><span class="mnt-unit">${e(unit)}</span>`;
  const toggle=(key,value,disabled=false)=>`<label class="mnt-toggle"><span>${e(m(key))}</span><input type="checkbox" role="switch" class="dc-switch" aria-label="${e(m(key)+' · '+name)}" data-mnt-field="${key}" ${value?'checked':''} ${disabled?'disabled':''}></label>`;
  return `<article class="mnt-card" data-mnt-row="${e(row.id)}"><div class="mnt-card-heading"><span>${e(name)}</span>${this.button(question,`data-mnt-help="${e(row.id)}" aria-label="${e(m('help')+' · '+name)}"`)}</div><div class="mnt-controls">${input('dailyTarget',row.dailyTarget.effective,!row.customEditable||row.dailyTarget.mode!=='custom'||!!row.dailyTarget.editor)}${toggle('visible',row.visible)}${input('maximum',row.maximum.effective,!row.customEditable||row.maximum.mode!=='custom')}${toggle('custom',row.custom,!row.customEditable)}</div></article>`;
 }
 click(event){
  const el=event.target.closest('button');if(!el)return;
  if(el.hasAttribute('data-mnt-reload')){this.unknown=false;void this.load();return;}
  if(el.hasAttribute('data-mnt-advanced')){this.advanced=!this.advanced;this.render();this.root.querySelector('[data-mnt-advanced]').focus({preventScroll:true});return;}
  if(el.dataset.mntCategory){this.advanced=false;this.category=el.dataset.mntCategory;this.render();window.scrollTo(0,0);}
  if(el.dataset.mntHighlight){const id=el.dataset.mntHighlight;this.category=this.view.groups.find(g=>g.nutrients.some(row=>row.id===id)).id;this.advanced=!mobileNutrientGroups[this.category].includes(id);this.render();const row=[...this.root.querySelectorAll('[data-mnt-row]')].find(el=>el.dataset.mntRow===id);row?.scrollIntoView({block:'center'});row?.querySelector('button')?.focus({preventScroll:true});}
  if(el.hasAttribute('data-mnt-edit-highlights'))this.onNavigate('diary');
  if(el.dataset.mntHelp)this.help(el.dataset.mntHelp);
 }
 async change(event){
  const input=event.target.closest('[data-mnt-field]');if(!input||this.saving||this.loading||this.unknown)return;
  const id=input.closest('[data-mnt-row]').dataset.mntRow,key=input.dataset.mntField,row=this.view.groups.flatMap(g=>g.nutrients).find(row=>row.id===id);let value;
  if(['custom','visible'].includes(key))value=input.checked;else{if(!input.checkValidity()){input.reportValidity();return;}value=input.value===''?null:Number(input.value);if(value!==null&&(!Number.isFinite(value)||value<0)){input.setCustomValidity(this.m('invalid'));input.reportValidity();return;}if(row.unit==='kcal'&&value!==null)value=convertEnergy(value,this.view.energyUnit,'kcal');}
  this.saving=true;this.error='';this.render();
  try{await this.save(key==='custom'?'nutrientTarget.setCustom':'nutrientTarget.patch',key==='custom'?{date:this.date,id,custom:value}:{date:this.date,id,changes:{[key]:value}});this.onNotice?.(this.m('saved'));if(this.disposed)return;this.saving=false;await this.load();}
  catch(error){if(this.disposed)return;this.unknown=!(error.status>=400&&error.status<500);this.error=this.unknown?this.m('unknown'):error.message;}
  finally{this.saving=false;if(!this.disposed)this.render();}
 }
 help(id){
  this.popup?.close();const row=this.view.groups.flatMap(g=>g.nutrients).find(row=>row.id===id),m=this.m,reference=row.dailyTarget.reference,maximum=row.maximum.reference;
  const number=value=>value===null?m('unset'):displayValue(value,row.unit,this.view.energyUnit).toLocaleString(this.language,{maximumFractionDigits:3})+' '+displayUnit(row.unit,this.view.energyUnit);
  const editor=!row.customEditable?row.dailyTarget.editor??'macros':'references';
  this.popup=new LibraryReviewDialog({title:this.name(row),closeLabel:m('close'),loading:'',onClose:()=>{this.popup=null;}});this.popup.root.classList.add('mnt-help-dialog');
  this.popup.show(`<dl><div><dt>${e(m('dailyTarget'))}</dt><dd>${e(number(row.dailyTarget.effective))}</dd></div><div><dt>${e(m('maximum'))}</dt><dd>${e(number(row.maximum.effective))}</dd></div></dl>${row.dailyTarget.origin==='sample'?`<p>${e(m('sample'))}</p>`:''}${reference?`<p>${e(reference.kind??m('noReference'))}</p><a href="${e(reference.source.url)}" target="_blank" rel="noopener noreferrer">${e(m('source'))}</a>`:`<p>${e(m('noReference'))}</p>`}${maximum?.comparisonSupported===false?`<p>${e(m('restricted'))}</p>`:''}${this.button(e(m(row.customEditable?'referenceSetup':'editTargets')),'class="mnt-edit" data-mnt-owner')}`);
  this.popup.root.querySelector('[data-mnt-owner]').onclick=()=>{this.popup.close();this.onNavigate(editor);};
 }
 back(){if(this.popup){this.popup.close();return true;}if(this.category){this.category=null;this.render();window.scrollTo(0,0);return true;}return false;}
 dispose(){this.disposed=true;this.controller.abort();this.popup?.close(false);}
}
