import {mountDashboard} from './dashboard.js';
import {mountRecordEditor} from './records.js';
import {mountBackup} from './backup.js';
import {openProfileSettings} from './profile-settings.js';
import {mountSnapshots} from './snapshots.js';
import {openImports} from './imports.js';
import {mountFasting} from './fasting.js';
import {openTargetPolicies} from './target-policies.js';
import {mountCharts,openExport} from './charts.js';
import {escape as e} from './html.js';
import {request,command} from './diary-api.js';
import {applyTheme} from './appearance.js';
import {openPrintReport} from './print-report.js';
const num=(n,d=1)=>Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:d}):'—';
const commonIds=['calories','protein','carbs','fat','fiber','water','sugar','sodium','potassium','calcium','iron','magnesium','vitaminA','vitaminC','vitaminD','vitaminE','vitaminK','vitaminB6','vitaminB12','omega3','omega6'];
const rank=row=>commonIds.includes(row.id)?commonIds.indexOf(row.id):commonIds.length;
const ordered=rows=>[...rows].sort((a,b)=>rank(a)-rank(b)||a.name.localeCompare(b.name));
const owners={scheduler:'Macro schedule',weekday:'Weekday schedule',macros:'Macro policy',expenditure:'Calculated energy',references:'Reference targets'};
const offset=(date,days)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
const option=(value,label,current)=>`<option value="${e(value)}" ${value===current?'selected':''}>${e(label)}</option>`;
export function mountNutrition({page,mode,date,show,close,header,content,onChange,initialTab='dashboard'}){
 let dashboard=null,backup=null,snapshots=null,charts=null,fasting=null,disposed=false,serial=0,data,tab=initialTab,query='',reportOptions={from:offset(date(),-6),to:date(),dayFilter:'nonempty',includeToday:true,includeSupplements:true};
 const root=document.createElement('section');root.className='nutrition-page';page.replaceChildren(root);
 const alive=()=>!disposed&&root.isConnected;
 async function load(){const id=++serial;root.setAttribute('aria-busy','true');root.innerHTML='<p class="empty">Loading…</p>';
  try{const result=await request(mode==='targets'?'/api/targets?date='+date():'/api/nutrition-report?'+new URLSearchParams(reportOptions));if(!alive()||serial!==id)return;data=result;mode==='targets'?targets():discover();}
  catch(error){if(alive()&&serial===id){if(mode!=='targets'&&data&&tab==='report'){discover();root.querySelectorAll('.nutrition-card').forEach(card=>card.remove());const status=document.createElement('p');status.className='sheet-message';status.setAttribute('role','status');status.textContent=error.message;root.querySelector('.report-content').append(status);return;}root.innerHTML=`<p class="sheet-message">${e(error.message)}</p><button class="more-results" data-retry>Try again</button>`;root.querySelector('[data-retry]').onclick=load;}}
  finally{if(alive()&&serial===id)root.setAttribute('aria-busy','false');}
 }
 function targets(){
  applyTheme(data.theme);
  root.innerHTML=`<h1>Targets & Settings</h1><button type="button" data-profile-settings>Profile &amp; Body</button><button type="button" class="more-results" data-target-policies>Macro & Energy Targets</button><button type="button" class="more-results" data-export>Export data</button><button type="button" data-backup>Backup &amp; Restore</button><button type="button" data-imports>Import &amp; devices</button><label class="field-row"><span>Theme</span><select aria-label="Theme">${[['dark','Dark'],['light','Light'],['system','System (device setting)']].map(([v,l])=>option(v,l,data.theme)).join('')}</select></label><p class="sheet-message" role="status"></p><div class="target-heading"><h2>Nutrient targets</h2><span>${e(date())}</span></div><input type="search" class="target-search" aria-label="Search nutrients" placeholder="Search nutrients" value="${e(query)}"><div class="target-list"></div>`;
  root.querySelector('[data-target-policies]').onclick=()=>openTargetPolicies({date,show,close,header,content,onChange:async()=>{await onChange();if(alive())await load();}});
  root.querySelector('[data-profile-settings]').onclick=()=>openProfileSettings({date,show,close,header,content,onChange:async()=>{await onChange();if(alive())await load();}});
  root.querySelector('[data-imports]').onclick=()=>openImports({show,close,header,content,onChange});
  root.querySelector('[data-backup]').onclick=()=>{root.innerHTML='<button type=button data-back-settings>Back to Settings</button><h1>Backup &amp; Restore</h1><div class=backup-host></div>';backup=mountBackup({root:root.querySelector('.backup-host'),show,close,header,content,onChange});root.querySelector('[data-back-settings]').onclick=()=>{backup?.dispose();backup=null;load();};};
  root.querySelector('[data-export]').onclick=()=>openExport({date,show,header,content});
  const list=root.querySelector('.target-list');
  const filter=()=>{const rows=ordered(data.nutrients).filter(r=>r.name.toLowerCase().includes(query.toLowerCase()));const render=r=>`<button type="button" class="target-row" data-nutrient="${e(r.id)}"><span><strong>${e(r.name)}</strong>${r.editor?`<small>${e(owners[r.editor])}</small>`:''}</span><span>${num(r.dailyTarget)} ${e(r.unit)}${r.visible?'':' · Hidden'} ›</span></button>`;list.innerHTML=query?rows.map(render).join(''):rows.filter(r=>commonIds.includes(r.id)).map(render).join('')+'<details class=additional-nutrients><summary>More nutrients</summary>'+rows.filter(r=>!commonIds.includes(r.id)).map(render).join('')+'</details>';list.querySelectorAll('[data-nutrient]').forEach(b=>b.onclick=()=>editTarget(data.nutrients.find(r=>r.id===b.dataset.nutrient)));};filter();
  root.querySelector('input').oninput=event=>{query=event.target.value;filter();};
  const theme=root.querySelector('select');theme.onchange=async()=>{theme.disabled=true;try{const result=await command(data.revision,'preferences.patch',{theme:theme.value});if(!alive())return;data.revision=result.revision;data.theme=theme.value;applyTheme(data.theme);await onChange();}catch(error){if(alive()){root.querySelector('[role=status]').textContent=error.message;theme.value=data.theme;}}finally{theme.disabled=false;}};
 }
 function editTarget(row){
  const field=(key,label,value,locked)=>`<label class="field-row"><span>${label} (${e(row.unit)})</span><input name="${key}" aria-label="${label}" type="number" step="any" min="0" value="${value??''}" ${locked?'disabled':''} placeholder="Not set"></label>`;
  show(`${header(row.name)}<form class="entry-form">${row.editor?`<p class="target-owner">Daily target: ${e(owners[row.editor])}</p>`:''}${field('dailyTarget','Daily target',row.dailyTarget,row.editor)}${row.maximumEditor?'<p class="target-owner">Maximum: Reference targets</p>':''}${field('maximum','Maximum',row.maximum,row.maximumEditor)}<label class="field-row"><span>Show nutrient</span><input name="visible" type="checkbox" ${row.visible?'checked':''}></label><p class="sheet-message" role="status"></p><footer class="entry-actions"><button class="primary">Save</button></footer></form>`);
  const form=content.querySelector('form'),revision=data.revision;
  form.onsubmit=async event=>{event.preventDefault();const changes={};for(const key of ['dailyTarget','maximum'])if(!form.elements[key].disabled){const value=form.elements[key].value===''?null:Number(form.elements[key].value);if(value!==row[key])changes[key]=value;}if(form.elements.visible.checked!==row.visible)changes.visible=form.elements.visible.checked;if(!Object.keys(changes).length){close();return;}
   const button=form.querySelector('button');button.disabled=true;try{await command(revision,'nutrientTarget.patch',{date:date(),id:row.id,changes});await onChange();if(form.isConnected)close();if(alive())await load();}catch(error){if(form.isConnected){const status=form.querySelector('[role=status]');status.textContent=error.message;if(error.status===409){const refresh=document.createElement('button');refresh.type='button';refresh.textContent='Reload targets';refresh.onclick=()=>{close();load();};status.append(refresh);}}}finally{button.disabled=false;}
  };
 }
 const metric=(label,value,unit)=>`<div><span>${e(label)}</span><strong>${num(value)} <small>${e(unit)}</small></strong></div>`;
 function nutrientRow(row){return `<div class="report-nutrient" data-report-nutrient="${e(row.id)}"><div><strong>${e(row.name)}</strong><span>${num(row.mean)} ${e(row.unit)}</span></div>${Number.isFinite(row.percentOfMeanTarget)?`<progress max="100" value="${Math.min(100,Math.max(0,row.percentOfMeanTarget))}" aria-label="${e(row.name)} target progress"></progress>`:''}<small>${row.mean===null?'No data':`${row.knownDays}/${row.eligibleDays} days`}${row.partialDays?` · ${row.partialDays} partial`:''}${Number.isFinite(row.meanTarget)?` · Target ${num(row.meanTarget)} ${e(row.unit)}`:''}</small></div>`;}
 function discover(){dashboard?.dispose();dashboard=null;snapshots?.dispose();snapshots=null;charts?.dispose();charts=null;fasting?.dispose();fasting=null;const report=data.report,calories=report.nutrients.find(r=>r.id==='calories');
  root.innerHTML=`<nav class="discover-tabs" aria-label="Discover"><button type="button" data-tab="dashboard" ${tab==='dashboard'?'aria-current="page"':''}>Dashboard</button><button type="button" data-tab="charts" ${tab==='charts'?'aria-current="page"':''}>Charts</button><button type="button" data-tab="report" ${tab==='report'?'aria-current="page"':''}>Report</button><button type="button" data-tab="snapshots" ${tab==='snapshots'?'aria-current="page"':''}>Snapshots</button></nav><div class="report-content"></div>`;
  root.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;discover();});const panel=root.querySelector('.report-content');
  if(tab==='snapshots'){snapshots=mountSnapshots({root:panel,show,close,header,content,date,onChange});return;}
  if(tab==='fasting'){fasting=mountFasting({page:panel,show,close,header,content,onChange});return;}
  if(tab==='charts'){charts=mountCharts({page:panel,date,show,close,header,content,onChange});return;}
  if(tab==='dashboard'){
   dashboard=mountDashboard({root:panel,date,show,close,header,content,onChange,onReport:()=>{tab='report';discover();},onFasting:()=>{tab='fasting';discover();},onWeight:()=>mountRecordEditor({kind:'biometric',date:date(),show,close,header,content,onChange:async()=>{await onChange();await dashboard?.reload();}}),onConnect:()=>openImports({show,close,header,content,onChange})});return;
  }
  panel.innerHTML=`<form class="report-filters"><div class="report-dates"><label>From<input aria-label="From" name="from" type="date" required value="${reportOptions.from}"></label><label>To<input aria-label="To" name="to" type="date" required value="${reportOptions.to}"></label></div><label class="field-row"><span>Days</span><select name="dayFilter" aria-label="Days">${[['nonempty','Logged days'],['complete','Completed days'],['all','All days']].map(([v,l])=>option(v,l,reportOptions.dayFilter)).join('')}</select></label><label class="field-row"><span>Include today</span><input type="checkbox" name="includeToday" ${reportOptions.includeToday?'checked':''}></label><label class="field-row"><span>Include supplements</span><input type="checkbox" name="includeSupplements" ${reportOptions.includeSupplements?'checked':''}></label><button class="primary">Update report</button></form><section class="nutrition-card"><h2>Daily averages</h2><p class="report-period">${report.counts.eligibleDays} of ${report.counts.requestedDays} days</p><div class="report-macros">${metric('Calories',calories.mean,'kcal')}${metric('Target',calories.meanTarget,'kcal')}</div></section><section class="nutrition-card"><h2>Nutrients</h2>${ordered(report.nutrients).filter(r=>r.visible&&(commonIds.includes(r.id)||r.mean!==null)).map(nutrientRow).join('')}<details class=additional-nutrients><summary>More nutrients</summary>${ordered(report.nutrients).filter(r=>r.visible&&!commonIds.includes(r.id)&&r.mean===null).map(nutrientRow).join('')}</details></section>`;
  const printButton=document.createElement('button');printButton.type='button';printButton.textContent='Print Report';printButton.className='more-results';printButton.onclick=()=>openPrintReport({initialOptions:{...reportOptions},show,header,content});panel.querySelector('form').after(printButton);
  panel.querySelector('form').onsubmit=event=>{event.preventDefault();const form=event.target;reportOptions={from:form.elements.from.value,to:form.elements.to.value,dayFilter:form.elements.dayFilter.value,includeToday:form.elements.includeToday.checked,includeSupplements:form.elements.includeSupplements.checked};load();};
 }
 load();return {reload:load,dispose(){disposed=true;serial++;dashboard?.dispose();backup?.dispose();snapshots?.dispose();charts?.dispose();fasting?.dispose();}};
}
