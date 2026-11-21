import {uiLanguage,t} from './app-language.js';
import {fc,foodQuantityUnit} from './food-cloud-messages.js';
import {request,queueCommand} from './diary-api.js';
import {localEntryAdjustment,localPreviewEntryAdjustment} from './local-adjustments.js';
import {localLibraryItem} from './local-engine.js';
import {escape as e} from './html.js';
import {quantityFields,quantityValue} from './quantity.js';
import {mountFoodPicker} from './food-picker.js';
import {readWriteCopy} from './offline-store.js';
import {readDeviceCache} from './device-cache.js';
import {mountFoodEntry} from './food-entry.js';
import {mealActionText} from './meal-action-messages.js';
import {convertEnergy} from './dashboard-source/energy-units.mjs';
import {icon} from './foods-source/icons.js';

export function openEntryAdjustment({kind,date,id,show,close,header,content,onSave,onBack,revision:initialRevision}){
 let view,draft,rows=[],serial=0,timer,pickerCleanup,disposed=false,revision=initialRevision;
 const owner=readDeviceCache('/api/diary').then(value=>value.ticket);
 let notice;
 const current=()=>!disposed&&content.isConnected;
 const num=value=>Number.isFinite(value)?new Intl.NumberFormat(uiLanguage(),{maximumFractionDigits:1}).format(value):'—';
 const payload=()=>({kind,date,id,sourceRevision:view.sourceRevision,items:draft.items,...(kind==='recipe'?{basis:draft.basis}:{})});
 const status=(form,message)=>{const element=form.querySelector('[role=status]');if(element?.isConnected)element.textContent=message;};
 const sheet=content.closest('dialog'),events=new AbortController();
 const backToMeal=event=>{
  if(!notice&&kind==='meal'&&content.querySelector('.mf-form,.adjustment-picker')){
   if(content.querySelector('.mf-menu[open]')){
    if(event.type==='nourishing-back'){event.preventDefault();event.stopImmediatePropagation();content.querySelector('[data-mf-dismiss]').click();}
    return;
   }
   event.preventDefault();event.stopImmediatePropagation();editor();
  }
 };
 sheet.addEventListener('cancel',backToMeal,{capture:true,signal:events.signal});
 window.addEventListener('nourishing-back',backToMeal,{capture:true,signal:events.signal});
 sheet.addEventListener('close',()=>{if(!sheet.open)dispose();},{signal:events.signal});
 function dispose(){disposed=true;serial++;clearTimeout(timer);events.abort();notice?.close();pickerCleanup?.();}
 function confirmMeal(){
  const dialog=notice=document.createElement('dialog');dialog.className='adjustment-confirm';dialog.setAttribute('aria-labelledby','meal-adjustment-title');
  dialog.innerHTML=`<h2 id="meal-adjustment-title">${e(fc('saveMealNotice'))}</h2><p>${e(fc('mealAdjustmentScope'))}</p><label><input type="checkbox"> ${e(fc('hideMealNotice'))}</label><footer><button type="button" data-cancel>${e(t('fastingHistory.cancel'))}</button><button type="button" data-confirm>OK</button></footer>`;
  const back=event=>{event.preventDefault();event.stopImmediatePropagation();dialog.close();};
  return new Promise(resolve=>{
   dialog.addEventListener('close',()=>{window.removeEventListener('nourishing-back',back,true);const hide=dialog.querySelector('input').checked;dialog.remove();notice=null;resolve(dialog.returnValue==='save'?{hide}:null);},{once:true});
   dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
   dialog.querySelector('[data-confirm]').onclick=()=>dialog.close('save');
   dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
   document.body.append(dialog);dialog.showModal();window.addEventListener('nourishing-back',back,true);
  });
 }
 async function load(){
  const token=++serial;show(header(fc("adjustIngredientsLower"))+`<p class="empty">${e(t("mobileNutrientDetail.loading"))}</p>`);const loading=content.querySelector('.empty');
  try{const result=await localEntryAdjustment({kind,date,id})??await request('/api/diary/ingredients?'+new URLSearchParams({kind,date,id}));if(!current()||token!==serial||!loading.isConnected)return;view=result;revision=result.revision??initialRevision;draft={items:structuredClone(result.items),...(kind==='recipe'?{basis:structuredClone(result.basis)}:{})};rows=result.rows;editor();}
  catch(error){if(current()&&loading.isConnected)loading.textContent=error.message;}
 }
 function basisFields(){
  if(kind!=='recipe')return '';
  const field=(name,label,value)=>`<label class="field-row"><span>${label}</span><input type="number" name="${name}" aria-label="${label}" min="0.000001" step="any" value="${e(value??'')}"></label>`;
  return `<details class="adjustment-basis"><summary>${e(fc("recipeYieldPortions"))}</summary>${field('servings',t("multiAdd.servings"),draft.basis.servings)}${field('cookedWeightGrams',fc("cookedWeight"),draft.basis.cookedWeightGrams)}${field('batchVolumeMl',fc("batchVolume"),draft.basis.batchVolumeMl)}${draft.basis.portions.map((portion,index)=>field('portion-'+index,`${e(portion.label)} (${portion.basis==='batch'?fc('perBatch'):portion.basis==='weight'?'g':'mL'})`,portion[portion.basis==='batch'?'portionsPerBatch':portion.basis==='weight'?'grams':'milliliters'])).join('')}</details>`;
 }
 function readBasis(form){
  if(kind!=='recipe')return;
  for(const key of ['servings','cookedWeightGrams','batchVolumeMl'])draft.basis[key]=form.elements[key].value===''?null:Number(form.elements[key].value);
  draft.basis.portions.forEach((portion,index)=>{const field=portion.basis==='batch'?'portionsPerBatch':portion.basis==='weight'?'grams':'milliliters';portion[field]=Number(form.elements['portion-'+index].value);});
 }
 function itemLabel(item,row){
  const unit=item.unit==='portion'?(row?.options?.find(option=>option[0]==='portion:'+item.portionId)?.[1]??row?.portions?.find(portion=>portion.id===item.portionId)?.label??foodQuantityUnit('portion')):foodQuantityUnit(item.unit??'servings');
  return (item.quantity??item.amount)+' '+unit;
 }
 function ingredientRows(){
  return draft.items.map((item,index)=>{
   const row=rows[index],label=row?.name??fc('ingredient');
   const controls=`<button type="button" class="icon-button" data-replace="${index}" aria-label="${e(fc('replaceIngredientNumber',{number:index+1}))}">↻</button><button type="button" class="icon-button" data-remove="${index}" aria-label="${e(fc('removeIngredient',{number:index+1}))}">×</button>`;
   const meal=kind==='meal';
   const ingredientIcon=item.recipeId?icon('food'):'<span aria-hidden="true" class="adjustment-food-icon"></span>';
   return `<li><button type="button" data-edit="${index}">${meal?ingredientIcon:''}<strong>${e(label)}</strong><small>${e(itemLabel(item,row))}</small>${meal?'<span data-item-energy></span>':''}</button>${meal?`<details class="adjustment-item-actions"><summary aria-label="${e(t('mobileFood.options')+' · '+label)}">⋮</summary>${controls}</details>`:controls}</li>`;
  }).join('');
 }
 function editor(){
  pickerCleanup?.();pickerCleanup=null;serial++;clearTimeout(timer);
  const meal=kind==='meal',title=meal?mealActionText('adjust'):fc('adjustIngredientsLower');
  const addLabel=meal?t('recipeEditor.addItem'):fc('addIngredientLower');
  const saveLabel=meal?t('mobileFood.save'):t('progress.saveChanges');
  const heading=meal?`<div class="adjustment-meal-name">${icon('food')}<strong>${e(view.name)}</strong><span data-total-energy></span></div>`:`<p class="adjustment-scope">${e(fc('entryOnly'))}</p>`;
  const addButton=`<button type="button" class="more-results" data-add>${e(addLabel)}</button>`;
  show(`${header(title)}<form class="entry-form entry-adjustment ${meal?'meal-adjustment':''}">${heading}<ul class="adjustment-items">${ingredientRows()}</ul>${meal?'':addButton+basisFields()+'<div class="nutrition-preview" aria-live="polite"></div>'}<p class="sheet-message" role="status"></p><footer class="entry-actions">${meal?addButton:`<button type="button" data-back>${e(t('mobileFoodEditor.back'))}</button>`}<button type="submit" class="primary" disabled>${e(saveLabel)}</button></footer></form>`);
  const form=content.querySelector('form'),save=form.querySelector('[type=submit]');let ready=false;
  const preview=()=>{
   ready=false;save.disabled=true;clearTimeout(timer);const token=++serial,summary=form.querySelector('.nutrition-preview');
   if(summary)summary.textContent='…';status(form,'');
   timer=setTimeout(async()=>{
    try{
     const result=await localPreviewEntryAdjustment(payload())??await request('/api/diary/ingredients/preview',payload());
     if(!current()||!form.isConnected||token!==serial)return;
     const n=result.after.values;
     if(meal){
      const unit=view.energyUnit??'kcal',energy=value=>num(convertEnergy(value??null,'kcal',unit))+' '+unit;
      form.querySelector('[data-total-energy]').textContent=energy(n.calories);
      form.querySelectorAll('[data-item-energy]').forEach((node,index)=>node.textContent=energy(result.ingredientCalories?.[index]));
     }else summary.innerHTML=`<strong>${num(n.calories)} kcal</strong><p>${num(n.protein)} g ${e(t('mobileNutrientTargets.group.protein'))} · ${num(n.carbs)} g ${e(t('energyChart.component.carbohydrate'))} · ${num(n.fat)} g ${e(t('mobileDiary.fat'))}</p>`;
     ready=true;save.disabled=false;
    }catch(error){if(form.isConnected&&token===serial){if(summary)summary.textContent='';status(form,error.message);if(error.status===409)reloadButton(form);}}
   },150);
  };
  form.oninput=()=>{readBasis(form);preview();};
  if(!meal)form.querySelector('[data-back]').onclick=()=>{dispose();onBack?onBack():close();};
  form.querySelector('[data-add]').onclick=()=>{readBasis(form);pick();};
  form.querySelector('ul').onclick=event=>{const remove=event.target.closest('[data-remove]'),edit=event.target.closest('[data-edit]'),replace=event.target.closest('[data-replace]');readBasis(form);if(remove){const index=Number(remove.dataset.remove);draft.items.splice(index,1);rows.splice(index,1);editor();}else if(edit){const index=Number(edit.dataset.edit);quantity(index,rows[index]);}else if(replace)pick(Number(replace.dataset.replace));};
  form.onsubmit=async event=>{event.preventDefault();if(!ready)return;readBasis(form);form.querySelectorAll('button,input,select').forEach(element=>element.disabled=true);status(form,'');
   try{
    const ticket=await owner,account=kind==='meal'?await readWriteCopy():null;
    if(!current()||!form.isConnected)return;
    let choice;
    if(kind==='meal'&&!(account?.ownerId===ticket?.ownerId&&account?.hideMealAdjustmentNotice)){
     choice=await confirmMeal();if(!choice||!current()||!form.isConnected)return;
    }
    await queueCommand(revision,'entry.ingredients.adjust',payload(),{ticket,projection:choice?.hide?{hideMealAdjustmentNotice:true}:{}});
    dispose();if(form.isConnected)close();void onSave?.();
   }
   catch(error){if(form.isConnected){status(form,error.message);if(error.status===409)reloadButton(form);}}
   finally{if(form.isConnected)form.querySelectorAll('button,input,select').forEach(element=>element.disabled=false);}
  };preview();
 }
 function reloadButton(form){if(form.querySelector('[data-reload]'))return;const button=document.createElement('button');button.type='button';button.className='more-results';button.dataset.reload='';button.textContent=fc("reloadLatest");button.onclick=load;form.querySelector('[role=status]').append(button);}
 function pick(index){
  serial++;clearTimeout(timer);show(`${header(index===undefined?fc("addIngredientLower"):fc("replaceIngredient"))}<div class="adjustment-picker"></div><button type="button" class="more-results" data-back>${e(t("mobileFoodEditor.back"))}</button>`);
  content.querySelector('[data-back]').onclick=editor;
  pickerCleanup=mountFoodPicker(content.querySelector('.adjustment-picker'),{allowMeals:false,excludeRecipe:kind==='recipe'?view.recipeId:null,onPick:async(pickedKind,pickedId)=>{
   pickerCleanup?.();const token=++serial;show(header(fc("ingredient"))+`<p class="empty">${e(t("mobileNutrientDetail.loading"))}</p>`);const loading=content.querySelector('.empty');
   try{const found=await localLibraryItem({kind:pickedKind,id:pickedId})??await request('/api/library/item?'+new URLSearchParams({kind:pickedKind,id:pickedId}));if(!current()||token!==serial||!loading.isConnected)return;quantity(index,{kind:pickedKind,id:pickedId,name:found.resource.name,options:found.options,item:found},true);}
   catch(error){if(loading.isConnected){editor();status(content.querySelector('form'),error.message);}}
  }});
 }
 async function quantity(index,row,replaced=false){
  const token=++serial;clearTimeout(timer);
  if(!row.options||kind==='meal'&&!row.item){show(header(row.name)+`<p class="empty">${e(t("mobileNutrientDetail.loading"))}</p>`);const loading=content.querySelector('.empty');try{const result=await localLibraryItem({kind:row.kind,id:row.id})??await request('/api/library/item?'+new URLSearchParams({kind:row.kind,id:row.id}));if(!current()||token!==serial||!loading.isConnected)return;row={...row,options:result.options,item:result};}catch(error){if(loading.isConnected){editor();status(content.querySelector('form'),error.message);}return;}}
  const item=replaced?{}:draft.items[index];
  const apply=value=>{
   if(index===undefined){draft.items.push(value);rows.push(row);}else{draft.items[index]=value;rows[index]=row;}
   editor();
  };
  if(kind==='meal'){
   pickerCleanup=mountFoodEntry({item:row.item,quantity:item,date,group:view.group,groups:[view.group],revision:()=>revision,show,close:editor,content,
    ingredientOnly:true,submitLabel:t('mobileFood.save'),onBack:editor,onChange:async()=>{},
    onApply:({date,time,group,...value})=>apply(value)});
   return;
  }
  show(`${header(row.name)}<form class="entry-form">${quantityFields(row.options,item)}<footer class="entry-actions"><button type="button" data-back>${e(t("mobileFoodEditor.back"))}</button><button type="submit" class="primary">${e(fc("useIngredient"))}</button></footer></form>`);
  const form=content.querySelector('form');form.querySelector('[data-back]').onclick=editor;form.onsubmit=event=>{event.preventDefault();apply({[row.kind+'Id']:row.id,...quantityValue(form)});};
 }
 load();return {dispose};
}
