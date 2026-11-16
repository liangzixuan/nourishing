import {snapshotListMarkup} from './snapshot-view.js';
import {request,command} from './diary-api.js';
import {escape as e} from './html.js';
import {bottomNavigation} from './dashboard-source/discover-ui.js';
import {MobileDiaryCalendar} from './snapshot-source/mobile-diary-calendar.js';
import {MobilePhotoCapture} from './snapshot-source/mobile-photo-capture.js';
import {createMessageFormatter} from './dashboard-source/message-formatter.js';
import {snapshotMessages} from './snapshot-source/snapshot-messages.js';
const format=createMessageFormatter(snapshotMessages),m=(key)=>format('en',key);
const icon=name=>`<img src="/snapshot-source/${name}.svg" alt="">`;
const media=row=>'/api/media?'+new URLSearchParams({namespace:'progress_photos',id:row.imageId});
const dateLabel=day=>new Date(day+'T12:00:00Z').toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
const number=value=>Number.isFinite(value)?value.toLocaleString('en',{maximumFractionDigits:1}):'';
const metadata=row=>Object.fromEntries(['date','time','title','note','vitals'].filter(key=>Object.hasOwn(row,key)).map(key=>[key,structuredClone(row[key])]));
const fileData=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not open this photo.'));reader.readAsDataURL(file);});

