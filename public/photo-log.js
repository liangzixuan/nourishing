import {AnchoredMenu} from './targets-source/anchored-menu.js';
import {uiLanguage,t} from './app-language.js';
import {fc,foodQuantityUnit} from './food-cloud-messages.js';
import {openPhotoCreate} from './photo-create.js';
import {photoMacros,photoNutritionSummary,previewPhotoFood} from './photo-nutrition.js';
import {request,queueCommand} from './diary-api.js';
import {favoriteButton} from './library-extras.js';
import {localLibraryItem,localPreviewDiaryItem} from './local-engine.js';
import {escape as e} from './html.js';
import {mountFoodPicker} from './food-picker.js';
import {quantityFields, quantityValue} from './quantity.js';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const CLIENT_MAX_EDGE = 1280;
const CLIENT_SKIP_BYTES = 300 * 1024;
const CLIENT_JPEG_QUALITY = 0.8;
const num = value => Number.isFinite(value) ? value.toLocaleString(uiLanguage(), {maximumFractionDigits: 1}) : '—';
const quantityLabel = row => `${num(row.quantity ?? row.amount ?? 1)} ${row.unit === 'portion' ? row.portionLabel ?? foodQuantityUnit('portions') : foodQuantityUnit(row.unit ?? 'servings')}${row.unit!=='g'&&Number.isFinite(row.preview?.nutrition.entries?.[0]?.grams)?' · '+num(row.preview.nutrition.entries[0].grams)+' g':''}`;
const fileData = file => new Promise((resolve, reject) => {const reader = new FileReader();reader.onload = () => resolve(reader.result);reader.onerror = () => reject(Error(fc("photoOpenFailed")));reader.readAsDataURL(file);});

async function prepareUploadImage(file) {
  if (typeof createImageBitmap !== 'function') return fileData(file);
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const maxDim = Math.max(bitmap.width, bitmap.height);
    if (maxDim <= CLIENT_MAX_EDGE && file.size <= CLIENT_SKIP_BYTES) return fileData(file);
    const scale = Math.min(1, CLIENT_MAX_EDGE / maxDim);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return fileData(file);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', CLIENT_JPEG_QUALITY);
  } catch {
    return fileData(file);
  } finally {
    bitmap?.close?.();
  }
}

