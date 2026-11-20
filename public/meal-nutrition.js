import {uiLanguage,t} from './app-language.js';
import {escape as e} from './html.js';
import {request} from './diary-api.js';
import {localWorkspaceState} from './local-engine.js';
import {catalog} from './report-source/server/nutrient-catalog.mjs';
import {calculateSelectionNutrition} from './report-source/server/nutrition.mjs';
import {FoodNutritionView} from './food-entry-source/food-nutrition-view.js';

export function openMealNutrition({entry,revision,energyUnit,show,header,content}){
 show(header(t('accountCloud.nutritionSummary'))+`<section class="meal-nutrition-summary entry-form"><h3>${e(entry.facts?.name??entry.name??'')}</h3><div class="mf-preview" aria-busy="true"></div><p role="status"></p></section>`);
 const root=content.querySelector('.meal-nutrition-summary'),target=root.querySelector('.mf-preview');let nutrition,disposed=false;
 const current=()=>!disposed&&root.isConnected;
 const dispose=()=>{disposed=true;nutrition?.dispose();observer.disconnect();};
 const observer=new MutationObserver(()=>{if(!root.isConnected)dispose();});observer.observe(content,{childList:true});
 void(async()=>{
  try{
   const state=await localWorkspaceState();
   const facts=state?.entries.some(row=>row.id===entry.id&&row.date===entry.date)?calculateSelectionNutrition(state,entry.date,[entry.id]):(await request('/api/diary/tools/review',{operation:'nutrition',revision,selection:{date:entry.date,scope:'selected',records:[{collection:'entries',id:entry.id}]}})).facts;if(!current())return;
   nutrition=new FoodNutritionView({target,language:uiLanguage(),unit:energyUnit??'kcal',catalog});
   await nutrition.render(facts,{showHighlights:true,isCurrent:current});if(current())target.setAttribute('aria-busy','false');
  }catch(error){if(current()){root.querySelector('[role=status]').textContent=error.message;target.setAttribute('aria-busy','false');}}
 })();return {dispose};
}
