import {AnchoredMenu} from './anchored-menu.js';
import {formatMessage} from '../report-source/public/message-format.js';
import {MobileDateTimePicker,dateTimeField,refreshDateTimeFields} from './mobile-datetime-picker.js';
import {escape as e,row,symbol} from './ui.js';
import {readRepeatFields,writeRepeatFields,repeatPreset,presetRule,repeatPresets,recurrenceMessage as m} from './fasting-recurrence-fields.js';
import {scheduleWeekdays} from './fasting-schedule-facts.js';
import {validFastingRecurrence,fastingRecurrenceIntervalLimits} from './fasting-schedule-contract.mjs';
export class MobileFastingRecurrence{
 constructor({form,language,onChange}){Object.assign(this,{form,language,onChange});}
 open(){
  this.menu?.close();const origin=this.form.querySelector('[data-repeat-picker]'),current=readRepeatFields(this.form),selected=repeatPreset(current,this.form.elements.start.value);
  this.menu=new AnchoredMenu({origin,anchor:origin.closest('.dc-row'),placement:'row-end',edgeInset:0,label:origin.getAttribute('aria-label'),className:'dc-repeat-menu dc-repeat-presets',items:repeatPresets.map(id=>({id,label:m(this.language,'preset.'+id),selected:id===selected})),onClose:()=>{this.menu=null;},onChoose:id=>{
   if(id==='custom'){this.openCustom(current);return;}
   writeRepeatFields(this.form,{...presetRule(id,this.form.elements.start.value),untilDate:id==='once'?null:current.untilDate},this.language);this.onChange();
  }});
 }
 openCustom(value){
  const language=this.language,t=(key,values)=>m(language,key,values),start=this.form.elements.start.value;
  const initial=['daily','weekly'].includes(value.recurrence)?value:presetRule('daily',start);
  const dialog=document.createElement('dialog');this.dialog=dialog;dialog.className='dc-overlay dc-recurrence';dialog.dataset.recurrenceEditor='';dialog.setAttribute('aria-label',t('customTitle'));
  const select=(name,value,label)=>`<input type="hidden" name="${name}" value="${e(value)}"><button type="button" class="dc-repeat-value" data-repeat-choice="${name}" aria-label="${e(label)}" aria-haspopup="menu"><span></span>${symbol('arrow_drop_down')}</button>`;
  dialog.innerHTML=`<header class="dc-dialog-header"><button type="button" class="dc-button dc-icon" data-repeat-close aria-label="${e(t('close'))}">${symbol('close')}</button><h2>${e(t('customTitle'))}</h2><span></span></header><form class="dc-dialog-body"><div class="dc-group">${row(t('startDate'),dateTimeField('start',start,t('startDate'),language))}${row(t('repeat'),select('frequency',initial.recurrence,t('repeat')))}${row(t('every'),`<span class="dc-repeat-interval">${select('interval',initial.interval??1,t('every'))}<span data-repeat-unit></span></span>`)}</div><p class="dc-repeat-summary" data-repeat-summary></p><fieldset class="dc-group" data-repeat-days aria-label="${e(t('weekdays'))}">${scheduleWeekdays(language).map((day,i)=>`<label class="dc-row"><span>${e(day)}</span><input type="checkbox" name="weekday" value="${i}" ${initial.days.includes(i)?'checked':''} aria-label="${e(day)}"></label>`).join('')}</fieldset>${value.untilDate?`<details class="dc-repeat-end" open><summary>${e(t('until'))}</summary><input type="date" name="untilDate" value="${e(value.untilDate)}" aria-label="${e(t('until'))}"></details>`:'<input type="hidden" name="untilDate" value="">'}<button type="submit" class="dc-button dc-pill">${e(formatMessage(language,'common.save'))}</button><p role="alert" class="dc-error"></p></form>`;
  const form=dialog.querySelector('form');
  const read=()=>({recurrence:form.elements.frequency.value,interval:Number(form.elements.interval.value),days:form.elements.frequency.value==='weekly'?[...form.elements.weekday].filter(f=>f.checked).map(f=>Number(f.value)):[],untilDate:form.elements.untilDate.value||null});
  const sync=()=>{
   const current=read(),weekly=current.recurrence==='weekly';form.querySelector('[data-repeat-days]').hidden=!weekly;
   form.querySelector('[data-repeat-unit]').textContent=t('unit.'+current.recurrence);form.elements.untilDate.min=form.elements.start.value.slice(0,10);
   form.querySelector('[data-repeat-summary]').textContent=t('summary.'+current.recurrence+'.'+(current.interval===1?'one':'many'),{count:current.interval,days:current.days.length?t('summary.on',{days:new Intl.ListFormat(language,{style:'long',type:'conjunction'}).format(current.days.map(day=>scheduleWeekdays(language)[day]))}):'',date:new Date(form.elements.start.value.slice(0,10)+'T12:00:00Z').toLocaleDateString(language,{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'})});
   form.querySelector('[data-repeat-choice=frequency] span').textContent=t('preset.'+current.recurrence);form.querySelector('[data-repeat-choice=interval] span').textContent=current.interval;
   refreshDateTimeFields(form,language);
  };
  form.addEventListener('input',sync);
  form.addEventListener('click',event=>{
   const origin=event.target.closest('[data-repeat-choice]');if(!origin)return;
   const name=origin.dataset.repeatChoice,field=form.elements[name],values=name==='frequency'?['daily','weekly']:Array.from({length:fastingRecurrenceIntervalLimits[form.elements.frequency.value]},(_,i)=>String(i+1));
   this.menu=new AnchoredMenu({origin,anchor:origin,label:origin.getAttribute('aria-label'),className:'dc-repeat-menu dc-custom-repeat-menu',items:values.map(id=>({id,label:name==='frequency'?t('preset.'+id):id,selected:id===field.value})),onClose:()=>{this.menu=null;},onChoose:id=>{field.value=id;if(name==='frequency')form.elements.interval.value='1';sync();}});
  });
  dialog.querySelector('[data-repeat-close]').addEventListener('click',()=>this.closeCustom());
  form.querySelector('[data-datetime-field]').addEventListener('click',()=>{this.picker=new MobileDateTimePicker({value:form.elements.start.value,title:t('startDate'),language,timeZone:this.form.dataset.timeZone,onChoose:next=>{form.elements.start.value=next;sync();},onClose:()=>{this.picker=null;}});});
  form.addEventListener('submit',event=>{
   event.preventDefault();if(!form.reportValidity())return;const current=read();if(current.recurrence==='weekly'&&!current.days.length)current.days=presetRule('weekly',form.elements.start.value).days;current.custom=true;
   if(!validFastingRecurrence(current)){form.querySelector('.dc-error').textContent=t('invalidSchedule');return;}
   const previousStart=this.form.elements.start.value;this.form.elements.start.value=form.elements.start.value;writeRepeatFields(this.form,current,language);this.closeCustom();this.onChange({previousStart});
  });
  dialog.addEventListener('cancel',event=>{event.preventDefault();this.back();});
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)this.back();});
  document.body.append(dialog);dialog.showModal();sync();
 }
 closeCustom(){this.picker?.close();if(this.dialog){this.dialog.close();this.dialog.remove();this.dialog=null;this.form.querySelector('[data-repeat-picker]')?.focus();}}
 back(){if(this.picker){this.picker.close();return true;}if(this.menu){this.menu.close();return true;}if(this.dialog){this.closeCustom();return true;}return false;}
 dispose(){this.menu?.close();this.closeCustom();}
}
