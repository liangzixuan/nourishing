import {quantityDescription} from './quantity-description.js';
import {escape as e} from './discover-ui.js';
import {chartPointTime} from './mobile-chart-rendering.js';
const utensils='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 3v5a3 3 0 0 0 6 0V3M7 3v18M20 3c-3 0-5 4-5 8h5M20 3v18"/></svg>';
const finite=value=>typeof value==='number'&&Number.isFinite(value);
/** Interpolation positions an icon on the drawn line; it does not create a reading. */
export function foodCurveMarkers(rows,points,{x,y,left,right}){
 const samples=[];
 for(const point of points.map(point=>({time:chartPointTime(point),value:point.value})).filter(point=>Number.isFinite(point.time)).sort((a,b)=>a.time-b.time)){
  const previous=samples.at(-1);if(previous?.time===point.time)previous.value=null;else samples.push(point);
 }
 const foods=rows.filter(row=>row.kind==='food'&&row.position).map(row=>({row,time:chartPointTime(row.position)})).filter(row=>Number.isFinite(row.time)).sort((a,b)=>a.time-b.time),groups=[];
 let index=0;
 for(const {row,time} of foods){
  while(index<samples.length&&samples[index].time<time)index++;
  const next=samples[index],prior=samples[index-1];let value;
  if(next?.time===time)value=next.value;
  else if(prior&&next&&finite(prior.value)&&finite(next.value))value=prior.value+(next.value-prior.value)*(time-prior.time)/(next.time-prior.time);
  if(!finite(value))continue;
  const px=x(time),py=y(value);if(!Number.isFinite(px)||!Number.isFinite(py)||px<left||px>right)continue;
  const previous=groups.at(-1);
  if(previous&&time-previous.time<=300000&&Math.hypot(px-previous.x,py-previous.y)<44)previous.foods.push(row);
  else groups.push({x:px,y:py,time,foods:[row]});
 }return groups;
}
export function foodMarkerPlugin(card,{label,onOpen}){
 let layer;
 return {id:'nourishingFoodMarkers',afterUpdate(chart){
  layer?.remove();layer=document.createElement('div');layer.className='mcl-food-markers';chart.canvas.parentElement.append(layer);
  const {x,y}=chart.scales,{left,right}=chart.chartArea;
  for(const group of foodCurveMarkers(card.capture.markers.timed,card.series.find(series=>series.id==='glucose')?.points??[],{x:value=>x.getPixelForValue(value),y:value=>y.getPixelForValue(value),left,right})){
   const button=document.createElement('button');button.type='button';button.dataset.mclFoodMarker='';button.className='mcl-food-marker';button.style.left=group.x+'px';button.style.top=group.y+'px';button.setAttribute('aria-label',label(group.foods));button.innerHTML=utensils+(group.foods.length>1?'<small>'+group.foods.length+'</small>':'');button.addEventListener('click',()=>onOpen(group.foods,button));layer.append(button);
  }
 },afterDestroy(){layer?.remove()}};
}
export function foodPopupContent(foods,{language}){
 return '<ul class="mcl-food-list">'+foods.map(food=>{
  const q=food.quantity,amount=q?.quantity??q?.amount;
  const kind=q?.unit==='portion'?'portion':q?.unit==='batch'?'batch':!q?.unit||q.unit==='servings'?'servings':'measurement';
  const quantity=typeof amount==='number'?quantityDescription({kind,value:amount,unit:q.unit,label:q.portionLabel??q.portionId},language):'';
  return `<li><strong>${e(food.name)}</strong><span>${e(food.date)} · ${e(food.time)}</span>${quantity?`<span>${e(quantity)}</span>`:''}</li>`;
 }).join('')+'</ul>';
}
