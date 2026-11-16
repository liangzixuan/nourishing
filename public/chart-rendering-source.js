/** Calendar-positioned fasting regions use the captured owner positions, including DST exclusions. */
export function fastingPlotOptions(card){
 const start=Date.parse(card.range.from+'T00:00:00Z');
 return {enabled:card.settings.showFasting===true,regions:(card.fasting?.rows??[]).filter(row=>row.startPosition&&row.endPosition).map(row=>({from:row.startPosition.instant?Date.parse(row.startPosition.instant):start+row.startPosition.offsetMinutes*60000,to:row.endPosition.instant?Date.parse(row.endPosition.instant):start+row.endPosition.offsetMinutes*60000}))};
}
export const fastingBands={id:'nourishingFasting',beforeDatasetsDraw(chart,_args,options){
 if(!options.enabled)return;const {ctx,chartArea,scales}=chart;if(!chartArea)return;
 ctx.save();ctx.beginPath();ctx.rect(chartArea.left,chartArea.top,chartArea.right-chartArea.left,chartArea.bottom-chartArea.top);ctx.clip();ctx.fillStyle=getComputedStyle(document.body).getPropertyValue('--mcl-fasting').trim();
 for(const region of options.regions){const left=scales.x.getPixelForValue(region.from),right=scales.x.getPixelForValue(region.to);ctx.fillRect(left,chartArea.top,Math.max(1,right-left),chartArea.bottom-chartArea.top)}ctx.restore();
}};
export function chartVisibleSeries(card){
 return card.series.filter(series=>card.id==='sleep'?['rem','light','deep'].includes(series.id):series.id!=='unattributed'||series.points.some(point=>typeof point.value==='number'&&point.value>0)).sort((a,b)=>card.id==='sleep'?['rem','light','deep'].indexOf(a.id)-['rem','light','deep'].indexOf(b.id):0);
}
export function sleepHourLabel(value){const minutes=Math.round(Number(value)*60);return minutes%60===0?String(minutes/60):Math.trunc(minutes/60)+':'+String(Math.abs(minutes%60)).padStart(2,'0')}

export const chartPointTime=point=>point.position?.instant||point.instant?Date.parse(point.position?.instant??point.instant):Date.parse(point.date+'T'+(point.time?point.time.length===5?point.time+':00':point.time:'00:00:00')+'Z');
/** Fit observed series only. Reference targets and fasts must not restore empty margins. */
export function chartTimeBounds(card){
 if(card.capture?.window)return {min:Date.parse(card.capture.window.start),max:Date.parse(card.capture.window.end)};
 const full={min:chartPointTime({date:card.range.from}),max:chartPointTime({date:card.range.to,time:'23:59:59'})};
 if(!card.settings.zoom)return full;
 let min=Infinity,max=-Infinity;
 const include=point=>{
  const start=chartPointTime(point);if(!Number.isFinite(start)||start<full.min||start>full.max)return;
  const width=!point.time?86400000:card.timing?.grouping==='hour'?3600000:60000;
  min=Math.min(min,start);max=Math.max(max,Math.min(full.max,start+width-1000));
 };
 for(const series of chartVisibleSeries(card))for(const point of series.points)if(typeof point.value==='number'&&Number.isFinite(point.value))include(point);
 if(!Number.isFinite(min))return full;
 if(min===max)min=Math.max(full.min,min-60000);
 return {min,max};
}

/** A daily target applies across the whole recorded day, including a one-day chart. */
export function dailyTargetPoints(target,bounds={min:-Infinity,max:Infinity}){
 const points=[];let previous=null;
 for(const point of target.points){
  const start=chartPointTime(point),left=Math.max(start,bounds.min),right=Math.min(start+86399000,bounds.max);
  if(left>right)continue;
  if(previous!==null&&start-previous>86400000)points.push({date:new Date(previous+86400000).toISOString().slice(0,10),time:'00:00:00',value:null});
  points.push({...point,time:new Date(left).toISOString().slice(11,19)},{...point,time:new Date(right).toISOString().slice(11,19)});previous=start;
 }
 return points;
}
