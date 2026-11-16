import {request} from './diary-api.js';
import {escape as e} from './html.js';
import {mountNoteEditor} from './note-photos.js';
import {MobileExerciseBrowser} from './record-source/mobile-exercise-browser.js';
import {MobileExerciseEditor,mobileExerciseMarkup} from './record-source/mobile-exercise-editor.js';
import {CatalogExerciseEditor} from './record-source/catalog-exercise-editor.js';
import {MobileBiometricPanel} from './record-source/mobile-biometric.js';
import {blankBiometricDraft} from './record-source/biometric-entry.js';
import {formatMessage} from './record-source/message-format.js';
import {convertEnergy} from './dashboard-source/energy-units.mjs';
const collections={exercise:'entries',biometric:'biometrics'},message=(key,values)=>formatMessage('en',key,values),clock=()=>new Date().toTimeString().slice(0,5);
const classes=['mobile-food-editor','mobile-catalog-browser','mobile-exercise-editor','mobile-biometric'];
/** Each open sheet owns its draft, pending command and disposable source presentation. */
export async function mountRecordEditor(args){
 const {kind,date,show,close,content,onChange,initialSelection,initialGroup}=args;let record=args.record;
 if(kind==='note')return mountNoteEditor(args);if(!Object.hasOwn(collections,kind))return;
 if(!document.querySelector('link[data-record-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/records.css';link.dataset.recordStyle='';document.head.append(link);}
 show('<section class="record-surface"><header class="dialog-head"><button type="button" data-record-close aria-label="Close">×</button><h2>Add '+(kind==='exercise'?'Exercise':'Biometric')+'</h2></header><div data-record-content><p class="empty" role="status">Loading…</p></div><div class="record-status" role="alert"></div></section>');
 const root=content.querySelector('.record-surface'),sheet=content.closest('dialog'),abort=new AbortController();sheet.classList.add('record-sheet');
 let options,detail,panel,session,disposed=false,busy=false,envelope=null,conflict=false,returnTo=null,deletePrompt=false;
 const alive=()=>!disposed&&root.isConnected,status=()=>root.querySelector('.record-status');
 function teardown(){panel?.dispose();panel=null;session=null;sheet.classList.remove(...classes);}
 function dispose(){if(disposed)return;disposed=true;teardown();abort.abort();observer.disconnect();sheet.classList.remove('record-sheet');}
 function exit(){if(busy)return;dispose();close();}
 function back(){if(busy)return;if(deletePrompt){root.querySelector('.record-delete-confirm')?.remove();deletePrompt=false;return;}if(panel?.menu){panel.menu.close();return;}if(panel?.base?.menu){panel.base.menu.close();return;}if(envelope||conflict||record){exit();return;}if(kind==='biometric'&&panel?.back())return;if(returnTo){const next=returnTo;returnTo=null;next();return;}exit();}
 function frame(title,html){teardown();root.innerHTML=`<header class="dialog-head"><button type="button" data-action="close-dialog" data-record-close aria-label="Back">×</button><h2>${e(title)}</h2></header><div data-record-content>${html}</div><div class="record-status" role="alert"></div>`;sheet.scrollTop=0;return root.querySelector('[data-record-content]');}
 const observer=new MutationObserver(()=>{if(!root.isConnected)dispose();});observer.observe(content,{childList:true});
 const cancel=event=>{if(!alive())return;event.preventDefault();event.stopImmediatePropagation();back();};sheet.addEventListener('cancel',cancel,{capture:true,signal:abort.signal});window.addEventListener('nourishing-back',cancel,{capture:true,signal:abort.signal});
 sheet.addEventListener('click',event=>{if(event.target===sheet){event.preventDefault();event.stopImmediatePropagation();back();}},{capture:true,signal:abort.signal});
 root.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.hasAttribute('data-record-close'))back();if(button.hasAttribute('data-record-reload')){dispose();void mountRecordEditor(args);}if(button.hasAttribute('data-record-retry'))void save();if(button.hasAttribute('data-record-delete'))confirmDelete();if(button.hasAttribute('data-delete-cancel')){root.querySelector('.record-delete-confirm')?.remove();deletePrompt=false;}if(button.hasAttribute('data-delete-confirm'))void save(kind==='exercise'?'entry.delete':'biometric.delete',{id:record.id});},{signal:abort.signal});
 function controls(){
  if(!alive())return;const locked=busy||Boolean(envelope)||conflict;
  if(!locked){for(const node of root.querySelectorAll('[data-record-disabled]')){node.disabled=node.dataset.recordDisabled==='true';delete node.dataset.recordDisabled;}if(panel instanceof CatalogExerciseEditor)panel.refresh();else if(panel instanceof MobileExerciseEditor)panel.update();else panel?.controls();}
  if(locked||record&&!detail.editable)for(const node of root.querySelectorAll('input,select,form button')){if(!Object.hasOwn(node.dataset,'recordDisabled'))node.dataset.recordDisabled=String(node.disabled);node.disabled=true;}
  for(const button of root.querySelectorAll('[data-record-close],[data-record-delete],[data-record-retry],[data-record-reload],[data-delete-cancel],[data-delete-confirm]'))button.disabled=busy||button.hasAttribute('data-record-delete')&&(Boolean(envelope)||conflict);
  if(session?.unknown&&!busy&&!conflict){const retry=root.querySelector('[data-mb-check]');if(retry)retry.disabled=false;}
  if(record&&!detail.editable)root.querySelector('[type=submit]')?.setAttribute('hidden','');
 }
 function errorView(error){if(!alive())return;status().innerHTML=(session&&!conflict?'':e(error.message))+(conflict?'<button type="button" data-record-reload>Reload record</button>':envelope&&!session?'<button type="button" data-record-retry>Try again</button>':'');if(session){session.error=error.message;session.unknown=Boolean(envelope)&&!conflict;if(conflict)session.readOnly=true;session.notify();}}
 async function save(type,payload){
  if(busy||conflict||!alive())return;
  if(!envelope)envelope={requestId:crypto.randomUUID(),revision:detail?.revision??options.revision,type,payload:structuredClone(payload)};
  busy=true;status().textContent='';if(session){session.pending='save';session.error='';session.notify();}controls();
  try{await request('/api/workspace/command',envelope);if(!alive())return;await onChange();if(alive()){busy=false;exit();}}
  catch(error){if(!alive())return;if(error.status>=400&&error.status<500&&error.status!==408){envelope=null;conflict=error.status===409;}errorView(error);}
  finally{busy=false;if(alive()){if(session){session.pending=null;session.notify();}controls();}}
 }
 function confirmDelete(){if(busy||envelope||conflict||deletePrompt||!detail?.deletable)return;deletePrompt=true;root.insertAdjacentHTML('beforeend','<section class="record-delete-confirm" role="alertdialog" aria-label="Delete record"><p>Delete this record?</p><div><button type="button" data-delete-cancel>Cancel</button><button type="button" data-delete-confirm>Delete</button></div></section>');root.querySelector('[data-delete-cancel]').focus();}
 function savedActions(){if(!record)return;if(!detail.editable)status().textContent=detail.reason;if(detail.deletable)root.insertAdjacentHTML('beforeend','<button type="button" class="record-delete" data-record-delete>Delete</button>');}
 function correction(changes){return {collection:collections[kind],id:record.id,recordRevision:detail.recordRevision,changes};}
 try{
  [options,detail]=await Promise.all([request('/api/records/options?'+new URLSearchParams({date:record?.date??date}),null,abort.signal),record?request('/api/records/item?'+new URLSearchParams({collection:collections[kind],id:record.id}),null,abort.signal):null]);
  if(!alive())return;if(detail)record=detail.record;if(kind==='exercise'){if(record)exerciseEditor();else exerciseBrowser();}else biometricEditor();
 }catch(error){if(alive())errorView(error);}
 function exerciseBrowser(snapshot={node:'root',query:'',parent:null}){
  const body=frame(message('exerciseBrowser.'+snapshot.node),'');returnTo=snapshot.parent?()=>exerciseBrowser(snapshot.parent):null;
  panel=new MobileExerciseBrowser({root:body,dialog:sheet,message:key=>message('exerciseBrowser.'+key),api:()=>request('/api/records/exercise-catalog',null,abort.signal),snapshot,onNavigate:next=>exerciseBrowser(next),onSelect:(activity,choices,titleKey,from)=>exerciseEditor({activity,choices,titleKey,from}),onCustom:from=>exerciseEditor({from})});
 }
 function exerciseEditor({activity,choices,titleKey,from,draft}={}){
  const value=record??draft??{},unit=options.energyUnit,group=record?record.group:value.group??(options.groups.includes(initialGroup)?initialGroup:options.groups.includes('Uncategorized')?'Uncategorized':options.groups[0]);
  const values={id:value.id,date:value.date??date,name:activity?.description??value.name??'',duration:value.duration??15,calories:value.caloriesBurned==null?'':convertEnergy(value.caloriesBurned,'kcal',unit),time:value.time??clock()};
  const markup=mobileExerciseMarkup({value:values,groupOptions:options.groups.map(g=>`<option value="${e(g)}" ${g===group?'selected':''}>${e(g)}</option>`).join(''),unit,limits:{...options.exerciseLimits,maximumEnergy:convertEnergy(options.exerciseLimits.maximumKcal,'kcal',unit)},message,edit:Boolean(record)});
  frame(record?'Edit Exercise':activity?message('exerciseBrowser.'+(titleKey??'root')):'Custom Exercise',markup);returnTo=from?()=>exerciseBrowser(from):null;
  if(activity)panel=new CatalogExerciseEditor({dialog:sheet,message,activity,choices,titleKey,api:async()=>options.exerciseWeight,onCustom:next=>exerciseEditor({from,draft:next})});else panel=new MobileExerciseEditor({dialog:sheet,message});
  const form=root.querySelector('form');
  if(record){const dateField=document.createElement('label');dateField.className='me-row';dateField.innerHTML=`<strong>Date</strong><input type="date" value="${e(record.date)}" data-record-date required>`;form.querySelector('.me-card').append(dateField);dateField.querySelector('input').oninput=event=>form.elements.date.value=event.target.value;
   if(record.exerciseBasis)form.insertAdjacentHTML('beforeend',`<details class="record-source"><summary>Original estimate</summary><p>${e(record.exerciseBasis.minutes)} min · ${e(record.exerciseBasis.weightKg)} kg · ${e(record.exerciseBasis.estimatedKcal)} kcal</p><a href="${e(record.exerciseBasis.source)}" target="_blank" rel="noreferrer">${e(record.exerciseBasis.edition)}</a></details>`);
  }
  form.addEventListener('submit',event=>{event.preventDefault();if(busy||envelope||conflict)return;const f=form.elements,common={date:f.date.value,time:f.time.value,group:f.group.value,duration:Number(f.duration.value)};if(activity)void save('exercise.catalog.add',{...common,code:f.code.value,weightKg:Number(f.weightKg.value),useEstimate:f.useEstimate.value==='true',...(f.useEstimate.value==='true'?{}:{calories:convertEnergy(Number(f.calories.value),unit,'kcal')})});else{const changes={...common,name:f.name.value,calories:convertEnergy(Number(f.calories.value),unit,'kcal')};void save(record?'record.correct':'exercise.add',record?correction(changes):changes);}},{signal:abort.signal});
  savedActions();controls();
 }
 function biometricEditor(){
  const body=frame(record?'Edit Biometric':'Add Biometric',''),listeners=new Set(),selected=record?detail.biometricChoice:initialSelection;
  const same=(a,b)=>a&&b&&Object.keys(a).length===Object.keys(b).length&&Object.entries(a).every(([key,value])=>b[key]===value);
  const metric=selected?options.biometrics.metrics.find(row=>same(row.selection,selected.selection)):null;
  if(selected&&(!metric||selected.unit!==null&&!metric.units.includes(selected.unit)))throw Error('This measurement is no longer available.');
  const draft=blankBiometricDraft(record?.date??date,record?.time??clock(),record?record.group:options.groups.includes(initialGroup)?initialGroup:null);
  if(record){if(!metric)throw Error('This measurement is no longer available.');draft.metric=metric.key;draft.unit=record.unit;draft.value=String(record.value);draft.name=record.type;
   if(metric.selection.kind==='catalog'&&metric.selection.id==='weight'&&record.unit==='st'){draft.value=String(Math.floor(record.value));draft.stonePounds=String(Number(((record.value-Math.floor(record.value))*14).toFixed(12)));}
   if(metric.selection.kind==='catalog'&&metric.selection.id==='sleep'&&record.unit==='h'){draft.durationHours=String(Math.floor(record.value));draft.durationMinutes=String(Math.round((record.value-Math.floor(record.value))*60));}
  }
  const original=structuredClone(draft);
  session={language:'en',editing:Boolean(record),draft,library:options.biometrics,pending:null,error:'',unknown:false,imported:false,readOnly:Boolean(record&&!detail.editable),message:(key,values)=>message('measurementLog.'+key,values),subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},notify(){for(const fn of listeners)fn();},invalidate(){if(!envelope){this.error='';this.notify();}},stopWaiting(){},load:async()=>{},reconcile:()=>save(),async save(input){if(record){const unchanged=['value','stonePounds','durationHours','durationMinutes','unit'].every(key=>this.draft[key]===original[key]),changes={date:input.date,time:input.time,group:input.group,type:metric.selection.kind==='metric'?this.draft.name:record.type,unit:input.unit,value:unchanged?record.value:input.values.value};await save('record.correct',correction(changes));}else await save('biometric.log',input);}};
  panel=new MobileBiometricPanel({root:body,session,date,time:draft.time,group:draft.group,initialEntry:record?null:selected});

  savedActions();controls();
 }
 return {dispose,back};
}
