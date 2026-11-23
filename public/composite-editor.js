import {guardSheetExit} from './edge-navigation.js';
import {compositeHeader,compositeHelp,compositeNameField} from './composite-source/mobile-composite-header.js';
import {previewLocalLibrary} from './library-local.js';
import {uiLanguage,t} from './app-language.js';
import {fc,foodActionLabel} from './food-cloud-messages.js';
import {LibraryEditorSave} from './library-editor-save.js';

import {escape as e} from './html.js';
import {FoodNutritionView} from './food-entry-source/food-nutrition-view.js';
import {MobileLibrarySheet} from './foods-source/mobile-library.js';
import {openCompositeIngredient,ingredientRow} from './composite-items.js';

/** Source meal stages, with transient edits and the existing canonical meal command. */
export function mountMealEditor({saved,data,draft,selection,show,close,content,date,onSaved,onAction,openEntry}){
 const resource=saved?.resource,values=structuredClone(draft??{name:resource?.name??'',items:resource?.items??[]});
 const views=new WeakMap(values.items.map((row,i)=>[row,(saved?.ingredients)?.[i]]));
 show('<section class="meal-editor"></section>');const root=content.querySelector('.meal-editor'),sheet=content.closest('dialog'),abort=new AbortController();sheet.classList.add('mobile-composite-editor');
 let stage=0,ordering=false,disposed=false,busy=false,saveAdd=false,ready=false,generation=0,previewRequest,footerSize,child,menu,nutrition,error='';
 let help;
 const alive=()=>!disposed&&root.isConnected,read=()=>({...values,...(resource?{id:resource.id}:{})});
 const saver=new LibraryEditorSave({selection,kind:'meal',revision:data.revision,host:()=>root.querySelector('[data-meal-preview]'),onChange:()=>{if(alive())controls();}});
 function cleanupPreview(){++generation;previewRequest?.abort();nutrition?.dispose();nutrition=null;}
 function render(){
  if(!alive())return;saver.clearReview();cleanupPreview();footerSize?.disconnect();ready=false;
  const libraryReview=stage&&!selection;
  const rows=values.items.map((row,i)=>ingredientRow('meal',row,views.get(row),i,values.items.length,ordering)).join('');
  root.innerHTML=`${compositeHeader('meal',!!resource)}<form data-form="meal"><p class="meal-status" role="alert">${e(error)}</p><section class="mce-stage" data-mce-stage="ingredients" ${stage?'hidden':''}>${compositeNameField('meal',values.name)}<div class="mci-list"><h3>${e(t("mobileSuggest.items"))}</h3><div class="composite-items-editor"><div class="composite-items-heading"><button type="button" data-composite-add>${e(fc("addMealItem"))}</button></div>${rows}${values.items.length>1&&!ordering?`<button type="button" class="mce-reorder" data-meal-reorder>${e(fc('reorderItems'))}</button>`:''}</div></div></section><section class="mce-stage mce-review mfe-review" data-mce-stage="review" ${stage?'':'hidden'}><h2>${e(values.name)}</h2><div class="mf-preview" data-meal-preview></div></section><footer class="mce-footer" ${stage?'data-review':'data-first-step'}><div class="mce-navigation"><button type="button" data-meal-back data-mce-back ${stage?'':'hidden'}>${e(t("mobileFoodEditor.back"))}</button><button type="submit" data-meal-next data-mce-next>${ordering?t("mobileExpenditure.done"):stage?fc("saveMeal"):t("mobileFoodEditor.next")}</button></div><button type="submit" data-mce-add ${libraryReview?'':'hidden'}>${e(t("mobileCompositeEditor.saveAdd"))}</button><div class="mce-progress" ${libraryReview&&!resource?'':'hidden'}><span class="${stage?'':'current'}"></span><span class="${stage?'current':''}"></span></div></footer></form>`;
  root.querySelector('input[name=name]').addEventListener('input',event=>{values.name=event.target.value;saver.clearReview();});
  footerSize=new ResizeObserver(()=>{const form=root.querySelector('form');form.style.setProperty('--mce-footer-height',root.querySelector('.mce-footer').getBoundingClientRect().height+'px');form.style.setProperty('--mce-header-height',root.querySelector('.sheet-header').getBoundingClientRect().height+'px');});footerSize.observe(root.querySelector('.mce-footer'));footerSize.observe(root.querySelector('.sheet-header'));
  controls();if(stage&&!saver.locked)void preview();
 }
 function controls(){
  root.querySelector('[data-meal-next]').textContent=ordering?t("mobileExpenditure.done"):stage?fc("saveMeal"):t("mobileFoodEditor.next");root.querySelector('.meal-status').innerHTML=e(error);
  for(const el of root.querySelectorAll('button,input')){if(el.hasAttribute('data-meal-close')){el.disabled=busy;continue;}if(el.hasAttribute('data-meal-next')){el.disabled=busy||stage&&!ready&&!saver.locked;continue;}el.disabled=busy||!!saver.locked||el.hasAttribute('data-mce-add')&&!ready||el.hasAttribute('data-meal-move')&&(Number(el.dataset.mealMove)+(Number(el.dataset.direction))<0||Number(el.dataset.mealMove)+Number(el.dataset.direction)>=values.items.length);}
  root.dataset.mealBusy=String(busy);root.dataset.mealStage=stage?'review':'ingredients';
 }
 async function preview(){
  const current=++generation;previewRequest=new AbortController();const target=root.querySelector('[data-meal-preview]');target.setAttribute('aria-busy','true');
  try{const result=await previewLocalLibrary({kind:'meal',draft:read(),date:date()},previewRequest.signal,selection);if(!alive()||current!==generation)return;nutrition=new FoodNutritionView({target,language:uiLanguage(),unit:data.energyUnit,catalog:data.nutrients});await nutrition.render(result.nutrition,{showHighlights:true,isCurrent:()=>alive()&&current===generation});if(alive()&&current===generation){ready=true;controls();}}
  catch(failure){if(alive()&&current===generation)target.innerHTML='<p role="alert">'+e(failure.message)+`</p><button type="button" data-meal-preview-retry>${e(t("mobileSuggest.retry"))}</button>`;}
  finally{if(alive()&&current===generation)target.removeAttribute('aria-busy');}
 }
 async function save(add){
  if(busy||!ready&&!saver.locked)return;if(!saver.locked)saveAdd=add&&!selection;
  busy=true;error='';controls();
  try{const result=await saver.save(read());if(!result||!alive())return;await onSaved();if(!alive())return;const id=result.item.id,add=saveAdd;dispose();close();if(add)openEntry('meal',id);}
  catch(failure){if(!alive())return;error=failure.message;}
  finally{busy=false;if(alive())controls();}
 }

 function editItem(index){child?.close();child=openCompositeIngredient({selection,date:date(),items:values.items,index,nutrients:data.nutrients,energyUnit:data.energyUnit,onApply:(row,label)=>{if(index===undefined)values.items.push(row);else values.items[index]=row;views.set(row,label);error='';render();},onClose:()=>child=null});}
 function back(){if(help){help.close();return;}if(child){child.back();return;}if(menu){menu.close();return;}if(busy)return;if(stage&&!saver.locked){stage=0;render();}else{dispose();close();}}
 function dispose(){if(disposed)return;disposed=true;help?.close(false);saver.dispose();cleanupPreview();footerSize?.disconnect();abort.abort();child?.close();menu?.close(false);observer.disconnect();sheet.classList.remove('mobile-composite-editor');}
 root.addEventListener('submit',event=>{event.preventDefault();if(busy)return;if(ordering){ordering=false;render();return;}if(stage)void save(event.submitter?.hasAttribute('data-mce-add'));else{if(!values.items.length){error=fc("addMealItemRequired");render();return;}error='';stage=1;render();}},{signal:abort.signal});
 root.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-meal-close')){if(!busy){dispose();close();}return;}
  if(busy||saver.locked)return;if(b.hasAttribute('data-mce-help')){help=compositeHelp('meal',()=>help=null);return;}
  if(b.hasAttribute('data-meal-back'))return back();if(b.hasAttribute('data-meal-preview-retry')){cleanupPreview();void preview();return;}
  if(b.hasAttribute('data-composite-add'))return editItem();
  if(b.dataset.mealItem!==undefined)return editItem(Number(b.dataset.mealItem));
  if(b.dataset.mealRemove!==undefined){values.items.splice(Number(b.dataset.mealRemove),1);render();return;}
  if(b.dataset.mealMove!==undefined){const index=Number(b.dataset.mealMove),next=index+Number(b.dataset.direction);if(next>=0&&next<values.items.length){[values.items[index],values.items[next]]=[values.items[next],values.items[index]];render();}return;}
  if(b.hasAttribute('data-meal-reorder')){ordering=true;render();return;}
  if(b.hasAttribute('data-meal-menu'))menu=new MobileLibrarySheet({actionRows:true,label:t("mobileSuggest.mealOptions"),onClose:()=>menu=null,items:[{id:'delete',label:foodActionLabel('delete'),icon:'<img src="/repeat-source/delete.svg" alt="">'}],onChoose:id=>onAction?.(id)});
 },{signal:abort.signal});
 guardSheetExit(root,()=>busy,abort.signal);
 const cancel=event=>{if(!alive()||event.type==='cancel'&&event.target!==sheet)return;event.preventDefault();event.stopImmediatePropagation();back();};sheet.addEventListener('cancel',cancel,{capture:true,signal:abort.signal});window.addEventListener('nourishing-back',cancel,{capture:true,signal:abort.signal});
 const observer=new MutationObserver(()=>{if(!root.isConnected)dispose();});observer.observe(content,{childList:true});
 render();return {element:root,dispose};
}
