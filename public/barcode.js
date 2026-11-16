import {BarcodeScanner} from './barcode-source/barcode-scanner.js';
import {request,command} from './diary-api.js';
import {escape as e} from './html.js';
import {quantityFields,quantityValue} from './quantity.js';
const num=value=>Number.isFinite(value)?value.toLocaleString(undefined,{maximumFractionDigits:1}):'—';

export function openBarcode({mode='camera',show,close,header,content,date,groups,group,onChange,revision,onSelect}){
 show('<div class="barcode-flow"></div>');const root=content.querySelector('.barcode-flow');let scanner,controller,serial=0,disposed=false,timer;
 const dispose=()=>{if(disposed)return;disposed=true;serial++;clearTimeout(timer);controller?.abort();scanner?.dispose();observer.disconnect();};
 root.addEventListener('click',event=>{if(event.target.closest('[data-barcode-back]'))close();});
 const observer=new MutationObserver(()=>{if(!root.isConnected)dispose();});observer.observe(content,{childList:true});
 function view(html){serial++;controller?.abort();scanner?.dispose();scanner=null;clearTimeout(timer);root.innerHTML=html;content.closest('dialog').scrollTop=0;}
 async function lookup(code,scan,signal){
  const result=await request('/api/barcode/lookup',{code,...(scan?{scan}:{})},signal);if(disposed||signal?.aborted)return;review(result);
 }
 function camera(){view('<div class="barcode-camera-root"></div>');scanner=new BarcodeScanner({root:root.firstElementChild,fullscreen:true,onClose:close,onCode:lookup});}
 function search(){
  view(header('Branded Foods')+'<form class="branded-search-form"><input type="search" aria-label="Product or brand" placeholder="Product or brand" required minlength="2" maxlength="200"><button>Search</button></form><p class="sheet-message" role="status"></p><ul class="search-results"></ul><button type="button" class="more-results" hidden>Show more</button><p class="barcode-source-link">Open Food Facts · ODbL</p>');
  const form=root.querySelector('form'),status=root.querySelector('[role=status]'),list=root.querySelector('ul'),more=root.querySelector('.more-results');let query='',next;
  async function run(page=1){controller?.abort();controller=new AbortController();const id=++serial,signal=controller.signal;more.hidden=true;status.textContent='Searching…';if(page===1){query=form.querySelector('input').value.trim();list.replaceChildren();}
   try{const result=await request('/api/branded/search',{q:query,page},signal);if(disposed||serial!==id)return;next=result.nextPage;list.insertAdjacentHTML('beforeend',result.items.map(item=>`<li><button type="button" data-barcode="${e(item.barcode)}"><strong>${e(item.name)}</strong><small>${e(item.brands??'')} · ${e(item.barcode)}</small></button></li>`).join(''));more.hidden=!next;status.textContent=result.items.length?'':'No products found.';}
   catch(error){if(serial===id&&!disposed&&error.name!=='AbortError')status.textContent=error.message;}
  }
  form.onsubmit=event=>{event.preventDefault();run();};more.onclick=()=>run(next);
  list.onclick=async event=>{const button=event.target.closest('[data-barcode]');if(!button)return;button.disabled=true;status.textContent='Loading product…';controller?.abort();controller=new AbortController();try{await lookup(button.dataset.barcode,null,controller.signal);}catch(error){if(!disposed&&status.isConnected&&error.name!=='AbortError'){status.textContent=error.message;button.disabled=false;}}};
 }
 function review(result){
  view(header('Food'));const food=result.resource,now=new Date(),time=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0'),selected=groups.includes(group)?group:groups.includes('Uncategorized')?'Uncategorized':groups[0];
  root.insertAdjacentHTML('beforeend',`<section class="barcode-review"><h3>${e(food.name)}</h3><p class="barcode-source-link">${e(food.barcode)} · <a href="https://world.openfoodfacts.org/product/${encodeURIComponent(food.barcode)}" target="_blank" rel="noopener noreferrer">Open Food Facts</a> · ODbL<br>Check the package label.</p><form class="entry-form">${quantityFields(result.options)}<label class="field-row"><span>Date</span><input name="date" type="date" value="${e(date())}" required></label><label class="field-row"><span>Group</span><select name="group">${groups.map(g=>`<option ${g===selected?'selected':''}>${e(g)}</option>`).join('')}</select></label><label class="field-row"><span>Time</span><input name="time" type="time" value="${time}" required></label><div class="nutrition-preview" aria-live="polite"></div><p class="sheet-message" role="status"></p><footer class="entry-actions"><button type="button" data-save-food class="danger">Save to My Foods</button><button class="primary">${onSelect?'Select Food':'Add to Diary'}</button></footer></form></section>`);
  const form=root.querySelector('form'),status=root.querySelector('[role=status]'),preview=root.querySelector('.nutrition-preview');let previewId=0;
  const payload=()=>{const values=Object.fromEntries(new FormData(form));return {reviewToken:result.reviewToken,date:values.date,time:values.time,group:values.group,...quantityValue(form)};};
  function update(){clearTimeout(timer);const id=++previewId;preview.textContent='…';timer=setTimeout(async()=>{if(disposed||!form.isConnected)return;try{const value=await request('/api/barcode/preview',payload());if(id!==previewId||!form.isConnected)return;const n=value.nutrition.totals;preview.innerHTML=`<strong>${num(value.energy.value)} ${e(value.energy.unit)}</strong><p>${num(n.protein)} g Protein · ${num(n.carbs)} g Carbs · ${num(n.fat)} g Fat</p>`;}catch(error){if(id===previewId&&form.isConnected)preview.textContent=error.message;}},180);}
  form.oninput=update;update();
  async function save(saveOnly){const input={...payload(),...(saveOnly||onSelect?{saveOnly:true}:{})};form.querySelectorAll('button').forEach(b=>b.disabled=true);status.textContent='';try{const saved=await command(result.revision,'barcode.log',input);if(disposed)return;await onChange();if(onSelect&&!saveOnly){if(!saved.item?.id)throw Error('Saved food could not be selected.');const {reviewToken,...entry}=payload();await onSelect({...food,id:saved.item.id,kind:'foods'},entry);}else close();}catch(error){if(disposed)return;status.textContent=error.message;if(error.status===409){const button=document.createElement('button');button.type='button';button.className='more-results';button.textContent='Refresh diary';button.onclick=async()=>{await onChange();result.revision=revision();status.textContent='Diary refreshed. Check and save again.';};status.append(button);}}finally{form.querySelectorAll('button').forEach(b=>b.disabled=false);}}
  form.onsubmit=event=>{event.preventDefault();save(false);};form.querySelector('[data-save-food]').onclick=()=>save(true);
 }
 if(mode==='search')search();else camera();return dispose;
}
