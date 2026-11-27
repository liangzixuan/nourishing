import {guardSheetExit} from './edge-navigation.js';
import {escape as e} from './html.js';
import {uiLanguage} from './app-language.js';
import {dc} from './discover-cloud-messages.js';
import {request,command,queueCommand} from './diary-api.js';
import {readDeviceCache} from './device-cache.js';
import {onBackgroundWriteStatus} from './background-writes.js';
import {chartCardMarkup,mountChartPlots,validateChartView} from './chart-presentation.js';
import {chartArrow,chartSeriesLabel} from './charts-source-view.js';
import {chartTimeBounds} from './chart-rendering-source.js';
import {MobileChartPicker} from './cgm-detail-source/mobile-chart-picker.js';
import {cgmRangeScreen,previewCgmRange} from './cgm-detail-source/mobile-cgm-range.js';
import {cgmHelpContent} from './health-source/public/mobile-cgm-guidance.js';
import {cgmStatistics,openCgmStatistics} from './health-source/public/mobile-cgm-stats.js';
import {mobileChartsMessages} from './health-source/public/locales/mobile-charts.js';
import {createMessageFormatter} from './report-source/public/message-formatter.js';
import {openGlucose} from './health-controls.js';
const format=createMessageFormatter(mobileChartsMessages),m=(key,values)=>format(uiLanguage(),key,values);
const gear='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 3 1-2h4l1 2 3 2 2 1v4l-2 1v3l2 1v4l-2 1-3 2-1 2h-4l-1-2-3-2-2-1v-4l2-1v-3l-2-1V6l2-1z" transform="translate(2 2) scale(.8)"/><circle cx="12" cy="12" r="3"/></svg>';

/** Source detailCards semantics: a separate comparison plot sharing the captured window. */
export function cgmDetailCards(card){
 if(!card.settings.showCompare||!card.capture.stats.count||!card.comparison)return [card];
 const timeBounds=chartTimeBounds({...card,series:[...card.series,card.comparison]});
 return [{...card,timeBounds},{...card,id:'cgm-comparison',series:[card.comparison],timeBounds,target:null,timing:{untimedCount:card.comparison.untimedCount}}];
}

