import {mobileScoreOrder} from '../diary-summary-source/score-labels.js';
import {sourceNutrients} from '../report-source/server/source-nutrient-registry.mjs';
const standardNutrients=new Set(sourceNutrients.map(row=>row.id));
export function standardChartMetric(metric){
 if(metric.kind==='nutrient')return metric.id!=='carbs'&&standardNutrients.has(metric.id);
 if(metric.kind==='score')return mobileScoreOrder.slice(0,15).includes(metric.id);
 return metric.kind==='biometric'||metric.kind==='carbohydrate'&&Boolean(metric.mode);
}
const chartMetricCategory=metric=>['biometric','score'].includes(metric.kind)?metric.kind:'nutrient';
export function chartPickerOptions(options,current,field){
 const kind=chartMetricCategory(current);let choices=options.filter(row=>chartMetricCategory(row.metric)===kind);
 if(kind==='score'){const rank=id=>{const index=mobileScoreOrder.indexOf(id);return index<0?mobileScoreOrder.length:index;};choices.sort((a,b)=>rank(a.metric.id)-rank(b.metric.id));}
 if(field==='unit')return choices.filter(row=>row.metric.type===current.type&&row.metric.unit!==null);
 if(kind==='biometric'&&field!=='source')choices=choices.filter((row,i,all)=>all.findIndex(other=>other.metric.type===row.metric.type)===i).map(row=>row.metric.type===current.type?{...row,metric:current}:row);
 return choices;
}
