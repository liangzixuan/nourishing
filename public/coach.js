import {dc} from './discover-cloud-messages.js';
import {nutrientDisplayName} from './report-source/public/nutrient-language.js';
import {carbohydrateDisplayLabel,carbohydrateControlDescription} from './report-source/public/carbohydrate-description.js';
import {uiLanguage,t} from './app-language.js';
import {request} from './diary-api.js';
import {escape as e} from './html.js';
import {coachChoices,updateCoachChoices} from './dashboard-source/discover-ui.js';
import {displayValue,displayUnit} from './dashboard-source/energy-display.js';
import {fastingMutation as createMutation} from './fasting-source/mutation.js';

const choiceKeys={"Health": "discover.coach.choice.Health", "Longevity": "discover.coach.choice.Longevity", "Weight Loss": "discover.coach.choice.Weight Loss", "Weight Gain": "discover.coach.choice.Weight Gain", "Strength": "discover.coach.choice.Strength", "Build Muscle": "discover.coach.choice.Build Muscle", "Manage Condition": "discover.coach.choice.Manage Condition", "Athletic Performance": "discover.coach.choice.Athletic Performance", "Improve Mood": "discover.coach.choice.Improve Mood", "Improve Sleep": "discover.coach.choice.Improve Sleep", "Improve Energy": "discover.coach.choice.Improve Energy", "Research": "discover.coach.choice.Research", "Tracking": "discover.coach.choice.Tracking", "Accountability": "discover.coach.choice.Accountability", "Motivation": "discover.coach.choice.Motivation", "Education": "discover.coach.choice.Education", "GLP-1 Medication": "discover.coach.choice.GLP-1 Medication", "Support": "discover.coach.choice.Support", "None": "discover.coach.choice.None", "Carnivore": "discover.coach.choice.Carnivore", "Keto": "discover.coach.choice.Keto", "Low Carb": "discover.coach.choice.Low Carb", "Low Fat": "discover.coach.choice.Low Fat", "Mediterranean": "discover.coach.choice.Mediterranean", "Paleo": "discover.coach.choice.Paleo", "Pescatarian": "discover.coach.choice.Pescatarian", "Vegan": "discover.coach.choice.Vegan", "Vegetarian": "discover.coach.choice.Vegetarian", "Dairy Free": "discover.coach.choice.Dairy Free", "Gluten Free": "discover.coach.choice.Gluten Free", "Fasting": "discover.coach.choice.Fasting"};
const choiceLabel=value=>Object.hasOwn(choiceKeys,value)?t(choiceKeys[value]):value;
const questionLabel=id=>({overview:dc('dailySummary'),protein:nutrientDisplayName({id:'protein',name:'Protein'},uiLanguage()),carbs:nutrientDisplayName({id:'carbs',name:'Carbs'},uiLanguage()),water:t('mobileDiary.water')}[id]);
/** Source preference cards with a recorded-facts composer; no model advice is implied. */
export function openCoach({date,show,close,header,content,onChange=async()=>{},onReport,onSuggest}){
 show('<section class="coach-panel" data-coach-root></section>');
 const root=content.querySelector('[data-coach-root]');
 let data,result,editor=null,mutation=null,busy=false,disposed=false,error='',retry='',readController,selectedDate=typeof date==='function'?date():date,question=dc('dailySummary');
 const life=new AbortController(),alive=()=>!disposed&&root.isConnected;
 const number=value=>Number.isFinite(value)?value.toLocaleString(uiLanguage(),{maximumFractionDigits:2}):'—';
 const amount=(value,unit)=>`${number(displayValue(value,unit,data.energyUnit))} ${displayUnit(unit,data.energyUnit)}`;
 const observer=new MutationObserver(()=>{if(!root.isConnected)dispose();});observer.observe(content,{childList:true,subtree:true});
 function dispose(){if(disposed)return;disposed=true;life.abort();readController?.abort();mutation?.dispose();observer.disconnect();}
 function facts(){return result?`<section class="coach-results" aria-label="${e(dc('recordedFacts'))}"><div class="coach-result-heading"><h2>${e(dc('recordedFacts'))}</h2><span>${e(result.date)}</span></div>${result.facts.map(fact=>fact.kind==='energy'?`<article><h3>${e(dc('energyBalance'))}</h3><dl>${[['expenditure',dc('estimatedExpenditure')],['target',dc('intakeTarget')],['remaining',t('energyReport.remaining')],['balance',dc('balance')]].map(([key,label])=>`<div><dt>${label}</dt><dd>${e(amount(fact[key],'kcal'))}</dd></div>`).join('')}</dl></article>`:`<article><h3>${e(fact.kind==='recorded-water'?dc('drinkingWater'):fact.kind==='tracked-carbohydrate'?carbohydrateDisplayLabel(fact.definition,uiLanguage()):nutrientDisplayName({id:fact.nutrient,name:fact.name},uiLanguage()))}</h3><strong class="coach-value">${e(amount(fact.value,fact.unit))}</strong><span>${e(dc('targetAmount',{amount:amount(fact.target,fact.unit)}))}</span>${fact.coverage&&!fact.coverage.complete?`<small>${e(dc('partialFoods',fact.coverage))}</small>`:''}</article>`).join('')}</section><details class="coach-details"><summary>${e(dc('detailsLimits'))}</summary>${result.observations.map(row=>`<p>${e(row.text)}${row.carbohydrateDefinition!==undefined?' '+e(carbohydrateControlDescription(row.carbohydrateDefinition,uiLanguage())):''}${row.reasonCodes?.length?' '+row.reasonCodes.map(code=>e(t('energyGuidance.reason.'+code))).join(' '):''}</p>`).join('')}${result.limitations.map(text=>`<p>${e(text)}</p>`).join('')}</details>`:'';}
 function preferences(){return `<form class="coach-preferences" data-coach-preferences><header class="sheet-header coach-editor-header"><button type="button" data-coach-cancel>${e(t('common.cancel'))}</button><h2>${e(dc('goalsPreferences'))}</h2><button type="submit">${e(t('common.save'))}</button></header><div class="coach-editor-body">${[['goals',t('coach.preferencesGoals')],['dietaryPreferences',t('discover.coach.dietaryPreferences')]].map(([key,label])=>{const chosen=coachChoices(editor[key]),all=[...new Set([...data.choices[key],...chosen])];return `<section class="coach-chip-section"><h3>${label} <span data-coach-count="${key}">(${chosen.length||t('settings.none')})</span></h3><div class="coach-chips">${all.map(value=>`<button type="button" data-choice="${key}" data-value="${e(value)}" aria-pressed="${chosen.includes(value)}">${e(choiceLabel(value))}</button>`).join('')}</div></section>`;}).join('')}<section class="coach-chip-section"><label for="coach-notes">${e(dc('otherNotes'))}</label><textarea id="coach-notes" aria-label="${e(t('clients.notes'))}" name="notes" maxlength="2000" rows="3">${e(editor.notes)}</textarea></section><small>${e(dc('preferencesTargets'))}</small></div></form>`;}
 function render(){
  if(!alive())return;
  mutation?.dispose();mutation=null;
  root.setAttribute('aria-busy',String(busy));
  if(editor){
   root.innerHTML=preferences();
   mutation=createMutation({revision:()=>data.revision,host:root.querySelector('form'),onSaved:async()=>{editor=null;result=null;await load();await onChange();},onReload:async()=>{const next=await request('/api/coach/preferences',undefined,life.signal);if(!alive())return;data=next;editor=structuredClone(next.preferences);render();}});
   return;
  }
  root.innerHTML=`${header('Nourishing Coach')}<div class="coach-body"><div class="coach-toolbar"><span>${e(dc('recordedFacts'))}</span>${data?`<button type="button" data-coach-edit>${e(dc('goalsPreferences'))}</button>`:''}</div><p class="coach-status" role="status">${busy?t('mobileOracle.loading'):e(error)}${retry&&!busy?`<button type="button" data-coach-retry>${e(t('mobileSuggest.retry'))}</button>`:''}</p>${data?`<form data-coach-question><label>${e(t('diary.date'))}<input type="date" name="date" required value="${e(selectedDate)}"></label><label>${e(t('coach.questionLabel'))}<textarea aria-label="${e(t('coach.questionLabel'))}" name="question" maxlength="2000" required rows="2">${e(question)}</textarea></label><button class="primary" type="submit">${e(dc('showRecords'))}</button></form><div class="coach-chips coach-shortcuts">${[['Daily summary',dc('overview')],['Protein',questionLabel('protein')],['Carbs',questionLabel('carbs')],['Water',questionLabel('water')]].map(([value,label])=>`<button type="button" data-question="${value}">${label}</button>`).join('')}</div>${facts()}${onReport||onSuggest?`<div class="coach-links">${onReport?`<button type="button" data-coach-report>${e(dc('fullReport'))}</button>`:''}${onSuggest?`<button type="button" data-coach-suggest>${e(dc('suggestFood'))}</button>`:''}</div>`:''}`:''}</div>`;
  root.querySelectorAll('.coach-body button,input,textarea').forEach(control=>control.disabled=busy);
 }
 async function load(){
  readController?.abort();readController=new AbortController();busy=true;error='';retry='';render();
  try{const next=await request('/api/coach/preferences',undefined,readController.signal);if(!alive())return;data=next;await ask();}
  catch(cause){if(alive()&&cause.name!=='AbortError'){error=cause.message;retry='load';}}
  finally{busy=false;if(alive())render();}
 }
 async function ask(){
  readController?.abort();const controller=new AbortController();readController=controller;busy=true;error='';retry='';result=null;render();
  try{const next=await request('/api/coach/answer',{date:selectedDate,question,preferencesRevision:data.preferencesRevision},controller.signal);if(alive()&&readController===controller)result=next;}
  catch(cause){if(alive()&&readController===controller&&cause.name!=='AbortError'){error=cause.message;retry=cause.status===409?'load':'answer';}}
  finally{if(alive()&&readController===controller){busy=false;render();}}
 }
 root.addEventListener('input',event=>{if(editor){if(event.target.name==='notes')editor.notes=event.target.value;}else if(event.target.name==='date')selectedDate=event.target.value;else if(event.target.name==='question')question=event.target.value;},{signal:life.signal});
 root.addEventListener('submit',event=>{event.preventDefault();if(event.target.matches('[data-coach-question]')){if(!busy)void ask();}else if(event.target.matches('[data-coach-preferences]'))void mutation.run('coach.preferences',{preferences:editor,revision:data.preferencesRevision});},{signal:life.signal});
 root.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  if(button.hasAttribute('data-coach-cancel')){editor=null;render();return;}
  if(button.dataset.choice){const key=button.dataset.choice;button.setAttribute('aria-pressed',String(button.getAttribute('aria-pressed')!=='true'));editor[key]=updateCoachChoices(editor[key],[...root.querySelectorAll(`[data-choice="${key}"][aria-pressed=true]`)].map(node=>node.dataset.value));root.querySelector(`[data-coach-count="${key}"]`).textContent='('+(coachChoices(editor[key]).length||t('settings.none'))+')';return;}
  if(button.hasAttribute('data-coach-edit')){editor=structuredClone(data.preferences);render();}
  else if(button.hasAttribute('data-coach-retry'))void(retry==='load'?load():ask());
  else if(button.dataset.question){question=questionLabel({'Daily summary':'overview',Protein:'protein',Carbs:'carbs',Water:'water'}[button.dataset.question]);void ask();}
  else if(button.hasAttribute('data-coach-report')){dispose();close();onReport?.(selectedDate);}
  else if(button.hasAttribute('data-coach-suggest')){dispose();close();onSuggest?.(selectedDate);}
 },{signal:life.signal});
 void load();return {dispose,back(){if(editor&&!mutation?.blocked){editor=null;render();return true;}return false;}};
}
