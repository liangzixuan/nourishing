import {request,command} from './diary-api.js';
import {escape as e} from './html.js';

export const notePhotoUrl=record=>/^[a-f0-9]{64}$/.test(record?.imageId??'')?'/api/media?'+new URLSearchParams({namespace:'note_photos',id:record.imageId}):null;
export const notePhotoThumbnail=record=>notePhotoUrl(record)?`<img class="note-photo-thumbnail" loading="lazy" src="${e(notePhotoUrl(record))}" alt="Note photo" referrerpolicy="no-referrer">`:'';
const fileData=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not open this photo.'));reader.readAsDataURL(file);});

/** One mounted note owns its draft, normalized photo and exact retry packet. */
export async function mountNoteEditor({record,date,show,close,header,content,onChange}){
 show(header(record?'Edit Note':'Add Note')+'<p class="empty">Loading…</p>');
 const loading=content.querySelector('.empty');let options,detail;
 try{
  [options,detail]=await Promise.all([request('/api/records/options?'+new URLSearchParams({date:record?.date??date})),record?request('/api/records/item?'+new URLSearchParams({collection:'notes',id:record.id})):null]);
  if(!loading.isConnected)return;if(detail)record=detail.record;
 }catch(error){if(loading.isConnected)loading.textContent=error.message;return;}
 const editable=!record||detail.editable,limit=Math.max(1024,record?.text?.length??0),group=record?.group??'',time=record?.time??new Date().toTimeString().slice(0,5);
 let mode='keep',photo=null,pending=null,busy=false,conflict=false,serial=0,lastTime=time;
 const camera='<svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/></svg>';
 show(header(record?'Edit Note':'Add Note')+`<form class="entry-form note-editor"><fieldset class="record-fields" ${editable?'':'disabled'}><section class="note-text-card"><textarea name="text" aria-label="Note" placeholder="Write a note…" required maxlength="${limit}">${e(record?.text??'')}</textarea><div class="note-text-actions"><output data-note-count>${record?.text?.length??0}/${limit}</output><button type="button" class="icon-button" data-note-choose aria-label="Attach photo" aria-expanded="false">${camera}</button></div><div class="note-photo-choices" hidden><button type="button" data-note-source="camera">Take photo</button><button type="button" data-note-source="gallery">Choose photo</button></div><input hidden type="file" data-note-camera accept="image/jpeg,image/png,image/webp" capture="environment"><input hidden type="file" data-note-gallery accept="image/jpeg,image/png,image/webp"><div class="note-photo-preview"></div></section><label class="field-row"><span>Date</span><input type="date" name="date" aria-label="Date" required value="${e(record?.date??date)}"></label><div class="field-row"><span>Time</span><input type="time" name="time" aria-label="Time" value="${e(time)}" ${time?'':'disabled'}><input type="checkbox" class="note-time-toggle" aria-label="Include time" ${time?'checked':''}></div><label class="field-row"><span>Group</span><select name="group" aria-label="Group"><option value="">Uncategorized</option>${options.groups.map(value=>`<option value="${e(value)}" ${value===group?'selected':''}>${e(value)}</option>`).join('')}</select></label></fieldset>${editable?'':`<p class="record-disabled">${e(detail.reason)}</p>`}<p class="sheet-message" role="status"></p><footer class="entry-actions">${record&&detail.deletable?'<button type="button" class="danger" data-note-delete>Delete</button>':''}${editable?'<button type="submit" class="primary">Save</button>':''}</footer></form>`);
 const form=content.querySelector('form'),preview=form.querySelector('.note-photo-preview'),status=form.querySelector('[role=status]'),save=form.querySelector('[type=submit]'),choices=form.querySelector('.note-photo-choices'),choose=form.querySelector('[data-note-choose]');
 const abort=new AbortController(),observer=new MutationObserver(()=>{if(!form.isConnected){serial++;abort.abort();observer.disconnect();}});observer.observe(content,{childList:true});
 const alive=()=>form.isConnected;
 function closeChoices(){choices.hidden=true;choose.setAttribute('aria-expanded','false');}
 document.addEventListener('click',event=>{if(!choices.contains(event.target)&&!choose.contains(event.target))closeChoices();},{signal:abort.signal});
 function controls(){
  const blocked=busy||!!pending||conflict||!editable;
  form.querySelectorAll('fieldset input,fieldset select,fieldset textarea,fieldset button').forEach(node=>node.disabled=blocked);
  form.elements.time.disabled=blocked||!form.querySelector('.note-time-toggle').checked;
  if(save){save.disabled=busy||conflict;save.textContent=pending?'Try again':busy?'Saving…':'Save';}
  const remove=form.querySelector('[data-note-delete]');if(remove)remove.disabled=busy||!!pending||conflict;
 }
 function renderPhoto(){
  const src=mode==='replace'?photo?.dataUrl:mode==='keep'?notePhotoUrl(record):null;
  preview.innerHTML=src?`<button type="button" class="note-photo-open" aria-label="Enlarge note photo"><img src="${e(src)}" alt="Note photo"></button><div class="note-photo-actions"><button type="button" data-note-remove>Remove photo</button>${mode!=='keep'&&notePhotoUrl(record)?'<button type="button" data-note-undo>Keep original photo</button>':''}</div>`:mode!=='keep'&&notePhotoUrl(record)?'<button type="button" data-note-undo>Keep original photo</button>':'';
  preview.querySelector('.note-photo-open')?.addEventListener('click',event=>{const expanded=preview.classList.toggle('expanded');event.currentTarget.setAttribute('aria-label',expanded?'Reduce note photo':'Enlarge note photo');});
  preview.querySelector('[data-note-remove]')?.addEventListener('click',()=>{mode='remove';photo=null;renderPhoto();});
  preview.querySelector('[data-note-undo]')?.addEventListener('click',()=>{mode='keep';photo=null;renderPhoto();});
  controls();
 }
 choose.onclick=()=>{choices.hidden=!choices.hidden;choose.setAttribute('aria-expanded',String(!choices.hidden));};
 choices.querySelectorAll('button').forEach(button=>button.onclick=()=>{closeChoices();form.querySelector(button.dataset.noteSource==='camera'?'[data-note-camera]':'[data-note-gallery]').click();});
 form.elements.text.oninput=()=>{form.querySelector('[data-note-count]').textContent=form.elements.text.value.length+'/'+limit;};
 form.querySelector('.note-time-toggle').onchange=event=>{if(event.target.checked)form.elements.time.value=lastTime||new Date().toTimeString().slice(0,5);else{lastTime=form.elements.time.value;form.elements.time.value='';}controls();};
 form.querySelectorAll('input[type=file]').forEach(input=>input.onchange=async()=>{
  const file=input.files?.[0];input.value='';if(!file||busy||pending)return;
  if(file.size>8*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type)){status.textContent='Choose a JPEG, PNG or WebP photo under 8 MB.';return;}
  const version=++serial;busy=true;controls();status.textContent='Opening photo…';
  try{const dataUrl=await fileData(file);if(!alive()||serial!==version)return;const ready=await request('/api/note-photos/prepare',{dataUrl},abort.signal);if(!alive()||serial!==version)return;photo=ready.photo;mode='replace';status.textContent='';renderPhoto();}
  catch(error){if(alive()&&error.name!=='AbortError')status.textContent=error.message;}
  finally{if(alive()&&serial===version){busy=false;controls();}}
 });
 form.onsubmit=async event=>{
  event.preventDefault();if(busy||conflict||!editable)return;
  pending??={requestId:crypto.randomUUID(),revision:detail?.revision??options.revision,id:record?.id??null,recordRevision:detail?.recordRevision??null,fields:{date:form.elements.date.value,time:form.elements.time.value,text:form.elements.text.value,group:form.elements.group.value||null},photo:mode==='replace'?{mode,...photo}:{mode}};
  busy=true;controls();status.textContent='';
  try{await request('/api/note-photos/save',pending);pending=null;if(alive())close();await onChange();}
  catch(error){if(alive()){status.textContent=error.message;if(error.status>=400&&error.status<500){pending=null;if(error.status===409){conflict=true;const reload=document.createElement('button');reload.type='button';reload.textContent='Reload note';reload.onclick=()=>mountNoteEditor({record,date,show,close,header,content,onChange});status.append(reload);}}}}
  finally{if(alive()){busy=false;controls();}}
 };
 const remove=form.querySelector('[data-note-delete]');if(remove)remove.onclick=()=>{remove.textContent='Delete note';remove.onclick=async()=>{if(busy)return;busy=true;controls();try{await command(detail.revision,'note.delete',{id:record.id});if(alive())close();await onChange();}catch(error){if(alive())status.textContent=error.message;}finally{if(alive()){busy=false;controls();}}};};
 renderPhoto();
}
