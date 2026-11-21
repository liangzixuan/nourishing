import {uiLanguage,t} from './app-language.js';
import {fc} from './food-cloud-messages.js';
import {request} from './diary-api.js';
import {localFoodSearch} from './local-search.js';
import {MobileFoodSearch} from './food-search-source/mobile-food-search.js';
/** Shared source search surface. The third callback argument identifies the selected corpus. */
export function mountFoodPicker(root,{onPick,onClose,allowMeals=true,allowRecipes=true,excludeRecipe=null,onBarcode,onBranded,multi=null,restore=null}){
 root.classList.add('food-picker-host');
 const search=new MobileFoodSearch({root,language:uiLanguage(),request:(path,{signal,body}={})=>request(path,body?JSON.parse(body):null,signal),onScan:onBarcode,multi,restore:restore??multi?.restore,
  fetchPage:async(params,signal)=>{params.set('allowMeals',String(allowMeals));params.set('allowRecipes',String(allowRecipes));if(excludeRecipe)params.set('excludeRecipe',excludeRecipe);const local=await localFoodSearch(params);if(local)return local;return request('/api/food-search?'+params,null,signal);},
  onPick:row=>onPick(({catalog:'food',foods:'food',recipes:'recipe',meals:'meal'})[row.kind],row.id,{source:row.kind==='catalog'?'catalog':'library'}),
  onClose:onClose??(()=>root.closest('dialog')?.querySelector('[data-close]')?.click()),onPreferenceError:message=>{root.querySelector('[role=status]').textContent=message;}
 });
 if(onBranded){const button=document.createElement('button');button.type='button';button.dataset.pickerBranded='';button.textContent=fc("searchBranded");button.onclick=onBranded;root.querySelector('.mfs-content').append(button);}
 const dispose=()=>{search.dispose();root.classList.remove('food-picker-host');};
 Object.assign(dispose,{snapshot:()=>search.snapshot(),ready:search.multi?.ready??Promise.resolve(),applyEntry:(entry,label)=>search.multi?.applyEntry(entry,label)??false,returnFromDetail:()=>search.multi?.returnFromDetail(),select:(row,entry)=>search.multi?.select(row,entry)??false});return dispose;
}
