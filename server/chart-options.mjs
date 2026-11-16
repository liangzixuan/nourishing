import {metricOptions,metricInfo} from './domain/chart-metrics.mjs';
import {biometricCatalog} from './domain/biometric-library.mjs';

// The saved mobile chart picker includes supported catalog metrics before any logging.
// Labels may change; the canonical metric identity must not.
export function chartMetricOptions(state){
 const options=metricOptions(state),seen=new Set(options.map(row=>JSON.stringify(row.metric)));
 const add=metric=>{const key=JSON.stringify(metric);if(!seen.has(key)){seen.add(key);options.push({metric,...metricInfo(metric)});}};
 for(const definition of biometricCatalog)for(const unit of definition.units)add({kind:'biometric',type:definition.type,unit});
 for(const chart of state.charts??[])for(const metric of [chart.primary,chart.secondary])if(metric)add(metric);
 return options.map(row=>({...row,name:row.metric.kind==='biometric'?(biometricCatalog.find(definition=>definition.type===row.metric.type)?.label??row.name):row.name}));
}
