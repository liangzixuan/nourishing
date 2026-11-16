import {uiLanguage,t} from './app-language.js';
import {fc,foodActionLabel,foodQuantityUnit} from './food-cloud-messages.js';
import {LibraryEditorSave} from './library-editor-save.js';
import {request} from './diary-api.js';
import {escape as e} from './html.js';
import {FoodNutritionView} from './food-entry-source/food-nutrition-view.js';
import {MobileLibrarySheet} from './foods-source/mobile-library.js';
import {openCompositeIngredient} from './composite-items.js';
const identity=row=>(row.recipeId?'recipe:':'food:')+(row.recipeId??row.foodId);

/** Source meal stages, with transient edits and the existing canonical meal command. */
export function mountMealEditor({saved,data,draft,show,close,content,date,onSaved,onAction,onReload,openEntry}){
 const resource=saved?.resource,values=structuredClone(draft??{name:resource?.name??'',items:resource?.items??[]}),names=new Map((saved?.ingredients??[]).map(row=>[identity(row),{name:row.name,source:row.options?(row.source?.name??(row.recipeId?t("recipeEditor.recipe"):t("mobileSearch.food"))):'',options:row.options}]));
 show('<section class="meal-editor"></section>');const root=content.querySelector('.meal-editor'),sheet=content.closest('dialog'),abort=new AbortController();sheet.classList.add('mobile-composite-editor');
 let stage=0,ordering=false,disposed=false,busy=false,saveAdd=false,ready=false,generation=0,previewRequest,footerSize,child,actionChild,menu,nutrition,conflict=false,error='';
 const alive=()=>!disposed&&root.isConnected,read=()=>({...values,...(resource?{id:resource.id}:{})});
 const saver=new LibraryEditorSave({kind:'meal',revision:data.revision,host:()=>root.querySelector('[data-meal-preview]'),onChange:()=>{if(alive())controls();}});
 function cleanupPreview(){++generation;previewRequest?.abort();nutrition?.dispose();nutrition=null;}
 function render(){
  if(!alive())return;saver.clearReview();cleanupPreview();footerSize?.disconnect();ready=false;
  const rows=values.items.map((row,index)=>{const label=names.get(identity(row)),unit=row.unit==='portion'?label?.options?.find(([id])=>id==='portion:'+row.portionId)?.[1]??foodQuantityUnit('portion'):foodQuantityUnit(row.unit??'servings');return `<div class="composite-item-row"><button type="button" data-meal-item="${index}" data-mci-edit><span class="mci-item-name">${e(label?.name??fc("mealItem"))}</span><span class="mci-item-quantity">${e(row.quantity??row.amount)} ${e(unit)}</span><span class="mci-item-source">${e(label?.source??'')}</span></button><button type="button" data-meal-remove="${index}" data-composite-remove aria-label="${e(fc('removeItem',{number:index+1}))}">×</button>${ordering?`<div class="composite-reorder"><button type="button" data-meal-move="${index}" data-direction="-1" aria-label="${e(fc('moveItemUp',{number:index+1}))}" ${index===0?'disabled':''}>↑</button><button type="button" data-meal-move="${index}" data-direction="1" aria-label="${e(fc('moveItemDown',{number:index+1}))}" ${index===values.items.length-1?'disabled':''}>↓</button></div>`:''}</div>`;}).join('');
  root.innerHTML=`<header class="sheet-header"><button type="button" class="icon-button" data-meal-close aria-label="${e(t("common.close"))}">×</button><h2>${e(fc(resource?'editMeal':'createMeal'))}</h2><button type="button" data-meal-menu aria-label="${e(t("mobileSuggest.mealOptions"))}">⋮</button></header><form data-form="meal"><p class="meal-status" role="alert">${e(error)}${conflict?`<button type="button" data-meal-reload>${e(fc("reloadLatest"))}</button>`:''}</p><section class="mce-stage" data-mce-stage="ingredients" ${stage?'hidden':''}><label class="mce-name"><span>${e(fc("mealName"))}</span><input name="name" aria-label="${e(fc("mealName"))}" value="${e(values.name)}" required maxlength="300"></label><div class="mci-list"><h3>${e(t("mobileSuggest.items"))}</h3><div class="composite-items-editor">${rows}<div class="composite-items-heading"><button type="button" data-composite-add>${e(fc("addMealItem"))}</button></div></div></div></section><section class="mce-stage mce-review mfe-review" data-mce-stage="review" ${stage?'':'hidden'}><h2>${e(values.name)}</h2><div class="mf-preview" data-meal-preview></div></section><footer class="mce-footer" ${stage?'data-review':'data-first-step'}><div class="mce-navigation"><button type="button" data-meal-back data-mce-back ${stage?'':'hidden'}>${e(t("mobileFoodEditor.back"))}</button><button type="submit" data-meal-next data-mce-next>${saver.locked?t("mobileSuggest.retry"):ordering?t("mobileExpenditure.done"):stage?fc("saveMeal"):t("mobileFoodEditor.next")}</button></div><button type="submit" data-mce-add ${stage?'':'hidden'}>${e(fc("saveAdd"))}</button><div class="mce-progress" ${stage?'':'hidden'}><span class="${stage?'':'current'}"></span><span class="${stage?'current':''}"></span></div></footer></form>`;
  root.querySelector('input[name=name]').addEventListener('input',event=>{values.name=event.target.value;saver.clearReview();});
  footerSize=new ResizeObserver(()=>{const form=root.querySelector('form');form.style.setProperty('--mce-footer-height',root.querySelector('.mce-footer').getBoundingClientRect().height+'px');form.style.setProperty('--mce-header-height',root.querySelector('.sheet-header').getBoundingClientRect().height+'px');});footerSize.observe(root.querySelector('.mce-footer'));footerSize.observe(root.querySelector('.sheet-header'));
  controls();if(stage&&!saver.locked&&!conflict)void preview();
 }
 function controls(){
  root.querySelector('[data-meal-next]').textContent=saver.locked?t("mobileSuggest.retry"):ordering?t("mobileExpenditure.done"):stage?fc("saveMeal"):t("mobileFoodEditor.next");root.querySelector('.meal-status').innerHTML=e(error)+(conflict?`<button type="button" data-meal-reload>${e(fc("reloadLatest"))}</button>`:'');
  for(const el of root.querySelectorAll('button,input')){if(el.hasAttribute('data-meal-close')){el.disabled=busy;continue;}if(el.hasAttribute('data-meal-next')){el.disabled=busy||conflict||stage&&!ready&&!saver.locked;continue;}if(el.hasAttribute('data-meal-reload')){el.disabled=busy;continue;}el.disabled=busy||!!saver.locked||conflict||el.hasAttribute('data-mce-add')&&!ready||el.hasAttribute('data-meal-move')&&(Number(el.dataset.mealMove)+(Number(el.dataset.direction))<0||Number(el.dataset.mealMove)+Number(el.dataset.direction)>=values.items.length);}
  root.dataset.mealBusy=String(busy);root.dataset.mealStage=stage?'review':'ingredients';
 }
 async function preview(){
  const current=++generation;previewRequest=new AbortController();const target=root.querySelector('[data-meal-preview]');target.setAttribute('aria-busy','true');
  try{const result=await request('/api/library/preview',{kind:'meal',draft:read(),date:date()},previewRequest.signal);if(!alive()||current!==generation)return;nutrition=new FoodNutritionView({target,language:uiLanguage(),unit:data.energyUnit,catalog:data.nutrients});await nutrition.render(result.nutrition,{showHighlights:true,isCurrent:()=>alive()&&current===generation});if(alive()&&current===generation){ready=true;controls();}}
  catch(failure){if(alive()&&current===generation)target.innerHTML='<p role="alert">'+e(failure.message)+`</p><button type="button" data-meal-preview-retry>${e(t("mobileSuggest.retry"))}</button>`;}
  finally{if(alive()&&current===generation)target.removeAttribute('aria-busy');}
 }
 async function save(add){
  if(busy||conflict||!ready&&!saver.locked)return;if(!saver.locked)saveAdd=add;
  busy=true;error='';controls();
  try{const result=await saver.save(read());if(!result||!alive())return;await onSaved();if(!alive())return;const id=result.item.id,add=saveAdd;dispose();close();if(add)openEntry('meal',id);}
  catch(failure){if(!alive())return;error=failure.message;conflict=failure.status===409;}
  finally{busy=false;if(alive())controls();}
 }

 function editItem(index){child?.close();child=openCompositeIngredient({date:date(),items:values.items,index,nutrients:data.nutrients,energyUnit:data.energyUnit,onApply:(row,label)=>{if(index===undefined)values.items.push(row);else values.items[index]=row;names.set(identity(row),label);error='';render();},onClose:()=>child=null});}
 function back(){if(actionChild?.back())return;if(child){child.back();return;}if(menu){menu.close();return;}if(busy)return;if(stage&&!saver.locked&&!conflict){stage=0;render();}else{dispose();close();}}
 function dispose(){if(disposed)return;disposed=true;actionChild?.dispose();saver.dispose();cleanupPreview();footerSize?.disconnect();abort.abort();child?.close();menu?.close(false);observer.disconnect();sheet.classList.remove('mobile-composite-editor');}
 root.addEventListener('submit',event=>{event.preventDefault();if(busy)return;if(ordering){ordering=false;render();return;}if(stage)void save(event.submitter?.hasAttribute('data-mce-add'));else{if(!values.items.length){error=fc("addMealItemRequired");render();return;}error='';stage=1;render();}},{signal:abort.signal});
 root.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-meal-close')){if(!busy){dispose();close();}return;}if(b.hasAttribute('data-meal-reload'))return onReload();
  if(busy||saver.locked||conflict)return;
  if(b.hasAttribute('data-meal-back'))return back();if(b.hasAttribute('data-meal-preview-retry')){cleanupPreview();void preview();return;}
  if(b.hasAttribute('data-composite-add'))return editItem();
  if(b.dataset.mealItem!==undefined)return editItem(Number(b.dataset.mealItem));
  if(b.dataset.mealRemove!==undefined){values.items.splice(Number(b.dataset.mealRemove),1);render();return;}
  if(b.dataset.mealMove!==undefined){const index=Number(b.dataset.mealMove),next=index+Number(b.dataset.direction);if(next>=0&&next<values.items.length){[values.items[index],values.items[next]]=[values.items[next],values.items[index]];render();}return;}
  if(b.hasAttribute('data-meal-menu'))menu=new MobileLibrarySheet({label:t("mobileSuggest.mealOptions"),onClose:()=>menu=null,items:[{id:'reorder',label:fc("reorderItems")},...(resource?['share',resource.retired?'restore':'retire','log','delete'].map(id=>({id,label:foodActionLabel(id)})):[])],onChoose:id=>{menu=null;if(id==='reorder'){stage=0;ordering=true;render();}else actionChild=onAction?.(id,read());}});
 },{signal:abort.signal});
 const cancel=event=>{if(!alive())return;event.preventDefault();event.stopImmediatePropagation();back();};sheet.addEventListener('cancel',cancel,{capture:true,signal:abort.signal});window.addEventListener('nourishing-back',cancel,{capture:true,signal:abort.signal});
 const observer=new MutationObserver(()=>{if(!root.isConnected)dispose();});observer.observe(content,{childList:true});
 render();return {element:root,dispose};
}
