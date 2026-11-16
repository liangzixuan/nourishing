import {request} from './diary-api.js';
import {mountFoodPicker} from './food-picker.js';
import {MobileIngredientDetail} from './suggestion-source/mobile-ingredient-detail.js';
import {escape as e} from './html.js';

/** One transient search/detail layer. The parent owns the ingredient list. */
export function openCompositeIngredient({date,items,index,nutrients,energyUnit,onApply,onClose}){
 const origin=document.activeElement,dialog=document.createElement('dialog');dialog.className='mci-dialog';dialog.setAttribute('aria-label','Add Meal Item');document.body.append(dialog);dialog.showModal();
 let search,detail,loading,disposed=false,serial=0,fromSearch=index===undefined;
 const alive=()=>!disposed&&dialog.isConnected;
 function clear(){loading?.abort();search?.();search=null;detail?.dispose();detail=null;++serial;}
 function close(){if(disposed)return;disposed=true;clear();dialog.close();dialog.remove();if(origin?.isConnected)origin.focus();onClose?.();}
 function back(){if(detail&&fromSearch){openSearch();return;}close();}
 function openSearch(){clear();dialog.innerHTML='<button type="button" data-close hidden>Close</button><div data-composite-search></div><p role="alert" data-composite-error></p>';dialog.querySelector('[data-close]').onclick=close;search=mountFoodPicker(dialog.querySelector('[data-composite-search]'),{allowMeals:false,onPick:(kind,id)=>openDetail(kind,id)});}
 async function openDetail(kind,id){
  clear();const generation=serial;dialog.innerHTML='<header class="mf-header"><button type="button" data-mci-back aria-label="Back">‹</button><h2>Meal Item</h2></header><p class="empty" role="status">Loading…</p>';
  try{
   loading=new AbortController();const item=await request('/api/library/item?'+new URLSearchParams({kind,id}),null,loading.signal);if(!alive()||generation!==serial)return;
   const key=kind+'Id',resource={...item.resource,quantityOptions:item.options},previous=index===undefined?{}:items[index];
   detail=new MobileIngredientDetail({root:dialog,resource,kind:kind+'s',source:previous,language:'en',unit:energyUnit,catalog:nutrients,sourceLabel:resource.source?.name??(kind==='recipe'?'Recipe':'Custom Food'),applyLabel:index===undefined?'Add to Meal':'Apply',
    normalize:quantity=>({[key]:id,...quantity}),
    preview:(row,signal)=>request('/api/library/preview',{kind:'meal',date,draft:{name:'Item preview',items:[row]}},signal),
    onApply:row=>{onApply(row,{name:resource.name,source:resource.source?.name??(kind==='recipe'?'Recipe':'Custom Food'),options:item.options});close();}});
  }catch(error){if(alive()&&generation===serial)dialog.innerHTML='<header class="mf-header"><button type="button" data-mci-back aria-label="Back">‹</button><h2>Meal Item</h2></header><p role="alert">'+e(error.message)+'</p>';}
 }
 dialog.addEventListener('click',event=>{if(event.target.closest('[data-mci-back]'))back();if(event.target===dialog){const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)back();}});
 dialog.addEventListener('cancel',event=>{event.preventDefault();event.stopPropagation();back();});
 if(index===undefined)openSearch();else{const row=items[index];openDetail(row.recipeId?'recipe':'food',row.recipeId??row.foodId);}
 return {close,back};
}
