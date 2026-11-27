import {guardSheetExit} from './edge-navigation.js';
import {dc} from './discover-cloud-messages.js';
import {nutrientDisplayName} from './report-source/public/nutrient-language.js';
import {carbohydrateDisplayLabel,carbohydrateControlDescription} from './report-source/public/carbohydrate-description.js';
import {uiLanguage,t} from './app-language.js';
import {request,queueCommand} from './diary-api.js';
import {readDeviceCache} from './device-cache.js';
import {isBackgroundWritesRunning,flushBackgroundWrites,onBackgroundWriteStatus} from './background-writes.js';
import {localCoachView} from './local-engine.js';
import {coachPreferencesView} from './local-diary-projection.js';
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
 let data,result,editor=null,setupStep=null,understood=false,mutation=null,busy=false,disposed=false,error='',retry='',readController,selectedDate=typeof date==='function'?date():date,question=dc('dailySummary');
 const life=new AbortController(),alive=()=>!disposed&&root.isConnected;
 const number=value=>Number.isFinite(value)?value.toLocaleString(uiLanguage(),{maximumFractionDigits:2}):'—';
 const amount=(value,unit)=>`${number(displayValue(value,unit,data.energyUnit))} ${displayUnit(unit,data.energyUnit)}`;
 const observer=new MutationObserver(()=>{if(!root.isConnected)dispose();});observer.observe(content,{childList:true,subtree:true});
 const unsubscribeWrites=onBackgroundWriteStatus(event=>{
  if(!event.discarded||!alive()||editor)return;
  void localCoachView().then(local=>{if(local&&alive()&&!editor){data={...data,...local};render();}});
 });
 function dispose(){if(disposed)return;disposed=true;life.abort();readController?.abort();mutation?.dispose();unsubscribeWrites();observer.disconnect();}
 function facts(){return result?`<section class="coach-results" aria-label="${e(dc('recordedFacts'))}"><div class="coach-result-heading"><h2>${e(dc('recordedFacts'))}</h2><span>${e(result.date)}</span></div>${result.facts.map(fact=>fact.kind==='energy'?`<article><h3>${e(dc('energyBalance'))}</h3><dl>${[['expenditure',dc('estimatedExpenditure')],['target',dc('intakeTarget')],['remaining',t('energyReport.remaining')],['balance',dc('balance')]].map(([key,label])=>`<div><dt>${label}</dt><dd>${e(amount(fact[key],'kcal'))}</dd></div>`).join('')}</dl></article>`:`<article><h3>${e(fact.kind==='recorded-water'?dc('drinkingWater'):fact.kind==='tracked-carbohydrate'?carbohydrateDisplayLabel(fact.definition,uiLanguage()):nutrientDisplayName({id:fact.nutrient,name:fact.name},uiLanguage()))}</h3><strong class="coach-value">${e(amount(fact.value,fact.unit))}</strong><span>${e(dc('targetAmount',{amount:amount(fact.target,fact.unit)}))}</span>${fact.coverage&&!fact.coverage.complete?`<small>${e(dc('partialFoods',fact.coverage))}</small>`:''}</article>`).join('')}</section><details class="coach-details"><summary>${e(dc('detailsLimits'))}</summary>${result.observations.map(row=>`<p>${e(row.text)}${row.carbohydrateDefinition!==undefined?' '+e(carbohydrateControlDescription(row.carbohydrateDefinition,uiLanguage())):''}${row.reasonCodes?.length?' '+row.reasonCodes.map(code=>e(t('energyGuidance.reason.'+code))).join(' '):''}</p>`).join('')}${result.limitations.map(text=>`<p>${e(text)}</p>`).join('')}</details>`:'';}
 function preferences(){return `<form class="coach-preferences" data-coach-preferences ${setupStep?'data-first-use':''}><header class="sheet-header coach-editor-header"><button type="button" data-coach-cancel>${e(t('common.cancel'))}</button><h2 id="sheet-title">${e(setupStep?t('discover.getStarted'):dc('goalsPreferences'))}</h2><button type="submit">${e(setupStep?t('discover.next'):t('common.save'))}</button></header><div class="coach-editor-body">${setupStep?`<p>${e(dc('coachIntro'))}</p>`: ''}${[['goals',t('coach.preferencesGoals')],['dietaryPreferences',t('discover.coach.dietaryPreferences')]].map(([key,label])=>{const chosen=coachChoices(editor[key]),all=[...new Set([...data.choices[key],...chosen])];return `<section class="coach-chip-section"><h3>${label} <span data-coach-count="${key}">(${chosen.length||t('settings.none')})</span></h3><div class="coach-chips">${all.map(value=>`<button type="button" data-choice="${key}" data-value="${e(value)}" aria-pressed="${chosen.includes(value)}">${e(choiceLabel(value))}</button>`).join('')}</div></section>`;}).join('')}<section class="coach-chip-section"><label for="coach-notes">${e(dc(setupStep?'coachNotesInstructions':'otherNotes'))}</label><textarea id="coach-notes" aria-label="${e(t('clients.notes'))}" name="notes" maxlength="2000" rows="3" ${setupStep?`placeholder="${e(dc('coachNotesExample'))}"`:''}>${e(editor.notes)}</textarea></section><small>${e(dc('preferencesTargets'))}</small></div></form>`;}
 function render(){
  if(!alive())return;
  mutation?.dispose();mutation=null;
  root.setAttribute('aria-busy',String(busy));
  if(editor){
   if(setupStep==='about'){
    root.innerHTML=`<form class="coach-preferences" data-coach-ack><header class="sheet-header coach-editor-header"><button type="button" data-coach-back>${e(t('mobileDisplay.back'))}</button><h2 id="sheet-title">${e(dc('coachAboutTitle'))}</h2><button type="submit" ${understood?'':'disabled'}>${e(t('discover.ok'))}</button></header><div class="coach-editor-body"><p>${e(dc('coachNoticeIntro'))}</p><p>${e(dc('coachLimits'))}</p><label class="coach-ack"><input type="checkbox" required name="understood" ${understood?'checked':''}>${e(dc('coachUnderstand'))}</label></div></form>`;
   }else root.innerHTML=preferences();
   if(setupStep==='choices')return;
   mutation=createMutation({revision:()=>data.revision,host:root.querySelector('form'),onSaved:async()=>{editor=null;setupStep=null;result=null;await load();await onChange();},onReload:async()=>{const next=await request('/api/coach/preferences',undefined,life.signal);if(!alive())return;data=next;editor=structuredClone(next.preferences);setupStep=next.setupComplete?null:'choices';understood=false;render();}});
   return;
  }
  root.innerHTML=`${header('Nourishing Coach')}<div class="coach-body"><div class="coach-toolbar"><span>${e(dc('recordedFacts'))}</span>${data?`<button type="button" data-coach-edit>${e(dc('goalsPreferences'))}</button>`:''}</div><p class="coach-status" role="status">${busy?t('mobileOracle.loading'):e(error)}${retry&&!busy?`<button type="button" data-coach-retry>${e(t('mobileSuggest.retry'))}</button>`:''}</p>${data?`<form data-coach-question><label>${e(t('diary.date'))}<input type="date" name="date" required value="${e(selectedDate)}"></label><label>${e(t('coach.questionLabel'))}<textarea aria-label="${e(t('coach.questionLabel'))}" name="question" maxlength="2000" required rows="2">${e(question)}</textarea></label><button class="primary" type="submit">${e(dc('showRecords'))}</button></form><div class="coach-chips coach-shortcuts">${[['Daily summary',dc('overview')],['Protein',questionLabel('protein')],['Carbs',questionLabel('carbs')],['Water',questionLabel('water')]].map(([value,label])=>`<button type="button" data-question="${value}">${label}</button>`).join('')}</div>${facts()}${onReport||onSuggest?`<div class="coach-links">${onReport?`<button type="button" data-coach-report>${e(dc('fullReport'))}</button>`:''}${onSuggest?`<button type="button" data-coach-suggest>${e(dc('suggestFood'))}</button>`:''}</div>`:''}`:''}</div>`;
  root.querySelectorAll('.coach-body button,input,textarea').forEach(control=>control.disabled=busy);
 }
  async function savePreferences(){
   if(isBackgroundWritesRunning()){
    const {ticket}=await readDeviceCache('/api/coach/preferences').catch(()=>({}));
    if(ticket){
     try{
      const prevRevision=data.preferencesRevision;
      const candidate={goals:(editor.goals??'').trim(),dietaryPreferences:(editor.dietaryPreferences??'').trim(),notes:(editor.notes??'').trim()};
      const projected=coachPreferencesView({settings:{coachPreferences:candidate}});
      const nextData={...data,setupComplete:true,preferences:projected.preferences,preferencesRevision:projected.revision};
      await queueCommand(data.revision,'coach.preferences',{preferences:projected.preferences,revision:prevRevision},{ticket,projection:{responses:{'/api/coach/preferences':nextData}}});
      if(!alive())return;
      data=nextData;editor=null;setupStep=null;result=null;render();
      Promise.resolve().then(()=>onChange()).catch(()=>{});
      return;
     }catch(cause){
      if(alive()){error=cause.message;render();}
      return;
     }
    }
   }
   await mutation.run('coach.preferences',{preferences:editor,revision:data.preferencesRevision});
  }
  async function load(){
  readController?.abort();readController=new AbortController();busy=true;error='';retry='';render();
  let hadLocal=false;
  try{
   if(!data){
    const cached=await readDeviceCache('/api/coach/preferences').catch(()=>({}));
    if(cached.ticket&&cached.value===undefined){
     const local=await localCoachView();
     if(local&&alive()){data=local;hadLocal=true;if(!local.setupComplete){setupStep='choices';editor=structuredClone(local.preferences);understood=false;busy=false;render();}}
    }
   }
   const next=await request('/api/coach/preferences',undefined,readController.signal);if(!alive())return;data=next;if(next.setupComplete){await ask();}else{setupStep='choices';editor=structuredClone(next.preferences);understood=false;}
  }
  catch(cause){if(alive()&&cause.name!=='AbortError'&&!hadLocal){error=cause.message;retry='load';}}
  finally{busy=false;if(alive())render();}
 }
 async function ask(){
  readController?.abort();const controller=new AbortController();readController=controller;busy=true;error='';retry='';result=null;render();
  try{
   let next;
   try{next=await request('/api/coach/answer',{date:selectedDate,question,preferencesRevision:data.preferencesRevision},controller.signal);}
   catch(cause){
    if(cause.status===409&&isBackgroundWritesRunning()){
     await flushBackgroundWrites().catch(()=>{});
     if(!alive()||readController!==controller)return;
     const latest=await request('/api/coach/preferences',undefined,controller.signal).catch(()=>null);
     if(latest&&alive()&&readController===controller)data=latest;
     next=await request('/api/coach/answer',{date:selectedDate,question,preferencesRevision:data.preferencesRevision},controller.signal);
    }else throw cause;
   }
   if(alive()&&readController===controller)result=next;
  }
  catch(cause){if(alive()&&readController===controller&&cause.name!=='AbortError'){error=cause.message;retry=cause.status===409?'load':'answer';}}
  finally{if(alive()&&readController===controller){busy=false;render();}}
 }
 root.addEventListener('input',event=>{if(editor){if(event.target.name==='notes')editor.notes=event.target.value;
   if(event.target.name==='understood'){understood=event.target.checked;root.querySelector('[type=submit]').disabled=!understood;}}else if(event.target.name==='date')selectedDate=event.target.value;else if(event.target.name==='question')question=event.target.value;},{signal:life.signal});
 root.addEventListener('submit',event=>{event.preventDefault();if(event.target.matches('[data-coach-question]')){if(!busy)void ask();}else if(setupStep==='choices'){setupStep='about';render();}
  else if(!setupStep||understood)void savePreferences();},{signal:life.signal});
 root.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  if(button.hasAttribute('data-coach-cancel')){if(setupStep){dispose();close();}else{editor=null;render();}return;}
  if(button.hasAttribute('data-coach-back')){setupStep='choices';understood=false;render();return;}
  if(button.dataset.choice){const key=button.dataset.choice;button.setAttribute('aria-pressed',String(button.getAttribute('aria-pressed')!=='true'));editor[key]=updateCoachChoices(editor[key],[...root.querySelectorAll(`[data-choice="${key}"][aria-pressed=true]`)].map(node=>node.dataset.value));root.querySelector(`[data-coach-count="${key}"]`).textContent='('+(coachChoices(editor[key]).length||t('settings.none'))+')';return;}
  if(button.hasAttribute('data-coach-edit')){
   if(isBackgroundWritesRunning()){
    void localCoachView().then(local=>{
     if(!alive()||editor)return;
     if(local)data={...data,...local};
     editor=structuredClone(data.preferences);render();
    });
    return;
   }
   editor=structuredClone(data.preferences);render();
  }
  else if(button.hasAttribute('data-coach-retry'))void(retry==='load'?load():ask());
  else if(button.dataset.question){question=questionLabel({'Daily summary':'overview',Protein:'protein',Carbs:'carbs',Water:'water'}[button.dataset.question]);void ask();}
  else if(button.hasAttribute('data-coach-report')){dispose();close();onReport?.(selectedDate);}
  else if(button.hasAttribute('data-coach-suggest')){dispose();close();onSuggest?.(selectedDate);}
 },{signal:life.signal});
 function back(){
  if(!editor||mutation?.blocked||setupStep==='choices')return false;
  if(setupStep==='about'){setupStep='choices';understood=false;}else editor=null;
  render();return true;
 }
 guardSheetExit(root,()=>mutation?.blocked,life.signal);
 function stepBack(event){
  if(!setupStep||!alive())return;
  if(mutation?.blocked||back()){event.preventDefault();event.stopImmediatePropagation();}
 }
 root.closest('dialog')?.addEventListener('cancel',stepBack,{capture:true,signal:life.signal});
 window.addEventListener('nourishing-back',stepBack,{capture:true,signal:life.signal});
 void load();return {dispose,back};
}
