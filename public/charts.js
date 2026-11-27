import {dc,chartText as cm} from './discover-cloud-messages.js';
import {uiLanguage,t} from './app-language.js';
import {mountChartDetail} from './chart-detail.js';
import {mountCgmDetail} from './cgm-detail.js';
import {escape as e} from './html.js';
import {onBackgroundWriteStatus} from './background-writes.js';
import {request,queueCommand} from './diary-api.js';
import {readDeviceCache} from './device-cache.js';
import {appendShellNavigation} from './app-shell.js';
import {saveChartDefinition} from './custom-chart-editor.js';
import {localWorkspaceState,localChartsView} from './local-engine.js';
import {chartCardMarkup,mountChartPlots,validateChartView} from './chart-presentation.js';
import {chartArrow,chartTitle} from './charts-source-view.js';
import {openChartDefinition} from './chart-editor.js';
export function mountCharts({page,date,show,close,header,content,onChange,onReady}){
 const root=document.createElement('section');root.className='chart-page';page.replaceChildren(root);
 let data,disposed=false,serial=0,plots,detailHost,cgmDetail,customEditor;
 const alive=()=>!disposed&&root.isConnected;
 const disposeDetail=()=>{customEditor?.dispose();customEditor=null;cgmDetail?.dispose();cgmDetail=null;detailHost=null;};
 const observer=new MutationObserver(()=>{if(detailHost&&!detailHost.isConnected)disposeDetail();});observer.observe(content,{childList:true});
 const showSheet=html=>{disposeDetail();show(html);};
 const ui={show:showSheet,close,header,content,onChange,afterSave:()=>alive()?load():undefined,openDetail:detail,onEditor:editor=>{customEditor=editor;detailHost=editor.element;}};
 async function load(){
  const id=++serial;root.setAttribute('aria-busy','true');
  let hadLocal=false;
  try{
   const apply=next=>{if(!alive()||id!==serial)return;data=validateChartView(next);render();onReady?.();};
   const path='/api/charts?'+new URLSearchParams({to:date()});
   if(!data){
    const cached=await readDeviceCache(path).catch(()=>({}));
    if(cached.ticket&&cached.value===undefined){
     const local=await localChartsView({to:date()});
     if(local&&alive()&&id===serial){apply(local);root.removeAttribute('aria-busy');hadLocal=true;}
    }
   }
   const next=await request(path,undefined,undefined,{onRefresh:next=>{if(!document.querySelector('dialog[open]'))apply(next);}});
   if(!hadLocal||!document.querySelector('dialog[open]'))apply(next);
  }
  catch(error){if(alive()&&id===serial&&!hadLocal){plots?.dispose();root.innerHTML=`<p class="sheet-message" role="status">${e(error.message)}</p><button type="button" class="more-results" data-retry>${t('mobileSuggest.retry')}</button>`;root.querySelector('[data-retry]').onclick=load;onReady?.(false);}}
  finally{if(alive()&&id===serial)root.removeAttribute('aria-busy');}
 }
 function render(){
  plots?.dispose();root.innerHTML=`<div class="mcl-actions"><button type="button" data-manage>${e(cm('manage'))} ${chartArrow}</button><button type="button" data-create><svg class="mcl-add-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M4 12h16" stroke="currentColor" stroke-width="2"/></svg>${e(cm('add'))}</button></div><div class="mcl-list">${data.cards.map(card=>chartCardMarkup(card)).join('')}</div>${data.cards.length||data.saved.some(chart=>chart.visible&&chart._awaitingPlot)?'':`<p class="empty">${dc('noCharts')}</p>`}`;
  for(const chart of data.saved.filter(row=>row.visible&&row._awaitingPlot&&!data.cards.some(card=>card.chartId===row.id))){
   const button=document.createElement('button');button.type='button';button.className='mcl-row';button.textContent=chart.name;
   button.onclick=()=>openChartDefinition(chart,data,ui);root.querySelector('.mcl-list').append(button);
  }
  root.querySelector('[data-create]').onclick=()=>openChartDefinition(null,data,ui);root.querySelector('[data-manage]').onclick=manage;
  root.querySelectorAll('[data-chart-open]').forEach(button=>button.onclick=()=>detail(button.dataset.chartOpen));plots=mountChartPlots(root,data);
 }
 async function detail(id){
  let view=data,card=view.cards.find(row=>row.id===id);
  if(!card){
   const local=view.saved.find(chart=>'custom:'+chart.id===id&&chart._awaitingPlot);
   if(local){openChartDefinition(local,view,ui);return;}
   showSheet(`${header(dc('chart'))}<p class="empty" role="status">${dc('loadingChart')}</p>`);const pending=content.querySelector('[role=status]');
   try{view=validateChartView(await request('/api/charts?'+new URLSearchParams({to:date(),card:id})));if(!alive()||!pending.isConnected)return;card=view.cards[0];}
   catch(error){if(pending.isConnected)pending.textContent=error.message;return;}
  }
  if(!card)return;
  if(card.id==='cgm'){cgmDetail=mountCgmDetail(view,ui);detailHost=cgmDetail.element;return;}
  customEditor=mountChartDetail(view,id,ui);detailHost=customEditor.element;
 }
 function manage({scrollTop=0,focus=null}={}){
  if(!alive())return;
  const owner=readDeviceCache('/api/diary').then(value=>value.ticket);
  const row=card=>{
   const title=card.kind==='custom'?card.name:cm(card.id==='energy'?'energyManager':card.id);
   return `<div class="mcl-row"><button type="button" class="mcl-custom-name" data-manage-chart="${e(card.id)}"><strong>${e(title)}</strong></button><input type="checkbox" role="switch" class="chart-visibility" aria-label="${e(title)}" data-chart-visible="${e(card.id)}" ${card.settings.visible?'checked':''}></div>`;
  };
  const custom=data.catalog.filter(card=>card.kind==="custom"),builtins=data.catalog.filter(card=>card.kind!=="custom");
  showSheet(`<header class="sheet-header chart-manager-header"><button type="button" class="icon-button" data-manager-back aria-label="${t('discover.back')}">‹</button><h2 id="sheet-title">${e(cm('manage'))}</h2></header><div class="mcl-body" data-chart-manager><div class="mcl-group">${builtins.map(row).join('')}</div><h3>${e(cm('custom'))}</h3><div class="mcl-group">${custom.map(row).join('')}<button type="button" class="mcl-row" data-create-chart><strong>${e(cm('create'))}</strong>${chartArrow}</button></div><p class="sheet-message" role="status"></p></div>`);
  const host=content.querySelector('[data-chart-manager]'),sheet=content.closest('dialog');
  content.querySelector('[data-manager-back]').onclick=()=>{close();root.querySelector('[data-manage]')?.focus();};
  appendShellNavigation(host,original=>{close();original.click();});
  if(sheet)sheet.scrollTop=scrollTop;
  if(focus)(host.querySelector(focus)??host.querySelector('[data-create-chart]')).focus({preventScroll:true});
  const resumeAt=selector=>{const scrollTop=sheet?.scrollTop??0;return ()=>manage({scrollTop,focus:selector});};
  host.querySelector('[data-create-chart]').onclick=()=>openChartDefinition(null,data,{...ui,onBack:resumeAt('[data-create-chart]')});
  host.querySelectorAll('[data-manage-chart]').forEach(button=>button.onclick=()=>{
   const id=button.dataset.manageChart,chart=data.saved.find(row=>'custom:'+row.id===id);
   if(chart){const resume=resumeAt('[data-manage-chart="'+CSS.escape(id)+'"]');openChartDefinition(chart,data,{...ui,onBack:resume,afterDelete:resume});}
   else detail(id);
  });
  let toggleQueue=Promise.resolve();
  host.querySelectorAll('[data-chart-visible]').forEach(input=>input.onchange=()=>{
   const id=input.dataset.chartVisible,checked=input.checked,previous=!checked;
   toggleQueue=toggleQueue.then(async()=>{
    try{
     if(id.startsWith('custom:')){
      const {_awaitingPlot,...definition}=data.saved.find(chart=>chart.id===id.slice(7));
      await saveChartDefinition({type:'chart.save',payload:{...definition,visible:checked},requestId:crypto.randomUUID(),revision:data.revision},data,await owner);
      await load();
      Promise.resolve().then(()=>onChange?.()).catch(()=>{});
      return;
     }
     const action={type:'chart.display',payload:{id,patch:{visible:checked}}};
     const state=await localWorkspaceState();if(!state)throw Error(dc('loadingChart'));
     const {projectLocalChart}=await import('./local-chart-projection.js'),next=await projectLocalChart(state,action,data);
     await queueCommand(data.revision,action.type,action.payload,{ticket:await owner,projection:{responses:{['/api/charts?'+new URLSearchParams({to:date()})]:next},chartState:next.localChartState}});
     if(alive()){data=next;render();}
     Promise.resolve().then(()=>onChange?.()).catch(()=>{});
    }catch(error){
     if(host.isConnected){input.checked=previous;host.querySelector('[role=status]').textContent=error.message;}
    }
   });
  });
 }
 const stopStatus=onBackgroundWriteStatus(event=>{if(alive()&&(event.result?.records?.charts||event.discarded))void load();});
 root.innerHTML=`<p class="empty">${e(cm('loading'))}</p>`;load();
 return {dispose(){disposed=true;stopStatus();serial++;plots?.dispose();disposeDetail();observer.disconnect();},reload:load,openManage(){if(alive()&&data)manage();}};
}
export function openExport({date,show,header,content}){
 show(`${header(dc('exportData'))}<form class="entry-form"><label class="field-row"><span>${t('discover.nav.report')}</span><select name="kind" aria-label="Export report">${[['daily-nutrients',dc('dailyNutrients')],['daily-energy',t('chartControls.dailyEnergy')],['diary',t('recovery.count.foods')],['exercises',t('activity.exercise')],['biometrics',t('recovery.count.biometrics')],['notes',t('recovery.count.notes')]].map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label><label class="field-row"><span>${t('recordCleanup.from')}</span><input name="from" aria-label="Export from" type="date" required value="${e(date())}"></label><label class="field-row"><span>To</span><input name="to" aria-label="Export to" type="date" required value="${e(date())}"></label><label class="field-row" data-export-groups><span>${t('chartControls.includeGroupsShort')}</span><input type="checkbox" name="includeGroups"></label><p class="sheet-message" role="status"></p><footer class="entry-actions"><button class="primary" type="submit">${t('chartControls.download')}</button><button type="button" data-export-cancel hidden>${t('common.cancel')}</button></footer></form>`);
 const form=content.querySelector('form'),status=form.querySelector('[role=status]'),cancel=form.querySelector('[data-export-cancel]');let pending=null,disposed=false;
 const controls=()=>{for(const input of form.querySelectorAll('input,select,button[type=submit]'))input.disabled=!!pending;const groups=form.elements.kind.value==='daily-nutrients';form.querySelector('[data-export-groups]').hidden=!groups;form.elements.includeGroups.disabled=!!pending||!groups;cancel.hidden=!pending;};
 const observer=new MutationObserver(()=>{if(!form.isConnected||content.closest('dialog')?.open===false){disposed=true;pending?.abort();observer.disconnect();}});observer.observe(content,{childList:true});const dialog=content.closest('dialog');if(dialog)observer.observe(dialog,{attributes:true,attributeFilter:['open']});
 form.oninput=()=>{form.elements.to.setCustomValidity('');controls();};cancel.onclick=()=>pending?.abort();
 form.onsubmit=async event=>{event.preventDefault();if(pending||disposed)return;const {kind,from,to}=Object.fromEntries(new FormData(form));form.elements.to.setCustomValidity(from>to?t('coach.dateOrder'):'');if(!form.reportValidity())return;
  const body={kind,from,to,...(kind==='daily-nutrients'?{includeGroups:form.elements.includeGroups.checked}:{})};pending=new AbortController();controls();status.textContent=dc('preparingCsv');
  try{const result=await request('/api/reports/export',body,pending.signal);if(disposed||!form.isConnected||pending.signal.aborted)return;const url=URL.createObjectURL(new Blob([result.csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=result.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent=t('nutritionReport.ready');}
  catch(error){if(!disposed&&form.isConnected)status.textContent=error.name==='AbortError'?dc('cancelled'):error.message;}
  finally{pending=null;if(!disposed&&form.isConnected)controls();}
 };controls();
}
