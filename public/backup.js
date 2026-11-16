import {accountMessage as m} from './account-cloud-messages.js';
import {uiLanguage} from './app-language.js';
import {request} from './diary-api.js';
import {escape as e} from './html.js';
const maxFileBytes=1024*1024*1024;
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const hex=buffer=>[...new Uint8Array(buffer)].map(value=>value.toString(16).padStart(2,'0')).join('');
const hash=async value=>hex(await crypto.subtle.digest('SHA-256',value));
const dataUrl=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error(m("accountCloud.backupCouldnotreadthisphoto")));reader.readAsDataURL(blob);});
const keys=['entries','biometrics','notes','foods','recipes','meals','progressSnapshots'];
const labels=()=>({entries:m("accountCloud.backupDiaryfoodsandexercise"),biometrics:m("discover.streak.metric"),notes:m("mobileCompositeEditor.notes"),foods:m("mobileFoods.title"),recipes:m("libraryView.tab.recipes"),meals:m("libraryView.tab.meals"),progressSnapshots:m("discover.nav.snapshots")});

/** One verified export path for both account deletion and workspace backup. */
export async function downloadBackup({signal,onProgress=()=>{},isCurrent=()=>true,requestJson=request}={}){
   const exported=await requestJson('/api/backup/export',undefined,signal),manifest=exported.manifest,images=[];
   const {digest:expected,...body}=manifest;if(await hash(new TextEncoder().encode(JSON.stringify(canonical(body))))!==expected)throw Error(m("accountCloud.backupBackupverificationfailedTryagain"));
   for(const [index,row]of manifest.media.entries()){
    onProgress(m('accountCloud.backupDownloadingphotoscurrenttotal',{current:index+1,total:manifest.media.length}));
    const response=await fetch('/api/media?'+new URLSearchParams({namespace:row.namespace,id:row.id}),{credentials:'same-origin',signal});if(!response.ok)throw Error(m("accountCloud.backupAbackupphotocouldnotbedownloadedTryagain"));
    const bytes=await response.arrayBuffer();if(bytes.byteLength!==row.bytes||await hash(bytes)!==row.id)throw Error(m("accountCloud.backupAbackupphotofailedverificationTryagain"));
    images.push({...row,dataUrl:await dataUrl(new Blob([bytes],{type:'image/jpeg'}))});
   }
   const latest=await requestJson('/api/backup/export',undefined,signal);if(latest.revision!==exported.revision)throw Error(m("accountCloud.backupYourworkspacechangedDownloadthebackupagain"));
   if(!isCurrent())return false;const blob=new Blob([JSON.stringify({...manifest,media:images})],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='nourishing-backup-'+manifest.createdAt.slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);onProgress(m("accountCloud.backupBackupdownloaded"));
 return true;
}

