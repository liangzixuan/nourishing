import {chartLibrary,chartColor} from '../dashboard-source/chart-library.js';

export const energyComponentColors={protein:'#61ce91',carbohydrate:'#41c8d4',fat:'#be78ce',alcohol:'#e5b965',unattributed:'#73798c',resting:'#f7d4f0',baseline:'#db80ca',exercise:'#eaa66d',tracker:'#65baad',thermicEffect:'#e0ce70'};
const consumedOrder=['fat','protein','carbohydrate','alcohol','unattributed'];

// The carousel and the detail screen chart the same captured energy allocations.
export class DiaryEnergyRings {
 constructor(root){this.root=root;this.charts=[];this.version=0;}
 clear(){this.version++;this.charts.forEach(chart=>chart.destroy());this.charts=[];}
 resize(){this.charts.forEach(chart=>chart.resize());}
 async draw(summary){
  this.clear();const version=this.version;
  let Chart;
  try{Chart=await chartLibrary();}
  catch(error){const status=this.root.querySelector('.md-chart-error');if(status&&version===this.version)status.textContent=error.message;return;}
  if(version!==this.version||!this.root.isConnected)return;
  const energy=summary.energy??{},values=summary.consumedEnergy?.values;
  const expenditure=summary.expenditureBreakdown?.components??[];
  const slices={
   consumed:values?consumedOrder.map(id=>values[id]):[],
   expenditure:expenditure.map(row=>row.mean),
   remaining:[energy.consumed,energy.remaining],balance:[energy.consumed,energy.balance]
  };
  for(const canvas of this.root.querySelectorAll('[data-md-ring]')){
   const kind=canvas.dataset.mdRing,budget=kind==='remaining'||kind==='balance';
   const rows=slices[kind].map(value=>budget&&Number.isFinite(value)?Math.max(0,value):value);
   const known=rows.length&&rows.every(value=>Number.isFinite(value)&&value>=0)&&rows.some(value=>value>0);
   const color=({dataIndex})=>{
    if(!known||budget&&dataIndex===1)return chartColor('pale')();
    if(budget)return '#ff8050';
    return energyComponentColors[kind==='consumed'?consumedOrder[dataIndex]:expenditure[dataIndex].id];
   };
   this.charts.push(new Chart(canvas,{type:'doughnut',data:{datasets:[{data:known?rows:[1],backgroundColor:color,borderWidth:kind==='consumed'?1:0,borderColor:chartColor('paper')}]},options:{responsive:true,maintainAspectRatio:false,cutout:'84%',animation:false,events:[],plugins:{legend:{display:false},tooltip:{enabled:false}}}}));
  }
 }
}
