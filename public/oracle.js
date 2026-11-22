import {bottomNavigation} from './dashboard-source/discover-ui.js';
import {uiLanguage,t} from './app-language.js';
import {MobileOracle} from './oracle-source/mobile-oracle.js';
import {symbol} from './oracle-source/ui.js';
import {request} from './diary-api.js';
import {escape as e} from './html.js';

/** Source Oracle presentation. Rankings and daily targets come from the workspace. */
export function openOracle({date,show,close,content}){
 const day=typeof date==='function'?date():date;
 show(`<div class="oracle-heading"><header class="mo-header"><button type="button" data-oracle-close aria-label="${e(t("mobileFoodEditor.back"))}">${symbol('back')}</button><h1>${e(t("catalogInsights.oracle"))}</h1><span></span></header></div><div class="oracle-body"><p class="empty" role="status">${e(t("mobileNutrientDetail.loading"))}</p></div><nav class="dc-bottom" data-oracle-nav aria-label="${e(t("discover.nav.main"))}">${bottomNavigation("oracle",uiLanguage())}</nav>`);
 const sheet=content.closest('dialog'),root=content.querySelector('.oracle-body'),heading=content.querySelector('.oracle-heading'),events=new AbortController(),signal=events.signal;
 sheet.classList.add('oracle-sheet');let panel,diary,options,disposed=false,conflict=false;
 const alive=()=>!disposed&&root.isConnected;
 async function context(){
  const readOptions={fresh:conflict};
  const result=await Promise.all([
   request('/api/food-insights/options',null,signal,readOptions),
   request('/api/diary?date='+encodeURIComponent(day),null,signal,readOptions)
  ]);
  if(!alive())return;
  [options,diary]=result;
  if(panel){panel.targets=diary.summary.targets;panel.nutrients=options.nutrients;panel.conflict=false;}
  conflict=false;
 }
 async function sourceRequest(input,querySignal){
  if(conflict)await context();
  try{return await request('/api/food-insights/oracle',input,querySignal);}
  catch(error){if(error.status===409){conflict=true;if(panel)panel.conflict=true;}throw error;}
 }
 function exit(){dispose();close();}
 function back(event){if(disposed)return;if(event.type==='cancel'&&event.target!==sheet)return;event.preventDefault();event.stopImmediatePropagation();if(panel?.back())return;exit();}
 sheet.addEventListener('cancel',back,{capture:true,signal});window.addEventListener('nourishing-back',back,{capture:true,signal});
 const observer=new MutationObserver(()=>{if(!root.isConnected)dispose();});observer.observe(content,{childList:true});sheet.addEventListener('close',()=>dispose(),{signal});
 function dispose(){if(disposed)return;disposed=true;events.abort();observer.disconnect();panel?.dispose();sheet.classList.remove('oracle-sheet');}
 content.querySelector('[data-oracle-nav]').addEventListener('click',event=>{
  const control=event.target.closest('[data-discover]');
  if(!control)return;
  const destination=document.querySelector('.app-nav [data-discover="'+control.dataset.discover+'"]');
  if(destination){exit();destination.click();}
 },{signal});
 heading.querySelector('[data-oracle-close]').onclick=exit;
 async function start(){try{await context();if(!alive())return;panel=new MobileOracle({root,header:heading,request:sourceRequest,nutrients:options.nutrients,targets:diary.summary.targets,options:{nutrient:'potassium',basis:'oracle'},language:uiLanguage(),icon:symbol,onOptions:()=>{},onBack:exit});}catch(error){if(!alive())return;root.innerHTML=`<p role="alert">${e(error.message)}</p><button type="button" data-oracle-retry>${e(t("mobileSuggest.retry"))}</button>`;root.querySelector('[data-oracle-retry]').onclick=start;}}
 void start();return dispose;
}