/** The browser assembles one portable file. Photos travel in separate bounded requests. */
export function mountBackup({root,show,close,header,content,onChange=async()=>{}}){
 let disposed=false,busy=false,restore=null;const abort=new AbortController();
 root.innerHTML=`<section class="backup-panel"><div class="backup-actions"><button type="button" class="primary" data-backup-download>${m("accountCloud.downloadBackup")}</button><button type="button" data-backup-choose>${m("accountCloud.backupRestorebackup")}</button><button type="button" data-backup-recovery>${m("accountCloud.backupPreviousversions")}</button></div><p class="backup-scope">${m("accountCloud.backupDiarysettingsandattachedphotos")}</p><p class="backup-status" role="status"></p><input type="file" data-backup-file accept="application/json,.json" hidden></section>`;
 const panel=root.querySelector('.backup-panel'),status=panel.querySelector('[role=status]'),fileInput=panel.querySelector('input');
 const alive=()=>!disposed&&panel.isConnected;
 const setBusy=value=>{busy=value;panel.querySelectorAll('button').forEach(button=>button.disabled=value);};
 const message=text=>{if(alive())status.textContent=text;};
 panel.querySelector('[data-backup-download]').onclick=download;
 panel.querySelector('[data-backup-choose]').onclick=()=>fileInput.click();
 panel.querySelector('[data-backup-recovery]').onclick=recoveries;
 async function recoveries(){
  if(busy)return;setBusy(true);message(m("accountCloud.backupLoadingpreviousversions"));
  try{
   const inventory=await request('/api/backup/recoveries',undefined,abort.signal);if(!alive())return;message('');
   show(header(m("accountCloud.backupPreviousversions"))+'<div class="backup-recoveries"><div data-recovery-list></div><p role="status"></p></div>');
   const container=content.querySelector('.backup-recoveries'),list=container.querySelector('[data-recovery-list]');
   if(!inventory.generations.length)list.textContent=m("accountCloud.backupNopreviousversionsyet");
   for(const item of inventory.generations){
    const row=document.createElement('div');row.className='field-row';
    const label=item.retainedAt?new Date(item.retainedAt).toLocaleString(uiLanguage()):m("accountCloud.backupEarlierversion");
    row.innerHTML=`<span>${e(label)}${item.recoverySnapshotId?`<small> · ${e(m('accountCloud.backupRecoveryid',{id:item.recoverySnapshotId}))}</small>`:''}${item.status!=='available'?`<small> · ${e(item.status==='unverified'?m("accountCloud.backupUnverified"):item.status==='incomplete'?m("nutritionReport.incomplete"):m("mobileScoreDetail.unavailable"))}</small>`:''}</span>`;
    if(item.status==='available'){
     const button=document.createElement('button');button.type='button';button.textContent=m('accountCloud.review');
     button.onclick=async()=>{
      if(busy)return;setBusy(true);container.querySelectorAll('button').forEach(value=>value.disabled=true);const output=container.querySelector('[role=status]');output.textContent=m("accountCloud.backupCheckingversion");
      try{
       const inspection=await request('/api/backup/recovery/inspect',{generation:item.generation,revision:inventory.revision},abort.signal);
       if(!alive()||!container.isConnected)return;
       restore={photos:[],inspection,requestId:crypto.randomUUID(),uploaded:0};review();
      }catch(error){if(error.name!=='AbortError'&&container.isConnected)output.textContent=error.message;}
      finally{if(alive())setBusy(false);container.querySelectorAll('button').forEach(value=>value.disabled=false);}
     };row.append(button);
    }
    list.append(row);
   }
  }catch(error){if(error.name!=='AbortError')message(error.message);}finally{if(alive())setBusy(false);}
 }
 async function download(){
  if(busy)return;setBusy(true);message(m("accountCloud.preparingBackup"));
  try{
   await downloadBackup({signal:abort.signal,onProgress:message,isCurrent:alive});
  }catch(error){if(error.name!=='AbortError')message(error.message);}finally{if(alive())setBusy(false);}
 }
 fileInput.onchange=async()=>{
  const file=fileInput.files?.[0];fileInput.value='';if(!file||busy)return;setBusy(true);restore=null;message(m("accountCloud.backupCheckingbackup"));
  try{
   if(file.size>maxFileBytes)throw Error(m("accountCloud.backupChooseabackupsmallerthan1GiB"));
   let bundle;try{bundle=JSON.parse(await file.text());}catch{throw Error(m("accountCloud.backupChooseaNourishingJSONbackup"));}
   if(!bundle||!Array.isArray(bundle.media))throw Error(m("accountCloud.backupChooseacompleteNourishingJSONbackup"));
   const photos=bundle.media.map(({dataUrl,...row})=>({namespace:row.namespace,photo:{id:row.id,dataUrl}}));
   if(photos.some(row=>typeof row.photo.dataUrl!=='string'))throw Error(m("accountCloud.backupThisbackupismissingphotos"));
   const manifest={...bundle,media:bundle.media.map(({dataUrl,...row})=>row)},current=await request('/api/backup/export',undefined,abort.signal),inspection=await request('/api/backup/inspect',{manifest,revision:current.revision},abort.signal);
   if(!alive())return;restore={manifest,photos,inspection,requestId:crypto.randomUUID(),uploaded:0};message('');review();
  }catch(error){if(error.name!=='AbortError')message(error.message);}finally{if(alive())setBusy(false);}
 };
 function review(){
  const summary=restore.inspection.summary??restore.inspection;restore.reviewToken=restore.inspection.reviewToken??summary.reviewToken;
  show(header(m("accountCloud.backupRestorebackup"))+`<div class="backup-review"><p>${e(new Date(summary.createdAt).toLocaleString(uiLanguage()))}</p>${summary.range?`<p>${e(summary.range.from)} – ${e(summary.range.to)}</p>`:''}<table><thead><tr><th>${m("accountCloud.backupContent")}</th><th>${m("accountCloud.backupCurrent")}</th><th>${m("accountCloud.backupBackup")}</th></tr></thead><tbody>${keys.map(key=>`<tr><th>${labels()[key]}</th><td>${e(summary.current.counts[key]??0)}</td><td>${e(summary.counts[key]??0)}</td></tr>`).join('')}<tr><th>${m("accountCloud.backupPhotos")}</th><td>${e(summary.current.photos)}</td><td>${e(summary.photos)}</td></tr></tbody></table>${summary.changes?.some(row=>row.code==='fasting-schedules-paused')?`<p>${m("accountCloud.backupFastingscheduleswillbepaused")}</p>`:''}<p>${m("accountCloud.backupReplaceyourcurrentworkspacewiththisbackupYoursigninanddeviceconnectionsstayunchanged")}</p><p class="sheet-message" role="status"></p><footer class="entry-actions"><button type="button" data-backup-cancel>${m("mobileWeightGoal.cancel")}</button><button type="button" class="danger" data-backup-restore>${m("accountCloud.backupReplaceworkspace")}</button></footer></div>`);
  const container=content.querySelector('.backup-review');container.querySelector('[data-backup-cancel]').onclick=()=>{restore=null;close();};container.querySelector('[data-backup-restore]').onclick=()=>commit(container);
 }
 async function commit(container){
  if(busy||!restore)return;setBusy(true);const operation=restore,output=container.querySelector('[role=status]');container.querySelectorAll('button').forEach(button=>button.disabled=true);
  try{
   while(operation.uploaded<operation.photos.length){output.textContent=m('accountCloud.backupUploadingphotoscurrenttotal',{current:operation.uploaded+1,total:operation.photos.length});await request('/api/backup/media',{reviewToken:operation.reviewToken,...operation.photos[operation.uploaded]},abort.signal);operation.uploaded++;}
   output.textContent=m("accountCloud.backupRestoring");await request('/api/backup/restore',{requestId:operation.requestId,reviewToken:operation.reviewToken,confirmation:'replace'},abort.signal);
   restore=null;if(container.isConnected)close();await onChange();message(m("accountCloud.backupBackuprestored"));
  }catch(error){if(error.name!=='AbortError'&&container.isConnected){output.textContent=error.message;if(error.status===409){restore=null;container.querySelector('[data-backup-restore]').hidden=true;}else container.querySelector('[data-backup-restore]').textContent=m("accountCloud.backupTryrestoreagain");}}
  finally{if(alive())setBusy(false);container.querySelectorAll('button').forEach(button=>button.disabled=false);}
 }
 return {dispose(){disposed=true;restore=null;abort.abort();root.replaceChildren();}};
}
