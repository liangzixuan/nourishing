import {accountMessage} from './account-cloud-messages.js';
import {uiLanguage} from './app-language.js';
import {escape as e} from './html.js';
import {watchDiarySelection} from './diary-selection-nutrition.js';
import {catalog} from './report-source/server/nutrient-catalog.mjs';
import {FoodNutritionView} from './food-entry-source/food-nutrition-view.js';

export function openMealNutrition({entry,energyUnit,show,header,content}){
 return openSelectionNutrition({selection:{date:entry.date,scope:'selected',records:[{collection:'entries',id:entry.id}]},name:entry.facts?.name??entry.name,energyUnit,show,header,content});
}

export function openSelectionNutrition({selection,name,energyUnit,show,header,content}){
 show(header(accountMessage('accountCloud.nutritionSummary'))+`<section class="meal-nutrition-summary entry-form">${name?`<h3>${e(name)}</h3>`:''}<div class="mf-preview" aria-busy="true"></div></section>`);
 const root=content.querySelector('.meal-nutrition-summary'),target=root.querySelector('.mf-preview');let nutrition,selected,disposed=false;
 const current=()=>!disposed&&root.isConnected;
 const dispose=()=>{disposed=true;selected?.dispose();nutrition?.dispose();observer.disconnect();};
 const observer=new MutationObserver(()=>{if(!root.isConnected)dispose();});observer.observe(content,{childList:true});
 selected=watchDiarySelection({selection,onChange:async({facts})=>{
  if(!current())return;
  nutrition??=new FoodNutritionView({target,language:uiLanguage(),unit:energyUnit??'kcal',catalog});
  const open=new Map([...root.querySelectorAll("[data-mf-section]")].map(el=>[el.dataset.mfSection,el.open]));
  await nutrition.render(facts,{open,showHighlights:true,isCurrent:current});if(current())target.setAttribute('aria-busy','false');
 }});return {dispose};
}
