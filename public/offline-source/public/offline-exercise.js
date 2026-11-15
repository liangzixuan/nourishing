import {diaryRecordErrorText} from './diary-record-errors.js';
import {formatMessage} from './../../report-source/public/message-format.js';
import {parseExerciseFields,exerciseLimits} from './../server/diary-record-fields.mjs';
import {assertDiaryDaysEditable} from './../../report-source/server/diary-day-status.mjs';
import {convertEnergy} from './../../report-source/server/energy-units.mjs';

export const exerciseInputsReady=snapshot=>snapshot?.energyInputsVersion===3&&Number.isSafeInteger(snapshot.operationWatermark)&&snapshot.operationWatermark>=0;
const activityMessage=(language,key,values)=>formatMessage(language||'en','activity.'+key,values);
export function prepareExercise(copy,payload){
 const message=(key,values)=>activityMessage(copy?.snapshot?.state?.settings?.appLanguage,key,values);
 if(!exerciseInputsReady(copy.snapshot))throw Error(message('refreshRequired'));
 const value=parseExerciseFields(payload,copy.snapshot.state.settings.groups);assertDiaryDaysEditable(copy.snapshot.state,[value.date]);return value;
}
export function projectPendingExercise(state,snapshot,pending){
 const message=(key,values)=>activityMessage(snapshot?.state?.settings?.appLanguage,key,values);
 if(pending.command.workspaceId!==snapshot.identity.workspaceId||pending.command.generation!==snapshot.identity.generation)return message('earlierWorkspace');
 if(state.entries.some(row=>row.id===pending.command.operationId))return null;
 if(pending.status==='unknown'&&pending.preview.savedAt!==snapshot.savedAt)return message('unknownRefresh');
 try{prepareExercise({snapshot},pending.command.payload);}catch(error){return diaryRecordErrorText(error,snapshot?.state?.settings?.appLanguage);}
 state.entries.push({...pending.preview.value,_pending:true});return null;
}
export function acceptExerciseReceipt(current,pending,result,projectRecord){
 const message=(key,values)=>activityMessage(current?.snapshot?.state?.settings?.appLanguage,key,values);
 const expected=pending.preview.value,actual=result.record?.value;
 if(!actual||Object.keys(actual).length!==Object.keys(expected).length||Object.keys(expected).some(key=>expected[key]!==actual[key])||!Number.isSafeInteger(result.sequence)||result.sequence<1)throw Error(message('receiptError'));
 if(result.sequence<=current.snapshot.operationWatermark)return;
 if(!current.snapshot.state.entries.some(row=>row.id===actual.id))current.snapshot.state.entries.push(projectRecord('entries',actual));
}

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class ExerciseEditor{
 constructor(dialog,{copy,date,onError,save}){
  const message=(key,values)=>activityMessage(copy.snapshot.state.settings.appLanguage,key,values);
  this.dialog=dialog;this.copy=copy;this.review=null;this.busy=false;
  const unit=copy.snapshot.state.settings.energyUnit??'kcal';
  dialog.innerHTML=`<div class="dialog-head"><h2>${escape(message('offlineTitle'))}</h2></div><form class="dialog-body offline-form"><label>${escape(message('exercise'))}<input name="name" maxlength="300" required></label><div class="offline-fields"><label>${escape(message('date'))}<input name="date" type="date" value="${escape(date)}" required></label><label>${escape(message('optionalTime'))}<input name="time" type="time" value="${new Date().toTimeString().slice(0,5)}"></label></div><label>${escape(message('group'))}<select name="group">${copy.snapshot.state.settings.groups.map(g=>`<option value="${escape(g)}">${escape(g)}</option>`).join('')}</select></label><label>${escape(message('duration'))}<input name="duration" type="number" min="${exerciseLimits.minimumMinutes}" max="${exerciseLimits.maximumMinutes}" step="any" required></label><div class="offline-fields"><label>${escape(message('energy'))}<input name="energy" type="number" min="0" step="any" required></label><label>${escape(message('energyUnit'))}<select name="energyUnit"><option value="kcal" ${unit==='kcal'?'selected':''}>kcal</option><option value="kJ" ${unit==='kJ'?'selected':''}>kJ</option></select></label></div><p class="offline-small">${escape(message('offlineHelp'))}</p><div data-exercise-review></div><p data-exercise-error role="alert" hidden></p><div class="row wrap"><button type="button" class="btn" data-exercise-preview>${escape(message('review'))}</button><button type="submit" class="btn primary" data-exercise-save disabled>${escape(message('offlineSave'))}</button><button type="button" class="btn" data-exercise-cancel>${escape(message('cancel'))}</button></div></form>`;
  const form=dialog.querySelector('form'),error=message=>{const node=dialog.querySelector('[data-exercise-error]');node.textContent=message;node.hidden=false;onError(message);};
  const invalidate=()=>{this.review=null;dialog.querySelector('[data-exercise-review]').replaceChildren();this.controls(this.busy);};form.oninput=invalidate;form.onchange=invalidate;
  dialog.querySelector('[data-exercise-preview]').onclick=()=>{if(this.busy||!form.reportValidity())return;try{const fields=Object.fromEntries(new FormData(form));const payload={date:fields.date,time:fields.time,group:fields.group,name:fields.name,duration:Number(fields.duration),calories:convertEnergy(Number(fields.energy),fields.energyUnit,'kcal'),confirmed:true},value=prepareExercise(copy,payload);this.review={payload,value};dialog.querySelector('[data-exercise-error]').hidden=true;dialog.querySelector('[data-exercise-review]').innerHTML=`<h3>${escape(message('review'))}</h3><p>${escape(value.name)}</p><p>${escape(value.date)} · ${escape(value.time||message('noTime'))} · ${escape(value.group)}</p><p>${escape(message('durationValue',{duration:value.duration,energy:fields.energy,unit:fields.energyUnit}))}${fields.energyUnit==='kJ'?` ${escape(message('recorded',{energy:value.caloriesBurned}))}`:''}</p><p>${escape(message('offlineScope'))}</p>`;this.controls(this.busy);}catch(e){invalidate();error(diaryRecordErrorText(e,copy.snapshot.state.settings.appLanguage));}};
  form.onsubmit=event=>{event.preventDefault();if(this.busy||!this.review)return;save(this.review.payload,this.review.value,{...copy.snapshot.identity});};
  dialog.querySelector('[data-exercise-cancel]').onclick=()=>this.close();dialog.oncancel=event=>{event.preventDefault();if(!this.busy)this.close();};dialog.showModal();dialog.querySelector('[name=name]').focus();
 }
 controls(busy=false){this.busy=busy;if(!this.dialog.open)return;for(const node of this.dialog.querySelectorAll('input,select,button'))node.disabled=busy;this.dialog.querySelector('[data-exercise-save]').disabled=busy||!this.review;}
 close(){if(this.dialog.open)this.dialog.close();this.dialog.replaceChildren();this.review=null;}
}

