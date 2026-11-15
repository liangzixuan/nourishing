import {request} from './diary-api.js';
import {escape as e} from './html.js';
const languages=new Set(['en','fr','de','pt-BR']);
const sections=[['nutrition','Nutrition'],['diary','Diary'],['profile','Profile'],['biometrics','Biometrics'],['notes','Notes'],['bloodPressure','Blood pressure'],['glucoseKetones','Glucose & ketones']];

/** Only presentation changes: source report values, text and SVG attributes stay captured. */
export function cspPrintDocument(html,language){
 if(!languages.has(language))throw Error('Unsupported report language.');
 const document=new DOMParser().parseFromString(html,'text/html');
 if(document.querySelector('script,iframe,object,embed'))throw Error('Invalid report document.');
 if(document.querySelector('style,[style]'))throw Error('Unsupported report styling.');
 const csp=document.querySelector('meta[http-equiv="Content-Security-Policy"]');
 if(!csp)throw Error('Missing report policy.');
 const links=document.querySelectorAll('link');if(links.length!==1||links[0].getAttribute('href')!=='/report-source/print-'+language+'.css')throw Error('Invalid report stylesheet.');
 return html;
}

export async function openPrintReport({initialOptions,show,header,content}){
 show(header('Print Report')+'<section class="print-flow"><p role="status">Loading…</p></section>');
 const root=content.querySelector('.print-flow');let metadata;
 try{metadata=await request('/api/print-report/options');if(!root.isConnected)return;}catch(error){if(root.isConnected)root.querySelector('[role=status]').textContent=error.message;return;}
 let serial=0,controller,frame=null,captured=null,ready=false;
 const select=(name,label,checked)=>`<label class="field-row"><span>${label}</span><input type="checkbox" name="${name}" ${checked?'checked':''}></label>`;
 root.innerHTML=`<form class="entry-form"><div class="report-dates"><label>From<input name="from" type="date" value="${e(initialOptions.from)}" required></label><label>To<input name="to" type="date" value="${e(initialOptions.to)}" required></label></div><label class="field-row"><span>Days</span><select name="dayFilter">${[['all','All days'],['nonempty','Logged days'],['complete','Completed days']].map(([value,label])=>`<option value="${value}" ${initialOptions.dayFilter===value?'selected':''}>${label}</option>`).join('')}</select></label>${select('includeToday','Include today',initialOptions.includeToday)}${select('includeSupplements','Include supplements',initialOptions.includeSupplements)}<fieldset><legend>Sections</legend>${sections.map(([id,label])=>select(id,label,id==='nutrition')).join('')}</fieldset><details><summary>Diary column & charts</summary><label class="field-row"><span>Diary column</span><select name="diaryColumn"><option value="macros">Macros</option>${metadata.diaryColumns.map(row=>`<option value="${e(row.id)}">${e(row.name)} (${e(row.unit)})</option>`).join('')}</select></label>${metadata.charts.map(row=>select('chart:'+row.id,e(row.name),false)).join('')}</details><p class="sheet-message" role="status"></p><footer class="entry-actions"><button class="primary" type="submit">Preview</button><button type="button" data-print disabled>Print / Save PDF</button></footer></form><div class="print-preview"></div>`;
 const form=root.querySelector('form'),status=form.querySelector('[role=status]'),print=form.querySelector('[data-print]'),generate=form.querySelector('[type=submit]'),preview=root.querySelector('.print-preview');
 const reviewActions=document.createElement('footer');reviewActions.className='entry-actions print-review-actions';reviewActions.hidden=true;const change=document.createElement('button');change.type='button';change.textContent='Change options';reviewActions.append(change,print);preview.after(reviewActions);form.after(status);
 const clear=()=>{serial++;controller?.abort();controller=null;captured=null;ready=false;frame?.remove();frame=null;preview.replaceChildren();print.disabled=true;generate.disabled=false;form.hidden=false;reviewActions.hidden=true;};
 change.onclick=()=>{clear();status.textContent='';};
 const observer=new MutationObserver(()=>{if(!root.isConnected){clear();observer.disconnect();window.removeEventListener('pagehide',dispose);}});
 const dispose=()=>{clear();observer.disconnect();window.removeEventListener('pagehide',dispose);};
 observer.observe(content,{childList:true});window.addEventListener('pagehide',dispose,{once:true});
 form.oninput=()=>{clear();status.textContent='';};form.onchange=form.oninput;
 form.onsubmit=async event=>{
  event.preventDefault();clear();const id=++serial;controller=new AbortController();generate.disabled=true;status.textContent='Preparing report…';
  const values=form.elements,input={options:{from:values.from.value,to:values.to.value,dayFilter:values.dayFilter.value,includeToday:values.includeToday.checked,includeSupplements:values.includeSupplements.checked},sections:{...Object.fromEntries(sections.map(([key])=>[key,values[key].checked])),chartIds:metadata.charts.filter(row=>values['chart:'+row.id].checked).map(row=>row.id),diaryColumn:values.diaryColumn.value==='macros'?{mode:'macros'}:{mode:'nutrient',id:values.diaryColumn.value}}};
  try{
   const [result,renderer]=await Promise.all([request('/api/print-report/preview',input,controller.signal),import('./report-source/renderer.js')]);
   if(!root.isConnected||id!==serial)return;
   if(result.accountId!==metadata.accountId||typeof result.accountId!=='string'||!result.accountId)throw Error('Your account changed. Reopen the report.');
   const same=(a,b)=>Object.keys(a).length===Object.keys(b??{}).length&&Object.entries(a).every(([key,value])=>JSON.stringify(value)===JSON.stringify(b[key]));
   if(!same(input.options,result.capture.options)||!same(input.sections,result.capture.sections))throw Error('Report options changed. Preview again.');
   const html=cspPrintDocument(renderer.renderPrintDocument(result.capture,{energyUnit:result.energyUnit,language:result.language}),result.language);
   captured=result;frame=document.createElement('iframe');frame.title='Report preview';frame.dataset.printFrame='';frame.dataset.printAccountId=result.accountId;frame.setAttribute('sandbox','allow-same-origin allow-modals');
   frame.onload=()=>{if(!root.isConnected||id!==serial||!frame?.contentDocument)return;const styles=frame.contentDocument.styleSheets;try{if(styles.length!==1||!styles[0].cssRules.length)throw Error('Report styles did not load.');ready=true;print.disabled=false;status.textContent='';form.hidden=true;reviewActions.hidden=false;root.closest('dialog')?.scrollTo(0,0);}catch(error){status.textContent=error.message;print.disabled=true;}};
   frame.srcdoc=html;preview.append(frame);
  }catch(error){if(root.isConnected&&id===serial){clear();status.textContent=error.message;}}
  finally{if(root.isConnected&&id===serial)generate.disabled=false;}
 };
 print.onclick=async()=>{
  if(!ready||!captured||!frame)return;const selected=frame,accountId=captured.accountId;print.disabled=true;
  try{const account=await request('/api/account');if(!root.isConnected||frame!==selected)return;if(account.id!==accountId){clear();throw Error('Your account changed. Reopen the report.');}selected.contentWindow.focus();await selected.contentWindow.print();}
  catch(error){if(root.isConnected)status.textContent=error.message;}
  finally{if(root.isConnected)print.disabled=!ready;}
 };
 return {dispose};
}