/** Owns one CGM detail and its source child screens; the server owns all values. */
export function mountCgmDetail(view,ui){
 const {show,content,close}=ui;
 show('<section class="cgm-detail"></section>');const root=content.querySelector('.cgm-detail'),dialog=content.closest('dialog'),abort=new AbortController();
 let card=view.cards.find(row=>row.id==='cgm'),screen='detail',plots=null,picker=null,disposed=false,busy=false,error='',pending=null,detailScroll=0,settingsScroll=0,statsOpen=[],editSerial=0;
 const ownerTicket=readDeviceCache('/api/diary').then(cached=>cached.ticket).catch(()=>null);
 const queued=new Set();
 const alive=()=>!disposed&&root.isConnected,scrollHost=()=>dialog??content;
 const pick=(key,label,value)=>`<button type="button" class="mcl-row" data-cgm-pick="${key}"><strong>${e(label)}</strong><span>${e(value)}${chartArrow}</span></button>`;
 const toggle=(key,label)=>`<label class="mcl-row"><strong>${e(label)}</strong><input type="checkbox" class="chart-visibility" role="switch" data-cgm-setting="${key}" aria-label="${e(label)}" ${card.settings[key]?'checked':''}></label>`;
 function render(){
  if(!alive())return;const scroll=scrollHost().scrollTop;
  if(root.querySelector('[data-mcl-stats]'))statsOpen=openCgmStatistics(root);
  plots?.dispose();plots=null;
  const title=m(screen==='target'?'targetRange':screen==='settings'?'cgmSettings':'cgm');
  const controls=screen==='settings'?`<div class="mcl-group"><button type="button" class="mcl-row mcl-target-setting" data-cgm-target><span><strong>${e(m('targetRange'))}</strong><small>${e(m('range'+card.targetRange.mode))}</small></span>${chartArrow}</button>${pick('primaryUnit',m('cgmUnits'),card.axisUnits.find(axis=>axis.key==='primaryUnit').unit)}${toggle('showInsulin',m('showInsulin'))}${toggle('showFasting',m('showFasting'))}${toggle('showCompare',m('showCompare'))}${toggle('showOnDashboard',m('showOnDashboard'))}${toggle('showCycle',dc('cyclePhases'))}</div><button type="button" class="mcl-row mcl-group" data-cgm-configure>${e(m('configure'))}${chartArrow}</button>`:'';
  const cards=cgmDetailCards(card),comparison=card.settings.showCompare&&card.capture.stats.count>0?`<h3>${e(m('compare'))}</h3>${cards[1]?chartCardMarkup(cards[1],{detail:true,statistics:false}):''}<div class="mcl-group">${pick('compare',m('compareMetric'),card.comparison?chartSeriesLabel(card.comparison)+(card.comparison.unit?' ('+card.comparison.unit+')':''):m('none'))}</div>`:'';
  const chartControls=`<div class="mcl-cgm-title"><h2>${e(m('cgm'))}${card.settings.showInsulin?' + '+e(m('insulinSeries')):''}</h2><button type="button" data-cgm-settings aria-label="${e(m('cgmSettings'))}">${gear}</button></div><div class="mcl-hour-range" role="group" aria-label="${e(m('range'))}">${[3,24,48,72].map(hours=>`<button type="button" data-cgm-hours="${hours}" aria-pressed="${card.settings.hours===hours}">${hours} ${e(m('hourShort'))}</button>`).join('')}</div>`;
  root.innerHTML=`<header class="sheet-header"><button type="button" class="icon-button" data-cgm-back aria-label="${e(m(screen==='settings'?'close':'back'))}">${screen==='settings'?'×':'‹'}</button><h2>${e(title)}</h2>${screen==='detail'?`<button type="button" class="icon-button" data-cgm-help aria-label="${e(m('cgmHelp'))}">ⓘ</button>`:''}</header><div class="mcl-body"><p data-cgm-error role="alert" ${error?'':'hidden'}>${e(error)}${pending?`<button type="button" data-cgm-retry>${e(m('retry'))}</button>`:''}</p>${screen==='target'?cgmRangeScreen(card,{language:uiLanguage(),m,busy}):screen==='settings'?controls:`${chartCardMarkup(cards[0],{detail:true,statistics:false,beforePlot:chartControls})}${comparison}${cgmStatistics(card,{language:uiLanguage(),m,open:statsOpen})}`}</div>`;
  if(screen==='target'){
   const slider=root.querySelector('.mcl-range-sliders');if(slider){const {min,max}=card.targetRange.controls,value=card.targetRange.options.custom;for(const key of ['low','high'])slider.style.setProperty('--range-'+key,100*(value[key]-min)/(max-min)+'%');}
  }
  if(screen==='detail')plots=mountChartPlots(root,{...view,cards});
  for(const control of root.querySelectorAll('input,button'))control.disabled=busy||!!pending&&!control.hasAttribute('data-cgm-retry')&&!control.hasAttribute('data-cgm-back');
  root.dataset.cgmBusy=String(busy);root.dataset.cgmScreen=screen;scrollHost().scrollTop=scroll;
 }
 async function refresh(){
  const next=validateChartView(await request('/api/charts?'+new URLSearchParams({to:view.to,card:'cgm'}),undefined,abort.signal));
  if(alive()){view=next;card=next.cards[0];}
 }
 async function save(patch){
  if(!alive())return;
  const ticket=await ownerTicket;
  if(ticket&&patch){
   const previous=structuredClone(card);
   editSerial++;error='';
   card={...card,settings:{...card.settings,...structuredClone(patch)}};
   render();
   try{
    const result=await queueCommand(view.revision,'chart.display',{id:'cgm',patch:structuredClone(patch)},{ticket});
    queued.add(result.requestId);
    void ui.afterSave?.();void ui.onChange?.();
   }catch(failure){
    if(alive()){card=previous;error=failure.message;render();}
   }
   return;
  }
  if(busy||pending&&patch)return;
  if(patch)pending={patch:structuredClone(patch),revision:view.revision,saved:false};
  if(!pending)return;busy=true;error='';render();
  try{
   if(!pending.saved){await command(pending.revision,'chart.display',{id:'cgm',patch:pending.patch});pending.saved=true;}
   await refresh();pending=null;await ui.afterSave?.();await ui.onChange?.();
  }catch(failure){
   if(!alive())return;error=failure.message;
   if(failure.status===409){pending=null;try{await refresh();}catch{error+=' '+dc('reloadLatestChart');}}
  }finally{busy=false;if(alive())render();}
 }
 const stopStatus=onBackgroundWriteStatus(event=>{
  if(!alive())return;
  if(event.saved&&queued.delete(event.requestId)){
   view={...view,revision:event.result.revision??view.revision};
   const serial=editSerial;
   void refresh().then(()=>{if(alive()&&serial===editSerial)render();}).catch(()=>{});
  }
 });
 function popup(key,anchor){
  const unit=key==='primaryUnit',axis=card.axisUnits.find(row=>row.key==='primaryUnit');
  const choices=unit?axis.choices.map(value=>({value,label:value})):[{value:'null',label:m('none')},...card.capture.comparisonOptions.map(row=>({value:JSON.stringify(row.metric),label:chartSeriesLabel(row)+(row.unit?' ('+row.unit+')':'')}))];
  picker=new MobileChartPicker({label:m(unit?'cgmUnits':'compareMetric'),choices,selected:unit?axis.unit:JSON.stringify(card.settings.compare),search:unit?null:m('search'),anchor,onClose:()=>picker=null,onChoose:value=>save({[key]:unit?value:JSON.parse(value)})});
 }
 function back(){
  if(picker){picker.close();return;}if(busy)return;
  if(screen==='target'){screen='settings';render();scrollHost().scrollTop=settingsScroll;}
  else if(screen==='settings'){screen='detail';render();scrollHost().scrollTop=detailScroll;}
  else close();
 }
 root.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.hasAttribute('data-cgm-back'))return back();if(button.hasAttribute('data-cgm-retry'))return void save();
  if(busy||pending||picker)return;
  if(button.dataset.cgmHours)return void save({hours:Number(button.dataset.cgmHours)});
  if(button.dataset.cgmPick)return popup(button.dataset.cgmPick,button);
  if(button.hasAttribute('data-cgm-settings')){detailScroll=scrollHost().scrollTop;screen='settings';render();scrollHost().scrollTop=0;}
  if(button.hasAttribute('data-cgm-target')){settingsScroll=scrollHost().scrollTop;screen='target';render();scrollHost().scrollTop=0;}
  if(button.hasAttribute('data-mcl-target-hint'))void save({showTargetHint:false});
  if(button.hasAttribute('data-cgm-help'))picker=new MobileChartPicker({label:m('cgmHelp'),content:cgmHelpContent(card,{language:uiLanguage(),m}),closeLabel:m('close'),presentation:'sheet',onClose:()=>picker=null});
  if(button.hasAttribute('data-cgm-configure'))void openGlucose({...ui,date:()=>view.to});
 },{signal:abort.signal});
 root.addEventListener('input',event=>{if(event.target.dataset.mclRangeValue)previewCgmRange(event.target,card,uiLanguage());},{signal:abort.signal});
 root.addEventListener('change',event=>{
  if(busy||pending)return;const input=event.target;
  if(input.dataset.cgmSetting)return void save({[input.dataset.cgmSetting]:input.checked});
  if(input.hasAttribute('data-mcl-range-mode')){const targetRange=structuredClone(card.settings.targetRange);targetRange.mode=input.value;if(input.value==='custom'&&!targetRange.custom)targetRange.custom={...card.targetRange.options.custom};return void save({targetRange});}
  if(input.dataset.mclRangeValue){if(!input.checkValidity()){input.reportValidity();return;}const key=input.dataset.mclRangeValue,custom={...card.targetRange.options.custom,[key]:Number(input.value)};if(['low','high'].includes(key))custom.fastedHigh=Math.max(custom.low,Math.min(custom.high,custom.fastedHigh));void save({targetRange:{mode:'custom',custom}});}
 },{signal:abort.signal});
 guardSheetExit(root,()=>busy,abort.signal);
 const handleBack=event=>{if(!alive()||picker)return;if(screen!=='detail'||busy){event.preventDefault();event.stopImmediatePropagation();back();}};
 dialog?.addEventListener('cancel',handleBack,{capture:true,signal:abort.signal});window.addEventListener('nourishing-back',handleBack,{capture:true,signal:abort.signal});
 render();
 return {element:root,dispose(){disposed=true;stopStatus();abort.abort();picker?.close();plots?.dispose();}};
}
