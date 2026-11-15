import {request} from './diary-api.js';
import {escape as e} from './html.js';
export function openImports({show,close,header,content,onChange}){
 show(`${header('Import & Devices')}<section class="entry-form"><button type="button" data-nourishing-health-connect hidden>Health Connect</button><label class="field-row"><span>Health Connect file</span><input type="file" accept=".json,application/json" aria-label="Health Connect export"></label><div data-review></div><p class="sheet-message" role="status"></p></section>`);
 const root=content.querySelector('.entry-form'),file=root.querySelector('input'),status=root.querySelector('[role=status]'),review=root.querySelector('[data-review]'),native=root.querySelector('[data-nourishing-health-connect]');
 const refreshNative=()=>{native.hidden=!window.NourishingNative?.openHealthConnect;};refreshNative();
 window.addEventListener('nourishing:nativeready',refreshNative,{once:true});
 file.onchange=async()=>{
  const selected=file.files?.[0];review.replaceChildren();status.textContent='';if(!selected)return;
  if(selected.size>20000000){status.textContent='Choose an export smaller than 20 MB.';return;}
  file.disabled=true;
  try{const snapshot=JSON.parse(await selected.text());if(!root.isConnected)return;status.textContent='Checking records…';const preview=await request('/api/health-connect/preview?summary=1',snapshot);if(!root.isConnected)return;status.textContent='';
   review.innerHTML=`<div class="nutrition-preview">${Object.entries(preview.counts).map(([key,value])=>`<span>${e(key)}: <strong>${e(value)}</strong></span>`).join(' · ')}</div><details><summary>Details</summary>${preview.warnings.map(text=>`<p>${e(text)}</p>`).join('')}</details><footer class="entry-actions"><button type="button" class="primary" data-confirm>Import</button></footer>`;
   review.querySelector('[data-confirm]').onclick=async event=>{event.target.disabled=true;try{
    const response=await fetch('/api/health-connect/import?summary=1',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Nourish-Review-Token':preview.reviewToken},body:JSON.stringify(snapshot)});const result=await response.json();if(!response.ok)throw Error(result.error??'Import failed. Try again.');await onChange();if(root.isConnected)close();
   }catch(error){if(root.isConnected)status.textContent=error.message;}finally{event.target.disabled=false;}};
  }catch(error){if(root.isConnected)status.textContent=error instanceof SyntaxError?'Choose a valid Health Connect JSON export.':error.message;}finally{file.disabled=false;}
 };
}
