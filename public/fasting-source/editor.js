import {scheduleForm,syncScheduleForm,readSchedule} from './discover-schedule.js';
import {MobileFastingRecurrence} from './mobile-fasting-recurrence.js';
import {MobileDateTimePicker,dateTimeField,refreshDateTimeFields} from './mobile-datetime-picker.js';
import {MobileFastingDeleteDialog} from './mobile-fasting-delete-dialog.js';
import {repeatFields,readRepeatFields,refreshRepeatLabel} from './fasting-recurrence-fields.js';
import {scheduleGoalEnd,scheduleGoalHours,scheduledWallInstant} from './fasting-time.mjs';
import {Temporal} from './vendor/temporal.js';
import {escape as e,row,symbol} from './ui.js';
import {fastingMutation} from './mutation.js';

export function openFastingEditor({mode='schedule',record,context,refresh,onChange,onClose,initialField}){
 let data=context(),disposed=false,picker,recurrence,deletion,deleteMutation,mutation,form,initial,shiftedEnd,durationChanged=false;
 const dialog=document.createElement('dialog');dialog.className='dc-overlay dc-fast-editor fasting-editor';dialog.setAttribute('aria-label',record?'Edit Fast':mode==='past'?'Log Past Fast':'New Fast');
 dialog.innerHTML=`<header class="dc-dialog-header"><button type="button" class="dc-button dc-icon" data-close-fast aria-label="Back">${symbol('close')}</button><h2>${record?'Edit Fast':mode==='past'?'Log Past Fast':'New Fast'}</h2><span></span></header><div class="dc-dialog-body"></div>`;
 document.body.append(dialog);dialog.showModal();const body=dialog.querySelector('.dc-dialog-body');
 const schedule=mode==='schedule',language='en';
 function close(){if(mutation?.busy||deleteMutation?.busy)return;dispose();onClose?.();}
 function dispose(){if(disposed)return;disposed=true;picker?.close();recurrence?.dispose();deleteMutation?.dispose();deletion?.close();mutation?.dispose();dialog.close();dialog.remove();}
 async function reload(){await refresh();if(disposed)return;data=context();if(record){record=(schedule?data.schedules:data.history.rows).find(row=>row.id===record.id);if(!record){close();return;}}render();}
 async function saved(){dispose();onClose?.();try{await refresh();await onChange();}catch{} }
 function historyForm(){
  const completed=record?.end!=null,hours=completed?record.durationSeconds/3600:record?.goalHours??16,start=record?.startLocal??data.pastStartLocal,end=record?.endLocal??(mode==='past'?data.localNow:'');
  const input=(name,type,value,extra='')=>`<input name="${name}" type="${type}" value="${e(value)}" ${extra}>`;
  return `<form data-fast-edit-form data-time-zone="${e(data.timeZone)}" data-custom-repeat="${Boolean(record?.repeat?.custom)}"><div class="dc-group">${row('Duration',`<span class="dc-duration"><span class="dc-duration-unit">${input('days','number',Math.floor(hours/24),'min="0" step="1" required aria-label="Days"')} Day(s)</span><span class="dc-duration-unit">${input('hours','number',Number((hours%24).toFixed(4)),'min="0" max="24" step="any" required aria-label="Hours"')} Hrs</span></span>`)}${row('Open-ended fast',`<input name="open" type="checkbox" class="dc-switch" role="switch" aria-label="Open-ended fast" ${record?.goalHours===null?'checked':''}>`)}</div><div class="dc-group">${row('Start',dateTimeField('start',start,'Start'))}${row('End',dateTimeField('end',end,'End'))}${row('Repeat Fast',repeatFields(record?.repeat,start,language))}</div><div class="dc-group">${row('Name',input('label','text',record?.label??'16 hr','maxlength="200" aria-label="Name"'))}</div><textarea name="note" rows="1" maxlength="10000" placeholder="Notes" aria-label="Notes">${e(record?.note??'')}</textarea><button type="submit" class="dc-button dc-pill">Save</button>${record?'<button type="button" class="dc-button dc-fast-delete" data-delete-fast>Delete Fast</button>':''}</form>`;
 }
 function render(){
  recurrence?.dispose();mutation?.dispose();durationChanged=false;shiftedEnd=null;
  const draft=record??{label:'16 hr',startDate:data.nextLocal.slice(0,10),time:data.nextLocal.slice(11),goalHours:16,timeZone:data.timeZone,recurrence:'once',interval:1,days:[],untilDate:null,enabled:true};
  body.innerHTML=schedule?scheduleForm(draft,language):historyForm();form=body.querySelector('form');
  if(schedule){if(!record)form.querySelector('[name=enabled]')?.closest('.dc-row').remove();form.querySelector('.dc-help')?.remove();const save=form.querySelector('[data-discover=save-schedule]');save.removeAttribute('data-discover');save.type='submit';if(record)form.insertAdjacentHTML('beforeend','<button type="button" class="dc-button dc-fast-delete" data-delete-fast>Delete Fast</button>');}
  initial={start:form.elements.start.value,end:form.elements.end.value};
  recurrence=new MobileFastingRecurrence({form,language,onChange:change=>{
   if(!schedule&&change?.previousStart&&change.previousStart!==form.elements.start.value&&form.elements.end.value){const zone=data.timeZone,before=scheduledWallInstant(change.previousStart,zone),after=scheduledWallInstant(form.elements.start.value,zone),end=Temporal.Instant.from(edited('end'));const next=Temporal.Instant.fromEpochNanoseconds(end.epochNanoseconds+after.epochNanoseconds-before.epochNanoseconds);form.elements.end.value=next.toZonedDateTimeISO(zone).toPlainDateTime().toString({smallestUnit:'minute'});shiftedEnd=next.toString();}
   sync(form.elements.start);
  }});
  mutation=fastingMutation({revision:()=>data.revision,host:body,onSaved:saved,onReload:reload});sync();
  form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;try{const f=form.elements;
   if(schedule){const payload=readSchedule(form,record,record?.id??crypto.randomUUID());delete payload.timeZone;void mutation.run('fasting.schedule.save',payload);return;}
   const completed=record?.end!=null;let goalHours=record?.goalHours??16;if(f.open.checked)goalHours=null;else if(!completed||record?.goalHours===null){goalHours=Number(f.days.value)*24+Number(f.hours.value);if(goalHours<1||goalHours>168)throw Error('Choose a duration from 1 to 168 hours.');}
   const payload={start:edited('start'),end:edited('end'),goalHours,label:f.label.value,note:f.note.value,...(record?{id:record.id,repeat:readRepeatFields(form)}:{})};if(completed&&durationChanged)payload.durationHours=Number(f.days.value)*24+Number(f.hours.value);void mutation.run(record?'fast.update':'fast.record',payload);
  }catch(error){body.querySelector('[role=status]').textContent=error.message;}};
  form.addEventListener('input',event=>sync(event.target));form.addEventListener('click',event=>{if(mutation.blocked)return;const time=event.target.closest('[data-datetime-field]');if(time)openTime(time.dataset.datetimeField);if(event.target.closest('[data-repeat-picker]'))recurrence.open();if(event.target.closest('[data-delete-fast]'))confirmDelete();});
 }
 function edited(field){const value=form.elements[field].value;if(field==='end'&&shiftedEnd)return shiftedEnd;if(value===initial[field]&&record)return record[field];return value?scheduledWallInstant(value,data.timeZone).toString():null;}
 function sync(target){if(schedule){syncScheduleForm(form,target);return;}const f=form.elements;f.days.disabled=f.hours.disabled=f.open.checked;f.hours.setCustomValidity('');
  if(target&&['days','hours'].includes(target.name)){durationChanged=true;shiftedEnd=null;if(f.end.value&&!f.open.checked){try{f.end.value=scheduleGoalEnd(f.start.value,Number(f.days.value)*24+Number(f.hours.value),data.timeZone)??'';}catch{f.hours.setCustomValidity('Choose a valid duration.');}}}
  else if(target&&['start','end'].includes(target.name)&&f.end.value){if(target.name==='end'){durationChanged=false;shiftedEnd=null;}try{const hours=scheduleGoalHours(f.start.value,f.end.value,data.timeZone);if(hours>=0){f.days.value=Math.floor(hours/24);f.hours.value=Number((hours%24).toFixed(4));}}catch{}}
  refreshRepeatLabel(form,language);refreshDateTimeFields(form,language);
 }
 function openTime(field){if(picker)return;picker=new MobileDateTimePicker({value:form.elements[field].value||data.localNow,title:field==='start'?'Start':'End',timeZone:form.dataset.timeZone,language,onChoose:value=>{form.elements[field].value=value;sync(form.elements[field]);},onClose:()=>picker=null});}
 function closeDelete(){if(deleteMutation?.busy)return;deleteMutation?.dispose();deleteMutation=null;deletion?.close();deletion=null;}
 function confirmDelete(){deletion=new MobileFastingDeleteDialog({onCancel:closeDelete,onConfirm:()=>deleteMutation.run(schedule?'fasting.schedule.delete':'fast.delete',{id:record.id,...(schedule?{revision:record.revision}:{})})});deleteMutation=fastingMutation({revision:()=>data.revision,host:deletion.element,onSaved:saved,onReload:async()=>{deleteMutation?.dispose();deleteMutation=null;deletion?.close();deletion=null;await reload();}});}
 function back(){if(recurrence?.back())return true;if(picker){picker.close();return true;}if(deletion){closeDelete();return true;}close();return true;}
 dialog.addEventListener('cancel',event=>{event.preventDefault();back();});dialog.addEventListener('click',event=>{if(event.target.closest('[data-close-fast]'))back();if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)back();}});
 render();if(initialField)openTime(initialField);return {back,dispose};
}
