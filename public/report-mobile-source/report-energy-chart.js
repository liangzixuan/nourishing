import {dc} from '../discover-cloud-messages.js';
import {chartLibrary} from '../dashboard-source/chart-library.js';
import {escape as e} from '../dashboard-source/discover-ui.js';
import {displayValue} from '../dashboard-source/energy-display.js';
import {formatMessage} from './message-format.js';
const profiles={expenditure:{field:'breakdown',colors:['#e6a1d4','#a0358e','#eaa66d','#65baad','#e0ce70']},consumed:{field:'consumedBreakdown',colors:['#61ce91','#41c8d4','#be78ce','#e5b965','#73798c']}};
const number=(value,language)=>value===null?'—':value.toLocaleString(language,{maximumFractionDigits:1});
const message=(language,key,values)=>formatMessage(language,'energyChart.'+key,values);
const components=(capture,kind,language,colors=profiles[kind].colors)=>capture[profiles[kind].field].components.map((row,index)=>({...row,name:message(language,'component.'+row.id),color:colors[index]}));
const hasSlice=row=>row.mean!==null&&row.mean!==0;
export function energyChartMarkup(capture,unit,kind,extraDetails='',language='en'){
 const {field}=profiles[kind],title=formatMessage(language,'energyReport.'+kind),breakdown=capture[field],rows=components(capture,kind,language),text=(key,values)=>message(language,key,values),empty=text('empty.'+kind);
 const total=number(displayValue(breakdown.mean,'kcal',unit),language),label=breakdown.mean===null?empty:`${total} ${unit}`;
 const unlogged=kind==='consumed'&&breakdown.knownDays===0&&!capture.days.some(day=>day.logged);
 const legend=unlogged
  ? breakdown.components.filter(row=>['protein','carbohydrate','fat'].includes(row.id)).map(row=>
    `<div data-energy-slice="${row.id}" class="report-unlogged-macro"><i></i><b>${e(text('component.'+row.id))}</b><small>${e(dc('summaryWhenLogged',{},language))}</small></div>`
  ).join('')
  : rows.filter(row=>hasSlice(row)||(kind==='expenditure'&&row.id==='exercise'&&row.mean===0)).map(row=>`<div data-energy-slice="${row.id}"><i></i><span>${e(row.name)}</span><strong>${number(displayValue(row.mean,'kcal',unit),language)} ${e(unit)}</strong><span>${row.percent===null?'':number(row.percent,language)+'%'}</span></div>`).join('');
 const methods=kind==='consumed'?`<dl class="report-energy-methods"><dt>${e(text('source'))}</dt><dd>${number(breakdown.methods.sourceFactors,language)}</dd><dt>${e(text('general'))}</dt><dd>${number(breakdown.methods.generalFactors,language)}</dd><dt>${e(text('unattributedFoods'))}</dt><dd>${number(breakdown.methods.unattributed,language)}</dd></dl>`:'';
 return `<section class="dc-card report-energy-chart" data-report-energy-kind="${kind}"><div class="report-energy-heading"><h2>${e(title)}</h2>${kind==='consumed'&&!unlogged?`<small>${e(text('estimated'))}</small>`:''}</div><div class="report-energy-ring"><canvas data-report-${kind}-chart role="img" aria-label="${e(text('average.'+kind,{value:label}))}"></canvas><div class="report-energy-center"><strong>${e(total)}</strong>${breakdown.mean===null?'':`<span>${e(unit)}</span>`}</div></div><div class="report-energy-legend">${legend}</div>${breakdown.mean===null&&!unlogged?`<p class="report-energy-empty">${e(empty)}</p>`:rows.some(row=>row.mean<0)?`<p class="report-energy-empty">${e(text('subtract'))}</p>`:''}<details class="report-energy-coverage"><summary>${e(text(kind==='consumed'?'details':'days'))}</summary><p>${e(formatMessage(language,'discover.summary.days',{known:number(breakdown.knownDays,language),eligible:number(breakdown.eligibleDays,language)}))}</p>${extraDetails}${methods}</details><p class="report-energy-error" role="status"></p></section>`;
}
/** Each report chart owns its pending load and instance independently. */
export class ReportEnergyChart{
 constructor(kind,language='en',colors=profiles[kind].colors){this.colors=colors;this.kind=kind;this.language=language;this.version=0;this.chart=null;}
 clear(){this.version++;this.chart?.destroy();this.chart=null;}
 async render(root,capture){
  this.clear();const version=this.version,canvas=root.querySelector(`[data-report-${this.kind}-chart]`);if(!canvas)return;
  let Chart;try{Chart=await chartLibrary();}catch(error){if(version===this.version&&canvas.isConnected)canvas.closest('.report-energy-chart').querySelector('.report-energy-error').textContent=error.code==='chart-load'?message(this.language,'loadFailed'):error.message;return;}
  if(version!==this.version||!canvas.isConnected)return;
  let rows=components(capture,this.kind,this.language,this.colors).filter(hasSlice);
  if(rows.some(row=>row.percent===null))rows=[];
  // The reference places fat at twelve o'clock, followed by protein and carbs.
  if(this.kind==='consumed')rows=['fat','protein','carbohydrate','alcohol','unattributed'].flatMap(id=>rows.filter(row=>row.id===id));
  this.chart=new Chart(canvas,{type:'doughnut',data:{labels:rows.length?rows.map(row=>row.name):[message(this.language,'noBreakdown')],datasets:[{data:rows.length?rows.map(row=>row.mean):[1],backgroundColor:rows.length?rows.map(row=>row.color):['#414456'],borderWidth:1,borderColor:'#252839',hoverOffset:2}]},options:{responsive:true,maintainAspectRatio:false,cutout:'84%',animation:false,plugins:{legend:{display:false},tooltip:{enabled:false}}}});
 }
}
