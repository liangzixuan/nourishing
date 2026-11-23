import {uiLanguage,t} from './app-language.js';
import {coreText} from './core-cloud-messages.js';
import {nutrientDisplayName} from './report-source/public/nutrient-language.js';
import {mobileDiarySummary,MobileDiary,diarySymbol} from './diary-summary-source/mobile-diary.js';
import {scoreName} from './diary-summary-source/score-labels.js';
import {watchDiarySelection} from './diary-selection-nutrition.js';
import {waterWidgetMarkup} from './water.js';

const labels=()=>({showCard:name=>coreText('diary.showSummaryCard',{name}),energy:coreText('diary.energy'),consumed:t('mobileDiary.consumed'),expenditure:t('mobileDiary.expenditure'),remaining:t('mobileDiary.remaining'),macros:coreText('diary.macros'),highlights:coreText('diary.highlights'),scores:t('mobileScoreSettings.title'),summary:coreText('diary.daily'),selected:t('mobileNutrientDetail.selection'),previous:coreText('diary.previousSummary'),next:coreText('diary.nextSummary')});
const icons=Object.fromEntries(Object.entries({check:'check_circle',back:'chevron_left',chevron:'chevron_right',plus:'add',more:'more_vert'}).map(([key,name])=>[key,diarySymbol(name)]));
const nutrientName=row=>nutrientDisplayName(row,uiLanguage());
let macroMode=null;
let waterExpanded=false;

function summaryMarkup(diary,facts=diary.summary,summary=diary.summary){
 const {presentation={settings:{},scores:[]}}=diary;
 return mobileDiarySummary({summary,facts,settings:presentation.settings,unit:diary.energyUnit??'kcal',language:uiLanguage(),labels:labels(),icons,macroMode:macroMode??facts.diaryDisplay?.policy.macroDisplay??'consumed',scores:presentation.scores,nutrientName,scoreName});
}
const waitingMarkup=()=>'<section class="md-summary md-selection-status" data-md-summary aria-busy="true"></section>';
export function diarySummaryMarkup(diary,selection,ownerId){
 const hydration=waterWidgetMarkup(diary,{expanded:waterExpanded,ownerId});
 return (selection?.records.length?waitingMarkup():summaryMarkup(diary))+hydration;
}

/** Owns summary carousel and charts only. Mutations and destination navigation stay with the shell. */
export function mountDiarySummary({root,diary,onAction,selection,onGroupSelect}){
 const controller=new AbortController(),header=document.createElement('div');
 let disposed=false,facts=diary.summary,chartSummary=diary.summary,ready=!selection?.records.length;
 const panel=new MobileDiary({root,header,summary:diary.summary,context:()=>{},onDatePicker:()=>{},onGroupSelect});
 const selected=ready?null:watchDiarySelection({selection,onChange:result=>{if(disposed)return;facts=result.facts;chartSummary=result.chartSummary;ready=true;panel.update(summaryMarkup(diary,facts,chartSummary),chartSummary);}});
 const actions=new Set(['mobile-diary-energy','toggle-energy-display','targets-summary','nutrient-contributors','nutrient-targets','choose-scores','score-details','water','water-custom','water-menu','water-remove','water-hint-close','water-settings','water-target']);
 root.addEventListener('toggle',event=>{if(event.target.matches('.md-water'))waterExpanded=event.target.open;},{capture:true,signal:controller.signal});
 root.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  const action=button.dataset.action;
  if(action==='toggle-macro-display'){macroMode=(macroMode??facts.diaryDisplay?.policy.macroDisplay??'consumed')==='remaining'?'consumed':'remaining';panel.update(summaryMarkup(diary,facts,chartSummary),chartSummary);return;}
  if(actions.has(action)){event.preventDefault();onAction({action,id:button.dataset.id,kind:button.dataset.kind,anchor:button,amount:button.dataset.amount?Number(button.dataset.amount):undefined});}
 },{signal:controller.signal});
 return {context(){return ready?{entryIds:facts.scope==='selection'?facts.selectedEntryIds:null,chartSummary,diaryDisplay:facts.diaryDisplay}:null;},dispose(){disposed=true;controller.abort();selected?.dispose();panel.dispose();}};
}