/** Save is injected by the authenticated cloud owner; no photo draft is persisted. */
export function mountPhotoLog({show, close, header, content, date, groups, initialGroup, save, onOptimisticSave, onChange = async () => {}}) {
  let disposed = false, serial = 0, abort, analysis, originalImage, rows = [], pickerCleanup, pendingSave = false, nutritionVersion = 0, hintDismissed = false, createCleanup, portionDialog, menuDialog, swapMenu, lastAddition, energyExpanded = true;
  const nutritionCache = new Map(), itemCache = new Map(), itemLoads = new Map(), additionDrafts = new Map();
  // Same default as the existing mobile photoDialog: uncategorized, then the current meal.
  const clock = new Date(), hour = clock.getHours(), meal = hour >= 6 && hour < 11 ? 'Breakfast' : hour >= 11 && hour < 16 ? 'Lunch' : hour >= 16 && hour < 22 ? 'Dinner' : 'Snacks';
  let group = groups.includes(initialGroup) ? initialGroup : groups.includes('Uncategorized') ? 'Uncategorized' : groups.includes(meal) ? meal : groups[0], time = clock.toTimeString().slice(0, 5), diaryDate = typeof date === 'function' ? date() : date;
  show(`<section class="photo-log">${header(t("mobilePhoto.title"))}<input type="file" accept="image/jpeg,image/png,image/webp" data-photo-gallery><input type="file" accept="image/*" capture="environment" data-photo-camera><div class="photo-log-body"></div></section>`);
  const shell = content.querySelector('.photo-log'), body = shell.querySelector('.photo-log-body');
  const alive = () => !disposed && shell.isConnected;
  function dispose() { if (disposed) return; disposed = true; serial++; abort?.abort();  nutritionCache.clear(); itemCache.clear(); itemLoads.clear(); additionDrafts.clear(); createCleanup?.(); swapMenu?.close(false); closePortion(); closeMenu(); pickerCleanup?.(); observer.disconnect(); originalImage = null; analysis = null; rows = []; }
  const observer = new MutationObserver(() => {if (!shell.isConnected) dispose();});observer.observe(content, {childList: true, subtree: true});
  function replace(html) {nutritionVersion++;pickerCleanup?.();pickerCleanup = null;body.innerHTML = html;body.scrollTop = 0;}
  const picker = camera => {if (!pendingSave) shell.querySelector(camera ? '[data-photo-camera]' : '[data-photo-gallery]').click();};
  shell.querySelectorAll('input[type=file]').forEach(input => {input.onchange = async () => {const file = input.files?.[0];input.value = '';if (!file) return;
    const id = ++serial;abort?.abort();analysis = null;originalImage = null;rows = [];lastAddition = undefined;energyExpanded = true;additionDrafts.clear();
    if (file.size > MAX_IMAGE_BYTES) return errorView(fc('photoTooLarge'));
    try {const image = await prepareUploadImage(file);if (!alive() || id !== serial) return;originalImage = image;analyze();} catch (error) {if (alive() && id === serial) errorView(error.message);}
  };});
  function start() {replace(`<div class="photo-start"><button type="button" class="primary" data-camera>${e(t("mobilePhoto.capture"))}</button><button type="button" class="more-results" data-gallery>${e(t("mobilePhoto.gallery"))}</button></div>`);body.querySelector('[data-camera]').onclick = () => picker(true);body.querySelector('[data-gallery]').onclick = () => picker(false);}
  function errorView(message) {replace(`<div class="photo-error"><p class="sheet-message" role="status">${e(message)}</p>${originalImage ? `<button class="primary" type="button" data-retry>${e(t("mobileSuggest.retry"))}</button>` : ''}<button class="more-results" type="button" data-gallery>${e(t("mobilePhoto.gallery"))}</button></div>`);body.querySelector('[data-gallery]').onclick = () => picker(false);if (originalImage) body.querySelector('[data-retry]').onclick = analyze;}
  async function analyze() {
    abort?.abort();abort = new AbortController();const signal = abort.signal, id = ++serial;analysis = null;rows = [];
    replace(`<div class="photo-scan" role="status"><img src="${e(originalImage)}" alt="Selected meal"><span class="photo-scan-line" aria-hidden="true"></span><p>${e(fc("matchingFoods"))}</p></div><div class="photo-log-actions"><button type="button" class="more-results" data-gallery>${e(t("mobilePhoto.gallery"))}</button><button type="button" class="primary" data-camera>${e(fc("takeNewPhoto"))}</button></div>`);
    body.querySelector('[data-gallery]').onclick = () => picker(false);body.querySelector('[data-camera]').onclick = () => picker(true);
    try {
      const result = await request('/api/photos/analyze', {image: originalImage}, signal);
      if (!alive() || id !== serial) return;
      analysis = result;
      rows = result.suggestions.filter(row => row.kind === 'observation').map(suggestion => {
        const candidate = suggestion.candidates.find(row => row.ref.id === suggestion.selection?.id && row.ref.kind === suggestion.selection?.kind);
        return makeRow(suggestion, candidate);
      });
      review();
    } catch (error) {if (alive() && id === serial && error.name !== 'AbortError') errorView(error.message);}
  }
  function makeRow(suggestion, candidate) {
    const estimate = suggestion.portionEstimate;
    const quantity = Number.isFinite(candidate?.grams) && candidate.grams > 0 && estimate ? {quantity: estimate.grams, unit: 'g'} : {amount: 1};
    const preview = suggestion.preview && candidate?.ref.id === suggestion.selection?.id ? suggestion.preview : null;
    return {name: candidate?.name ?? suggestion.description, foodId: candidate?.ref.id ?? null, ...quantity, ...(preview ? {preview} : {}), ...(suggestion.observationIndex !== undefined ? {observationIndex: suggestion.observationIndex} : {}), ...(suggestion.additionIndex !== undefined ? {additionIndex: suggestion.additionIndex} : {}), estimate, suggestion};
  }
  function closeMenu(){menuDialog?.close();menuDialog?.remove();menuDialog=null;}
  function menu(title,choices){
    closeMenu();const dialog=document.createElement('dialog');menuDialog=dialog;dialog.className='photo-action-menu';dialog.setAttribute('aria-label',title);
    dialog.innerHTML=`${choices.map(([label],i)=>`<button type="button" data-choice="${i}">${e(label)}</button>`).join('')}`;
    dialog.querySelectorAll('[data-choice]').forEach(button=>button.onclick=()=>{const action=choices[Number(button.dataset.choice)][1];closeMenu();action();});
    dialog.oncancel=event=>{event.preventDefault();event.stopPropagation();closeMenu();};dialog.onclick=event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeMenu();}};
    document.body.append(dialog);dialog.showModal();
  }
  const candidateFor=suggestion=>suggestion.candidates.find(candidate=>candidate.ref.id===suggestion.selection?.id&&candidate.ref.kind===suggestion.selection?.kind);
  function optionalRow(suggestion){if(!additionDrafts.has(suggestion.additionIndex))additionDrafts.set(suggestion.additionIndex,makeRow(suggestion,candidateFor(suggestion)));return additionDrafts.get(suggestion.additionIndex);}
  function addMatched(row) {
    rows.push(row);
    if (row.additionIndex !== undefined) {
      additionDrafts.set(row.additionIndex, row);
      lastAddition = row.additionIndex;
    }
  }
  function swapFood(origin, index, row, optional = false) {
    const candidates = (row.suggestion?.candidates ?? []).filter(candidate => candidate.ref?.kind === 'food');
    if (!candidates.length) return chooseFood(index, row, optional);
    swapMenu?.close();
    swapMenu = new AnchoredMenu({
      origin, anchor: origin, label: fc('replaceName', {name: row.name}), className: 'photo-swap',
      items: [...candidates.map((candidate, position) => ({
        id: String(position), label: [candidate.name, candidate.serving].filter(Boolean).join(' · ')
      })), {id: 'search', label: fc('searchMore')}],
      onChoose: id => id === 'search' ? chooseFood(index, row, optional) : editQuantity(index, candidates[Number(id)].ref.id, row, optional),
      onClose: () => { swapMenu = undefined; }
    });
  }
  function review() {
    const added = rows.find(row => lastAddition !== undefined && row.additionIndex === lastAddition);

    const additions = analysis.suggestions.filter(suggestion => suggestion.kind === 'possible-addition' && !rows.some(row => row.additionIndex === suggestion.additionIndex));
    replace(`<div class="photo-thumb"><img src="${e(analysis.photo.dataUrl)}" alt="Meal photo"><div><strong>${e(fc("myPhoto"))}</strong><input name="time" aria-label="${e(t("appActions.time"))}" type="time" value="${e(time)}"></div><button type="button" data-gallery aria-label="${e(fc("chooseAnotherPhoto"))}">＋</button></div><div class="photo-review-hint" ${hintDismissed?'hidden':''}><span>${e(fc("estimatedPortions"))}</span><button type="button" data-dismiss-hint aria-label="${e(fc("dismissPortionHint"))}">×</button></div><p class="photo-row-heading">${e(fc("matchedFoods"))}</p>${rows.map((row, index) => `<div class="photo-food-row"><button type="button" class="photo-food-main" data-quantity="${index}"><strong>${e(row.name)}</strong><span class="photo-food-quantity">${row.foodId ? e(quantityLabel(row)) : fc("chooseMatch")}</span><small class="photo-macros" data-macros="${index}" aria-live="polite"></small></button><button type="button" class="icon-button" data-replace="${index}" aria-label="${e(fc('replaceName',{name:row.name}))}" title="${e(fc('replaceName',{name:row.name}))}"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16m-5-5 5 5-5 5M20 17H4m5-5-5 5 5 5"/></svg></button><button type="button" class="photo-remove" data-remove="${index}" aria-label="${e(fc('removeName',{name:row.name}))}">×</button></div>`).join('')}<button type="button" class="more-results" data-add>${e(fc("searchMore"))}</button>${additions.length ? `<section class="photo-additions"><p class="photo-row-heading">${e(fc("alsoHad"))}</p>${additions.map(suggestion=>{const row=optionalRow(suggestion);return `<div class="photo-optional-row"><button type="button" class="photo-food-main" data-optional-quantity="${row.additionIndex}"><strong>${e(row.name)}</strong><span class="photo-food-quantity">${row.foodId?e(quantityLabel(row)):e(fc('chooseMatch'))}</span><small class="photo-macros" data-optional-macros="${row.additionIndex}">${photoMacros(row.preview)}</small></button><button type="button" class="icon-button" data-optional-replace="${row.additionIndex}" aria-label="${e(fc('replaceName',{name:row.name}))}">&#8646;</button><button type="button" class="icon-button" data-addition="${row.additionIndex}" aria-label="${e(t('mobileBiometric.add'))}: ${e(row.name)}">+</button></div>`;}).join('')}</section>` : ''}<label class="field-row"><span>${e(t("mobileRepeat.group"))}</span><select name="group" aria-label="${e(t("mobileRepeat.group"))}">${groups.map(value => `<option ${value === group ? 'selected' : ''}>${e(value)}</option>`).join('')}</select></label><details class="photo-nutrition-summary" ${energyExpanded ? 'open' : ''}><summary>${e(t("mobileFood.energy"))}</summary></details><details class="photo-preview-details"><summary>${e(fc("photoDetails"))}</summary><label class="field-row"><span>${e(t("mobileFood.date"))}</span><input name="date" aria-label="${e(t("mobileFood.date"))}" type="date" value="${e(diaryDate)}"></label></details><p class="sheet-message" role="status"></p><footer class="photo-log-actions"><button type="button" class="photo-create-button" data-create ${!rows.length || rows.some(row => !row.foodId) ? 'disabled' : ''}>${e(fc("createMore"))}</button><button type="button" class="primary" data-save ${!rows.length || rows.some(row => !row.foodId) ? 'disabled' : ''}>${e(t("libraryView.addToDiary"))}</button></footer>`);
    const energy = body.querySelector('.photo-nutrition-summary');
    energy.ontoggle = () => {if (energy.isConnected) energyExpanded = energy.open;};
    if (added) {
      const notice = document.createElement('div');
      notice.className = 'photo-undo';
      notice.innerHTML = `<span role="status">${e(fc('photoAdded', {name: added.name}))}</span><button type="button" data-undo-addition>${e(t('mobileSuggest.undo'))}</button><button type="button" data-dismiss-addition aria-label="${e(t('common.close'))}">×</button>`;
      const footer = body.querySelector('.photo-log-actions');
      footer.append(notice);
      notice.querySelector('[data-undo-addition]').onclick = () => {
        const index = rows.findIndex(row => row.additionIndex === lastAddition);
        if (index >= 0) additionDrafts.set(lastAddition, rows.splice(index, 1)[0]);
        lastAddition = undefined;
        review();
      };
      notice.querySelector('[data-dismiss-addition]').onclick = () => { lastAddition = undefined; notice.remove(); };
    }
    body.querySelector('[data-gallery]').onclick = () => menu(fc('chooseAnotherPhoto'),[[t('mobilePhoto.capture'),()=>picker(true)],[t('mobilePhoto.gallery'),()=>picker(false)]]);
    body.querySelector('[name=group]').onchange = event => {group = event.target.value;updateNutrition();};
    body.querySelector('[name=date]').onchange = event => {diaryDate = event.target.value;updateNutrition();};
    body.querySelector('[name=time]').onchange = event => {time = event.target.value;updateNutrition();};
    body.querySelector('[data-dismiss-hint]').onclick=()=>{hintDismissed=true;body.querySelector('.photo-review-hint').hidden=true;};
    updateNutrition();
    body.querySelectorAll('[data-quantity]').forEach(button => button.onclick = () => {const index = Number(button.dataset.quantity);rows[index].foodId ? editQuantity(index) : chooseFood(index);});
    body.querySelectorAll('[data-replace]').forEach(button => button.onclick = () => swapFood(button, Number(button.dataset.replace), rows[Number(button.dataset.replace)]));
    body.querySelectorAll('[data-remove]').forEach(button => button.onclick = () => {rows.splice(Number(button.dataset.remove), 1);review();});
    body.querySelector('[data-add]').onclick = () => chooseFood();
    body.querySelectorAll('[data-addition]').forEach(button => button.onclick = () => {const draft=optionalRow(additions.find(row=>row.additionIndex===Number(button.dataset.addition)));if(draft.foodId){addMatched(draft);review();}else chooseFood(undefined,draft);});
    body.querySelectorAll('[data-optional-replace]').forEach(button=>button.onclick=()=>swapFood(button,undefined,optionalRow(additions.find(row=>row.additionIndex===Number(button.dataset.optionalReplace))),true));
    body.querySelectorAll('[data-optional-quantity]').forEach(button=>button.onclick=()=>{const draft=optionalRow(additions.find(row=>row.additionIndex===Number(button.dataset.optionalQuantity)));draft.foodId?editQuantity(undefined,null,draft,true):chooseFood(undefined,draft,true);});
    for(const suggestion of additions){const row=optionalRow(suggestion);if(row.foodId&&!row.preview)void getItem(row.foodId).then(item=>{if(!alive())return;row.preview=previewPhotoFood(item,row);const label=body.querySelector(`[data-optional-macros="${row.additionIndex}"]`);if(label)label.innerHTML=photoMacros(row.preview);}).catch(()=>{});}
    const saveButton = body.querySelector('[data-save]');saveButton.onclick = async () => {
      const status=body.querySelector('.sheet-message');status.textContent='';
      try{await commit();}catch(error){if(alive()&&status.isConnected)status.textContent=error.message;}
    };
    body.querySelector('[data-create]').onclick=()=>menu(fc('create'),['meal','recipe'].map(kind=>[t('mobileFoods.create.'+kind),()=>{
      createCleanup?.();createCleanup=openPhotoCreate({kind,onSave:commit,onClose:()=>{createCleanup=null;if(alive())body.querySelector('[data-create]')?.focus();}});
    }]));
  }
  async function commit(destination){
    if(pendingSave)return;
    if(rows.some(row=>!itemCache.has(row.foodId)))throw Error(fc('nutritionUnavailable'));
    const payload={photo:{id:analysis.photo.id,dataUrl:analysis.photo.dataUrl},reviewToken:analysis.reviewToken,date:diaryDate,time,group,...(destination?{destination}:{}),rows:rows.map(({foodId,observationIndex,additionIndex,amount,quantity,unit,portionId})=>({foodId,...(observationIndex!==undefined?{observationIndex}:{}),...(additionIndex!==undefined?{additionIndex}:{}),...(quantity!==undefined?{quantity,unit,...(portionId?{portionId}:{})}:{amount})}))};
    if(!destination&&onOptimisticSave){
      const optimisticRows=rows.map(row=>{
        const previewKey=JSON.stringify({foodId:row.foodId,date:diaryDate,time,group,...(row.quantity!==undefined?{quantity:row.quantity,unit:row.unit,...(row.portionId?{portionId:row.portionId}:{})}:{amount:row.amount??1})});
        return {name:row.name,foodId:row.foodId,quantity:row.quantity,unit:row.unit,portionId:row.portionId,food:itemCache.get(row.foodId)?.resource,amount:row.amount,portionLabel:row.portionLabel,preview:nutritionCache.get(previewKey)??row.preview??null};
      });
      pendingSave=true;
      try{await onOptimisticSave({payload,rows:optimisticRows});if(alive()){dispose();close();}}finally{pendingSave=false;}
      return;
    }
    pendingSave=true;const panel=body.firstElementChild;
    const saveBtn=body.querySelector('[data-save]'),saveLabel=saveBtn?.textContent;
    if(saveBtn&&!destination)saveBtn.textContent='Saving…';
    body.querySelectorAll('button,input,select').forEach(element=>element.disabled=true);
    try{
      await save(payload);
      if(alive()&&panel.isConnected){dispose();close();}
      void onChange();
    }finally{pendingSave=false;if(alive()){if(saveBtn&&saveLabel)saveBtn.textContent=saveLabel;body.querySelectorAll('button,input,select').forEach(element=>element.disabled=false);}}
  }

  async function updateNutrition() {
    const version=++nutritionVersion;
    const summary=body.querySelector('.photo-nutrition-summary');if(!summary)return;
    const previews=rows.map(()=>null),jobs=[];
    for(let index=0;index<rows.length;index++){
      const row=rows[index];if(!row.foodId)continue;
      const payload={foodId:row.foodId,date:diaryDate,time,group,...(row.quantity!==undefined?{quantity:row.quantity,unit:row.unit,...(row.portionId?{portionId:row.portionId}:{})}:{amount:row.amount??1})},key=JSON.stringify(payload),label=body.querySelector(`[data-macros="${index}"]`);
      const cached=nutritionCache.get(key)??(row.preview&&!row.previewStale?row.preview:null);
      if(cached&&itemCache.has(row.foodId)){nutritionCache.set(key,cached);previews[index]=cached;if(label)label.innerHTML=photoMacros(cached);}
      else{if(label)label.textContent='Calculating macros…';jobs.push({row,index,payload,key});}
    }
    const current=()=>alive()&&summary.isConnected&&version===nutritionVersion;
    const render=()=>{if(!current())return;summary.innerHTML=photoNutritionSummary(previews);const ready=rows.length&&rows.every((row,index)=>row.foodId&&itemCache.has(row.foodId)&&previews[index]);body.querySelectorAll('[data-save],[data-create]').forEach(button=>button.disabled=!ready);};
    render();
    async function worker(){while(jobs.length&&current()){
      const {index,payload,key}=jobs.shift(),label=body.querySelector(`[data-macros="${index}"]`);
      try{
        const item=await getItem(payload.foodId);
        const result=nutritionCache.get(key)??(await localPreviewDiaryItem(payload))??previewPhotoFood(item,payload);
        if(!current())return;
        nutritionCache.set(key,result);previews[index]=result;rows[index].preview=result;if(label)label.innerHTML=photoMacros(result);render();
      }catch(error){if(current()&&error.name!=='AbortError'&&label){label.textContent=fc("nutritionUnavailable");label.title=error.message;}}
    }}
    await Promise.all(Array.from({length:Math.min(3,jobs.length)},worker));
    if(current()&&previews.some(value=>!value)&&rows.some(row=>row.foodId)){
      const retry=document.createElement('button');retry.type='button';retry.className='more-results';retry.textContent=fc("retryNutrition");retry.onclick=updateNutrition;summary.append(retry);
    }
  }
  function chooseFood(index, draft = rows[index] ?? {}, optional=false) {
    replace(`<div class="photo-food-picker"></div><button type="button" class="more-results" data-back>${e(fc("backToPhoto"))}</button>`);
    body.querySelector('[data-back]').onclick = review;
    const pickerRoot = body.querySelector('.photo-food-picker');
    pickerCleanup = mountFoodPicker(pickerRoot, {allowMeals: false, allowRecipes: false, onPick: async (kind, id) => {
      if (kind !== 'food') return;
      editQuantity(index, id, draft,optional);
    }});
  }
  async function getItem(id){if(itemCache.has(id))return itemCache.get(id);if(!itemLoads.has(id))itemLoads.set(id,(async()=>{const item=(await localLibraryItem({kind:'food',id}))??await request('/api/library/item?'+new URLSearchParams({kind:'food',id}));if(!disposed)itemCache.set(id,item);return item;})().finally(()=>itemLoads.delete(id)));return itemLoads.get(id);}
  function closePortion(){portionDialog?.close();portionDialog?.remove();portionDialog=null;}
  async function editQuantity(index, replacementId = null, row = rows[index] ?? {}, optional=false) {
    const replacing=replacementId!==null;
    if(body.querySelector('.photo-food-picker'))review();
    closePortion();const dialog=document.createElement('dialog');portionDialog=dialog;dialog.className='photo-portion-sheet';dialog.setAttribute('aria-label',row.name??t('mobileFood.amount'));
    dialog.innerHTML=`<p class="empty">${e(t('mobileNutrientDetail.loading'))}</p><button type="button" data-cancel>${e(t('common.cancel'))}</button>`;
    const dismiss=()=>{closePortion();body.querySelector(`[data-quantity="${index}"]`)?.focus();};
    dialog.querySelector('[data-cancel]').onclick=dismiss;
    dialog.oncancel=event=>{event.preventDefault();event.stopPropagation();dismiss();};dialog.onclick=event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dismiss();}};
    document.body.append(dialog);dialog.showModal();
    try {
      const item=await getItem(replacementId??row.foodId);if(!alive()||portionDialog!==dialog)return;
      const preferred=replacing&&row.estimate&&item.options.some(([id])=>id==='g')?{quantity:row.estimate.grams,unit:'g'}:replacing?{amount:1}:row;
      dialog.innerHTML=`<form class="entry-form"><header><h3>${e(item.resource.name)}</h3><span data-photo-favorite>${favoriteButton('food',item.resource.id,false)}</span><button type="button" data-cancel aria-label="${e(t('common.close'))}">×</button></header>${quantityFields(item.options,preferred,t('mobileFood.serving'))}<details class="photo-nutrition-summary" open></details><p role="status" class="sheet-message"></p><footer class="entry-actions"><button type="button" data-cancel>${e(t('common.cancel'))}</button><button class="primary" type="submit">${e(t('common.save'))}</button></footer></form>`;
      const form=dialog.querySelector('form'),status=form.querySelector('[role=status]'),submit=form.querySelector('[type=submit]');form.elements.amount.min='0.000001';
      const favoriteHost=form.querySelector('[data-photo-favorite]');let favorites;favoriteHost.querySelector('button').disabled=true;
      const renderFavorite=()=>{favoriteHost.innerHTML=favoriteButton('food',item.resource.id,favorites.items.some(row=>row.kind==='food'&&row.id===item.resource.id));};
      void request('/api/library/favorites').then(value=>{if(portionDialog!==dialog)return;favorites=value;renderFavorite();}).catch(()=>{});
      favoriteHost.onclick=async event=>{const button=event.target.closest('button');if(!button||button.disabled||!favorites)return;button.disabled=true;const enabled=!favorites.items.some(row=>row.kind==='food'&&row.id===item.resource.id),next={...favorites,items:enabled?[...favorites.items,{kind:'food',id:item.resource.id,name:item.resource.name,serving:item.resource.serving}]:favorites.items.filter(row=>!(row.kind==='food'&&row.id===item.resource.id))};try{await queueCommand(favorites.revision,'favorite.set',{kind:'food',id:item.resource.id,enabled},{projection:{responses:{'/api/library/favorites':next}}});favorites=next;if(portionDialog===dialog)renderFavorite();}catch(error){if(portionDialog===dialog){status.textContent=error.message;button.disabled=false;}}};
      let preview;
      const update=()=>{try{if(!form.elements.amount.value||!form.checkValidity())throw Error(fc('enterAmount'));preview=previewPhotoFood(item,quantityValue(form));form.querySelector('.photo-nutrition-summary').innerHTML=photoNutritionSummary([preview]);status.textContent='';submit.disabled=false;}catch(error){preview=null;status.textContent=error.message;submit.disabled=true;}};
      form.querySelectorAll('[data-cancel]').forEach(button=>button.onclick=dismiss);form.oninput=update;form.onchange=update;update();
      form.onsubmit=event=>{event.preventDefault();if(!preview||!form.reportValidity())return;const {amount,quantity,unit,portionId,preview:oldPreview,...rest}=row;const next={...rest,foodId:item.resource.id,name:item.resource.name,...quantityValue(form),preview,portionLabel:item.resource.portions?.find(p=>p.id===form.elements.unit.value.slice(8))?.label};if(optional)additionDrafts.set(row.additionIndex,next);else if(index===undefined)addMatched(next);else rows[index]=next;closePortion();review();};
    } catch(error){if(alive()&&portionDialog===dialog)dialog.querySelector('.empty').textContent=error.message;}
  }
  start();return {dispose};
}
