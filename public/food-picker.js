import {request} from './diary-api.js';
import {MobileFoodSearch} from './food-search-source/mobile-food-search.js';
/** Shared source search surface. The third callback argument identifies the selected corpus. */
export function mountFoodPicker(root,{onPick,allowMeals=true,allowRecipes=true,excludeRecipe=null,onBarcode,onBranded}){
 root.classList.add('food-picker-host');
 const search=new MobileFoodSearch({root,language:'en',request:(path,{signal}={})=>request(path,null,signal),onScan:onBarcode,
  fetchPage:(params,signal)=>{params.set('allowMeals',String(allowMeals));params.set('allowRecipes',String(allowRecipes));if(excludeRecipe)params.set('excludeRecipe',excludeRecipe);return request('/api/food-search?'+params,null,signal);},
  onPick:row=>onPick(({catalog:'food',foods:'food',recipes:'recipe',meals:'meal'})[row.kind],row.id,{source:row.kind==='catalog'?'catalog':'library'}),
  onClose:()=>root.closest('dialog')?.querySelector('[data-close]')?.click(),onPreferenceError:message=>{root.querySelector('[role=status]').textContent=message;}
 });
 if(onBranded){const button=document.createElement('button');button.type='button';button.dataset.pickerBranded='';button.textContent='Search Branded Foods';button.onclick=onBranded;root.querySelector('.mfs-content').append(button);}
 return ()=>{search.dispose();root.classList.remove('food-picker-host');};
}
