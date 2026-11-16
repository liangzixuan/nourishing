import {MealSuggestionsPanel} from './suggestion-source/meal-suggestions.js';
import {request} from './diary-api.js';
import {escape as e} from './html.js';
import {symbol} from './suggestion-source/ui.js';

/** Source presentation with an account-scoped cloud transport. Drafts die with this sheet. */
export function openSuggestions({date,show,close,content,onAdded,onPreferences}){
 if(!document.querySelector('link[data-suggestion-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/suggestions.css';link.dataset.suggestionStyle='';document.head.append(link);}
 const day=typeof date==='function'?date():date;
 show('<div class="suggestion-heading"><header class="ms-header"><button type="button" data-loading-close aria-label="Close">×</button><h1>Suggest Food</h1><span></span></header></div><div class="suggestion-body"><p class="empty" role="status">Loading…</p></div>');
 const root=content.querySelector('.suggestion-body'),heading=content.querySelector('.suggestion-heading'),sheet=root.closest('dialog');
 sheet.classList.add('suggestion-sheet');
 let panel,options,initialOptions,disposed=false,pendingPreference,review,reviewBody,saveBusy=false;
 const events=new AbortController(),signal=events.signal;
 const alive=()=>!disposed&&root.isConnected;
 const preferences=async()=>{
  // A lost reply is retried with its original receipt before fetching new state.
  if(pendingPreference){try{await request('/api/workspace/command',pendingPreference);}catch(error){if(error.status>=400&&error.status<500&&error.status!==408)pendingPreference=null;throw error;}pendingPreference=null;}
  options=await request('/api/food-insights/options');const {templates,...canonical}=options.suggestions;return canonical;
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
 const closeReview=()=>{if(saveBusy)return;review?.close();review?.remove();review=null;reviewBody=null;};
 function reviewMeal(item){
  closeReview();review=document.createElement('dialog');review.className='suggestion-review';review.setAttribute('aria-label','Add to Diary');
  review.innerHTML=`<form><header class="ms-header"><button type="button" data-review-close aria-label="Back">${symbol('back')}</button><h2>Add to Diary</h2><span></span></header><h3>${e(item.name)}</h3><label class="field-row"><span>Group</span><select name="group" aria-label="Group">${options.groups.map(g=>`<option ${g==='Uncategorized'?'selected':''}>${e(g)}</option>`).join('')}</select></label><label class="field-row"><span>Time</span><input type="time" name="time" aria-label="Time"></label><p role="alert" hidden></p><footer class="ms-footer"><button type="submit">Add to Diary</button></footer></form>`;
  document.body.append(review);review.showModal();const dialog=review,form=dialog.querySelector('form'),status=form.querySelector('[role=alert]');
  dialog.addEventListener('cancel',event=>{event.preventDefault();event.stopPropagation();closeReview();});dialog.addEventListener('click',event=>{if(event.target===dialog||event.target.closest('[data-review-close]'))closeReview();});
  form.onsubmit=async event=>{
   event.preventDefault();if(saveBusy)return;
   if(!reviewBody){const rows=item.rows.map(row=>({foodId:row.ref.id,...(row.unit==='servings'?{amount:row.quantity}:{quantity:row.quantity,unit:row.unit,...(row.unit==='portion'?{portionId:row.portionId}:{})})}));reviewBody={revision:options.revision,type:'meal.log',payload:{date:day,group:form.elements.group.value,time:form.elements.time.value,rows},requestId:crypto.randomUUID()};}
   const frozen=structuredClone(reviewBody);saveBusy=true;status.hidden=true;form.querySelectorAll('input,select,button').forEach(node=>node.disabled=true);
   const save=()=>request('/api/workspace/command',frozen);
   try{await save();await onAdded?.();saveBusy=false;if(alive()){closeReview();dispose();close();}}
   catch(error){saveBusy=false;if(!dialog.isConnected)return;status.textContent=error.message;status.hidden=false;form.querySelector('[data-review-close]').disabled=false;
    if(error.status===409){reviewBody=null;const reload=document.createElement('button');reload.type='button';reload.textContent='Reload latest';reload.onclick=async()=>{reload.disabled=true;try{await preferences();if(!alive())return;closeReview();await panel.load();}catch(reason){status.firstChild.textContent=reason.message;reload.disabled=false;}};status.append(reload);}
    else{if(error.status>=400&&error.status<500&&error.status!==408){reviewBody=null;form.querySelectorAll('input,select').forEach(node=>node.disabled=false);}const submit=form.querySelector('[type=submit]');submit.disabled=false;submit.textContent='Try again';}
   }
  };
 }
 function back(event){if(disposed)return;if(event.target!==sheet&&event.type==='cancel')return;event.preventDefault();event.stopImmediatePropagation();if(review){closeReview();return;}if(panel?.mobile.back())return;dispose();close();}
 sheet.addEventListener('cancel',back,{capture:true,signal});window.addEventListener('nourishing-back',back,{capture:true,signal});
 const observer=new MutationObserver(()=>{if(!root.isConnected)dispose();});observer.observe(content,{childList:true});sheet.addEventListener('close',()=>dispose(),{signal});
 function dispose(){if(disposed)return;disposed=true;events.abort();observer.disconnect();panel?.dispose();review?.close();review?.remove();review=null;pendingPreference=null;sheet.classList.remove('suggestion-sheet');}
 // Metadata arrives before the source component so nutrient labels and unit are canonical.
 heading.querySelector('[data-loading-close]').onclick=()=>{dispose();close();};
 preferences().then(canonical=>{
  if(!alive())return;
  initialOptions=canonical;
  panel=new MealSuggestionsPanel({root,request:sourceRequest,date:day,session:{},language:'en',energyUnit:options.energyUnit??'kcal',onSelect:reviewMeal,onPreferences,mobile:{header:heading,nutrients:options.nutrients,icon:symbol,onBack:()=>{dispose();close();}}});
 }).catch(error=>{if(!alive())return;heading.innerHTML='<header class="ms-header"><button type="button" data-retry-close aria-label="Close">×</button><h1>Suggest Food</h1></header>';root.innerHTML=`<p role="alert">${e(error.message)}</p><button type="button" data-retry>Try again</button>`;heading.querySelector('[data-retry-close]').onclick=()=>{dispose();close();};root.querySelector('[data-retry]').onclick=()=>{dispose();openSuggestions({date,show,close,content,onAdded,onPreferences});};});
 return dispose;
}