export function exerciseCorrectionFields(row,unit,language='en'){
 const message=(key,values)=>activityMessage(language,key,values);
 return `<label>${escape(message('exercise'))}<input name="name" maxlength="300" value="${escape(row.name)}" required></label><label>${escape(message('duration'))}<input name="duration" type="number" min="${exerciseLimits.minimumMinutes}" max="${exerciseLimits.maximumMinutes}" step="any" value="${escape(row.duration)}" required></label><label>${escape(message('energy'))}<input name="energy" type="number" min="0" step="any" value="${escape(convertEnergy(row.caloriesBurned,'kcal',unit))}" required></label><label>${escape(message('energyUnit'))}<select name="energyUnit"><option value="kcal" ${unit==='kcal'?'selected':''}>kcal</option><option value="kJ" ${unit==='kJ'?'selected':''}>kJ</option></select></label><p class="offline-small">${escape(message('correctionHelp'))}</p>`;
}
export function exerciseCorrectionInput(fields,original,unit,language='en'){
 const message=(key,values)=>activityMessage(language,key,values);
 if(!fields.duration.trim()||!fields.energy.trim())throw Error(message('requiredEnergy'));
 const energy=Number(fields.energy),unchanged=fields.energyUnit===unit&&energy===convertEnergy(original.caloriesBurned,'kcal',unit);
 const {energy:ignored,energyUnit,...changes}=fields;
 return {...changes,duration:Number(fields.duration),calories:unchanged?original.caloriesBurned:convertEnergy(energy,energyUnit,'kcal')};
}
export const describeExerciseCorrection=(row,unit,language='en')=>activityMessage(language,'correctionDescription',{name:row.name,duration:row.duration,energy:convertEnergy(row.caloriesBurned,'kcal',unit),unit,group:row.group});
