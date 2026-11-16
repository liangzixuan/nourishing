import {chartLibrary} from '../dashboard-source/chart-library.js';
/** Source-style range chart: 0..target, target..maximum, and above maximum
 * have separate spans. Canonical values stay visible in the surrounding table. */
export class NutrientRangeChart{
 clear(){this.generation=(this.generation??0)+1;this.chart?.destroy();this.chart=null}
 async render(canvas,{value,target,maximum,labels}){
  this.clear();const generation=this.generation;if(!canvas||!(target>0&&maximum>target))return;
  let Chart;try{Chart=await chartLibrary()}catch{return}if(generation!==this.generation||!canvas.isConnected)return;
  const position=value===null?null:value<=target?Math.max(0,value/target*15):value<=maximum?15+(value-target)/(maximum-target)*70:Math.min(100,85+(value-maximum)/maximum*15);
  this.chart=new Chart(canvas,{type:'bar',data:{labels:[''],datasets:[{data:[15],backgroundColor:'#414456'},{data:[70],backgroundColor:'#bcebcf'},{data:[15],backgroundColor:'#ffc4b4'}]},options:{responsive:true,maintainAspectRatio:false,animation:false,indexAxis:'y',layout:{padding:{top:20,bottom:26,left:4,right:4}},plugins:{legend:{display:false},tooltip:{enabled:false}},scales:{x:{stacked:true,min:0,max:100,display:false},y:{stacked:true,display:false}},datasets:{bar:{barThickness:10,borderWidth:0,borderSkipped:false}}},plugins:[{id:'nutrientMarkers',afterDraw(chart){const {ctx,scales:{x,y}}=chart,mid=y.getPixelForValue(0),color=getComputedStyle(canvas).color;ctx.save();ctx.fillStyle=color;ctx.strokeStyle=color;ctx.lineWidth=2;ctx.font=getComputedStyle(canvas).font;ctx.textBaseline='top';for(const [p,label]of [[0,'0'],[15,labels.target],[85,labels.maximum]]){const px=x.getPixelForValue(p);ctx.beginPath();ctx.moveTo(px,mid-8);ctx.lineTo(px,mid+8);ctx.stroke();ctx.textAlign=p===0?'left':'center';ctx.textBaseline=p===85?'bottom':'top';ctx.fillText(label,px,p===85?mid-11:mid+13)}if(position!==null){const px=x.getPixelForValue(position);ctx.beginPath();ctx.moveTo(px-5,mid-18);ctx.lineTo(px+5,mid-18);ctx.lineTo(px,mid-9);ctx.closePath();ctx.fill()}ctx.restore()}}]});
 }
}
