import {request} from './diary-api.js';
import {escape as e} from './html.js';
const maxFileBytes=1024*1024*1024;
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const hex=buffer=>[...new Uint8Array(buffer)].map(value=>value.toString(16).padStart(2,'0')).join('');
const hash=async value=>hex(await crypto.subtle.digest('SHA-256',value));
const dataUrl=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not read this photo.'));reader.readAsDataURL(blob);});
const keys=['entries','biometrics','notes','foods','recipes','meals','progressSnapshots'];
const labels={entries:'Diary foods and exercise',biometrics:'Biometrics',notes:'Notes',foods:'Foods',recipes:'Recipes',meals:'Meals',progressSnapshots:'Snapshots'};

/** One verified export path for both account deletion and workspace backup. */
export async function downloadBackup({signal,onProgress=()=>{},isCurrent=()=>true,requestJson=request}={}){
   const exported=await requestJson('/api/backup/export',undefined,signal),manifest=exported.manifest,images=[];
   const {digest:expected,...body}=manifest;if(await hash(new TextEncoder().encode(JSON.stringify(canonical(body))))!==expected)throw Error('Backup verification failed. Try again.');
   for(const [index,row]of manifest.media.entries()){
    onProgress(`Downloading photos ${index+1}/${manifest.media.length}…`);
    const response=await fetch('/api/media?'+new URLSearchParams({namespace:row.namespace,id:row.id}),{credentials:'same-origin',signal});if(!response.ok)throw Error('A backup photo could not be downloaded. Try again.');
    const bytes=await response.arrayBuffer();if(bytes.byteLength!==row.bytes||await hash(bytes)!==row.id)throw Error('A backup photo failed verification. Try again.');
    images.push({...row,dataUrl:await dataUrl(new Blob([bytes],{type:'image/jpeg'}))});
   }
   const latest=await requestJson('/api/backup/export',undefined,signal);if(latest.revision!==exported.revision)throw Error('Your workspace changed. Download the backup again.');
   if(!isCurrent())return false;const blob=new Blob([JSON.stringify({...manifest,media:images})],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='nourishing-backup-'+manifest.createdAt.slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);onProgress('Backup downloaded.');
 return true;
}

