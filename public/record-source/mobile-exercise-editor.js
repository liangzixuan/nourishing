import {escape as e,symbol} from './discover-ui.js';
import {AnchoredMenu} from './anchored-menu.js';

/** Presentation only. The application form handler owns validation and persistence. */
export function mobileExerciseMarkup({value,groupOptions,unit,limits,message:m,edit=false}){
 const field=(name,label,type,value,extra='',suffix='')=>`<label class="me-row"><strong>${e(label)}</strong><span class="me-value"><input name="${name}" type="${type}" value="${e(value)}" ${extra}>${suffix?`<span>${e(suffix)}</span>`:''}</span></label>`;
 return `<form class="me-form" data-form="${edit?'exercise-edit':'exercise'}" data-energy-unit="${e(unit)}"><input type="hidden" name="id" value="${e(value.id??'')}"><input type="hidden" name="date" value="${e(value.date)}"><section class="me-card">${field('name',m('activity.name'),'text',value.name,'required maxlength="300" placeholder="'+e(m('activity.customExercise'))+'"')}${field('duration',m('activity.mobileDuration'),'number',value.duration,`required min="${limits.minimumMinutes}" max="${limits.maximumMinutes}" step="any"`,'min')}${field('calories',m('activity.mobileBurned'),'number',value.calories,`required min="0" max="${limits.maximumEnergy}" step="any"`,unit)}<div class="me-row"><label for="me-time">${e(m('notes.timestamp'))}</label><span class="me-value"><input id="me-time" type="time" name="time" value="${e(value.time)}" ${value.time?'':'readonly tabindex="-1"'}><input type="checkbox" data-me-time-toggle aria-label="${e(m('notes.timestamp'))}" ${value.time?'checked':''}></span></div><select hidden name="group">${groupOptions}</select><button type="button" class="me-row" data-me-group aria-haspopup="menu" aria-expanded="false"><strong>${e(m('notes.groupLabel'))}</strong><span class="me-value"><span data-me-group-label></span>${symbol('arrow_drop_down')}</span></button></section><button class="me-save" type="submit">${e(m(edit?'activity.save':'activity.addToDiary'))}</button></form>`;
}

export class MobileExerciseEditor{
 constructor({dialog,message}){
  this.dialog=dialog;this.message=message;this.form=dialog.querySelector('.me-form');this.abort=new AbortController();this.lastTime=this.form.elements.time.value;dialog.classList.add('mobile-food-editor','mobile-exercise-editor');
  this.form.addEventListener('input',event=>{if(event.target.matches('[data-me-time-toggle]')){const time=this.form.elements.time;if(event.target.checked){time.value=this.lastTime||new Date().toTimeString().slice(0,5);time.readOnly=false;time.tabIndex=0}else{this.lastTime=time.value;time.value='';time.readOnly=true;time.tabIndex=-1}}this.update()},{signal:this.abort.signal});
  this.form.addEventListener('click',event=>{if(event.target.closest('[data-me-group]'))this.openGroup()},{signal:this.abort.signal});this.update();
 }
 update(){this.form.querySelector('[data-me-group-label]').textContent=this.form.elements.group.selectedOptions[0]?.textContent??'';this.form.querySelector('[type=submit]').disabled=!this.form.elements.name.value.trim()||!['name','duration','calories','time'].every(key=>this.form.elements[key].validity.valid)}
 openGroup(){
  this.menu?.close(false);const origin=this.form.querySelector('[data-me-group]'),select=this.form.elements.group;origin.setAttribute('aria-expanded','true');
  this.menu=new AnchoredMenu({origin,anchor:origin,className:'me-group-menu',label:this.message('notes.groupLabel'),items:[...select.options].map(o=>({id:o.value,label:o.textContent,selected:o.selected})),onChoose:value=>{select.value=value;select.dispatchEvent(new Event('input',{bubbles:true}));this.update()},onClose:()=>{this.menu=null;origin.setAttribute('aria-expanded','false')}});
 }
 back(){if(!this.menu)return false;this.menu.close();return true}
 dispose(){this.menu?.close(false);this.abort.abort()}
}
