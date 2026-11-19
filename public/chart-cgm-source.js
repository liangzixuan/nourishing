// Palette and y thresholds for CGM glucose timeline plotting.
export const cgmColors=Object.freeze({glucose:'#3CC26E',insulin:'#005C5C',outside:'#FFBA24',extreme:'#EA3B04'});
export function cgmGlucoseColor(value,range){
 if(value<range.outerLow||value>range.outerHigh)return cgmColors.extreme;
 if(value<range.active.low||value>range.active.high)return cgmColors.outside;
 return cgmColors.glucose;
}
/** Hard gradient boundaries color each part of a segment without changing data points. */
export function cgmGlucoseStyle(range,pointCount){
 let key,gradient;
 return {pointRadius:pointCount===1?3:0,pointBackgroundColor:context=>cgmGlucoseColor(context.raw?.y,range),borderColor:({chart})=>{
  const {ctx,chartArea,scales}=chart;if(!chartArea||!scales.y)return cgmColors.glucose;
  const {bottom,top}=chartArea,y=scales.y,nextKey=[bottom,top,y.min,y.max].join(':');if(key===nextKey)return gradient;
  const thresholds=[range.outerLow,range.active.low,range.active.high,range.outerHigh],colors=[cgmColors.extreme,cgmColors.outside,cgmColors.glucose,cgmColors.outside,cgmColors.extreme];
  gradient=ctx.createLinearGradient(0,bottom,0,top);gradient.addColorStop(0,cgmGlucoseColor(y.min,range));
  for(let i=0;i<thresholds.length;i++){
   const offset=(bottom-y.getPixelForValue(thresholds[i]))/(bottom-top);
   if(offset>=0&&offset<=1){gradient.addColorStop(offset,colors[i]);gradient.addColorStop(offset,colors[i+1]);}
  }
  gradient.addColorStop(1,cgmGlucoseColor(y.max,range));key=nextKey;return gradient;
 }};
}
