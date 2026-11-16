import {cgmDetails,cgmFoodPlugin} from './cgm-details.js';
import {escape as e} from './html.js';
import {chartLibrary,chartColor} from './dashboard-source/chart-library.js';
import {validateCycleOverlay,cyclePhaseAppearance} from './report-source/server/cycle-overlay.mjs';
import {fastingPlotOptions,fastingBands,chartVisibleSeries,sleepHourLabel,dailyTargetPoints,chartPointTime,chartTimeBounds} from './chart-rendering-source.js';
import {cgmGlucoseStyle} from './chart-cgm-source.js';
const colors=['#50b6be','#bf86cf','#63cf92','#ff8652','#e6c66e','#8d9ee0'];
export function validateChartView(view){
 for(const card of view.cards){
  if(typeof card.cycleOverlayEnabled!=='boolean'||Object.hasOwn(card,'cycleOverlay')!==card.cycleOverlayEnabled)throw Error('Refresh the chart to load its cycle data.');
  if(!card.cycleOverlayEnabled)continue;
  const overlay=validateCycleOverlay(card.cycleOverlay,card.range),dates=new Set(card.dates);
  if(['asOf','timeZone','today'].some(key=>overlay.calendar[key]!==view.calendar[key])||overlay.observations.some(row=>!dates.has(row.date)||!Number.isSafeInteger(row.from)||!Number.isSafeInteger(row.to)||row.to<=row.from))throw Error('The cycle dates do not match this chart.');
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
export function chartCardMarkup(card,{pinned=false}={}){
 const active=chartVisibleSeries(card),known=active.some(series=>series.points.some(p=>Number.isFinite(p.value)));
 const cycle=card.cycleOverlayEnabled?`<details class="chart-source"><summary>Cycle observations</summary>${card.cycleOverlay.observations.length?card.cycleOverlay.observations.map(row=>`<p>${e(row.source.name)} · ${e(row.date)} · ${e(cyclePhaseAppearance(row.phase).label)}</p>`).join(''):'<p>No cycle observations</p>'}</details>`:'';
 return `<section class="nutrition-card chart-card"><div class="section-actions"><h2>${e(card.name)}</h2><button type="button" data-chart-open="${e(card.id)}" aria-label="Edit ${e(card.name)}">${pinned?'Open':'Edit'}</button></div><small>${e(card.range.from)} – ${e(card.range.to)}</small><div class="chart-canvas"><canvas data-chart-plot="${e(card.id)}" role="img" aria-label="${e(card.name)}"></canvas></div>${known?'':'<p class="empty">No data available</p>'}${cycle}${cgmDetails(card)}</section>`;
}
export function chartPlotConfig(card){
 const active=chartVisibleSeries(card),bounds=chartTimeBounds(card),datasets=active.map((series,index)=>({type:series.plot==='bars'||card.plot==='stacked-bars'?'bar':'line',...(series.plot==='bars'?{barThickness:8}:{}),showLine:series.plot!=='points',label:series.name+(series.unit?' ('+series.unit+')':''),data:series.points.map(p=>({x:chartPointTime(p),y:p.value,coverage:p.coverage})),borderColor:colors[index%colors.length],backgroundColor:colors[index%colors.length],borderWidth:2,pointRadius:3,yAxisID:series.axis==='right'?'right':'y',stack:card.plot==='stacked-bars'?'values':undefined,...(card.id==='cgm'&&series.id==='glucose'?cgmGlucoseStyle(card.targetRange,series.points.length):{})}));
 if(card.target)for(const target of [card.target,...(card.target.upper?[card.target.upper]:[])])datasets.push({id:target===card.target?'daily-target':'target-upper',type:'line',label:card.target.upper?(target===card.target?'Target minimum':'Target maximum'):'Daily target',data:dailyTargetPoints(target,bounds).map(p=>({x:chartPointTime(p),y:p.value})),stepped:true,yAxisID:'y',borderColor:chartColor('ink'),borderDash:[4,4],borderWidth:2,pointRadius:0});
 const empty=!datasets.some(series=>series.data.some(p=>Number.isFinite(p.y))),y=position=>({position,beginAtZero:card.plot==='stacked-bars'||card.id==='cgm'&&position==='right'||['gki','lipids','nutrient','calcium'].includes(card.id)&&!card.settings.zoom,min:empty?0:undefined,max:empty?10:undefined,stacked:card.plot==='stacked-bars',grace:card.settings.zoom?'2%':'10%',grid:{color:chartColor('line')},ticks:{color:chartColor('ink'),maxTicksLimit:6,...(card.id==='sleep'?{callback:sleepHourLabel}:{})}});
 const timeZone=card.capture?.window?.timeZone??'UTC',timed=active.some(s=>s.points.some(p=>p.time)),sameDay=new Date(bounds.min).toISOString().slice(0,10)===new Date(bounds.max).toISOString().slice(0,10),label=value=>new Intl.DateTimeFormat(undefined,{timeZone,...(card.capture?.window?.hours<=24||timed&&sameDay?{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}:{month:'short',day:'numeric'})}).format(new Date(value));
 const scales={x:{type:'linear',offset:card.plot==='stacked-bars',min:bounds.min,max:bounds.max,grid:{display:false},ticks:{color:chartColor('ink'),maxTicksLimit:3,maxRotation:0,callback:label}},y:y('left')};if(active.some(s=>s.axis==='right'))scales.right={...y('right'),grid:{display:false}};
 return {plugins:[cycleBands,fastingBands,...(card.id==='cgm'?[cgmFoodPlugin(card)]:[])],type:card.plot==='stacked-bars'?'bar':'line',data:{datasets},options:{responsive:true,maintainAspectRatio:false,animation:false,spanGaps:false,parsing:false,plugins:{nourishingCycle:cyclePlotOptions(card),nourishingFasting:fastingPlotOptions(card),legend:{labels:{color:chartColor('ink')}},tooltip:{callbacks:{title:items=>items.length?label(items[0].parsed.x):'',afterLabel:item=>item.raw?.coverage&&!item.raw.coverage.complete?'Partial data':''}}},scales}};
}
export function mountChartPlots(host,view){
 let disposed=false;const plots=[];
 const ready=(async()=>{try{validateChartView(view);if(!host.querySelector('[data-chart-plot]'))return;const Chart=await chartLibrary();if(disposed||!host.isConnected)return;for(const canvas of host.querySelectorAll('[data-chart-plot]')){const card=view.cards.find(row=>row.id===canvas.dataset.chartPlot);if(card)plots.push(new Chart(canvas,chartPlotConfig(card)));}}catch(error){if(!disposed&&host.isConnected){const message=document.createElement('p');message.setAttribute('role','alert');message.textContent=error.message;host.prepend(message);}}})();
 return {ready,dispose(){disposed=true;for(const plot of plots)plot.destroy();}};
}
