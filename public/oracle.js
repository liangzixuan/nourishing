import {bottomNavigation} from './dashboard-source/discover-ui.js';
import {uiLanguage,t} from './app-language.js';
import {fc} from './food-cloud-messages.js';
import {MobileOracle} from './oracle-source/mobile-oracle.js';
import {symbol} from './oracle-source/ui.js';
import {request} from './diary-api.js';
import {mountFoodEntry} from './food-entry.js';
import {escape as e} from './html.js';

/** Source Oracle presentation. Queries, daily targets and food quantities remain server-owned. */
export function openOracle({date,show,close,content,onAdded}){
 const day=typeof date==='function'?date():date;
 show(`<div class="oracle-heading"><header class="mo-header"><button type="button" data-oracle-close aria-label="${e(t("mobileFoodEditor.back"))}">${symbol('back')}</button><h1>${e(t("catalogInsights.oracle"))}</h1><span></span></header></div><div class="oracle-body"><p class="empty" role="status">${e(t("mobileNutrientDetail.loading"))}</p></div><nav class="dc-bottom" data-oracle-nav aria-label="${e(t("discover.nav.main"))}">${bottomNavigation("oracle",uiLanguage())}</nav>`);
 const sheet=content.closest('dialog'),root=content.querySelector('.oracle-body'),heading=content.querySelector('.oracle-heading'),events=new AbortController(),signal=events.signal;
 sheet.classList.add('oracle-sheet');let panel,diary,options,disposed=false,detail,detailDispose,detailAbort,conflict=false;
 const alive=()=>!disposed&&root.isConnected;
 async function context(){const result=await Promise.all([request('/api/food-insights/options',null,signal),request('/api/diary?date='+encodeURIComponent(day),null,signal)]);if(!alive())return;[options,diary]=result;if(panel){panel.targets=diary.summary.targets;panel.nutrients=options.nutrients;panel.conflict=false;}conflict=false;}
 async function sourceRequest(path,{signal:querySignal}={}){
  if(conflict)await context();
  const params=new URL(path,location.origin).searchParams;
  try{return await request('/api/food-insights/oracle',{nutrient:params.get('nutrient'),basis:params.get('basis'),query:params.get('q')??'',offset:Number(params.get('offset')),limit:Number(params.get('limit')),categoryMode:params.get('categoryMode'),categoryIds:params.getAll('category'),includeUncategorized:params.get('includeUncategorized')==='true'},querySignal);}
  catch(error){if(error.status===409){conflict=true;if(panel)panel.conflict=true;}throw error;}
 }
 function closeDetail(){detailAbort?.abort();detailDispose?.();detailDispose=null;detail?.close();detail?.remove();detail=null;}
 async function refreshAfterSave(){
  try{await onAdded?.();await context();panel?.dialog?.querySelector('[data-oracle-refresh]')?.remove();}
  catch(error){if(!alive())return;const host=panel.dialog?.querySelector('.mo-results')??root;host.querySelector('[data-oracle-refresh]')?.remove();const notice=document.createElement('p');notice.dataset.oracleRefresh='';notice.setAttribute('role','status');notice.textContent='Saved. '+error.message+' ';const retry=document.createElement('button');retry.type='button';retry.textContent=fc("reloadLatest");retry.onclick=()=>{retry.disabled=true;void refreshAfterSave();};notice.append(retry);host.prepend(notice);}
 }
 async function selectFood(row,isCurrent){
  closeDetail();detailAbort=new AbortController();const selectedSignal=detailAbort.signal;
  const itemPath='/api/library/item?'+new URLSearchParams({kind:'food',id:row.ref.id});let item=await request(itemPath,null,selectedSignal);
  if(!alive()||selectedSignal.aborted||!isCurrent())return;
  detail=document.createElement('dialog');detail.className='oracle-food-detail';detail.setAttribute('aria-label',item.resource.name);const host=document.createElement('div');detail.append(host);document.body.append(detail);detail.showModal();
  const dialog=detail;
  const render=()=>{detailDispose?.();detailDispose=mountFoodEntry({item,quantity:row.sourceQuantity,date:day,group:diary.groups.includes('Uncategorized')?'Uncategorized':diary.groups[0],groups:diary.groups,revision:()=>diary.revision,content:host,show:html=>{host.innerHTML=html;dialog.scrollTop=0;},close:closeDetail,onBack:closeDetail,onChange:refreshAfterSave,onConflict:async()=>{try{await context();item=await request(itemPath,null,selectedSignal);if(alive()&&dialog.isConnected)render();}catch(error){const status=host.querySelector('.mf-status');if(status){const notice=document.createElement('span');notice.textContent=error.message+' ';status.prepend(notice);}}}});};
  render();dialog.addEventListener('cancel',event=>{event.preventDefault();closeDetail();});dialog.addEventListener('click',event=>{if(event.target===dialog)closeDetail();});
 }
 function exit(){dispose();close();}
 function back(event){if(disposed)return;if(event.type==='cancel'&&event.target!==sheet)return;event.preventDefault();event.stopImmediatePropagation();if(detail){if(detail.querySelector('.mf-menu[open]')){detail.querySelector('.mf-menu [data-mf-dismiss]').click();return;}closeDetail();return;}if(panel?.back())return;exit();}
 sheet.addEventListener('cancel',back,{capture:true,signal});window.addEventListener('nourishing-back',back,{capture:true,signal});
 const observer=new MutationObserver(()=>{if(!root.isConnected)dispose();});observer.observe(content,{childList:true});sheet.addEventListener('close',()=>dispose(),{signal});
 function dispose(){if(disposed)return;disposed=true;events.abort();observer.disconnect();closeDetail();panel?.dispose();sheet.classList.remove('oracle-sheet');}
 content.querySelector('[data-oracle-nav]').addEventListener('click',event=>{
  const control=event.target.closest('[data-discover]');
  if(!control)return;
  const destination=document.querySelector('.app-nav [data-discover="'+control.dataset.discover+'"]');
  if(destination){exit();destination.click();}
 },{signal});
 heading.querySelector('[data-oracle-close]').onclick=exit;
 async function start(){try{await context();if(!alive())return;panel=new MobileOracle({root,header:heading,request:sourceRequest,nutrients:options.nutrients,targets:diary.summary.targets,options:{nutrient:'potassium',basis:'oracle',query:''},language:uiLanguage(),icon:symbol,onOptions:()=>{},onSelect:selectFood,onBack:exit});}catch(error){if(!alive())return;root.innerHTML=`<p role="alert">${e(error.message)}</p><button type="button" data-oracle-retry>${e(t("mobileSuggest.retry"))}</button>`;root.querySelector('[data-oracle-retry]').onclick=start;}}
 void start();return dispose;
}
