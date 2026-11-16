const chartMetricCategory=metric=>['biometric','score'].includes(metric.kind)?metric.kind:'nutrient';
export function chartPickerOptions(options,current,field){
 const kind=chartMetricCategory(current);let choices=options.filter(row=>chartMetricCategory(row.metric)===kind);
 if(field==='unit')return choices.filter(row=>row.metric.type===current.type&&row.metric.unit!==null);
 if(kind==='biometric'&&field!=='source')choices=choices.filter((row,i,all)=>all.findIndex(other=>other.metric.type===row.metric.type)===i).map(row=>row.metric.type===current.type?{...row,metric:current}:row);
 return choices;
}
