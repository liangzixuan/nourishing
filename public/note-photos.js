import {recordEditorData,saveRecordCommand} from './record-local.js';
import {queueBackgroundWrite} from './background-writes.js';
import {privateImageAttributes} from './private-images.js';
import {readDeviceCache} from './device-cache.js';
import {t} from './app-language.js';
import {coreText} from './core-cloud-messages.js';
import {escape as e} from './html.js';

export const notePhotoUrl=record=>record?.localPhoto??(/^[a-f0-9]{64}$/.test(record?.imageId??'')?'/api/media?'+new URLSearchParams({namespace:'note_photos',id:record.imageId}):null);
export const notePhotoThumbnail=record=>notePhotoUrl(record)?`<img class="note-photo-thumbnail" loading="lazy" ${privateImageAttributes(notePhotoUrl(record))} alt="${e(t('notes.photoTitle'))}" referrerpolicy="no-referrer">`:'';
const fileData=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error(t('notes.error.read')));reader.readAsDataURL(file);});

/** One mounted note owns its draft, selected image until Save. */
export async function mountNoteEditor({record,date,initialGroup,show,close,header,content,onChange}){
 const title=coreText(record?'note.editTitle':'add.note');
 show(header(title)+`<p class="empty">${e(coreText('loading'))}</p>`);
 const loading=content.querySelector('.empty');let options,detail,ticket;
 try{
  ticket=(await readDeviceCache('/api/diary')).ticket;
  [options,detail]=await recordEditorData(record?.date??date,'notes',record?.id);
  if(!loading.isConnected)return;if(detail)record=detail.record;
 }catch(error){if(loading.isConnected)loading.textContent=error.message;return;}
 const editable=!record||detail.editable,limit=Math.max(1024,record?.text?.length??0),group=record?record.group??'':options.groups.includes(initialGroup)?initialGroup:'',time=record?.time??new Date().toTimeString().slice(0,5);
 let mode='keep',photo=null,pending=null,busy=false,serial=0,lastTime=time;
 const camera='<svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/></svg>';
 const countLabel=used=>coreText('note.charactersUsed',{used,limit});
 const used=record?.text?.length??0;
 show(header(title)+`<form class="entry-form note-editor">
  <fieldset class="record-fields" ${editable?'':'disabled'}>
   <section class="note-text-card">
    <textarea name="text" aria-label="${e(t('notes.note'))}" placeholder="${e(t('notes.mobilePlaceholder'))}" required maxlength="${limit}">${e(record?.text??'')}</textarea>
    <div class="note-text-actions">
     <output data-note-count aria-label="${e(countLabel(used))}">${used}/${limit}</output>
     <button type="button" class="icon-button" data-note-choose aria-controls="note-photo-choices" aria-label="${e(t('notes.attachPhoto'))}" aria-expanded="false">${camera}</button>
    </div>
    <div class="note-photo-choices" id="note-photo-choices" hidden>
     <button type="button" data-note-source="camera">${e(t('mobilePhoto.capture'))}</button>
     <button type="button" data-note-source="gallery">${e(t('mobilePhoto.gallery'))}</button>
    </div>
    <input hidden type="file" data-note-camera accept="image/jpeg,image/png,image/webp" capture="environment">
    <input hidden type="file" data-note-gallery accept="image/jpeg,image/png,image/webp">
    <div class="note-photo-preview"></div>
   </section>
   <div class="field-row">
    <span>${e(t('notes.timestamp'))}</span>
    <input type="time" name="time" aria-label="${e(t('notes.time'))}" value="${e(time)}" ${time?'':'disabled'}>
    <input type="checkbox" class="note-time-toggle" aria-label="${e(coreText('note.includeTime'))}" ${time?'checked':''}>
   </div>
   <label class="field-row"><span>${e(t('notes.groupLabel'))}</span><select name="group">
    <option value="">${e(t('notes.uncategorized'))}</option>
    ${options.groups.map(value=>`<option value="${e(value)}" ${value===group?'selected':''}>${e(value)}</option>`).join('')}
   </select></label>
  </fieldset>
  ${editable?'':`<p class="record-disabled">${e(detail.reason)}</p>`}
  <p class="sheet-message" role="status"></p>
  <footer class="entry-actions">${editable?`<button type="submit" class="primary">${e(t('notes.mobileSave'))}</button>`:''}</footer>
 </form>`);
 const form=content.querySelector('form'),preview=form.querySelector('.note-photo-preview'),status=form.querySelector('[role=status]'),save=form.querySelector('[type=submit]'),choices=form.querySelector('.note-photo-choices'),choose=form.querySelector('[data-note-choose]');
 const abort=new AbortController(),observer=new MutationObserver(()=>{if(!form.isConnected){serial++;abort.abort();observer.disconnect();}});observer.observe(content,{childList:true});
 const alive=()=>form.isConnected;
 function closeChoices(){choices.hidden=true;choose.setAttribute('aria-expanded','false');}
 const sheet=form.closest('dialog');
 function backFromChoices(event){
  if(choices.hidden||!alive()||(event.type==='cancel'&&event.target!==sheet))return;
  event.preventDefault();
  event.stopImmediatePropagation();
  closeChoices();
  choose.focus({preventScroll:true});
 }
 sheet.addEventListener('cancel',backFromChoices,{capture:true,signal:abort.signal});
 window.addEventListener('nourishing-back',backFromChoices,{signal:abort.signal});
 document.addEventListener('click',event=>{if(!choices.contains(event.target)&&!choose.contains(event.target))closeChoices();},{signal:abort.signal});
 function controls(){
  const blocked=busy||!!pending||!editable;
  form.querySelectorAll('fieldset input,fieldset select,fieldset textarea,fieldset button').forEach(node=>node.disabled=blocked);
  form.elements.time.disabled=blocked||!form.querySelector('.note-time-toggle').checked;
  if(save){save.disabled=busy||!form.elements.text.value.trim();save.textContent=pending?t('foodLog.saving'):t('notes.mobileSave');}
 }
 function renderPhoto(){
  const src=mode==='replace'?photo:mode==='keep'?notePhotoUrl(record):null;
  const undo=mode!=='keep'&&notePhotoUrl(record)?`<button type="button" data-note-undo>${e(t('notes.keepPhoto'))}</button>`:'';
  preview.innerHTML=src?`<button type="button" class="note-photo-open" aria-label="${e(coreText('note.enlargePhoto'))}"><img ${privateImageAttributes(src)} alt="${e(t('notes.photoTitle'))}"></button><div class="note-photo-actions"><button type="button" data-note-remove>${e(t('notes.removePhoto'))}</button>${undo}</div>`:undo;
  preview.querySelector('.note-photo-open')?.addEventListener('click',event=>{const expanded=preview.classList.toggle('expanded');event.currentTarget.setAttribute('aria-label',coreText(expanded?'note.reducePhoto':'note.enlargePhoto'));});
  preview.querySelector('[data-note-remove]')?.addEventListener('click',()=>{mode='remove';photo=null;renderPhoto();});
  preview.querySelector('[data-note-undo]')?.addEventListener('click',()=>{mode='keep';photo=null;renderPhoto();});
  controls();
 }
 choose.onclick=()=>{choices.hidden=!choices.hidden;choose.setAttribute('aria-expanded',String(!choices.hidden));if(!choices.hidden)choices.querySelector('button').focus({preventScroll:true});};
 choices.querySelectorAll('button').forEach(button=>button.onclick=()=>{closeChoices();form.querySelector(button.dataset.noteSource==='camera'?'[data-note-camera]':'[data-note-gallery]').click();});
 form.elements.text.oninput=()=>{const count=form.querySelector('[data-note-count]'),length=form.elements.text.value.length;count.textContent=length+'/'+limit;count.setAttribute('aria-label',countLabel(length));controls();};
 form.querySelector('.note-time-toggle').onchange=event=>{if(event.target.checked)form.elements.time.value=lastTime||new Date().toTimeString().slice(0,5);else{lastTime=form.elements.time.value;form.elements.time.value='';}controls();};
 form.querySelectorAll('input[type=file]').forEach(input=>input.onchange=async()=>{
  const file=input.files?.[0];input.value='';if(!file||busy||pending)return;
  if(file.size>8*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type)){status.textContent=t('notes.error.file');return;}
  const version=++serial;busy=true;controls();status.textContent=coreText('note.openingPhoto');
  try{const dataUrl=await fileData(file);if(!alive()||serial!==version)return;const image=new Image();image.src=dataUrl;await image.decode();if(!alive()||serial!==version)return;photo=dataUrl;mode='replace';status.textContent='';renderPhoto();}
  catch(error){if(alive()&&error.name!=='AbortError')status.textContent=error.message;}
  finally{if(alive()&&serial===version){busy=false;controls();}}
 });
 form.onsubmit=async event=>{
  event.preventDefault();if(busy||!editable)return;
  pending??={requestId:crypto.randomUUID(),revision:detail?.revision??options.revision,id:record?.id??null,fields:{date:record?.date??date,time:form.elements.time.value,text:form.elements.text.value,group:form.elements.group.value||null},photo:{mode}};
  busy=true;controls();status.textContent='';
  try{
   if(mode==='keep'&&!notePhotoUrl(record)){
    await saveRecordCommand(pending.revision,record?'record.correct':'note.add',record?{collection:'notes',id:record.id,changes:pending.fields}:pending.fields,{ticket});
   }else{
    if(!ticket)throw Error(coreText('note.storageUnavailable'));
    await queueBackgroundWrite('/api/note-photos/save',pending,mode==='replace'?{noteSource:photo}:{},ticket);
   }
   pending=null;if(alive())close();void Promise.resolve(onChange()).catch(()=>{});}
  catch(error){if(alive()){status.textContent=error.message;if(error.status>=400&&error.status<500){pending=null;}}}
  finally{if(alive()){busy=false;pending=null;controls();}}
 };
 renderPhoto();
 if(!record)form.elements.text.focus();
}
