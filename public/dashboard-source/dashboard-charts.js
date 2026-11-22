import {chartLibrary,chartColor} from './chart-library.js';
import {displayValue} from './energy-display.js';
const known=value=>typeof value==='number'&&Number.isFinite(value);
const documentFontScale=()=>parseFloat(getComputedStyle(document.documentElement).fontSize)/18;
export async function drawDashboardCharts(host){
  const canvases=[...host.querySelectorAll('[data-dc-chart]')];if(!canvases.length)return;let Chart;try{Chart=await chartLibrary();}catch(error){this.fail(error);return;}if(this.disposed)return;
  for(const canvas of canvases){if(!canvas.isConnected||this.charts.some(c=>c.canvas===canvas))continue;const weight=canvas.dataset.dcChart==='weight';let labels,datasets,xScale={},xTick;
   if(weight){
    const facts=this.weightFacts(),instant=date=>Date.parse(date+'T12:00:00Z'),from=instant(facts.range.from),to=instant(facts.range.to),singleDay=from===to;
    const min=singleDay?from-43200000:from,max=singleDay?to+43200000:to;
    const tickValues=[...new Set([from,from+Math.ceil((to-from)/86400000/2)*86400000,to])];
    labels=[];xScale={type:'linear',min,max,afterBuildTicks:scale=>{scale.ticks=tickValues.map(value=>({value}));}};xTick=value=>this.dateLabel(new Date(Number(value)).toISOString().slice(0,10));
    datasets=[{label:this.message('weight.series',{unit:facts.unit}),data:facts.records.map(record=>({x:instant(record.date),y:record.value})),borderColor:'#ff6430',backgroundColor:'#ff6430',pointRadius:3,borderWidth:2,clip:false}];
    if(known(facts.target))datasets.push({label:this.weightLegend(facts)[1],data:[{x:min,y:facts.target},{x:max,y:facts.target}],borderColor:chartColor('ink'),borderDash:[4,4],pointRadius:0,borderWidth:2,order:-1});
   }
   else{labels=this.energyDays.map(day=>this.dateLabel(day.date));const show=this.preferences.energyShow;datasets=show==='Consumed'?[['protein',4,'#55d28b'],['carbs',4,'#31bccc'],['fat',9,'#bf73cd'],['alcohol',7,'#ffbf23']].map(([id,factor,color])=>({label:this.message('energy.'+id),data:this.energyDays.map(day=>known(day.totals?.[id])?displayValue(day.totals[id]*factor,'kcal',this.unit):null),borderColor:color,backgroundColor:color,pointRadius:2,borderWidth:2})):[{label:this.message('energy.'+show),data:this.energyDays.map(day=>known(day.energy?.[show==='Expenditure'?'expenditure':'balance'])?displayValue(day.energy[show==='Expenditure'?'expenditure':'balance'],'kcal',this.unit):null),borderColor:'#ff6430',pointRadius:2,borderWidth:2}];}
   const values=datasets.flatMap(d=>d.data).map(point=>point&&typeof point==='object'?point.y:point).filter(known),empty=!values.length,flat=weight&&values.length&&Math.max(...values)-Math.min(...values)<0.001;const chart=new Chart(canvas,{type:'line',data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,animation:false,spanGaps:false,plugins:{legend:{display:false},tooltip:{enabled:true,...(weight?{callbacks:{title:items=>items.length?this.dateLabel(new Date(items[0].parsed.x).toISOString().slice(0,10)):''}}:{})}},scales:{x:{...xScale,grid:{display:false},border:{color:chartColor('line')},ticks:{...(weight?{callback:xTick}:{}),color:chartColor('ink'),maxTicksLimit:3,maxRotation:0,font:()=>({family:'Lato',size:13*documentFontScale()})}},y:{beginAtZero:!weight,min:empty?0:flat?Math.min(...values)-0.5:undefined,max:empty?10:flat?Math.max(...values)+0.5:undefined,grace:weight?(this.preferences.weightZoom?'2%':'10%'):undefined,grid:{color:chartColor('line')},border:{display:false},ticks:{callback:value=>Number(value).toLocaleString(this.language,{maximumFractionDigits:1}),color:chartColor(weight?'mobile-accent-text':'ink'),maxTicksLimit:6,padding:8,font:()=>({family:'Lato',size:11*documentFontScale()})}}}}});this.charts.push(chart);
  }
 }
