import {mountChartDetail} from './chart-detail.js';
import {mountCgmDetail} from './cgm-detail.js';
import {escape as e} from './html.js';
import {request,command} from './diary-api.js';
import {chartCardMarkup,mountChartPlots,validateChartView} from './chart-presentation.js';
import {chartArrow} from './charts-source-view.js';
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
  try{const next=validateChartView(await request('/api/charts?'+new URLSearchParams({to:date()})));if(!alive()||id!==serial)return;data=next;render();onReady?.();}
  catch(error){if(alive()&&id===serial){plots?.dispose();root.innerHTML=`<p class="sheet-message" role="status">${e(error.message)}</p><button type="button" class="more-results" data-retry>Try again</button>`;root.querySelector('[data-retry]').onclick=load;}}
  finally{if(alive()&&id===serial)root.removeAttribute('aria-busy');}
 }
 function render(){
  plots?.dispose();root.innerHTML=`<div class="mcl-actions"><button type="button" data-manage>Manage Charts ${chartArrow}</button><button type="button" data-create>＋ Add Chart</button></div><div class="mcl-list">${data.cards.map(card=>chartCardMarkup(card)).join('')}</div>${data.cards.length?'':'<p class="empty">No visible charts</p>'}`;
  root.querySelector('[data-create]').onclick=()=>openChartDefinition(null,data,ui);root.querySelector('[data-manage]').onclick=manage;
  root.querySelectorAll('[data-chart-open]').forEach(button=>button.onclick=()=>detail(button.dataset.chartOpen));plots=mountChartPlots(root,data);
 }
 async function detail(id){
  let view=data,card=view.cards.find(row=>row.id===id);
  if(!card){
   showSheet(`${header('Chart')}<p class="empty" role="status">Loading chart…</p>`);const pending=content.querySelector('[role=status]');
   try{view=validateChartView(await request('/api/charts?'+new URLSearchParams({to:date(),card:id})));if(!alive()||!pending.isConnected)return;card=view.cards[0];}
   catch(error){if(pending.isConnected)pending.textContent=error.message;return;}
  }
  if(!card)return;
  if(card.id==='cgm'){cgmDetail=mountCgmDetail(view,ui);detailHost=cgmDetail.element;return;}
  customEditor=mountChartDetail(view,id,ui);detailHost=customEditor.element;
 }
 function manage(){
  const row=card=>`<div class="mcl-row"><button type="button" class="mcl-custom-name" data-manage-chart="${e(card.id)}"><strong>${e(card.name)}</strong></button><input type="checkbox" role="switch" class="chart-visibility" aria-label="${e(card.name)}" data-chart-visible="${e(card.id)}" ${card.settings.visible?'checked':''}></div>`;
  const custom=data.catalog.filter(card=>card.kind==='custom'),builtins=data.catalog.filter(card=>card.kind!=='custom');
  showSheet(`${header('Manage Charts')}<div class="mcl-body" data-chart-manager><div class="mcl-group">${builtins.map(row).join('')}</div>${custom.length?`<h3>Custom Charts</h3><div class="mcl-group">${custom.map(row).join('')}</div>`:''}<button type="button" class="mcl-row" data-create-chart><strong>Create New Chart</strong>${chartArrow}</button><p class="sheet-message" role="status"></p></div>`);
  const host=content.querySelector('[data-chart-manager]');host.querySelector('[data-create-chart]').onclick=()=>openChartDefinition(null,data,{...ui,onBack:manage});
  host.querySelectorAll('[data-manage-chart]').forEach(button=>button.onclick=()=>detail(button.dataset.manageChart));
  host.querySelectorAll('[data-chart-visible]').forEach(input=>input.onchange=async()=>{
   const previous=!input.checked;host.querySelectorAll('button,input').forEach(control=>control.disabled=true);
   try{const id=input.dataset.chartVisible,custom=id.startsWith('custom:'),definition=custom?data.saved.find(chart=>chart.id===id.slice(7)):null;
    await command(data.revision,custom?'chart.save':'chart.display',custom?{...definition,visible:input.checked}:{id,patch:{visible:input.checked}});await load();await onChange?.();if(alive()&&host.isConnected)manage();}
   catch(error){if(host.isConnected){input.checked=previous;host.querySelector('[role=status]').textContent=error.message;}}
   finally{host.querySelectorAll('button,input').forEach(control=>control.disabled=false);}
  });
 }
 root.innerHTML='<p class="empty">Loading charts…</p>';load();
 return {dispose(){disposed=true;serial++;plots?.dispose();disposeDetail();observer.disconnect();},reload:load,openManage(){if(alive()&&data)manage();}};
}
export function openExport({date,show,header,content}){
 show(`${header('Export Data')}<form class="entry-form"><label class="field-row"><span>Report</span><select name="kind" aria-label="Export report">${[['daily-nutrients','Daily nutrients'],['daily-energy','Daily energy'],['diary','Foods'],['exercises','Exercise'],['biometrics','Biometrics'],['notes','Notes']].map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label><label class="field-row"><span>From</span><input name="from" aria-label="Export from" type="date" required value="${e(date())}"></label><label class="field-row"><span>To</span><input name="to" aria-label="Export to" type="date" required value="${e(date())}"></label><label class="field-row" data-export-groups><span>Include diary groups</span><input type="checkbox" name="includeGroups"></label><p class="sheet-message" role="status"></p><footer class="entry-actions"><button class="primary" type="submit">Download CSV</button><button type="button" data-export-cancel hidden>Cancel</button></footer></form>`);
 const form=content.querySelector('form'),status=form.querySelector('[role=status]'),cancel=form.querySelector('[data-export-cancel]');let pending=null,disposed=false;
 const controls=()=>{for(const input of form.querySelectorAll('input,select,button[type=submit]'))input.disabled=!!pending;const groups=form.elements.kind.value==='daily-nutrients';form.querySelector('[data-export-groups]').hidden=!groups;form.elements.includeGroups.disabled=!!pending||!groups;cancel.hidden=!pending;};
 const observer=new MutationObserver(()=>{if(!form.isConnected||content.closest('dialog')?.open===false){disposed=true;pending?.abort();observer.disconnect();}});observer.observe(content,{childList:true});const dialog=content.closest('dialog');if(dialog)observer.observe(dialog,{attributes:true,attributeFilter:['open']});
 form.oninput=()=>{form.elements.to.setCustomValidity('');controls();};cancel.onclick=()=>pending?.abort();
 form.onsubmit=async event=>{event.preventDefault();if(pending||disposed)return;const {kind,from,to}=Object.fromEntries(new FormData(form));form.elements.to.setCustomValidity(from>to?'Choose an end date on or after the start date.':'');if(!form.reportValidity())return;
  const body={kind,from,to,...(kind==='daily-nutrients'?{includeGroups:form.elements.includeGroups.checked}:{})};pending=new AbortController();controls();status.textContent='Preparing CSV…';
  try{const result=await request('/api/reports/export',body,pending.signal);if(disposed||!form.isConnected||pending.signal.aborted)return;const url=URL.createObjectURL(new Blob([result.csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=result.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='CSV ready.';}
  catch(error){if(!disposed&&form.isConnected)status.textContent=error.name==='AbortError'?'Cancelled.':error.message;}
  finally{pending=null;if(!disposed&&form.isConnected)controls();}
 };controls();
}
