import {request,command} from './diary-api.js';
import {escape as e} from './html.js';
import {mountNoteEditor} from './note-photos.js';
const names={exercise:'Exercise',biometric:'Biometric',note:'Note'};
const collections={exercise:'entries',biometric:'biometrics',note:'notes'};
const input=(label,name,value,attributes='')=>`<label class="field-row"><span>${e(label)}</span><input aria-label="${e(label)}" name="${name}" value="${e(value??'')}" ${attributes}></label>`;
const selectOption=(value,label,current)=>`<option value="${e(value)}" ${value===current?'selected':''}>${e(label)}</option>`;
const format=value=>Number.isFinite(value)?value.toLocaleString(undefined,{maximumFractionDigits:1}):'—';

export function mountRecordMenu({show,header,content,onPick}){
 show(header('Add to Diary')+'<div class="record-menu">'+[['food','Food'],['photo','Photo Log'],['barcode','Scan Barcode'],['exercise','Exercise'],['biometric','Biometric'],['note','Note']].map(([kind,label])=>`<button type="button" data-record-kind="${kind}">${label}</button>`).join('')+'</div>');
 content.querySelectorAll('[data-record-kind]').forEach(button=>button.onclick=()=>onPick(button.dataset.recordKind));
}

export async function mountRecordEditor({kind,record,date,show,close,header,content,onChange}){
 if(!Object.hasOwn(names,kind))return;
 if(kind==='note')return mountNoteEditor({record,date,show,close,header,content,onChange});
 show(header((record?'Edit ':'Add ')+names[kind])+'<p class="empty">Loading…</p>');
 const loading=content.querySelector('.empty');let options,detail;
 try{
  [options,detail]=await Promise.all([request('/api/records/options?'+new URLSearchParams({date:record?.date??date})),record?request('/api/records/item?'+new URLSearchParams({collection:collections[kind],id:record.id})):null]);
  if(!loading.isConnected)return;
  if(detail)record=detail.record;
  if(kind==='exercise'&&!record)exercisePicker();else editor();
 }catch(error){if(loading.isConnected)loading.textContent=error.message;}
 function diaryFields(){const group=record?.group??(options.groups.includes('Uncategorized')?'Uncategorized':kind==='exercise'?options.groups[0]:null);return input('Date','date',record?.date??date,'type="date" required')+input('Time','time',record?.time??new Date().toTimeString().slice(0,5),'type="time"')+`<label class="field-row"><span>Group</span><select aria-label="Group" name="group">${kind==='exercise'?'':selectOption('','Uncategorized',group??'')}${options.groups.map(value=>selectOption(value,value,group)).join('')}</select></label>`;}
 function fields(form){return {date:form.elements.date.value,time:form.elements.time.value,group:form.elements.group.value||null};}
 function actions(){return `<p class="sheet-message" role="status"></p><footer class="entry-actions">${record&&detail.deletable?'<button type="button" class="danger" data-delete>Delete</button>':''}${!record||detail.editable?'<button type="submit" class="primary">'+(record?'Save changes':'Add to diary')+'</button>':''}</footer>`;}
 function wireSave(form,payload,type){
  form.onsubmit=async event=>{event.preventDefault();await save(type,()=>payload(),form);};
  const remove=form.querySelector('[data-delete]');if(remove)remove.onclick=()=>{remove.textContent='Delete record';remove.onclick=()=>save(kind==='exercise'?'entry.delete':kind+'.delete',()=>({id:record.id}),form);};
 }
 async function save(type,payload,form){
  const status=form.querySelector('[role=status]');form.querySelectorAll('button').forEach(b=>b.disabled=true);status.textContent='';
  try{await command(detail?.revision??options.revision,type,payload());await onChange();if(form.isConnected)close();}
  catch(error){if(form.isConnected){status.textContent=error.message;if(error.status===409){const reload=document.createElement('button');reload.type='button';reload.textContent='Reload record';reload.onclick=()=>mountRecordEditor({kind,record,date,show,close,header,content,onChange});status.append(reload);}}}
  finally{form.querySelectorAll('button').forEach(b=>b.disabled=false);}
 }
 function correction(changes){return {collection:collections[kind],id:record.id,recordRevision:detail.recordRevision,changes};}
 function editor(activity=null){
  let specific='';
  if(kind==='exercise')specific=input('Exercise','name',record?.name??activity?.description??'','required maxlength="300"')+input('Minutes','duration',record?.duration??30,'type="number" min="0.01" max="1440" step="any" required')+(activity?'<label class="field-row record-group"><span>Use estimated calories</span><input type="checkbox" name="useEstimate" checked></label>':'')+input('Calories (kcal)','calories',record?.caloriesBurned??'',`type="number" min="0" max="50000" step="any" required ${activity?'disabled':''}`)+(activity?'<div class="record-estimate" aria-live="polite">Calculating…</div>':'');
  if(kind==='biometric')specific=record?input('Biometric','type',record.type,'required maxlength="100"')+input('Value','value',record.value,'type="number" step="any" required')+input('Unit','unit',record.unit,'required maxlength="30"'):`<div class="record-selection"><select name="metric" aria-label="Biometric">${options.biometrics.metrics.map(row=>selectOption(row.key,row.label,'catalog:weight')).join('')}<option value="__new__">New custom biometric…</option></select></div><div class="record-values"></div>`;
  const blocked=record&&!detail.editable;
  show(header((record?'Edit ':'Add ')+names[kind])+`<form class="entry-form"><fieldset class="record-fields" ${blocked?'disabled':''}>${specific}${diaryFields()}</fieldset>${blocked?`<p class="record-disabled">${e(detail.reason)}</p>`:''}${record?.exerciseBasis?`<details class="record-source"><summary>Original estimate</summary><p>${format(record.exerciseBasis.minutes)} min · ${format(record.exerciseBasis.weightKg)} kg · ${format(record.exerciseBasis.estimatedKcal)} kcal</p><a href="${e(record.exerciseBasis.source)}" target="_blank" rel="noreferrer">${e(record.exerciseBasis.edition)}</a></details>`:''}${actions()}</form>`);
  const form=content.querySelector('form');
  let metric;
  if(kind==='biometric'&&!record){
   const updateMetric=()=>{metric=options.biometrics.metrics.find(row=>row.key===form.elements.metric.value);const newCustom=!metric,unit=metric?.units[0]??'',multiple=metric?.fields.length===2;
    form.querySelector('.record-values').innerHTML=(newCustom?input('Name','customName','','required maxlength="100"'):'')+(metric?.fields??[{key:'value',label:'Value'}]).map(field=>input(field.label,field.key,'','type="number" step="any" required')).join('')+input('Unit','unit',unit,`required maxlength="30" ${multiple||metric?.selection.kind==='metric'?'readonly':''} list="record-unit-options"`)+`<datalist id="record-unit-options">${(metric?.units??[]).map(unit=>`<option value="${e(unit)}"></option>`).join('')}</datalist>`;
   };form.elements.metric.onchange=updateMetric;updateMetric();
  }
  if(kind==='exercise'&&activity){
   form.elements.name.readOnly=true;let calculation=null,version=0,timer;
   const recalculate=()=>{clearTimeout(timer);const id=++version;calculation=null;const preview=form.querySelector('.record-estimate'),button=form.querySelector('[type=submit]');preview.textContent='Calculating…';button.disabled=true;
    timer=setTimeout(async()=>{if(!form.isConnected)return;try{const result=await request('/api/records/exercise-estimate?'+new URLSearchParams({date:form.elements.date.value,code:activity.code,minutes:form.elements.duration.value}));if(id!==version||!form.isConnected)return;calculation=result;if(form.elements.useEstimate.checked)form.elements.calories.value=Number(result.netKcal.toFixed(1));preview.innerHTML=`<strong>${format(result.netKcal)} kcal</strong><small>${format(result.weightKg)} kg · Active calories</small>`;button.disabled=!result.recordable;}catch(error){if(id===version&&form.isConnected)preview.textContent=error.message;}},180);
   };
   form.elements.duration.oninput=recalculate;form.elements.date.onchange=recalculate;form.elements.useEstimate.onchange=()=>{form.elements.calories.disabled=form.elements.useEstimate.checked;if(calculation&&form.elements.useEstimate.checked)form.elements.calories.value=Number(calculation.netKcal.toFixed(1));};recalculate();
   const manual=document.createElement('button');manual.type='button';manual.className='more-results';manual.textContent='Enter exercise manually';manual.onclick=()=>editor();form.querySelector('.record-fields').append(manual);
   wireSave(form,()=>{if(!calculation)throw Error('Wait for the exercise estimate.');return {...fields(form),code:activity.code,duration:Number(form.elements.duration.value),weightKg:calculation.weightKg,useEstimate:form.elements.useEstimate.checked,...(!form.elements.useEstimate.checked?{calories:Number(form.elements.calories.value)}:{})};},'exercise.catalog.add');return;
  }
  wireSave(form,()=>{
   if(kind==='exercise'){const changes={...fields(form),name:form.elements.name.value,duration:Number(form.elements.duration.value),calories:Number(form.elements.calories.value)};return record?correction(changes):changes;}
   if(record)return correction({...fields(form),type:form.elements.type.value,value:Number(form.elements.value.value),unit:form.elements.unit.value});
   return {...fields(form),selection:metric?.selection??{kind:'new-custom',name:form.elements.customName.value},unit:form.elements.unit.value,values:Object.fromEntries((metric?.fields??[{key:'value'}]).map(field=>[field.key,Number(form.elements[field.key].value)]))};
  },record?'record.correct':kind==='biometric'?'biometric.log':kind+'.add');
 }
 function exercisePicker(){
  show(header('Add Exercise')+'<div class="record-picker-tabs"><button type="button" aria-current="page">Search exercises</button><button type="button" data-manual>Custom exercise</button></div><div class="record-search"><input type="search" aria-label="Search exercises" placeholder="Search exercises"></div><ul class="search-results"></ul>');
  const search=content.querySelector('input'),results=content.querySelector('.search-results');let serial=0,timer;
  content.querySelector('[data-manual]').onclick=()=>editor();
  async function find(offset=0){const id=++serial;try{const result=await request('/api/records/exercises?'+new URLSearchParams({q:search.value,offset}));if(id!==serial||!results.isConnected)return;const fragment=document.createDocumentFragment();for(const activity of result.items){const li=document.createElement('li'),button=document.createElement('button');button.type='button';button.textContent=activity.description;button.onclick=()=>editor(activity);li.append(button);fragment.append(li);}if(offset===0)results.replaceChildren();results.querySelector('[data-next]')?.remove();results.append(fragment);if(result.nextOffset!==null){const li=document.createElement('li');li.dataset.next='';const more=document.createElement('button');more.type='button';more.textContent='More exercises';more.onclick=()=>find(result.nextOffset);li.append(more);results.append(li);}if(!result.total)results.innerHTML='<li class="empty">No exercises found.</li>';}catch(error){if(id===serial&&results.isConnected)results.innerHTML=`<li class="empty">${e(error.message)}</li>`;}}
  search.oninput=()=>{clearTimeout(timer);serial++;timer=setTimeout(()=>find(),180);};find();
 }
}
