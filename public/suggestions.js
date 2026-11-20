import {uiLanguage,t} from './app-language.js';
import {MealSuggestionsPanel} from './suggestion-source/meal-suggestions.js';
import {request,queueCommand} from './diary-api.js';
import {escape as e} from './html.js';
import {symbol} from './suggestion-source/ui.js';

/** Source presentation with an account-scoped cloud transport. Drafts die with this sheet. */
export function openSuggestions({date,show,close,content,onAdded,onPreferences}){
 if(!document.querySelector('link[data-suggestion-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/suggestions.css';link.dataset.suggestionStyle='';document.head.append(link);}
 const day=typeof date==='function'?date():date;
 show(`<div class="suggestion-heading"><header class="ms-header"><button type="button" data-loading-close aria-label="${e(t("common.close"))}">×</button><h1>${e(t("mobileSuggest.title"))}</h1><span></span></header></div><div class="suggestion-body"><p class="empty" role="status">${e(t("mobileNutrientDetail.loading"))}</p></div>`);
 const root=content.querySelector('.suggestion-body'),heading=content.querySelector('.suggestion-heading'),sheet=root.closest('dialog');
 sheet.classList.add('suggestion-sheet');
 let panel,options,initialOptions,disposed=false,pendingPreference,saveBusy=false;
 const events=new AbortController(),signal=events.signal;
 const alive=()=>!disposed&&root.isConnected;
 const preferences=async()=>{
  // A lost reply is retried with its original receipt before fetching new state.
  if(pendingPreference){try{await request('/api/workspace/command',pendingPreference);}catch(error){if(error.status>=400&&error.status<500&&error.status!==408)pendingPreference=null;throw error;}pendingPreference=null;}
  options=await request('/api/food-insights/options',undefined,undefined,{fresh:Boolean(options)});const {templates,...canonical}=options.suggestions;return canonical;
 };
 const sourceRequest=async(path,{body,signal:requestSignal}={})=>{
  const input=body?JSON.parse(body):null;
  if(path==='/api/insights/meals/options'){if(initialOptions){const value=initialOptions;initialOptions=null;return value;}const retried=Boolean(pendingPreference),value=await preferences();if(retried)onPreferences?.();return value;}
  if(path==='/api/insights/meals/preferences'){
   if(!pendingPreference)pendingPreference={revision:options.revision,type:'foodSuggestion.preference',payload:input,requestId:crypto.randomUUID()};
   return {preferences:await preferences()};
  }
  const routes={'/api/insights/meals/suggest':'suggestions','/api/insights/meals/preview':'preview','/api/insights/meals/ingredient-preview':'ingredient-preview','/api/insights/meals/ingredient':'resolve'};
  return request(routes[path]?'/api/food-insights/'+routes[path]:path,input,requestSignal);
 };
 async function addMeal(item){
  if(saveBusy)return;
  const rows=item.rows.map(row=>({foodId:row.ref.id,...(row.unit==='servings'?{amount:row.quantity}:{quantity:row.quantity,unit:row.unit,...(row.unit==='portion'?{portionId:row.portionId}:{})})}));
  const payload={date:day,group:panel.mobile.group,time:panel.mobile.time,rows};
  saveBusy=true;panel.mobile.saving(true);panel.error('');
  try{await queueCommand(options.revision,'meal.log',payload);if(alive()){dispose();close();}void onAdded?.();}
  catch(error){if(alive())panel.error(error.message);}
  finally{saveBusy=false;if(alive())panel.mobile.saving(false);}
 }
 function back(event){if(disposed)return;if(event.target!==sheet&&event.type==='cancel')return;event.preventDefault();event.stopImmediatePropagation();if(panel?.mobile.back())return;dispose();close();}
 sheet.addEventListener('cancel',back,{capture:true,signal});window.addEventListener('nourishing-back',back,{capture:true,signal});
 const observer=new MutationObserver(()=>{if(!root.isConnected)dispose();});observer.observe(content,{childList:true});sheet.addEventListener('close',()=>dispose(),{signal});
 function dispose(){if(disposed)return;disposed=true;events.abort();observer.disconnect();panel?.dispose();pendingPreference=null;sheet.classList.remove('suggestion-sheet');}
 // Metadata arrives before the source component so nutrient labels and unit are canonical.
 heading.querySelector('[data-loading-close]').onclick=()=>{dispose();close();};
 preferences().then(canonical=>{
  if(!alive())return;
  initialOptions=canonical;
  panel=new MealSuggestionsPanel({root,request:sourceRequest,date:day,session:{},language:uiLanguage(),energyUnit:options.energyUnit??'kcal',onSelect:addMeal,onPreferences,mobile:{groups:options.groups,header:heading,nutrients:options.nutrients,icon:symbol,onBack:()=>{dispose();close();}}});
 }).catch(error=>{if(!alive())return;heading.innerHTML=`<header class="ms-header"><button type="button" data-retry-close aria-label="${e(t("common.close"))}">×</button><h1>${e(t("mobileSuggest.title"))}</h1></header>`;root.innerHTML=`<p role="alert">${e(error.message)}</p><button type="button" data-retry>${e(t("mobileSuggest.retry"))}</button>`;heading.querySelector('[data-retry-close]').onclick=()=>{dispose();close();};root.querySelector('[data-retry]').onclick=()=>{dispose();openSuggestions({date,show,close,content,onAdded,onPreferences});};});
 return dispose;
}