/** Source snapshot dialogs; the cloud contract owns normalization, private media and writes. */
export function mountSnapshots({root,date,onChange=async()=>{}}){
 let disposed=false,rows=[],revision,readSerial=0,busy=false,pending=null,pendingMutation=null,dialog=null,camera=null,calendar=null,focus=null;
 const abort=new AbortController();
 root.innerHTML='<section class="snapshots ms-root"><p class="snapshot-status" role="status"></p><div class="snapshot-list"></div><input type="file" data-snapshot-gallery accept="image/jpeg,image/png,image/webp" hidden></section>';
 const shell=root.querySelector('.snapshots'),list=shell.querySelector('.snapshot-list'),status=shell.querySelector('[role=status]');
 const alive=()=>!disposed&&shell.isConnected;
 const today=()=>typeof date==='function'?date():date??new Date().toLocaleDateString('en-CA');
 function message(text,retry=false){if(!alive())return;status.textContent=text;if(retry){const button=document.createElement('button');button.type='button';button.textContent=m('retry');button.onclick=()=>pending?upload():pendingMutation?mutate(...pendingMutation):load();status.append(button);}}
 function setBusy(value){busy=value;const add=shell.querySelector('[data-snapshot-add]');if(add)add.disabled=value||pending!==null;list.querySelectorAll('[data-snapshot-options]').forEach(button=>button.disabled=value);}
 function facts(row){const v=row.vitals;return [['Age',v.age],['Weight',v.weight?number(v.weight.value)+' '+(v.weight.unit==='lb'?'lbs':v.weight.unit):null],['BMI',row.bmi===undefined?null:Number(row.bmi).toLocaleString('en',{maximumFractionDigits:0})],['Body fat',v.bodyFat===undefined?null:number(v.bodyFat)+'%']].filter(([,value])=>value!==undefined&&value!==null).map(([label,value])=>`<div><dt>${label}:</dt><dd>${e(value)}</dd></div>`).join('');}
 function render(){list.innerHTML=snapshotListMarkup(rows,{busy:busy||pending!==null,media,dateLabel,facts});list.querySelectorAll('img').forEach(img=>img.onerror=()=>img.replaceWith(Object.assign(document.createElement('span'),{className:'snapshot-missing',textContent:'Photo unavailable'})));}
 async function load(){const serial=++readSerial;message(m('loading'));try{const result=await request('/api/snapshots',undefined,abort.signal);if(!alive()||serial!==readSerial)return;rows=result.items;revision=result.revision;render();message('');}catch(error){if(alive()&&error.name!=='AbortError')message(error.message,true);}}
 function back(){if(calendar){calendar.close();return true;}camera?.dispose();camera=null;if(!dialog)return false;dialog.close();dialog.remove();dialog=null;if(focus?.isConnected)focus.focus({preventScroll:true});return true;}
 function popup(label,markup,kind=''){
  back();focus=document.activeElement;const owner=document.createElement('dialog');owner.className='ms-dialog '+kind;owner.setAttribute('aria-label',label);owner.innerHTML=markup;dialog=owner;
  owner.addEventListener('cancel',event=>{event.preventDefault();back();});
  owner.addEventListener('click',event=>{if(event.target===owner){const r=owner.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)back();}if(event.target.closest('[data-snapshot-back]'))back();
   const navigation=event.target.closest('[data-discover]');if(navigation){const destination=document.querySelector('.app-nav [data-discover="'+navigation.dataset.discover+'"]');back();destination?.click();}
  });document.body.append(owner);owner.showModal();return owner;
 }
 window.addEventListener('nourishing-back',event=>{if(back()){event.preventDefault();event.stopImmediatePropagation();}},{capture:true,signal:abort.signal});
 function clearMutationRetry(){if(pendingMutation){pendingMutation=null;message('');}}
 function openSource(){if(busy||pending)return;clearMutationRetry();const owner=popup(m('source'),`<h2>${e(m('source'))}</h2>${['camera','files'].map(source=>`<button type="button" class="ms-choice" data-snapshot-source="${source}">${icon(source==='camera'?'camera':'folder')}<strong>${e(m(source))}</strong></button>`).join('')}`);
  owner.querySelectorAll('[data-snapshot-source]').forEach(button=>button.onclick=()=>{back();if(button.dataset.snapshotSource==='camera'){const host=popup(m('camera'),'');camera=new MobilePhotoCapture({dialog:host,language:'en',title:m('camera'),showHint:false,fileName:'snapshot.jpg',onClose:back,onFile:file=>{back();void selectFile(file);}});}else shell.querySelector('[data-snapshot-gallery]').click();});
 }
 shell.querySelector('input[type=file]').onchange=event=>{const file=event.target.files?.[0];event.target.value='';if(file)void selectFile(file);};
 async function selectFile(file){
  if(!alive()||busy||pending)return;
  if(file.size>8*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type)){message(m('fileError'));return;}
  setBusy(true);message(m('saving'));
  try{const dataUrl=await fileData(file);if(!alive())return;pending={dataUrl,date:today(),time:new Date().toTimeString().slice(0,5),title:'',note:'',captureMeasurements:true};}
  catch(error){message(error.message);}finally{if(alive())setBusy(false);}
  if(alive()&&pending)await upload();
 }
 async function upload(){
  if(!alive()||!pending||busy)return;setBusy(true);message(m('saving'));const operation=pending;
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
  const view=event.target.closest('[data-snapshot-view]'),options=event.target.closest('[data-snapshot-options]');const row=rows.find(row=>row.id===(view?.dataset.snapshotView??options?.dataset.snapshotOptions));if(!row)return;
  if(view){popup(dateLabel(row.date),`<header><button type="button" data-snapshot-back aria-label="Back">${icon('chevron-left')}</button><h2>${e(dateLabel(row.date))}</h2></header><img data-ms-photo src="${e(media(row))}" alt="${e(row.note||row.title||m('photo'))}" referrerpolicy="no-referrer">`,'ms-viewer');return;}
  if(options&&!busy)openOptions(row);
 };
 function openOptions(row){
  clearMutationRetry();
  const owner=popup(m('options'),[['date','pencil'],['caption','pencil'],['delete','delete']].map(([action,img])=>`<button type="button" class="ms-choice" data-snapshot-action="${action}">${icon(img)}<strong>${e(m(action))}</strong></button>`).join('')+`<nav class="dc-bottom" aria-label="Main navigation">${bottomNavigation('progress','en')}</nav>`,'ms-sheet');
  owner.querySelectorAll('[data-snapshot-action]').forEach(button=>button.onclick=()=>{back();if(button.dataset.snapshotAction==='date')calendar=new MobileDiaryCalendar({state:{settings:{}},date:row.date,language:'en',label:m('date'),showDiaryMarkers:false,onChoose:chosen=>mutate('snapshot.update',{id:row.id,...metadata(row),date:chosen}),onClose:()=>{calendar=null;}});else if(button.dataset.snapshotAction==='caption')caption(row);else remove(row);});
 }
 function caption(row){
  const owner=popup(m('captionTitle'),`<h2>${e(m('captionTitle'))}</h2><textarea data-snapshot-caption maxlength="10000" aria-label="${e(m('captionTitle'))}">${e(row.note)}</textarea><p data-snapshot-error role="alert"></p><footer><button type="button" data-snapshot-back>${e(m('cancel'))}</button><button type="button" data-snapshot-save>${e(m('save'))}</button></footer>`);
  owner.querySelector('textarea').focus();owner.querySelector('[data-snapshot-save]').onclick=()=>mutate('snapshot.update',{id:row.id,...metadata(row),note:owner.querySelector('textarea').value},owner);
 }
 function remove(row){
  const owner=popup(m('deleteTitle'),`<h2>${e(m('deleteTitle'))}</h2><p>${e(m('deleteHint'))}</p><p data-snapshot-error role="alert"></p><footer><button type="button" data-snapshot-back>${e(m('cancel'))}</button><button type="button" class="ms-danger" data-snapshot-delete>${e(m('delete'))}</button></footer>`);
  owner.querySelector('[data-snapshot-delete]').onclick=()=>mutate('snapshot.delete',{id:row.id},owner);
 }
 async function mutate(type,payload,owner=null){
  if(!alive()||busy)return;setBusy(true);const output=owner?.querySelector('[role=alert]');if(output)output.textContent='';owner?.querySelectorAll('button:not([data-snapshot-back]),textarea').forEach(node=>node.disabled=true);
  try{await command(revision,type,payload);pendingMutation=null;if(!alive())return;if(dialog===owner)back();await onChange();if(alive())await load();}
  catch(error){if(!alive())return;const target=output?.isConnected?output:null;if(target)target.textContent=error.message;else{pendingMutation=[type,payload];message(error.message,true);}if(error.status===409){pendingMutation=null;const target=output?.isConnected?output:status,reload=document.createElement('button');reload.type='button';reload.textContent='Refresh snapshots';reload.onclick=()=>{back();void load();};target.append(reload);}}
  finally{if(alive())setBusy(false);owner?.querySelectorAll('button,textarea').forEach(node=>node.disabled=false);}
 }
 void load();
 return {refresh:load,back,dispose(){disposed=true;readSerial++;abort.abort();back();pending=null;pendingMutation=null;root.replaceChildren();}};
}
