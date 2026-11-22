import {dc} from './discover-cloud-messages.js';
import {bindDiscoverSwipe} from './discover-swipe.js';
import {createDiscoverMotion} from './discover-motion.js';
import {t} from './app-language.js';
import {mountMobileReport} from './report-mobile.js';
import {openGlucose,openCycle} from './health-controls.js';
import {openCoach} from './coach.js';
import {discoverHeader} from './app-shell.js';
import {mountDashboard,openDashboardNews} from './dashboard.js';
import {mountRecordEditor} from './records.js';
import {mountSnapshots} from './snapshots.js';
import {mountFasting,openFastingAction} from './fasting.js';
import {mountCharts} from './charts.js';
import {escape as e} from './html.js';
import {request} from './diary-api.js';
import {openPrintReport} from './print-report.js';
const offset=(date,days)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
export function mountNutrition({page,headerRoot,date,show,close,header,content,onChange,onDiary,onSuggest,initialTab='dashboard',reportDate}){
 let dashboard=null,snapshots=null,charts=null,fasting=null,mobileReport=null,disposed=false,serial=0,reportController,data,tab=initialTab,reportOptions={from:reportDate??offset(date(),-6),to:reportDate??date(),dayFilter:reportDate?'all':'nonempty',includeToday:true,includeSupplements:true};
 const rangeSelection={};
 const root=document.createElement('section');root.className='nutrition-page';page.replaceChildren(root);
 const motion=createDiscoverMotion(root);let finishLoading,refreshHeader;
 const releaseSwipe=bindDiscoverSwipe(root,{current:()=>tab,select,onMove:motion.preview,onCancel:motion.reset,isTransitioning:motion.isTransitioning});
 const alive=()=>!disposed&&root.isConnected;
 const changed=onChange;
 onChange=async(...args)=>{data=undefined;cancelReport();return changed?.(...args);};
 function cancelReport(){serial++;reportController?.abort();reportController=null;}
 function select(next){if(next===tab)return;const tabs=['dashboard','charts','report','snapshots'],direction=tabs.indexOf(next)>tabs.indexOf(tab)?1:-1;tab=next;refreshHeader?.(false);motion.change(direction,discover);}
 function news(){
  return dashboard?dashboard.openNews():openDashboardNews({show,close,content,date});
 }
 async function loadReport(panel,onReady){
  cancelReport();const id=serial,controller=new AbortController();reportController=controller;
  panel.setAttribute('aria-busy','true');if(data)renderReport(panel);else panel.innerHTML=`<p class="empty">${t('mobileNutrientDetail.loading')}</p>`;
  try{const apply=result=>{if(!alive()||serial!==id||tab!=='report')return;data=result;renderReport(panel);onReady?.();};apply(await request('/api/nutrition-report?'+new URLSearchParams(reportOptions),undefined,controller.signal,{onRefresh:result=>{if(!document.querySelector('dialog[open]'))apply(result);}}));}
  catch(error){if(alive()&&serial===id&&!controller.signal.aborted){panel.innerHTML=`<p class="sheet-message" role="status">${e(error.message)}</p><button class="more-results" data-retry>${t('mobileSuggest.retry')}</button>`;panel.querySelector('[data-retry]').onclick=()=>loadReport(panel,onReady);onReady?.(false);}}
  finally{if(panel.isConnected&&serial===id)panel.removeAttribute('aria-busy');}
 }
 function discover(){finishLoading?.();let resolveReady;const ready=new Promise(resolve=>{resolveReady=resolve;});finishLoading=resolveReady;cancelReport();dashboard?.dispose();dashboard=null;snapshots?.dispose();snapshots=null;charts?.dispose();charts=null;fasting?.dispose();fasting=null;mobileReport?.dispose();mobileReport=null;
  root.innerHTML=`${headerRoot?'':'<div class="dashboard-header-fallback"></div>'}<div class="report-content"></div>`;
  const title=headerRoot??root.querySelector('.dashboard-header-fallback'),panel=root.querySelector('.report-content');
  const renderHeader=(ready=true)=>{if(alive())discoverHeader({root:title,tab,ready,onTab:select,onNews:news,onSettings:()=>tab==='charts'?charts?.openManage():tab==='report'?mobileReport?.openSettings():dashboard?.openSettings()});};
  refreshHeader=renderHeader;
  const onReady=(available=true)=>{if(panel.isConnected){renderHeader(available);resolveReady();}};
  renderHeader(!['dashboard','charts'].includes(tab)&&(tab!=='report'||Boolean(data)));
  if(tab==='report'){void loadReport(panel,onReady);return ready;}
  if(tab==='snapshots'){snapshots=mountSnapshots({root:panel,show,close,header,content,date,onChange,onReady});return ready;}
  if(['fasting','new-fast','end-fast','start-now'].includes(tab)){const initialAction=tab==='new-fast'?'new':tab==='end-fast'?'end':tab==='start-now'?'start-now':undefined;tab='fasting';fasting=mountFasting({page:panel,headerRoot:title,onBack:()=>{tab='dashboard';discover();},show,close,header,content,onChange,initialAction});return;}
  if(tab==='charts'){charts=mountCharts({page:panel,date,show,close,header,content,onChange,onReady});return ready;}
  if(tab==='dashboard'){
   dashboard=mountDashboard({root:panel,date,show,close,header,content,onChange,onDiary,onReady,onHealth:kind=>(kind==='glucose'?openGlucose:openCycle)({date,show,close,header,content,onChange}),onCoach:()=>openCoach({date,show,close,header,content,onChange,onReport:day=>{reportOptions={...reportOptions,from:day,to:day,dayFilter:'all'};tab='report';data=undefined;discover();},onSuggest}),onReport:()=>select('report'),onFasting:(intent='fasting',activeId)=>{if(intent==='fasting'){tab=intent;discover();return;}fasting?.dispose();const action={'new-fast':'new','end-fast':'end'}[intent]??intent;fasting=openFastingAction({page:panel,initialAction:action,activeId,onChange:async()=>{await onChange();await dashboard?.reload();panel.querySelector('[data-discover="'+intent+'"]')?.focus({preventScroll:true});}});},onWeight:()=>mountRecordEditor({kind:'biometric',initialSelection:{selection:{kind:'catalog',id:'weight'},unit:null},date:date(),show,close,header,content,onChange:async()=>{await onChange();await dashboard?.reload();}})});return ready;
  }
 }
 function renderReport(panel){
  mobileReport?.dispose();
  mobileReport=mountMobileReport({root:panel,value:data,rangeSelection,onApply:async (options,signal)=>{
   const id=++serial,result=await request('/api/nutrition-report?'+new URLSearchParams(options),undefined,signal);
   if(signal.aborted||!alive()||serial!==id||tab!=='report')throw Error(dc('reportClosed'));
   data=result;reportOptions={...result.report.options};return result;
  },onPrint:options=>openPrintReport({initialOptions:options,show,header,content})});
 }
 discover();return {reload(){motion.cancel();data=undefined;discover();},dispose(){disposed=true;releaseSwipe();motion.dispose();finishLoading?.();cancelReport();dashboard?.dispose();snapshots?.dispose();charts?.dispose();fasting?.dispose();mobileReport?.dispose();}};
}
