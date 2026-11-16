import {dc} from './discover-cloud-messages.js';
import {uiLanguage,t} from './app-language.js';
import {escape as e} from './html.js';
import {request} from './diary-api.js';
import {chartCardMarkup,mountChartPlots,validateChartView} from './chart-presentation.js';
import {chartArrow,chartTitle,chartSeriesLabel} from './charts-source-view.js';
import {MobileChartPicker} from './cgm-detail-source/mobile-chart-picker.js';
import {MobileDiaryCalendar} from './snapshot-source/mobile-diary-calendar.js';
import {chartPickerOptions} from './custom-chart-source/chart-picker-options.js';
import {mountCustomChartEditor} from './custom-chart-editor.js';
import {ranges,rangeLabel} from './dashboard-source/discover-ui.js';
import {mobileChartsMessages} from './health-source/public/locales/mobile-charts.js';
import {createMessageFormatter} from './report-source/public/message-formatter.js';
const format=createMessageFormatter(mobileChartsMessages),m=(key,values)=>format(uiLanguage(),key,values);

/** Non-CGM detail presentation from MobileCharts; all chart values remain server-owned. */
export function mountChartDetail(view,id,ui){
 const {show,content,close}=ui;
 show('<section class="chart-detail"></section>');
 const root=content.querySelector('.chart-detail'),dialog=content.closest('dialog'),abort=new AbortController();
 let card=view.cards.find(row=>row.id===id),plots,picker,disposed=false,busy=false,error='',pending=null,conflict=false,loading=true;
 const alive=()=>!disposed&&root.isConnected,scrollHost=()=>dialog??content;
 const rangeName=value=>ranges.some(([key])=>key===value)?rangeLabel(value,uiLanguage()):m('lastDays',{count:Number(value)});
 const pick=(key,label,value)=>`<button type="button" class="mcl-row" data-chart-pick="${key}"><strong>${e(label)}</strong><span>${e(value)}${chartArrow}</span></button>`;
 const toggle=(key,label,value=card.settings[key])=>`<label class="mcl-row"><strong>${e(label)}</strong><input type="checkbox" role="switch" class="chart-visibility" data-chart-setting="${key}" aria-label="${e(label)}" ${value?'checked':''}></label>`;
 function render(){
  if(!alive())return;const scroll=scrollHost().scrollTop;plots?.dispose();
  const p=card.settings;let controls='';const units=new Set();
  if(card.id==='calcium')controls+=toggle('targetLine',m('targetLine'));
  for(const axis of ['primary','secondary']){
   const series=card.series.find(row=>row.id===axis);if(!series?.metric)continue;
   if(card.kind==="custom"||['metric','nutrient','score'].includes(card.id))controls+=pick(axis,m(card.id==='nutrient'?'selectedNutrient':card.id==='score'?'selectedScore':axis+"Metric"),chartSeriesLabel(series));
   if(card.id==='nutrient')controls+=toggle('targetLine',m('targetLine'));
   if(series.displayUnits?.length){controls+=pick(axis+"Unit",m(axis+"Unit"),series.unit??m('chooseUnit'));units.add(axis+"Unit");}
  }
  for(const axis of card.axisUnits??[])if(!units.has(axis.key))controls+=pick(axis.key,m(axis.key),axis.unit);
  controls+=pick('range',m('range'),rangeName(p.range));
  if(p.range==="custom")controls+=pick('from',m('customFrom'),p.from)+pick('to',m('customTo'),p.to);
  controls+=pick('dayFilter',m("days"),m(p.dayFilter));
  if(card.id==='nutrient')controls+=pick('grouping',m('grouping'),m(p.grouping));
  if(!["energy",'sleep'].includes(card.id)){
   if(p.range!=="custom")controls+=toggle('includeToday',m('includeToday'));
   controls+=toggle('zoom',m('zoom'))+toggle('showFasting',m('showFasting'));
  }
  controls+=toggle('showOnDashboard',m('showOnDashboard'))+toggle('showCycle',dc('cyclePhases'),card.cycleOverlayEnabled);
  root.innerHTML=`<header class="sheet-header"><button type="button" class="icon-button" data-chart-back aria-label="${t('discover.back')}">‹</button><h2 id="sheet-title">${e(chartTitle(card))}</h2></header><div class="mcl-body"><p role="alert" ${error?'':'hidden'}>${e(error)}${pending?`<button type="button" data-chart-retry>${t('reminders.retry')}</button>`:''}${conflict?`<button type="button" data-chart-reload>${dc('reloadChart')}</button>`:''}</p>${chartCardMarkup(card,{detail:true})}<div class="mcl-group">${controls}</div>${card.kind==="custom"?`<button type="button" class="mcl-text-button" data-chart-edit>${e(m('edit'))}</button><button type="button" class="mcl-text-button" data-chart-delete>${e(m('delete'))}</button>`:''}</div>`;
  for(const control of root.querySelectorAll('input,button'))control.disabled=busy||loading&&!control.hasAttribute('data-chart-back')||!!pending&&!control.hasAttribute('data-chart-retry')&&!control.hasAttribute('data-chart-back')||conflict&&!control.hasAttribute('data-chart-reload')&&!control.hasAttribute('data-chart-back');
  root.dataset.chartBusy=String(busy||loading);plots=mountChartPlots(root,{...view,cards:[card]});scrollHost().scrollTop=scroll;
 }
 async function refresh(){
  const next=validateChartView(await request('/api/charts?'+new URLSearchParams({to:view.to,card:id}),undefined,abort.signal));
  if(alive()){const nextCard=next.cards.find(row=>row.id===id);if(!nextCard)throw Error(dc('chartUnavailable'));view=next;card=nextCard;}
 }
 async function save(type,payload){
  if(busy||loading||!alive()||conflict||pending&&type)return;
  if(type)pending={body:{requestId:crypto.randomUUID(),revision:view.revision,type,payload:structuredClone(payload)},saved:false};
  if(!pending)return;busy=true;error='';render();
  try{
   if(!pending.saved){const result=await request('/api/workspace/command',pending.body);if(result.ok!==true)throw Error(dc('saveConfirm'));pending.saved=true;}
   if(pending.body.type==='chart.delete'){pending=null;dispose();close();await ui.afterSave?.();await ui.onChange?.();return;}
   await refresh();if(!alive())return;pending=null;await ui.afterSave?.();await ui.onChange?.();
  }catch(failure){
   if(!alive())return;error=failure.message;
   if(failure.status>=400&&failure.status<500){pending=null;if(failure.status===409)conflict=true;}
  }finally{busy=false;if(alive())render();}
 }
 function preference(key,value){
  if(key==='showCycle'&&card.kind==="custom")return save('chart.cycle-overlay',{id:card.chartId,enabled:value});
  if(['primary','secondary'].includes(key)){
   const metric=JSON.parse(value);
   if(card.kind==="custom")return save('chart.save',{...card.definition,[key]:metric});
   return save('chart.display',{id,patch:{[key]:metric}});
  }
  const patch={[key]:value};if(key==='range'&&value==="custom"){patch.from=card.range.from;patch.to=card.range.to;}
  return save('chart.display',{id,patch});
 }
 function popup(key,anchor){
  const p=card.settings;
  if(['from','to'].includes(key)){
   picker=new MobileDiaryCalendar({date:p[key],language:uiLanguage(),showDiaryMarkers:false,label:m(key==='from'?'customFrom':'customTo'),onClose:()=>picker=null,onChoose:value=>preference(key,value)});return;
  }
  let choices,selected,label,search;const axisUnit=card.axisUnits?.find(axis=>axis.key===key);
  if(axisUnit){choices=axisUnit.choices.map(value=>({value,label:value}));selected=axisUnit.unit;label=m(key);}
  else if(key==='range'){choices=ranges.filter(([value])=>value!=='today').map(([value])=>({value,label:rangeLabel(value,uiLanguage())}));selected=p.range;label=m('range');}
  else if(key==='grouping'||key==='dayFilter'){choices=(key==='grouping'?["day",'hour','minute']:['all','nonempty',"complete"]).map(value=>({value,label:m(value)}));selected=p[key];label=m(key==='dayFilter'?"days":key);}
  else{
   const unit=key.endsWith("Unit"),axis=unit?key.slice(0,-4):key,series=card.series.find(row=>row.id===axis);if(!series?.metric)return;
   if(unit){choices=series.displayUnits.map(value=>({value,label:value}));selected=series.unit;}
   else{const options=chartPickerOptions(view.options,series.metric,'source').filter(row=>series.metric.kind!=='nutrient'||row.metric.kind==='nutrient');choices=options.map(row=>({value:JSON.stringify(row.metric),label:chartSeriesLabel(row)+(row.metric.kind==='biometric'&&options.filter(other=>other.metric.type===row.metric.type).length>1?' ('+(row.metric.unit??m('chooseUnit'))+')':'')}));selected=JSON.stringify(series.metric);search=m('search');}
   label=m(unit?axis+"Unit":card.id==='nutrient'?'selectedNutrient':card.id==='score'?'selectedScore':axis+"Metric");
  }
  picker=new MobileChartPicker({label,choices,selected,search,anchor,onClose:()=>picker=null,onChoose:value=>preference(key,value)});
 }
 function dispose(){if(disposed)return;disposed=true;abort.abort();picker?.close();plots?.dispose();observer.disconnect();}
 function back(){if(picker){picker.close();return;}if(busy)return;dispose();close();}
 root.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.hasAttribute('data-chart-back'))return back();
  if(button.hasAttribute('data-chart-retry'))return void save();
  if(button.hasAttribute('data-chart-reload'))return void reload();
  if(busy||loading||pending||conflict||picker)return;
  if(button.dataset.chartPick)return popup(button.dataset.chartPick,button);
  if(button.hasAttribute('data-chart-edit')){dispose();mountCustomChartEditor(card.definition,view,{...ui,onBack:()=>{const next=mountChartDetail(view,id,ui);ui.onEditor?.(next);}});}
  if(button.hasAttribute('data-chart-delete'))picker=new MobileChartPicker({label:m('delete'),confirm:{message:m('deleteMessage',{name:card.name}),cancel:m('cancel'),accept:m('delete')},onClose:()=>picker=null,onChoose:()=>save('chart.delete',{id:card.chartId})});
 },{signal:abort.signal});
 root.addEventListener('change',event=>{if(event.target.dataset.chartSetting&&!busy&&!loading&&!pending&&!conflict)void preference(event.target.dataset.chartSetting,event.target.checked);},{signal:abort.signal});
 async function reload(){if(busy)return;busy=true;render();try{await refresh();conflict=false;error='';}catch(failure){if(alive())error=failure.message;}finally{busy=false;if(alive())render();}}
 const handleBack=event=>{if(!alive()||picker)return;event.preventDefault();event.stopImmediatePropagation();back();};
 dialog?.addEventListener('cancel',handleBack,{capture:true,signal:abort.signal});window.addEventListener('nourishing-back',handleBack,{capture:true,signal:abort.signal});
 const observer=new MutationObserver(()=>{if(!root.isConnected)dispose();});observer.observe(content,{childList:true});
 // A parent card may still show its previous revision while its post-save refresh runs.
 // Source openDetail reads the canonical card on every open before enabling edits.
 render();void (async()=>{try{await refresh();}catch(failure){if(alive()){error=failure.message;conflict=true;}}finally{loading=false;if(alive())render();}})();
 return {element:root,dispose};
}
