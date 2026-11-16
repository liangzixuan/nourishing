import {uiLanguage,t} from './app-language.js';
import {fc} from './food-cloud-messages.js';
import {request} from './diary-api.js';
import {mountFoodPicker} from './food-picker.js';
import {MobileIngredientDetail} from './suggestion-source/mobile-ingredient-detail.js';
import {escape as e} from './html.js';

/** One transient search/detail layer. The parent owns the ingredient list. */
export function openCompositeIngredient({date,items,index,nutrients,energyUnit,onApply,onClose,kind:parentKind='meal',excludeRecipe=null}){
 const origin=document.activeElement,dialog=document.createElement('dialog');dialog.className='mci-dialog';dialog.setAttribute('aria-label',parentKind==='recipe'?t("mobileCompositeEditor.addIngredient"):t("mobileSuggest.addItem"));document.body.append(dialog);dialog.showModal();
 let search,detail,loading,restore,disposed=false,serial=0,fromSearch=index===undefined;
 const alive=()=>!disposed&&dialog.isConnected;
 function clear(){loading?.abort();search?.();search=null;detail?.dispose();detail=null;++serial;}
 function close(){if(disposed)return;disposed=true;clear();dialog.close();dialog.remove();if(origin?.isConnected)origin.focus();onClose?.();}
 function back(){if(fromSearch&&restore){openSearch();return;}close();}
 function openSearch(){clear();dialog.innerHTML=`<button type="button" data-close hidden>${e(t("common.close"))}</button><div data-composite-search></div><p role="alert" data-composite-error></p>`;dialog.querySelector('[data-close]').onclick=close;search=mountFoodPicker(dialog.querySelector('[data-composite-search]'),{allowMeals:false,excludeRecipe,restore,onPick:(kind,id)=>openDetail(kind,id)});}
 async function openDetail(kind,id){
  if(search)restore=search.snapshot();clear();const generation=serial;dialog.innerHTML=`<header class="mf-header"><button type="button" data-mci-back aria-label="${e(t("mobileFoodEditor.back"))}">‹</button><h2>${e(fc("mealItemTitle"))}</h2></header><p class="empty" role="status">${e(t("mobileNutrientDetail.loading"))}</p>`;
  try{
   loading=new AbortController();const item=await request('/api/library/item?'+new URLSearchParams({kind,id}),null,loading.signal);if(!alive()||generation!==serial)return;
   const key=kind+'Id',resource={...item.resource,quantityOptions:item.options},previous=index===undefined?{}:items[index];
   detail=new MobileIngredientDetail({root:dialog,resource,kind:kind+'s',source:previous,language:uiLanguage(),unit:energyUnit,catalog:nutrients,sourceLabel:resource.source?.name??(kind==='recipe'?t("recipeEditor.recipe"):t("mobileSearch.food")),applyLabel:index===undefined?(parentKind==='recipe'?t("mobileCompositeEditor.addToRecipe"):t("mobileSuggest.addToMeal")):t("mobileSuggest.applyQuantity"),
    normalize:quantity=>({[key]:id,...quantity}),
    preview:(row,signal)=>request('/api/library/preview',{kind:'meal',date,draft:{name:'Item preview',items:[row]}},signal),
    onApply:row=>{onApply(row,{name:resource.name,source:resource.source?.name??(kind==='recipe'?t("recipeEditor.recipe"):t("mobileSearch.food")),options:item.options});close();}});
  }catch(error){if(alive()&&generation===serial)dialog.innerHTML=`<header class="mf-header"><button type="button" data-mci-back aria-label="${e(t("mobileFoodEditor.back"))}">‹</button><h2>${e(fc("mealItemTitle"))}</h2></header><p role="alert">`+e(error.message)+'</p>';}
 }
 dialog.addEventListener('click',event=>{if(event.target.closest('[data-mci-back]'))back();if(event.target===dialog){const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)back();}});
 dialog.addEventListener('cancel',event=>{event.preventDefault();event.stopPropagation();back();});
 if(index===undefined)openSearch();else{const row=items[index];openDetail(row.recipeId?'recipe':'food',row.recipeId??row.foodId);}
 return {close,back};
}
