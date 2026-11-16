import {mobileDiarySummary,MobileDiary,diarySymbol} from './diary-summary-source/mobile-diary.js';
import {escape as e} from './html.js';
import {scoreName} from './diary-summary-source/score-labels.js';
import {request} from './diary-api.js';

const labels={energy:'Energy Summary',target:'Target',consumed:'Consumed',expenditure:'Expenditure',remaining:'Remaining',macros:'Macronutrient Targets',highlights:'Highlighted Nutrients',scores:'Nutrition Scores',summary:'Daily nutrition',report:'All nutrients',selected:'Selected foods',previous:'Previous summary',next:'Next summary'};
const icons=Object.fromEntries(Object.entries({check:'check_circle',back:'chevron_left',chevron:'chevron_right',plus:'add',more:'more_vert'}).map(([key,name])=>[key,diarySymbol(name)]));
const number=(value,digits=1)=>Number.isFinite(value)?value.toLocaleString('en',{maximumFractionDigits:digits}):'—';
const nutrientName=row=>({carbs:'Carbs',netCarbohydrate:'Net Carbs',fat:'Fat'})[row.id]??row.name;
let macroMode=null;

function summaryMarkup(diary,facts=diary.summary,summary=diary.summary){
 const {presentation={settings:{},scores:[]}}=diary;
 return mobileDiarySummary({summary,facts,settings:presentation.settings,unit:diary.energyUnit??'kcal',language:'en',labels,icons,macroMode:macroMode??facts.diaryDisplay?.policy.macroDisplay??'consumed',scores:presentation.scores,nutrientName,scoreName});
}
const waitingMarkup=(message='Loading selected foods…',retry=false)=>`<section class="md-summary md-selection-status" data-md-summary role="status"><p>${e(message)}</p>${retry?'<button type="button" data-summary-retry>Try again</button>':''}</section>`;
function duration(seconds){if(!Number.isFinite(seconds))return '';const minutes=Math.floor(Math.max(0,seconds)/60);return `${Math.floor(minutes/60)}h ${String(minutes%60).padStart(2,'0')}m`;}
export function diarySummaryMarkup(diary,selection){
 const {summary,presentation={settings:{},scores:[]}}=diary,water=summary.hydration,fast=presentation.fasting;
 const fasting=fast?.visible===false?'':`<details class="md-fasting"><summary><strong>Fasting</strong><span class="md-group-chevron">${icons.chevron}</span></summary><div class="md-fasting-body">${fast?.active?`<strong data-diary-fast-clock>${e(duration(fast.elapsedSeconds))}</strong>`:''}<button type="button" data-action="open-fasting">Open Fasting</button></div></details>`;
 const hydration=presentation.settings.showWater===false?'':`<details class="md-water"><summary><button type="button" data-action="water-custom" class="md-group-add" aria-label="Add water">${icons.plus}</button><div><strong>Water</strong><small>${number(water.logged/1000,2)} / ${number(water.target===null?null:water.target/1000,1)} L</small></div><span class="md-group-chevron">${icons.chevron}</span></summary><div class="md-water-actions"><button type="button" data-action="water" data-amount="250">Add 250 mL</button><button type="button" data-action="water-custom">Custom</button></div></details>`;
 return (selection?.records.length?waitingMarkup():summaryMarkup(diary))+fasting+hydration;
}

/** Owns summary carousel, charts and timer only. Mutations and destination navigation stay with the shell. */
export function mountDiarySummary({root,diary,onAction,selection,onReload}){
 const controller=new AbortController(),header=document.createElement('div');
 let disposed=false,facts=diary.summary,chartSummary=diary.summary,ready=!selection?.records.length,conflict=false;
 const panel=new MobileDiary({root,header,summary:diary.summary,context:()=>{},onDatePicker:()=>{}});
 async function loadSelection(){
  ready=false;conflict=false;panel.update(waitingMarkup(),diary.summary);
  try{
   const result=await request('/api/diary/tools/review',{operation:'nutrition',selection,revision:diary.revision},controller.signal);
   if(disposed)return;
   if(result.revision!==diary.revision)throw Object.assign(Error('Diary changed. Reload diary.'),{status:409});
   facts=result.facts;chartSummary=result.chartSummary;ready=true;panel.update(summaryMarkup(diary,facts,chartSummary),chartSummary);
  }catch(error){if(disposed)return;conflict=error.status===409;panel.update(waitingMarkup(error.message,true),diary.summary);if(conflict)root.querySelector('[data-summary-retry]').textContent='Reload diary';}
 }
 if(!ready)void loadSelection();
 const actions=new Set(['mobile-diary-energy','edit-day-targets','nutrient-contributors','configure-diary-display','all-nutrients','choose-scores','score-details','open-fasting','water','water-custom']);
 root.addEventListener('click',event=>{
  if(event.target.closest('[data-summary-retry]')){void(conflict?onReload?.():loadSelection());return;}
  const button=event.target.closest('[data-action]');if(!button)return;
  const action=button.dataset.action;
  if(action==='toggle-macro-display'){macroMode=(macroMode??facts.diaryDisplay?.policy.macroDisplay??'consumed')==='remaining'?'consumed':'remaining';panel.update(summaryMarkup(diary,facts,chartSummary),chartSummary);return;}
  if(actions.has(action)){event.preventDefault();onAction({action,id:button.dataset.id,kind:button.dataset.kind,amount:button.dataset.amount?Number(button.dataset.amount):undefined});}
 },{signal:controller.signal});
 const initial=diary.presentation?.fasting,started=performance.now();
 const updateClock=()=>{const target=root.querySelector('[data-diary-fast-clock]');if(target&&initial?.status==='active')target.textContent=duration(initial.elapsedSeconds+(performance.now()-started)/1000);};
 const timer=initial?.status==='active'?setInterval(updateClock,30000):null;
 return {context(){return ready?{entryIds:facts.scope==='selection'?facts.selectedEntryIds:null,chartSummary}:null;},dispose(){disposed=true;controller.abort();panel.dispose();if(timer)clearInterval(timer);}};
}