/** The browser assembles one portable file. Photos travel in separate bounded requests. */
export function mountBackup({root,show,close,header,content,onChange=async()=>{}}){
 let disposed=false,busy=false,restore=null;const abort=new AbortController();
 root.innerHTML='<section class="backup-panel"><div class="backup-actions"><button type="button" class="primary" data-backup-download>Download backup</button><button type="button" data-backup-choose>Restore backup</button><button type="button" data-backup-recovery>Previous versions</button></div><p class="backup-scope">Diary, settings and attached photos.</p><p class="backup-status" role="status"></p><input type="file" data-backup-file accept="application/json,.json" hidden></section>';
 const panel=root.querySelector('.backup-panel'),status=panel.querySelector('[role=status]'),fileInput=panel.querySelector('input');
 const alive=()=>!disposed&&panel.isConnected;
 const setBusy=value=>{busy=value;panel.querySelectorAll('button').forEach(button=>button.disabled=value);};
 const message=text=>{if(alive())status.textContent=text;};
 panel.querySelector('[data-backup-download]').onclick=download;
 panel.querySelector('[data-backup-choose]').onclick=()=>fileInput.click();
 panel.querySelector('[data-backup-recovery]').onclick=recoveries;
 async function recoveries(){
  if(busy)return;setBusy(true);message('Loading previous versions…');
  try{
   const inventory=await request('/api/backup/recoveries',undefined,abort.signal);if(!alive())return;message('');
   show(header('Previous versions')+'<div class="backup-recoveries"><div data-recovery-list></div><p role="status"></p></div>');
   const container=content.querySelector('.backup-recoveries'),list=container.querySelector('[data-recovery-list]');
   if(!inventory.generations.length)list.textContent='No previous versions yet.';
   for(const item of inventory.generations){
    const row=document.createElement('div');row.className='field-row';
    const label=item.retainedAt?new Date(item.retainedAt).toLocaleString():'Earlier version';
    row.innerHTML=`<span>${e(label)}${item.recoverySnapshotId?`<small> · Health Connect #${e(item.recoverySnapshotId)}</small>`:''}${item.status!=='available'?`<small> · ${e(item.status==='unverified'?'Unverified':item.status==='incomplete'?'Incomplete':'Unavailable')}</small>`:''}</span>`;
    if(item.status==='available'){
     const button=document.createElement('button');button.type='button';button.textContent='Review';
     button.onclick=async()=>{
      if(busy)return;setBusy(true);container.querySelectorAll('button').forEach(value=>value.disabled=true);const output=container.querySelector('[role=status]');output.textContent='Checking version…';
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
  if(busy)return;setBusy(true);message('Preparing backup…');
  try{
   await downloadBackup({signal:abort.signal,onProgress:message,isCurrent:alive});
  }catch(error){if(error.name!=='AbortError')message(error.message);}finally{if(alive())setBusy(false);}
 }
 fileInput.onchange=async()=>{
  const file=fileInput.files?.[0];fileInput.value='';if(!file||busy)return;setBusy(true);restore=null;message('Checking backup…');
  try{
   if(file.size>maxFileBytes)throw Error('Choose a backup smaller than 1 GiB.');
   let bundle;try{bundle=JSON.parse(await file.text());}catch{throw Error('Choose a Nourishing JSON backup.');}
   if(!bundle||!Array.isArray(bundle.media))throw Error('Choose a complete Nourishing JSON backup.');
   const photos=bundle.media.map(({dataUrl,...row})=>({namespace:row.namespace,photo:{id:row.id,dataUrl}}));
   if(photos.some(row=>typeof row.photo.dataUrl!=='string'))throw Error('This backup is missing photos.');
   const manifest={...bundle,media:bundle.media.map(({dataUrl,...row})=>row)},current=await request('/api/backup/export',undefined,abort.signal),inspection=await request('/api/backup/inspect',{manifest,revision:current.revision},abort.signal);
   if(!alive())return;restore={manifest,photos,inspection,requestId:crypto.randomUUID(),uploaded:0};message('');review();
  }catch(error){if(error.name!=='AbortError')message(error.message);}finally{if(alive())setBusy(false);}
 };
 function review(){
  const summary=restore.inspection.summary??restore.inspection;restore.reviewToken=restore.inspection.reviewToken??summary.reviewToken;
  show(header('Restore backup')+`<div class="backup-review"><p>${e(new Date(summary.createdAt).toLocaleString())}</p>${summary.range?`<p>${e(summary.range.from)} – ${e(summary.range.to)}</p>`:''}<table><thead><tr><th>Content</th><th>Current</th><th>Backup</th></tr></thead><tbody>${keys.map(key=>`<tr><th>${labels[key]}</th><td>${e(summary.current.counts[key]??0)}</td><td>${e(summary.counts[key]??0)}</td></tr>`).join('')}<tr><th>Photos</th><td>${e(summary.current.photos)}</td><td>${e(summary.photos)}</td></tr></tbody></table>${summary.changes?.some(row=>row.code==='fasting-schedules-paused')?'<p>Fasting schedules will be paused.</p>':''}<p>Replace your current workspace with this backup? Your sign-in and device connections stay unchanged.</p><p class="sheet-message" role="status"></p><footer class="entry-actions"><button type="button" data-backup-cancel>Cancel</button><button type="button" class="danger" data-backup-restore>Replace workspace</button></footer></div>`);
  const container=content.querySelector('.backup-review');container.querySelector('[data-backup-cancel]').onclick=()=>{restore=null;close();};container.querySelector('[data-backup-restore]').onclick=()=>commit(container);
 }
 async function commit(container){
  if(busy||!restore)return;setBusy(true);const operation=restore,output=container.querySelector('[role=status]');container.querySelectorAll('button').forEach(button=>button.disabled=true);
  try{
   while(operation.uploaded<operation.photos.length){output.textContent=`Uploading photos ${operation.uploaded+1}/${operation.photos.length}…`;await request('/api/backup/media',{reviewToken:operation.reviewToken,...operation.photos[operation.uploaded]},abort.signal);operation.uploaded++;}
   output.textContent='Restoring…';await request('/api/backup/restore',{requestId:operation.requestId,reviewToken:operation.reviewToken,confirmation:'replace'},abort.signal);
   restore=null;if(container.isConnected)close();await onChange();message('Backup restored.');
  }catch(error){if(error.name!=='AbortError'&&container.isConnected){output.textContent=error.message;if(error.status===409){restore=null;container.querySelector('[data-backup-restore]').hidden=true;}else container.querySelector('[data-backup-restore]').textContent='Try restore again';}}
  finally{if(alive())setBusy(false);container.querySelectorAll('button').forEach(button=>button.disabled=false);}
 }
 return {dispose(){disposed=true;restore=null;abort.abort();root.replaceChildren();}};
}
