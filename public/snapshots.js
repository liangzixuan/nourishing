import {snapshotListMarkup} from './snapshot-view.js';
import {request,command} from './diary-api.js';
import {escape as e} from './html.js';
const media=row=>'/api/media?'+new URLSearchParams({namespace:'progress_photos',id:row.imageId});
const dateLabel=day=>new Date(day+'T12:00:00Z').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
const number=value=>Number.isFinite(value)?value.toLocaleString(undefined,{maximumFractionDigits:1}):'';
const fileData=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not open this photo.'));reader.readAsDataURL(file);});
const field=(label,name,value='',attributes='')=>`<label class="field-row"><span>${e(label)}</span><input name="${name}" aria-label="${e(label)}" value="${e(value)}" ${attributes}></label>`;
const unit=(name,units,current)=>`<select aria-label="${name==='weightUnit'?'Weight unit':'Height unit'}" name="${name}">${units.map(value=>`<option value="${value}" ${value===current?'selected':''}>${value}</option>`).join('')}</select>`;

/** Photos and upload retries stay in this mounted view; no drafts go to browser storage. */
export function mountSnapshots({root,show,close,header,content,date,onChange=async()=>{}}){
 let disposed=false,rows=[],revision,readSerial=0,busy=false,pending=null;const abort=new AbortController();
 root.innerHTML='<section class="snapshots ms-root"><p class="snapshot-status" role="status"></p><div class="snapshot-list"></div><input type="file" data-snapshot-gallery accept="image/jpeg,image/png,image/webp" hidden><input type="file" data-snapshot-camera accept="image/*" capture="environment" hidden></section>';
 const shell=root.querySelector('.snapshots'),list=shell.querySelector('.snapshot-list'),status=shell.querySelector('[role=status]');
 const alive=()=>!disposed&&shell.isConnected;
 const today=()=>typeof date==='function'?date():date??new Date().toLocaleDateString('en-CA');
 const message=(text,retry=false)=>{if(!alive())return;status.textContent=text;if(retry){const button=document.createElement('button');button.type='button';button.textContent='Try again';button.onclick=()=>pending?upload():load();status.append(button);}};
 function setBusy(value){busy=value;const add=shell.querySelector('[data-snapshot-add]');if(add)add.disabled=value||pending!==null;list.querySelectorAll('[data-snapshot-options]').forEach(button=>button.disabled=value);}
 function facts(row){const v=row.vitals;return [['Age',v.age],['Weight',v.weight?number(v.weight.value)+' '+v.weight.unit:null],['BMI',row.bmi===undefined?null:number(row.bmi)],['Body fat',v.bodyFat===undefined?null:number(v.bodyFat)+'%']].filter(([,value])=>value!==undefined&&value!==null).map(([label,value])=>`<div><dt>${label}:</dt><dd>${e(value)}</dd></div>`).join('');}
 function render(){
  list.innerHTML=snapshotListMarkup(rows,{busy:busy||pending!==null,media,dateLabel,facts});
  list.querySelectorAll('img').forEach(img=>img.onerror=()=>{img.replaceWith(Object.assign(document.createElement('span'),{className:'snapshot-missing',textContent:'Photo unavailable'}));});
 }
 async function load(){const serial=++readSerial;message('Loading…');try{const result=await request('/api/snapshots',undefined,abort.signal);if(!alive()||serial!==readSerial)return;rows=result.items;revision=result.revision;render();message('');}catch(error){if(alive()&&error.name!=='AbortError')message(error.message,true);}}
 function choose(camera){shell.querySelector(camera?'[data-snapshot-camera]':'[data-snapshot-gallery]').click();}
 function openSource(){
  if(busy)return;show(header('Add snapshot')+'<div class="snapshot-choices"><button type="button" data-snapshot-source="camera">Take photo</button><button type="button" data-snapshot-source="gallery">Choose photo</button></div>');
  content.querySelectorAll('[data-snapshot-source]').forEach(button=>button.onclick=()=>choose(button.dataset.snapshotSource==='camera'));
 };
 shell.querySelectorAll('input[type=file]').forEach(input=>input.onchange=async()=>{
  const file=input.files?.[0];input.value='';if(!file||busy)return;
  if(file.size>8*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type)){close();message('Choose a JPEG, PNG or WebP photo under 8 MB.');return;}
  setBusy(true);close();message('Saving photo…');
  try{const dataUrl=await fileData(file);if(!alive())return;pending={dataUrl,date:today(),time:new Date().toTimeString().slice(0,5),title:'',note:'',captureMeasurements:true};}
  catch(error){message(error.message);}finally{if(alive())setBusy(false);}
  if(alive()&&pending)await upload();
 });
 async function upload(){
  if(!alive()||!pending||busy)return;setBusy(true);message('Saving photo…');const operation=pending;
  try{
   operation.prepared??=await request('/api/snapshots/prepare',Object.fromEntries(Object.entries(operation).filter(([key])=>!['prepared','body'].includes(key))),abort.signal);
   if(!alive()||pending!==operation)return;
   operation.body??={requestId:crypto.randomUUID(),revision:operation.prepared.revision,photo:operation.prepared.photo,...operation.prepared.metadata};
   await request('/api/snapshots/save',operation.body,abort.signal);pending=null;
   await onChange();if(alive())await load();
  }catch(error){if(alive()&&error.name!=='AbortError'){if(error.status===409){operation.prepared=null;operation.body=null;}message(error.message,true);}}
  finally{if(alive())setBusy(false);}
 }
 list.onclick=event=>{
  if(event.target.closest('[data-snapshot-add]'))return openSource();
  const view=event.target.closest('[data-snapshot-view]'),options=event.target.closest('[data-snapshot-options]');
  const row=rows.find(row=>row.id===(view?.dataset.snapshotView??options?.dataset.snapshotOptions));if(!row)return;
  if(view){show(header(dateLabel(row.date))+`<div class="snapshot-viewer"><img src="${e(media(row))}" alt="${e(row.title||'Progress photo')}">${row.note?`<p>${e(row.note)}</p>`:''}</div>`);return;}
  if(options&&!busy)openOptions(row);
 };
 function openOptions(row){
  show(header('Snapshot')+`<div class="snapshot-choices"><button type="button" data-snapshot-edit>Edit details</button><a href="${e(media(row))}" download="snapshot-${row.date}.jpg">Download photo</a><button type="button" class="danger" data-snapshot-delete>Delete snapshot</button></div>`);
  content.querySelector('[data-snapshot-edit]').onclick=()=>edit(row);
  content.querySelector('[data-snapshot-delete]').onclick=()=>remove(row);
 }
 function edit(row){
  const v=row.vitals;show(header('Edit snapshot')+`<form class="snapshot-form">${field('Date','date',row.date,'type="date" required')}${field('Time','time',row.time??'','type="time"')}${field('Title','title',row.title,'maxlength="200"')}<label class="snapshot-caption">Caption<textarea name="note" aria-label="Caption" maxlength="10000">${e(row.note)}</textarea></label><details class="snapshot-measurements"><summary>Measurements</summary><div class="field-row"><span>Weight</span><div class="snapshot-value"><input aria-label="Weight" name="weight" type="number" min="0.000001" step="any" value="${e(v.weight?.value??'')}">${unit('weightUnit',['kg','lb'],v.weight?.unit??'kg')}</div></div><div class="field-row"><span>Height</span><div class="snapshot-value"><input aria-label="Height" name="height" type="number" min="0.000001" step="any" value="${e(v.height?.value??'')}">${unit('heightUnit',['cm','in'],v.height?.unit??'cm')}</div></div>${field('Body fat (%)','bodyFat',v.bodyFat??'','type="number" min="0" max="100" step="any"')}${field('Age','age',v.age??'','type="number" min="0" max="150" step="1"')}</details><p class="sheet-message" role="status"></p><footer class="entry-actions"><button type="submit" class="primary">Save changes</button></footer></form>`);
  const form=content.querySelector('form');form.onsubmit=async event=>{
   event.preventDefault();const values=new FormData(form),vitals={};
   for(const key of ['weight','height'])if(values.get(key)!=='')vitals[key]={value:Number(values.get(key)),unit:values.get(key+'Unit')};
   for(const key of ['bodyFat','age'])if(values.get(key)!=='')vitals[key]=Number(values.get(key));
   const payload={id:row.id,date:values.get('date'),title:values.get('title'),note:values.get('note'),vitals,...(values.get('time')?{time:values.get('time')}:{})};
   await mutate('snapshot.update',payload,form);
  };
 }
 function remove(row){
  show(header('Delete snapshot?')+'<form class="snapshot-form"><p class="snapshot-delete-note">Remove this photo from your timeline? Stored copies may remain until cleanup.</p><p class="sheet-message" role="status"></p><footer class="entry-actions"><button type="button" class="primary" data-keep>Keep photo</button><button type="submit" class="danger">Delete snapshot</button></footer></form>');
  const form=content.querySelector('form');form.querySelector('[data-keep]').onclick=close;form.onsubmit=event=>{event.preventDefault();void mutate('snapshot.delete',{id:row.id},form);};
 }
 async function mutate(type,payload,form){
  form.querySelectorAll('button').forEach(button=>button.disabled=true);const output=form.querySelector('[role=status]');output.textContent='';
  try{await command(revision,type,payload);if(form.isConnected)close();await onChange();if(alive())await load();}
  catch(error){if(form.isConnected){output.textContent=error.message;if(error.status===409){const reload=document.createElement('button');reload.type='button';reload.textContent='Refresh snapshots';reload.onclick=()=>{close();void load();};output.append(reload);}}}
  finally{form.querySelectorAll('button').forEach(button=>button.disabled=false);}
 }
 void load();
 return {refresh:load,dispose(){disposed=true;readSerial++;abort.abort();pending=null;root.replaceChildren();}};
}
