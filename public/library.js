import {uiLanguage,t} from './app-language.js';
import {pushBackHandler} from './back-history.js';
import {fc,foodActionLabel} from './food-cloud-messages.js';
import {mountRecipeEditor} from './recipe-editor.js';
import {mountMealEditor} from './composite-editor.js';
import {mountCustomFoodEditor} from './custom-food-editor.js';
import {openLibrarySharing} from './library-sharing.js';
import {openFoodPrint} from './library-print.js';
import {openFavorites,setFavorite} from './library-extras.js';
import {LibraryRetirement} from './library-tools.js';
import {request,command} from './diary-api.js';
import {escape as e} from './html.js';
import {mobileFoodsHeader,mobileFoodsHome} from './foods-source/mobile-foods-home.js';
import {mobileLibraryHeader,mobileLibraryCollection,MobileLibrarySheet,MobileLibraryActions} from './foods-source/mobile-library.js';
import {icon} from './foods-source/icons.js';
import {localLibraryItem,localLibraryView} from './local-engine.js';
import {mealActionText} from './meal-action-messages.js';
const labels=()=>({food:t("mobileSearch.food"),recipe:t("recipeEditor.recipe"),meal:fc("meal")});
export function mountLibrary({page,show,close,header,content,date,openEntry,onChange,headerRoot}){
 let data,kind='food',screen='home',sort='recent',retired=false,query='',disposed=false,serial=0,extrasCleanup,optionsSheet,foodEditor,mealEditor,recipeEditor,collectionBack=null;
 const leaveCollection=({popHistory=true}={})=>{screen='home';query='';if(collectionBack){const handle=collectionBack;collectionBack=null;handle.release({popHistory});}render();};
 const alive=id=>!disposed&&id===serial;
 async function reload(){
  const id=++serial,apply=value=>{if(alive(id)){data=value;render();}};
  const local=await localLibraryView();if(local){apply(local);return;}
  try{apply(await request('/api/library',undefined,undefined,{onRefresh:async value=>{if(!document.querySelector('dialog[open]'))apply(await localLibraryView()??value);}}));}
  catch(error){if(alive(id))page.innerHTML=`<p class="empty">${e(error.message)}</p><button type="button" data-library-retry>${e(t("mobileSuggest.retry"))}</button>`;}
 }

 function renderHeader(markup){if(headerRoot){headerRoot.hidden=false;headerRoot.innerHTML=markup;return '';}return `<header class="library-inline-header">${markup}</header>`;}
 function collectionMarkup(){return mobileLibraryCollection({items:data.items.filter(item=>item.kind===kind&&item.retired===retired&&item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())),tab:kind+'s',query,sort,retired,language:uiLanguage(),icon});}
 function bindCollection(){
  page.querySelector('#library-search').setAttribute('aria-label',fc("searchLibrary"));
  page.querySelector('#library-search').oninput=event=>{query=event.target.value;renderItems();};
  page.querySelectorAll('.ml-row').forEach(button=>button.dataset.libraryItem=button.dataset.id);
 }
 function render(){
  document.body.classList.toggle('foods-home-mobile',screen==='home');document.body.classList.toggle('mobile-library',screen==='collection');
  if(screen==='home'){
   page.innerHTML=`<section class="library-page">${renderHeader(mobileFoodsHeader(uiLanguage(),icon))}${mobileFoodsHome(uiLanguage(),icon)}</section>`;
   page.querySelector('[data-action="recipe-import"]').disabled=!data;
   page.querySelector('[data-view="repeats"]').setAttribute('data-library-repeats','');
   page.querySelectorAll('[data-action="foods-insight"]').forEach(button=>button.dataset.foodInsight=button.dataset.section==='suggest'?'suggestions':'oracle');
   page.querySelectorAll('[data-action^="new-"]').forEach(button=>button.disabled=!data);
  }else{
   page.innerHTML=`<section class="library-page">${renderHeader(mobileLibraryHeader({tab:kind+'s',language:uiLanguage(),icon}))}${data?collectionMarkup():`<p class="empty">${e(t("mobileNutrientDetail.loading"))}</p>`}</section>`;
   if(data)bindCollection();
  }
 }
 function renderItems(){const fragment=document.createElement('template');fragment.innerHTML=collectionMarkup();for(const selector of ['.ml-list','.ml-tools'])page.querySelector(selector).replaceWith(fragment.content.querySelector(selector));bindCollection();}
 const retirement=new LibraryRetirement({onChange:async()=>{await onChange();await reload();}});
 function retireItem(item){return retirement.open({kind:item.kind,id:item.id,onCommitted:({retired})=>{if(retired)item.retired=true;else delete item.retired;}});}
 function retireEditor(itemKind,resource){const button=content.querySelector('[data-library-retire]');return retirement.open({kind:itemKind,id:resource.id,origin:button??content.querySelector('[data-recipe-menu],[data-meal-menu]')??document.activeElement,onCommitted:({retired})=>{if(retired)resource.retired=true;else delete resource.retired;if(button?.isConnected){button.dataset.foodAction=retired?'restore':'retire';button.textContent=foodActionLabel(button.dataset.foodAction);}}});}
 function utilities(action){extrasCleanup?.();const options={show,header,content,close,date,openEntry,onChange:async()=>{await onChange();await reload();}};if(action==='favorites')extrasCleanup=openFavorites(options);if(action==='label')editor('food',null,undefined,{focusNutrition:true});if(action==='import')extrasCleanup=openLibrarySharing(options);}
 function libraryOptions(){optionsSheet?.close(false);optionsSheet=new MobileLibrarySheet({label:t("mobileLibrary.options"),items:[{id:'recent',label:t("mobileLibrary.recent"),selected:sort==='recent'},{id:'alphabetical',label:t("mobileLibrary.alphabetical"),selected:sort==='alphabetical'},{id:'retired',label:retired?fc("showActive"):fc("showRetired")},{id:'favorites',label:t("mobileSearch.favorites")},...(kind==='food'?[{id:'label',label:fc("nutritionLabel")}]:[]),{id:'import',label:fc("importShared")}],onChoose:choice=>{if(disposed)return;if(['recent','alphabetical'].includes(choice)){sort=choice;renderItems();}else if(choice==='retired'){retired=!retired;renderItems();}else utilities(choice);}});}
 function itemActions(tab,id){const item=data?.items.find(item=>item.kind+'s'===tab&&item.id===id);if(!item)return;optionsSheet?.close(false);optionsSheet=new MobileLibrarySheet({label:item.name,items:[{id:'edit',label:t("mobileNutrientTargets.edit")},...(!item.retired?[{id:'log',label:foodActionLabel('log')},{id:'favorite',label:item.favorite?fc("removeFavorite"):fc("addFavorite")}]:[]),{id:'share',label:foodActionLabel('share')},{id:'retirement',label:foodActionLabel(item.retired?'restore':'retire')}],onChoose:async choice=>{if(disposed)return;if(choice==='retirement')return retireItem(item);if(choice==='edit')return openItem(item.kind,id);if(choice==='log')return openEntry(item.kind,id);if(choice==='share'){extrasCleanup?.();extrasCleanup=openLibrarySharing({kind:item.kind,id,show,header,content,close,onChange});return;}if(choice==='favorite')try{await setFavorite({kind:item.kind,id,enabled:!item.favorite,revision:data.revision,onChange:async()=>{await onChange();await reload();}});}catch(error){if(!disposed){const status=document.createElement('p');status.className='sheet-message';status.setAttribute('role','status');status.textContent=error.message;page.append(status);}}}});}
 async function select(event){
  const b=event.target.closest('button');if(!b)return;
  const action=b.dataset.action;
  if(action==='food-tab'){event.stopPropagation();kind=b.dataset.tab.slice(0,-1);screen='collection';query='';retired=false;if(!collectionBack)collectionBack=pushBackHandler(()=>{if(disposed||screen!=='collection')return;collectionBack=null;screen='home';query='';render();});render();return;}
  if(action==='foods-home'){event.stopPropagation();leaveCollection();return;}
  if(action?.startsWith('new-')&&labels()[action.slice(4)]){event.stopPropagation();if(data)editor(action.slice(4),null);return;}
  if(action==='recipe-import'){event.stopPropagation();if(data)editor('recipe',null,undefined,{initialImport:true});return;}
  if(action==='library-options'){event.stopPropagation();libraryOptions();return;}
  if(b.dataset.libraryItem){event.stopPropagation();openItem(kind,b.dataset.libraryItem);return;}
  if(b.hasAttribute('data-library-retry'))reload();
 }
 const itemMenu=new MobileLibraryActions({root:page,onChoose:itemActions});
 page.addEventListener('click',select);
 headerRoot?.addEventListener('click',select);
 async function openItem(itemKind,id,keptDraft,{copy=false}={}){show(header(labels()[itemKind])+`<p class="empty">${e(t("mobileNutrientDetail.loading"))}</p>`);const loading=content.querySelector('.empty');try{const item=await localLibraryItem({kind:itemKind,id})??await request('/api/library/item?'+new URLSearchParams({kind:itemKind,id}));if(!data)data=await localLibraryView()??await request('/api/library');if(!disposed&&loading.isConnected){if(copy){const resource={...item.resource};delete resource.id;editor(itemKind,{...item,resource:undefined},keptDraft??{name:mealActionText('copyName',{name:resource.name}),items:structuredClone(resource.items)});}else editor(itemKind,item,keptDraft);}}catch(error){if(!disposed&&loading.isConnected)loading.textContent=error.message;}}

 function editor(itemKind,saved,draft,importOptions={}){
  foodEditor?.dispose();mealEditor?.dispose();recipeEditor?.dispose();const resource=saved?.resource;
  if(itemKind==='food'){
   const savedChange=async()=>{await reload();void Promise.resolve(onChange()).catch(()=>{});};
   const action=(label,kept)=>{const back=()=>openItem('food',resource.id,kept);if(label==='share')extrasCleanup=openLibrarySharing({kind:'food',id:resource.id,show,header,content,close,onBack:back,onChange:savedChange});else if(label==='print')extrasCleanup=openFoodPrint({id:resource.id,show,header,content,onBack:back});else if(['retire','restore'].includes(label))return retireEditor('food',resource);else if(label==='log')openEntry('food',resource.id);else if(label==='delete'){show(header(fc("deleteFood"))+'<p class="sheet-message">'+e(t('libraryLifecycle.deletePrompt',{name:resource.name}))+`</p><div class="entry-actions"><button type="button" data-cancel-delete>${e(t("common.cancel"))}</button><button type="button" class="danger" data-confirm-delete>${e(t("mobileRepeat.delete"))}</button></div><p role="status" class="sheet-message"></p>`);content.querySelector('[data-cancel-delete]').onclick=()=>editor('food',saved,kept);content.querySelector('[data-confirm-delete]').onclick=async event=>{event.target.disabled=true;try{await command(data.revision,'food.delete',{id:resource.id});await savedChange();close();}catch(error){content.querySelector('[role=status]').textContent=error.message;event.target.disabled=false;}};}};
   foodEditor=mountCustomFoodEditor({...importOptions,resource,data,draft,show,close,content,date,openEntry,onSaved:savedChange,onAction:action});return;
  }
  if(itemKind==='meal'||itemKind==='recipe'){
   const savedChange=async()=>{await reload();void Promise.resolve(onChange()).catch(()=>{});};
   const action=(label,kept)=>{const back=()=>openItem(itemKind,resource.id,kept);if(label==='share')extrasCleanup=openLibrarySharing({kind:itemKind,id:resource.id,show,header,content,close,onBack:back,onChange:savedChange});else if(['retire','restore'].includes(label))return retireEditor(itemKind,resource);else if(label==='log')openEntry(itemKind,resource.id);else if(label==='delete'){show(header(fc('deleteKind',{kind:labels()[itemKind]}))+'<p class="sheet-message">'+e(t('libraryLifecycle.deletePrompt',{name:resource.name}))+`</p><div class="entry-actions"><button type="button" data-cancel-delete>${e(t("common.cancel"))}</button><button type="button" class="danger" data-confirm-delete>${e(t("mobileRepeat.delete"))}</button></div><p role="status" class="sheet-message"></p>`);content.querySelector('[data-cancel-delete]').onclick=()=>editor(itemKind,saved,kept);content.querySelector('[data-confirm-delete]').onclick=async event=>{event.target.disabled=true;try{await command(data.revision,itemKind+'.delete',{id:resource.id});await savedChange();close();}catch(error){content.querySelector('[role=status]').textContent=error.message;event.target.disabled=false;}};}};
   const editorMount=itemKind==='recipe'?mountRecipeEditor:mountMealEditor;const mounted=editorMount({...importOptions,onImported:prepared=>editor('recipe',null,prepared.recipe,{imported:prepared}),saved,data,draft,show,close,content,date,onSaved:savedChange,onAction:action,openEntry});if(itemKind==='recipe')recipeEditor=mounted;else mealEditor=mounted;return;
  }
 }
 render();reload();return {reload,openItem,dispose(){disposed=true;serial++;if(collectionBack){collectionBack.release({popHistory:false});collectionBack=null;}retirement.dispose();foodEditor?.dispose();mealEditor?.dispose();recipeEditor?.dispose();extrasCleanup?.();optionsSheet?.close(false);itemMenu.dispose();data=null;page.removeEventListener('click',select);headerRoot?.removeEventListener('click',select);document.body.classList.remove('foods-home-mobile','mobile-library');}};
}
