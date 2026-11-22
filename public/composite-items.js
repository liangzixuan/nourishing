import {previewLocalIngredient} from './library-local.js';
import {uiLanguage,t} from './app-language.js';
import {fc,foodQuantityUnit} from './food-cloud-messages.js';
import {localLibraryItem} from './local-engine.js';
import {request} from './diary-api.js';
import {mountFoodPicker} from './food-picker.js';
import {MobileIngredientDetail} from './suggestion-source/mobile-ingredient-detail.js';
import {escape as e} from './html.js';

export function formatCompositeGrams(grams){
 return Number.isFinite(grams)?grams.toLocaleString(uiLanguage(),{minimumFractionDigits:1,maximumFractionDigits:1})+'g':null;
}

export function ingredientRow(kind,row,view,index,count,ordering){
 const recipe=kind==='recipe',number=index+1;
 const name=view?.name??fc(recipe?'ingredient':'mealItem');
 const unit=row.unit==='portion'?view?.options?.find(([id])=>id==='portion:'+row.portionId)?.[1]??foodQuantityUnit('portion'):foodQuantityUnit(row.unit??'servings');
 const grams=formatCompositeGrams(view?.grams);
 const source=view?.options?(view.source?.name??(row.recipeId?t('recipeEditor.recipe'):t('mobileSearch.food'))):'';
 const move=(direction,key,symbol,disabled)=>`<button type="button" data-${kind}-move="${index}" data-direction="${direction}" aria-label="${e(fc(key,{number}))}" ${disabled?'disabled':''}>${symbol}</button>`;
 return `<div class="composite-item-row">
  <button type="button" data-${kind}-item="${index}" data-mci-edit><span class="mci-item-name">${e(name)}</span><span class="mci-item-quantity">${e(row.quantity??row.amount)} ${e(unit)}${grams?' - '+e(grams):''}</span><span class="mci-item-source">${e(source)}</span></button>
  <button type="button" data-${kind}-remove="${index}" data-composite-remove aria-label="${e(fc(recipe?'removeIngredient':'removeItem',{number}))}">×</button>
  ${ordering?`<div class="composite-reorder">${move(-1,recipe?'moveIngredientUp':'moveItemUp','↑',index===0)}${move(1,recipe?'moveIngredientDown':'moveItemDown','↓',index===count-1)}</div>`:''}</div>`;
}

/** One transient search/detail layer. The parent owns the ingredient list. */
export function openCompositeIngredient({date,items,index,nutrients,energyUnit,onApply,onClose,kind:parentKind='meal',excludeRecipe=null,selection}){
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
   loading=new AbortController();const inline=kind==='food'&&selection?.foods.find(food=>food.id===id);
   const item=inline?{resource:inline,options:selection.items.find(row=>row.foodId===id).options}:await localLibraryItem({kind,id})??await request('/api/library/item?'+new URLSearchParams({kind,id}),null,loading.signal);if(!alive()||generation!==serial)return;
   const key=kind+'Id',resource={...item.resource,quantityOptions:item.options},previous=index===undefined?{}:items[index];
   detail=new MobileIngredientDetail({root:dialog,resource,kind:kind+'s',source:previous,language:uiLanguage(),unit:energyUnit,catalog:nutrients,sourceLabel:resource.source?.name??(kind==='recipe'?t("recipeEditor.recipe"):t("mobileSearch.food")),applyLabel:index===undefined?(parentKind==='recipe'?t("mobileCompositeEditor.addToRecipe"):t("mobileSuggest.addToMeal")):t("mobileSuggest.applyQuantity"),
    normalize:quantity=>({[key]:id,...quantity}),
    preview:(row,signal)=>previewLocalIngredient(row,date,signal,selection),
    onApply:(row,result)=>{onApply(row,result.row);close();}});
  }catch(error){if(alive()&&generation===serial)dialog.innerHTML=`<header class="mf-header"><button type="button" data-mci-back aria-label="${e(t("mobileFoodEditor.back"))}">‹</button><h2>${e(fc("mealItemTitle"))}</h2></header><p role="alert">`+e(error.message)+'</p>';}
 }
 dialog.addEventListener('click',event=>{if(event.target.closest('[data-mci-back]'))back();if(event.target===dialog){const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)back();}});
 dialog.addEventListener('cancel',event=>{event.preventDefault();event.stopPropagation();back();});
 if(index===undefined)openSearch();else{const row=items[index];openDetail(row.recipeId?'recipe':'food',row.recipeId??row.foodId);}
 return {close,back};
}
