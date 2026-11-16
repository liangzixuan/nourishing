import {request} from './diary-api.js';
import {escape as e} from './html.js';
import {coachChoices,updateCoachChoices} from './dashboard-source/discover-ui.js';
import {displayValue,displayUnit} from './dashboard-source/energy-display.js';
import {fastingMutation as createMutation} from './fasting-source/mutation.js';

/** Source preference cards with a recorded-facts composer; no model advice is implied. */
export function openCoach({date,show,close,header,content,onChange=async()=>{},onReport,onSuggest}){
 show('<section class="coach-panel" data-coach-root></section>');
 const root=content.querySelector('[data-coach-root]');
 let data,result,editor=null,mutation=null,busy=false,disposed=false,error='',retry='',readController,selectedDate=typeof date==='function'?date():date,question='Daily summary';
 const life=new AbortController(),alive=()=>!disposed&&root.isConnected;
 const number=value=>Number.isFinite(value)?value.toLocaleString(data.language,{maximumFractionDigits:2}):'—';
 const amount=(value,unit)=>`${number(displayValue(value,unit,data.energyUnit))} ${displayUnit(unit,data.energyUnit)}`;
 const observer=new MutationObserver(()=>{if(!root.isConnected)dispose();});observer.observe(content,{childList:true,subtree:true});
 function dispose(){if(disposed)return;disposed=true;life.abort();readController?.abort();mutation?.dispose();observer.disconnect();}
 function facts(){return result?`<section class="coach-results" aria-label="Recorded facts"><div class="coach-result-heading"><h2>Recorded diary facts</h2><span>${e(result.date)}</span></div>${result.facts.map(fact=>fact.kind==='energy'?`<article><h3>Energy balance</h3><dl>${[['expenditure','Estimated expenditure'],['target','Intake target'],['remaining','Remaining'],['balance','Balance']].map(([key,label])=>`<div><dt>${label}</dt><dd>${e(amount(fact[key],'kcal'))}</dd></div>`).join('')}</dl></article>`:`<article><h3>${e(fact.name??'Drinking water')}</h3><strong class="coach-value">${e(amount(fact.value,fact.unit))}</strong><span>Target ${e(amount(fact.target,fact.unit))}</span>${fact.coverage&&!fact.coverage.complete?`<small>${fact.coverage.known}/${fact.coverage.total} foods measured</small>`:''}</article>`).join('')}</section><details class="coach-details"><summary>Details &amp; limits</summary>${result.observations.map(row=>`<p>${e(row.text)}</p>`).join('')}${result.limitations.map(text=>`<p>${e(text)}</p>`).join('')}</details>`:'';}
 function preferences(){return `<form class="coach-preferences" data-coach-preferences><header class="sheet-header coach-editor-header"><button type="button" data-coach-cancel>Cancel</button><h2>Goals &amp; preferences</h2><button type="submit">Save</button></header><div class="coach-editor-body">${[['goals','Goals'],['dietaryPreferences','Dietary constraints']].map(([key,label])=>{const chosen=coachChoices(editor[key]),all=[...new Set([...data.choices[key],...chosen])];return `<section class="coach-chip-section"><h3>${label} <span data-coach-count="${key}">(${chosen.length||'None'})</span></h3><div class="coach-chips">${all.map(value=>`<button type="button" data-choice="${key}" data-value="${e(value)}" aria-pressed="${chosen.includes(value)}">${e(value)}</button>`).join('')}</div></section>`;}).join('')}<section class="coach-chip-section"><label for="coach-notes">Other notes</label><textarea id="coach-notes" aria-label="Notes" name="notes" maxlength="2000" rows="3">${e(editor.notes)}</textarea></section><small>Preferences do not change your targets.</small></div></form>`;}
 function render(){
  if(!alive())return;
  mutation?.dispose();mutation=null;
  root.setAttribute('aria-busy',String(busy));
  if(editor){
   root.innerHTML=preferences();
   mutation=createMutation({revision:()=>data.revision,host:root.querySelector('form'),onSaved:async()=>{editor=null;result=null;await load();await onChange();},onReload:async()=>{const next=await request('/api/coach/preferences',undefined,life.signal);if(!alive())return;data=next;editor=structuredClone(next.preferences);render();}});
   return;
  }
  root.innerHTML=`${header('Nourishing Coach')}<div class="coach-body"><div class="coach-toolbar"><span>Recorded diary facts</span>${data?'<button type="button" data-coach-edit>Goals &amp; preferences</button>':''}</div><p class="coach-status" role="status">${busy?'Loading…':e(error)}${retry&&!busy?'<button type="button" data-coach-retry>Try again</button>':''}</p>${data?`<form data-coach-question><label>Diary date<input type="date" name="date" required value="${e(selectedDate)}"></label><label>Question<textarea aria-label="Question" name="question" maxlength="2000" required rows="2">${e(question)}</textarea></label><button class="primary" type="submit">Show records</button></form><div class="coach-chips coach-shortcuts">${[['Daily summary','Overview'],['Protein','Protein'],['Carbs','Carbs'],['Water','Water']].map(([value,label])=>`<button type="button" data-question="${value}">${label}</button>`).join('')}</div>${facts()}${onReport||onSuggest?`<div class="coach-links">${onReport?'<button type="button" data-coach-report>View full report</button>':''}${onSuggest?'<button type="button" data-coach-suggest>Suggest food</button>':''}</div>`:''}`:''}</div>`;
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
  if(button.dataset.choice){const key=button.dataset.choice;button.setAttribute('aria-pressed',String(button.getAttribute('aria-pressed')!=='true'));editor[key]=updateCoachChoices(editor[key],[...root.querySelectorAll(`[data-choice="${key}"][aria-pressed=true]`)].map(node=>node.dataset.value));root.querySelector(`[data-coach-count="${key}"]`).textContent='('+(coachChoices(editor[key]).length||'None')+')';return;}
  if(button.hasAttribute('data-coach-edit')){editor=structuredClone(data.preferences);render();}
  else if(button.hasAttribute('data-coach-retry'))void(retry==='load'?load():ask());
  else if(button.dataset.question){question=button.dataset.question;void ask();}
  else if(button.hasAttribute('data-coach-report')){dispose();close();onReport?.(selectedDate);}
  else if(button.hasAttribute('data-coach-suggest')){dispose();close();onSuggest?.(selectedDate);}
 },{signal:life.signal});
 void load();return {dispose,back(){if(editor&&!mutation?.blocked){editor=null;render();return true;}return false;}};
}
