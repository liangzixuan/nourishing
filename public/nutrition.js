import {mountMobileReport} from './report-mobile.js';
import {openGlucose,openCycle} from './health-controls.js';
import {openCoach} from './coach.js';
import {discoverHeader} from './app-shell.js';
import {mountDashboard} from './dashboard.js';
import {mountRecordEditor} from './records.js';
import {mountSnapshots} from './snapshots.js';
import {mountFasting} from './fasting.js';
import {openTargetPolicies} from './target-policies.js';
import {mountCharts} from './charts.js';
import {newsfeedMarkup} from './dashboard-source/discover-settings-ui.js';
import {parseNewsfeed,newsCardsMarkup} from './dashboard-source/discover-news.js';
import {escape as e} from './html.js';
import {request,command} from './diary-api.js';
import {applyTheme} from './appearance.js';
import {openPrintReport} from './print-report.js';
import {openNutrientDetail} from './nutrient-detail.js';
const num=(n,d=1)=>Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:d}):'—';
const commonIds=['calories','protein','carbs','fat','fiber','water','sugar','sodium','potassium','calcium','iron','magnesium','vitaminA','vitaminC','vitaminD','vitaminE','vitaminK','vitaminB6','vitaminB12','omega3','omega6'];
const rank=row=>commonIds.includes(row.id)?commonIds.indexOf(row.id):commonIds.length;
const ordered=rows=>[...rows].sort((a,b)=>rank(a)-rank(b)||a.name.localeCompare(b.name));
const owners={scheduler:'Macro schedule',weekday:'Weekday schedule',macros:'Macro policy',expenditure:'Calculated energy',references:'Reference targets'};
const offset=(date,days)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
export function mountNutrition({page,headerRoot,mode,date,show,close,header,content,onChange,onDiary,onSuggest,initialTab='dashboard',reportDate}){
 let dashboard=null,snapshots=null,charts=null,fasting=null,mobileReport=null,disposed=false,serial=0,data,tab=initialTab,query='',reportOptions={from:reportDate??offset(date(),-6),to:reportDate??date(),dayFilter:reportDate?'all':'nonempty',includeToday:true,includeSupplements:true};
 const root=document.createElement('section');root.className='nutrition-page';page.replaceChildren(root);
 const alive=()=>!disposed&&root.isConnected;
 async function news(){
  if(dashboard)return dashboard.openNews();
  show(`${header('Newsfeed')}<div class="dashboard-panel" aria-busy="true"></div>`);const host=content.querySelector('.dashboard-panel');
  try{const result=await request('/api/dashboard?'+new URLSearchParams({date:date()}));if(alive()&&host.isConnected)host.innerHTML=result.news.items.length?newsCardsMarkup(parseNewsfeed(result.news)):newsfeedMarkup('en');}
  catch(error){if(host.isConnected)host.textContent=error.message;}finally{host.removeAttribute('aria-busy');}
 }
 async function load(){const id=++serial;root.setAttribute('aria-busy','true');root.innerHTML='<p class="empty">Loading…</p>';
  try{const result=await request(mode==='targets'?'/api/targets?date='+date():'/api/nutrition-report?'+new URLSearchParams(reportOptions));if(!alive()||serial!==id)return;data=result;mode==='targets'?targets():discover();}
  catch(error){if(alive()&&serial===id){if(mode!=='targets'&&data&&tab==='report'){discover();const status=document.createElement('p');status.className='sheet-message';status.setAttribute('role','status');status.textContent=error.message;root.querySelector('.report-content').append(status);return;}root.innerHTML=`<p class="sheet-message">${e(error.message)}</p><button class="more-results" data-retry>Try again</button>`;root.querySelector('[data-retry]').onclick=load;}}
  finally{if(alive()&&serial===id)root.setAttribute('aria-busy','false');}
 }
 function targets(){
  applyTheme(data.theme);
  root.innerHTML=`<button type="button" class="more-results" data-target-policies>Macro & Energy Targets</button><p class="sheet-message mm-targets-status" role="status"></p><div class="target-heading"><h2>Nutrient targets</h2><span>${e(date())}</span></div><input type="search" class="target-search" aria-label="Search nutrients" placeholder="Search nutrients" value="${e(query)}"><div class="target-list"></div>`;
  root.querySelector('[data-target-policies]').onclick=()=>openTargetPolicies({date,show,close,header,content,onChange:async()=>{await onChange();if(alive())await load();}});
  const list=root.querySelector('.target-list');
  const filter=()=>{const rows=ordered(data.nutrients).filter(r=>r.name.toLowerCase().includes(query.toLowerCase()));const render=r=>`<button type="button" class="target-row" data-nutrient="${e(r.id)}"><span><strong>${e(r.name)}</strong>${r.editor?`<small>${e(owners[r.editor])}</small>`:''}</span><span>${num(r.dailyTarget)} ${e(r.unit)}${r.visible?'':' · Hidden'} ›</span></button>`;list.innerHTML=query?rows.map(render).join(''):rows.filter(r=>commonIds.includes(r.id)).map(render).join('')+'<details class=additional-nutrients><summary>More nutrients</summary>'+rows.filter(r=>!commonIds.includes(r.id)).map(render).join('')+'</details>';list.querySelectorAll('[data-nutrient]').forEach(b=>b.onclick=()=>editTarget(data.nutrients.find(r=>r.id===b.dataset.nutrient)));};filter();
  root.querySelector('input').oninput=event=>{query=event.target.value;filter();};
 }
 function editTarget(row){
  const field=(key,label,value,locked)=>`<label class="field-row"><span>${label} (${e(row.unit)})</span><input name="${key}" aria-label="${label}" type="number" step="any" min="0" value="${value??''}" ${locked?'disabled':''} placeholder="Not set"></label>`;
  show(`${header(row.name)}<form class="entry-form">${row.editor?`<p class="target-owner">Daily target: ${e(owners[row.editor])}</p>`:''}${field('dailyTarget','Daily target',row.dailyTarget,row.editor)}${row.maximumEditor?'<p class="target-owner">Maximum: Reference targets</p>':''}${field('maximum','Maximum',row.maximum,row.maximumEditor)}<label class="field-row"><span>Show nutrient</span><input name="visible" type="checkbox" ${row.visible?'checked':''}></label><p class="sheet-message" role="status"></p><footer class="entry-actions"><button class="primary">Save</button></footer></form>`);
  const form=content.querySelector('form'),revision=data.revision;
  form.onsubmit=async event=>{event.preventDefault();const changes={};for(const key of ['dailyTarget','maximum'])if(!form.elements[key].disabled){const value=form.elements[key].value===''?null:Number(form.elements[key].value);if(value!==row[key])changes[key]=value;}if(form.elements.visible.checked!==row.visible)changes.visible=form.elements.visible.checked;if(!Object.keys(changes).length){close();return;}
   const button=form.querySelector('button');button.disabled=true;try{await command(revision,'nutrientTarget.patch',{date:date(),id:row.id,changes});await onChange();if(form.isConnected)close();if(alive())await load();}catch(error){if(form.isConnected){const status=form.querySelector('[role=status]');status.textContent=error.message;if(error.status===409){const refresh=document.createElement('button');refresh.type='button';refresh.textContent='Reload targets';refresh.onclick=()=>{close();load();};status.append(refresh);}}}finally{button.disabled=false;}
  };
 }
 function discover(){dashboard?.dispose();dashboard=null;snapshots?.dispose();snapshots=null;charts?.dispose();charts=null;fasting?.dispose();fasting=null;mobileReport?.dispose();mobileReport=null;
  root.innerHTML=`${headerRoot?'':'<div class="dashboard-header-fallback"></div>'}<div class="report-content"></div>`;
  const title=headerRoot??root.querySelector('.dashboard-header-fallback'),panel=root.querySelector('.report-content');
  const renderHeader=(ready=true)=>{if(alive())discoverHeader({root:title,tab,ready,onTab:next=>{tab=next;discover();},onNews:news,onSettings:()=>tab==='charts'?charts?.openManage():tab==='report'?mobileReport?.openSettings():dashboard?.openSettings()});};
  renderHeader(!['dashboard','charts'].includes(tab));
  if(tab==='snapshots'){snapshots=mountSnapshots({root:panel,show,close,header,content,date,onChange});return;}
  if(tab==='fasting'||tab==='new-fast'){const initialAction=tab==='new-fast'?'new':undefined;tab='fasting';fasting=mountFasting({page:panel,show,close,header,content,onChange,initialAction});return;}
  if(tab==='charts'){charts=mountCharts({page:panel,date,show,close,header,content,onChange,onReady:()=>{if(panel.isConnected&&tab==='charts')renderHeader();}});return;}
  if(tab==='dashboard'){
   dashboard=mountDashboard({root:panel,date,show,close,header,content,onChange,onDiary,onReady:()=>{if(panel.isConnected&&tab==='dashboard')renderHeader();},onHealth:kind=>(kind==='glucose'?openGlucose:openCycle)({date,show,close,header,content,onChange}),onCoach:()=>openCoach({date,show,close,header,content,onChange,onReport:day=>{reportOptions={...reportOptions,from:day,to:day,dayFilter:'all'};tab='report';load();},onSuggest}),onReport:()=>{tab='report';discover();},onFasting:()=>{tab='fasting';discover();},onWeight:()=>mountRecordEditor({kind:'biometric',date:date(),show,close,header,content,onChange:async()=>{await onChange();await dashboard?.reload();}})});return;
  }
  mobileReport=mountMobileReport({root:panel,value:data,onApply:async options=>{
   const id=++serial,result=await request('/api/nutrition-report?'+new URLSearchParams(options));
   if(!alive()||serial!==id||tab!=='report')throw Error('This report is no longer open.');
   data=result;reportOptions={...result.report.options};return result;
  },onNutrient:(nutrient,options)=>openNutrientDetail({nutrient,options,show,header,content}),onPrint:options=>openPrintReport({initialOptions:options,show,header,content})});
 }
 load();return {reload:load,dispose(){disposed=true;serial++;dashboard?.dispose();snapshots?.dispose();charts?.dispose();fasting?.dispose();mobileReport?.dispose();}};
}
