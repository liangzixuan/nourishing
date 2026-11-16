import {mountMobileReport} from './report-mobile.js';
import {openGlucose,openCycle} from './health-controls.js';
import {openCoach} from './coach.js';
import {discoverHeader} from './app-shell.js';
import {mountDashboard} from './dashboard.js';
import {mountRecordEditor} from './records.js';
import {mountSnapshots} from './snapshots.js';
import {mountFasting} from './fasting.js';
import {mountCharts} from './charts.js';
import {newsfeedMarkup} from './dashboard-source/discover-settings-ui.js';
import {parseNewsfeed,newsCardsMarkup} from './dashboard-source/discover-news.js';
import {escape as e} from './html.js';
import {request} from './diary-api.js';
import {openPrintReport} from './print-report.js';
const offset=(date,days)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
export function mountNutrition({page,headerRoot,date,show,close,header,content,onChange,onDiary,onSuggest,initialTab='dashboard',reportDate}){
 let dashboard=null,snapshots=null,charts=null,fasting=null,mobileReport=null,disposed=false,serial=0,data,tab=initialTab,reportOptions={from:reportDate??offset(date(),-6),to:reportDate??date(),dayFilter:reportDate?'all':'nonempty',includeToday:true,includeSupplements:true};
 const root=document.createElement('section');root.className='nutrition-page';page.replaceChildren(root);
 const alive=()=>!disposed&&root.isConnected;
 async function news(){
  if(dashboard)return dashboard.openNews();
  show(`${header('Newsfeed')}<div class="dashboard-panel" aria-busy="true"></div>`);const host=content.querySelector('.dashboard-panel');
  try{const result=await request('/api/dashboard?'+new URLSearchParams({date:date()}));if(alive()&&host.isConnected)host.innerHTML=result.news.items.length?newsCardsMarkup(parseNewsfeed(result.news)):newsfeedMarkup('en');}
  catch(error){if(host.isConnected)host.textContent=error.message;}finally{host.removeAttribute('aria-busy');}
 }
 async function load(){const id=++serial;root.setAttribute('aria-busy','true');root.innerHTML='<p class="empty">Loading…</p>';
  try{const result=await request('/api/nutrition-report?'+new URLSearchParams(reportOptions));if(!alive()||serial!==id)return;data=result;discover();}
  catch(error){if(alive()&&serial===id){if(data&&tab==='report'){discover();const status=document.createElement('p');status.className='sheet-message';status.setAttribute('role','status');status.textContent=error.message;root.querySelector('.report-content').append(status);return;}root.innerHTML=`<p class="sheet-message">${e(error.message)}</p><button class="more-results" data-retry>Try again</button>`;root.querySelector('[data-retry]').onclick=load;}}
  finally{if(alive()&&serial===id)root.setAttribute('aria-busy','false');}
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
  },onPrint:options=>openPrintReport({initialOptions:options,show,header,content})});
 }
 load();return {reload:load,dispose(){disposed=true;serial++;dashboard?.dispose();snapshots?.dispose();charts?.dispose();fasting?.dispose();mobileReport?.dispose();}};
}
