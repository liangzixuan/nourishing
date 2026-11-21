import {dc} from './discover-cloud-messages.js';
import {uiLanguage,t} from './app-language.js';
import {cgmDetails,cgmFoodPlugin} from './cgm-details.js';
import {escape as e} from './html.js';
import {chartLibrary,chartColor} from './dashboard-source/chart-library.js';
import {validateCycleOverlay,cyclePhaseAppearance} from './report-source/server/cycle-overlay.mjs';
import {fastingPlotOptions,fastingBands,chartVisibleSeries,sleepHourLabel,dailyTargetPoints,chartPointTime,chartTimeBounds} from './chart-rendering-source.js';
import {cgmGlucoseStyle} from './chart-cgm-source.js';
import {chartSeriesColor,chartSeriesLabel,chartSourceMarkup} from './charts-source-view.js';
const documentFontScale=()=>parseFloat(getComputedStyle(document.documentElement).fontSize)/18;
export function validateChartView(view){
 for(const card of view.cards){
  if(typeof card.cycleOverlayEnabled!=='boolean'||Object.hasOwn(card,'cycleOverlay')!==card.cycleOverlayEnabled)throw Error(dc('cycleReload'));
  if(!card.cycleOverlayEnabled)continue;
  const overlay=validateCycleOverlay(card.cycleOverlay,card.range),dates=new Set(card.dates);
  if(['asOf','timeZone','today'].some(key=>overlay.calendar[key]!==view.calendar[key])||overlay.observations.some(row=>!dates.has(row.date)||!Number.isSafeInteger(row.from)||!Number.isSafeInteger(row.to)||row.to<=row.from))throw Error(dc('cycleMismatch'));
 }
 return view;
}
export function cyclePlotOptions(card){const rows=card.cycleOverlay?.observations??[],sources=[...new Set(rows.map(row=>row.source.id))];return {enabled:card.cycleOverlayEnabled,sourceCount:sources.length,regions:rows.map(row=>({from:row.from,to:row.to,lane:sources.indexOf(row.source.id),color:cyclePhaseAppearance(row.phase).color}))};}
const cycleBands={id:'nourishingCycle',beforeDatasetsDraw(chart,_args,options){
 if(!options.enabled||!options.sourceCount||!chart.chartArea)return;
 const {ctx,chartArea:area,scales}=chart,height=(area.bottom-area.top)/options.sourceCount;
 ctx.save();ctx.beginPath();ctx.rect(area.left,area.top,area.right-area.left,area.bottom-area.top);ctx.clip();ctx.globalAlpha=.22;
 for(const region of options.regions){const left=Math.max(area.left,scales.x.getPixelForValue(region.from)),right=Math.min(area.right,scales.x.getPixelForValue(region.to));if(right<=left)continue;ctx.fillStyle=region.color;ctx.fillRect(left,area.top+height*region.lane,right-left,height);}ctx.restore();
}};
export function chartCardMarkup(card,{detail=false,statistics=true,beforePlot=''}={}){
 const active=chartVisibleSeries(card);
 const rows=card.cycleOverlay?.observations??[];
 const cycle=card.cycleOverlayEnabled?`<details class="chart-source"><summary>${dc('cycleObservations')}</summary>${rows.map(row=>`<p>${e(row.source.name)} · ${e(row.date)} · ${e(t('cycleOverlay.phase.'+row.phase))}</p>`).join('')}${card.cycleCoveredDates?`<p role="status">${dc('cycleReload')}</p>`:rows.length?'':`<p>${dc('noCycle')}</p>`}</details>`:'';
 return `<section class="mcl-card chart-card" data-mobile-chart="${e(card.id)}">${beforePlot}${chartSourceMarkup(card,active,{detail})}${cycle}${statistics?cgmDetails(card):''}</section>`;
}
const dayMs=86400000;
function calendarAxis(card,bounds,dailyBars,timed){
 if(card.capture?.window)return null;
 const start=Math.floor(bounds.min/dayMs)*dayMs,end=Math.floor(bounds.max/dayMs)*dayMs;
 if(start===end&&timed)return null;
 // Daily bars represent the entire day. Place their ticks above their centers;
 // timed observations and overlays keep the server's exact range.
 const first=dailyBars?start+dayMs/2:bounds.min,last=dailyBars?end+dayMs/2:bounds.max;
 let positions;
 if(start===end)positions=[(first+last)/2];
 else{
  positions=[first];
  const days=(end-start)/dayMs;
  if(days>1)positions.push(start+Math.floor(days/2)*dayMs+(dailyBars?dayMs/2:0));
  positions.push(last);
 }
 return {offset:false,afterBuildTicks:scale=>{scale.ticks=positions.map(value=>({value}));}};
}
export function chartPlotConfig(card){
 const active=chartVisibleSeries(card),bounds=card.timeBounds??chartTimeBounds(card);
 const timed=active.some(series=>series.points.some(p=>p.time||p.instant||p.position?.instant));
 const dailyBars=card.plot==='stacked-bars'&&!timed&&!card.capture?.window;
 const datasets=active.map((series,index)=>{
  const color=chartSeriesColor(series,index,card);
  return {
   type:series.plot==='bars'||card.plot==='stacked-bars'?'bar':'line',
   ...(series.plot==='bars'?{barThickness:8}:{}),showLine:series.plot!=='points',
   label:chartSeriesLabel(series)+(series.unit?' ('+series.unit+')':''),
   data:series.points.map(p=>({x:chartPointTime(p)+(dailyBars?dayMs/2:0),y:p.value,coverage:p.coverage})),
   borderColor:color,backgroundColor:color,borderWidth:2,pointRadius:3,
   ...(card.id==='metric'?{clip:4}:{}),yAxisID:series.axis==='right'?'right':'y',
   stack:card.plot==='stacked-bars'?'values':undefined,
   ...(card.id==='cgm'&&series.id==='glucose'?cgmGlucoseStyle(card.targetRange,series.points.length):{}),
  };
 });
 if(card.target)for(const target of [card.target,...(card.target.upper?[card.target.upper]:[])])datasets.push({id:target===card.target?'daily-target':'target-upper',type:'line',label:card.target.upper?(target===card.target?dc('targetMin'):dc('targetMax')):t('mobileNutrientDetail.target'),data:dailyTargetPoints(target,bounds).map(p=>({x:chartPointTime(p),y:p.value})),stepped:true,yAxisID:'y',borderColor:chartColor('ink'),borderDash:[4,4],borderWidth:2,pointRadius:0});
 const empty=!datasets.some(series=>series.data.some(p=>Number.isFinite(p.y)));
 const hideAxes=card.id==='cgm'&&empty;
 const ink=chartColor('ink'),grid=chartColor('mcl-grid');
 const y=position=>({
  position,
  beginAtZero:card.plot==='stacked-bars'||(card.id==='cgm'&&position==='right')||(['gki','lipids','nutrient','calcium'].includes(card.id)&&!card.settings.zoom),
  ...(empty?{min:0,max:10,afterBuildTicks:scale=>{scale.ticks=[0,2,4,6,8,10].map(value=>({value}));}}:{}),
  stacked:card.plot==='stacked-bars',grace:card.settings.zoom?'2%':'10%',
  grid:{display:!hideAxes,color:ctx=>ctx.tick?.value===ctx.scale.min||ctx.tick?.value===ctx.scale.max?ink():grid()},
  border:{display:hideAxes&&position==='left',color:ink},
  ticks:{
   display:!hideAxes,maxTicksLimit:6,...(empty?{autoSkip:false}:{}),
   color:card.id==='metric'&&!empty&&active.length===1?chartSeriesColor(active[0],0,card):ink,
   font:()=>({family:'Lato',size:11*documentFontScale()}),
   ...(card.id==='sleep'?{callback:sleepHourLabel}:{}),
  },
 });
 const timeZone=card.capture?.window?.timeZone??'UTC';
 const sameDay=new Date(bounds.min).toISOString().slice(0,10)===new Date(bounds.max).toISOString().slice(0,10);
 const format=new Intl.DateTimeFormat(uiLanguage(),{timeZone,...(card.capture?.window?.hours<=24||timed&&sameDay?{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}:{month:'short',day:'numeric'})});
 const label=value=>format.format(new Date(value));
 const calendar=calendarAxis(card,bounds,dailyBars,timed);
 const scales={x:{
  type:'linear',offset:card.plot==='stacked-bars',min:bounds.min,max:bounds.max,...calendar,
  grid:{display:false},
  ticks:{display:!hideAxes,color:ink,font:()=>({family:'Lato',size:12*documentFontScale()}),maxTicksLimit:3,maxRotation:0,
   ...(calendar?{autoSkip:false,align:card.plot==='stacked-bars'?'center':'inner'}:{}),callback:label},
 },y:y('left')};
 if(active.some(series=>series.axis==='right'))scales.right={...y('right'),grid:{display:false}};
 return {plugins:[cycleBands,fastingBands,...(card.id==='cgm'?[cgmFoodPlugin(card)]:[])],type:card.plot==='stacked-bars'?'bar':'line',data:{datasets},options:{responsive:true,maintainAspectRatio:false,animation:false,spanGaps:false,parsing:false,plugins:{nourishingCycle:cyclePlotOptions(card),nourishingFasting:fastingPlotOptions(card),legend:{display:false},tooltip:{callbacks:{title:items=>items.length?label(items[0].parsed.x):'',afterLabel:item=>item.raw?.coverage&&!item.raw.coverage.complete?dc('partialData'):''}}},scales}};
}
export function mountChartPlots(host,view){
 let disposed=false;const plots=[];
 const ready=(async()=>{try{validateChartView(view);if(!host.querySelector('[data-chart-plot]'))return;const Chart=await chartLibrary();if(disposed||!host.isConnected)return;for(const canvas of host.querySelectorAll('[data-chart-plot]')){const card=view.cards.find(row=>row.id===canvas.dataset.chartPlot);if(card)plots.push(new Chart(canvas,chartPlotConfig(card)));}}catch(error){if(!disposed&&host.isConnected){const message=document.createElement('p');message.setAttribute('role','alert');message.textContent=error.message;host.prepend(message);}}})();
 return {ready,dispose(){disposed=true;for(const plot of plots)plot.destroy();}};
}
