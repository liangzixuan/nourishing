import {uiLanguage,t} from './app-language.js';
import {fc} from './food-cloud-messages.js';
import {BarcodeScanner} from './barcode-source/barcode-scanner.js';
import {readDeviceCache} from './device-cache.js';
import {parseReferencedQuantity} from './report-source/server/resource-quantity.mjs';
import {assertDiaryDaysEditable} from './report-source/server/diary-day-status.mjs';
import {requiredRecordGroup} from './report-source/server/diary-record-fields.mjs';
import {localWorkspaceState,localPreviewDiaryItem} from './local-engine.js';
import {request,command,queueCommand} from './diary-api.js';
import {escape as e} from './html.js';
import {quantityFields,quantityValue} from './quantity.js';
const num=value=>Number.isFinite(value)?value.toLocaleString(uiLanguage(),{maximumFractionDigits:1}):'—';

export function openBarcode({mode='camera',initialLookup=null,show,close,header,content,date,groups,group,onChange,onSelect,returnToPicker,onMissing=returnToPicker}){
 show('<div class="barcode-flow"></div>');const root=content.querySelector('.barcode-flow');let scanner,controller,serial=0,disposed=false,timer;
 const backEvents=new AbortController();
 const leave=returnToPicker??close;
 const dispose=()=>{if(disposed)return;disposed=true;backEvents.abort();serial++;clearTimeout(timer);controller?.abort();scanner?.dispose();observer.disconnect();};
 root.addEventListener('click',event=>{if(event.target.closest('[data-barcode-back]'))leave();});
 const observer=new MutationObserver(()=>{if(!root.isConnected)dispose();});observer.observe(content,{childList:true});
 if(returnToPicker){
  const back=event=>{
   if(!root.isConnected||!root.closest('dialog')?.open)return;
   event.preventDefault();event.stopImmediatePropagation();
   if(!scanner?.back())returnToPicker();
  };
  root.closest('dialog')?.addEventListener('cancel',back,{capture:true,signal:backEvents.signal});
  window.addEventListener('nourishing-back',back,{signal:backEvents.signal});
 }
 function view(html){serial++;controller?.abort();scanner?.dispose();scanner=null;clearTimeout(timer);root.innerHTML=html;content.closest('dialog').scrollTop=0;}
 async function lookup(target,scan,signal){
  const {ticket}=await readDeviceCache('/api/diary');
  const body=typeof target==='object'&&target?.fdcId?{fdcId:Number(target.fdcId)}:{code:typeof target==='string'?target:target?.barcode,...(scan?{scan}:{})};
  try{
   const result=await request('/api/barcode/lookup',body,signal);
   if(!disposed&&!signal?.aborted)review(result,ticket);
  }catch(error){
   if(disposed||signal?.aborted)return;
   if(error.errorCode!=='barcode.productNotFound'||!onMissing||mode!=='camera')throw error;
   await onMissing();
  }
 }
 function camera(){view('<div class="barcode-camera-root"></div>');scanner=new BarcodeScanner({root:root.firstElementChild,fullscreen:true,language:uiLanguage(),onClose:leave,onCode:lookup});}
 function search(){
  view(header(fc('brandedFoods'))+`<form class="branded-search-form"><input type="search" aria-label="${e(fc("productBrand"))}" placeholder="${e(fc("productBrand"))}" required minlength="2" maxlength="200"><button>${e(t("barcode.lookupShort"))}</button></form><p class="sheet-message" role="status"></p><ul class="search-results"></ul><button type="button" class="more-results" hidden>${e(fc("showMore"))}</button><p class="barcode-source-link">USDA Branded Foods · Open Food Facts</p>`);
  const form=root.querySelector('form'),status=root.querySelector('[role=status]'),list=root.querySelector('ul'),more=root.querySelector('.more-results');let query='',next;
  async function run(page=1){controller?.abort();controller=new AbortController();const id=++serial,signal=controller.signal;more.hidden=true;status.textContent=t("mobileSearch.loading");if(page===1){query=form.querySelector('input').value.trim();list.replaceChildren();}
   try{const result=await request('/api/branded/search',{q:query,page,lang:uiLanguage()},signal);if(disposed||serial!==id)return;next=result.nextPage;list.insertAdjacentHTML('beforeend',result.items.map(item=>{const meta=[item.brands,item.barcode,item.provider==='usda-branded'?'USDA':item.source==='Open Food Facts'?'OFF':item.source].filter(Boolean).join(' · ');return `<li><button type="button" ${item.fdcId?`data-fdc-id="${e(item.fdcId)}"`:''} ${item.barcode?`data-barcode="${e(item.barcode)}"`:''}><strong>${e(item.name)}</strong><small>${e(meta)}</small></button></li>`;}).join(''));more.hidden=!next;status.textContent=result.items.length?'':fc("noProducts");}
   catch(error){if(serial===id&&!disposed&&error.name!=='AbortError')status.textContent=error.message;}
  }
  form.onsubmit=event=>{event.preventDefault();run();};more.onclick=()=>run(next);
  list.onclick=async event=>{const button=event.target.closest('[data-fdc-id],[data-barcode]');if(!button)return;button.disabled=true;status.textContent=fc("loadingProduct");controller?.abort();controller=new AbortController();const target=button.dataset.fdcId?{fdcId:Number(button.dataset.fdcId)}:button.dataset.barcode;try{await lookup(target,null,controller.signal);}catch(error){if(!disposed&&status.isConnected&&error.name!=='AbortError'){status.textContent=error.message;button.disabled=false;}}};
 }
 function directLookup(target){
  const title=header(t('diary.food'));
  view((returnToPicker?title.replace('data-close','data-barcode-back'):title)+`<p class="sheet-message" role="status">${e(fc('loadingProduct'))}</p>`);
  const status=root.querySelector('[role=status]');
  controller=new AbortController();
  void lookup(target,null,controller.signal).catch(error=>{if(!disposed&&status.isConnected&&error.name!=='AbortError')status.textContent=error.message;});
 }
 function review(result,ticket){
  const title=header(t("diary.food"));
  view(returnToPicker?title.replace('data-close','data-barcode-back'):title);const food=result.resource,now=new Date(),time=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0'),selected=groups.includes(group)?group:groups.includes('Uncategorized')?'Uncategorized':groups[0];
  const isUsdaBranded=food.source?.provider==='usda-branded';
  const sourceCredit=isUsdaBranded
   ?`${food.barcode?e(food.barcode)+' · ':''}<a href="https://fdc.nal.usda.gov/food-details/${encodeURIComponent(food.source.fdcId)}/nutrients" target="_blank" rel="noopener noreferrer">USDA Branded Foods</a> · CC0 1.0`
   :`${e(food.barcode??'')} · <a href="https://world.openfoodfacts.org/product/${encodeURIComponent(food.barcode??'')}" target="_blank" rel="noopener noreferrer">Open Food Facts</a> · ODbL`;
  root.insertAdjacentHTML('beforeend',`<section class="barcode-review"><h3>${e(food.name)}</h3><p class="barcode-source-link">${sourceCredit}<br>${e(fc("checkPackage"))}</p><form class="entry-form">${quantityFields(result.options)}<label class="field-row"><span>${e(t("mobileFood.date"))}</span><input name="date" type="date" value="${e(date())}" required></label><label class="field-row"><span>${e(t("mobileFood.group"))}</span><select name="group">${groups.map(g=>`<option ${g===selected?'selected':''}>${e(g)}</option>`).join('')}</select></label><label class="field-row"><span>${e(t("foodLog.time"))}</span><input name="time" type="time" value="${time}" required></label><div class="nutrition-preview" aria-live="polite"></div><p class="sheet-message" role="status"></p><footer class="entry-actions"><button type="button" data-save-food class="danger">${e(fc("saveMyFoods"))}</button><button class="primary">${onSelect?fc("selectFood"):t("mobileFood.add")}</button></footer></form></section>`);
  const form=root.querySelector('form'),status=root.querySelector('[role=status]'),preview=root.querySelector('.nutrition-preview');let previewId=0;
  const payload=()=>{const values=Object.fromEntries(new FormData(form));return {reviewToken:result.reviewToken,date:values.date,time:values.time,group:values.group,...quantityValue(form)};};
  function update(){clearTimeout(timer);const id=++previewId;preview.textContent='…';timer=setTimeout(async()=>{if(disposed||!form.isConnected)return;try{const {reviewToken,...entry}=payload();const value=ticket&&await localPreviewDiaryItem({...entry,foodId:food.id},food)||await request('/api/barcode/preview',{reviewToken,...entry});if(id!==previewId||!form.isConnected)return;const n=value.nutrition.totals;preview.innerHTML=`<strong>${num(value.energy.value)} ${e(value.energy.unit)}</strong><p>${num(n.protein)} g ${e(t("mobileNutrientTargets.group.protein"))} · ${num(n.carbs)} g ${e(t("energyChart.component.carbohydrate"))} · ${num(n.fat)} g ${e(t("mobileDiary.fat"))}</p>`;}catch(error){if(id===previewId&&form.isConnected)preview.textContent=error.message;}},180);}
  form.oninput=update;update();
  let saving=false;
  async function save(saveOnly){
   if(saving||!form.reportValidity())return;
   const {reviewToken,...entry}=payload(),saveFoodOnly=saveOnly||Boolean(onSelect);
   const input={reviewToken,...entry,...(saveFoodOnly?{saveOnly:true}:{})};
   saving=true;form.querySelectorAll('button').forEach(button=>button.disabled=true);status.textContent='';
   try{
    const source=saveOnly?null:parseReferencedQuantity({foods:[food]},{...entry,foodId:food.id}).source;
    if(ticket){
     let barcodeEntry;
     if(!saveFoodOnly){
      const state=await localWorkspaceState();
      if(state){assertDiaryDaysEditable(state,[entry.date]);requiredRecordGroup(entry.group,state.settings.groups);}
      barcodeEntry={...source,kind:'food',name:food.name,date:entry.date,time:entry.time,group:entry.group};
     }
     await queueCommand(result.revision,'barcode.log',input,{path:'/api/barcode/save',ticket,projection:{barcodeFood:food,...(barcodeEntry?{barcodeEntry}:{})}});
    }else await command(result.revision,'barcode.log',input);
    if(disposed)return;
    await onChange();
    if(disposed)return;
    if(onSelect&&!saveOnly)await onSelect({...food,kind:'foods'},entry);
    else leave();
   }catch(error){if(!disposed)status.textContent=error.message;}
   finally{saving=false;form.querySelectorAll('button').forEach(button=>button.disabled=false);}
  }
  form.onsubmit=event=>{event.preventDefault();save(false);};form.querySelector('[data-save-food]').onclick=()=>save(true);
 }
 if(mode==='lookup'&&initialLookup)directLookup(initialLookup);else if(mode==='search')search();else camera();return dispose;
}
